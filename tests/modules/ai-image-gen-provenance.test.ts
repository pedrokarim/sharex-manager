import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const { imagesDir } = vi.hoisted(() => {
  const nodeFs = require("node:fs") as typeof import("node:fs");
  const nodeOs = require("node:os") as typeof import("node:os");
  const nodePath = require("node:path") as typeof import("node:path");
  return { imagesDir: nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "sxm-provenance-")) };
});

// Le service lit les images du module : on lui donne un dossier jetable.
vi.mock("@/modules/ai-image-gen/lib/store", () => ({ IMAGES_DIR: imagesDir }));

import { decodeCbor } from "@/modules/ai-image-gen/lib/c2pa";
import {
  inspectImage,
  parseParameters,
  readPngChunks,
  readXmp,
  stripMetadata,
} from "@/modules/ai-image-gen/lib/provenance";
import { cleanCopy, inspectMany, inspectOne, samePixels } from "@/modules/ai-image-gen/lib/provenance-service";
import { cleanFileName, provenanceLabel, provenanceVerdict } from "@/modules/ai-image-gen/lib/provenance-types";

// ─── Fabrique de fichiers d'essai ────────────────────────────────

/** Encodeur CBOR minimal : entiers, textes, octets, listes, tables (`Map`), étiquettes. */
function cbor(value: unknown): Buffer {
  const head = (major: number, length: number) => {
    if (length < 24) return Buffer.from([(major << 5) | length]);
    if (length < 0x100) return Buffer.from([(major << 5) | 24, length]);
    if (length < 0x10000) {
      const buffer = Buffer.alloc(3);
      buffer[0] = (major << 5) | 25;
      buffer.writeUInt16BE(length, 1);
      return buffer;
    }
    const buffer = Buffer.alloc(5);
    buffer[0] = (major << 5) | 26;
    buffer.writeUInt32BE(length, 1);
    return buffer;
  };
  if (value === null) return Buffer.from([0xf6]);
  if (typeof value === "boolean") return Buffer.from([value ? 0xf5 : 0xf4]);
  if (typeof value === "number") return value >= 0 ? head(0, value) : head(1, -1 - value);
  if (typeof value === "string") return Buffer.concat([head(3, Buffer.byteLength(value)), Buffer.from(value, "utf8")]);
  if (Buffer.isBuffer(value)) return Buffer.concat([head(2, value.length), value]);
  if (Array.isArray(value)) return Buffer.concat([head(4, value.length), ...value.map(cbor)]);
  if (value instanceof Map) {
    return Buffer.concat([head(5, value.size), ...Array.from(value).flatMap(([key, entry]) => [cbor(key), cbor(entry)])]);
  }
  if (typeof value === "object" && "tag" in value) {
    const tagged = value as { tag: number; value: unknown };
    return Buffer.concat([head(6, tagged.tag), cbor(tagged.value)]);
  }
  return cbor(new Map(Object.entries(value as object)));
}

const box = (type: string, payload: Buffer) => {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(payload.length + 8, 0);
  header.write(type, 4, "latin1");
  return Buffer.concat([header, payload]);
};

const superbox = (label: string, ...children: Buffer[]) =>
  box("jumb", Buffer.concat([box("jumd", Buffer.concat([Buffer.alloc(16, 0x11), Buffer.from([0x03]), Buffer.from(`${label}\0`, "utf8")])), ...children]));

// ─ Certificat auto-signé, écrit en DER à la main : Node ne sait pas en émettre.

const der = (tag: number, content: Buffer) => {
  const length =
    content.length < 0x80
      ? Buffer.from([content.length])
      : content.length < 0x100
        ? Buffer.from([0x81, content.length])
        : Buffer.from([0x82, content.length >> 8, content.length & 0xff]);
  return Buffer.concat([Buffer.from([tag]), length, content]);
};
const sequence = (...parts: Buffer[]) => der(0x30, Buffer.concat(parts));
const ECDSA_SHA256 = sequence(der(0x06, Buffer.from([0x2a, 0x86, 0x48, 0xce, 0x3d, 0x04, 0x03, 0x02])));
const distinguishedName = (commonName: string) =>
  sequence(der(0x31, sequence(der(0x06, Buffer.from([0x55, 0x04, 0x03])), der(0x0c, Buffer.from(commonName, "utf8")))));

function selfSignedCertificate(commonName: string) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
  const subject = distinguishedName(commonName);
  const toBeSigned = sequence(
    der(0xa0, der(0x02, Buffer.from([2]))),
    der(0x02, Buffer.from([0x01])),
    ECDSA_SHA256,
    subject,
    sequence(der(0x17, Buffer.from("250101000000Z")), der(0x17, Buffer.from("450101000000Z"))),
    subject,
    publicKey.export({ type: "spki", format: "der" })
  );
  const signature = crypto.sign("sha256", toBeSigned, privateKey);
  const certificate = sequence(toBeSigned, ECDSA_SHA256, der(0x03, Buffer.concat([Buffer.from([0]), signature])));
  return { certificate, privateKey };
}

const signer = selfSignedCertificate("Générateur d'essai");

interface ManifestOptions {
  /** Empreinte du fichier hors manifeste, et position du manifeste dans le fichier. */
  contentHash?: { hash: Buffer; start: number; length: number };
  /** Altère la déclaration après signature. */
  tamper?: boolean;
}

/** Un manifeste C2PA complet et réellement signé. */
function buildManifest(options: ManifestOptions = {}): Buffer {
  const actions = superbox(
    "c2pa.actions.v2",
    box(
      "cbor",
      cbor({
        actions: [
          {
            action: "c2pa.created",
            when: "2026-10-01T08:00:00Z",
            softwareAgent: { name: "Modèle d'essai", version: "1.0" },
            digitalSourceType: "http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia",
          },
          { action: "c2pa.watermarked.unbound", when: "2026-10-01T08:00:01Z" },
        ],
      })
    )
  );
  const assertions = [actions];
  if (options.contentHash) {
    const { hash, start, length } = options.contentHash;
    assertions.push(
      superbox("c2pa.hash.data", box("cbor", cbor({ exclusions: [{ start, length }], alg: "sha256", hash, name: "jumbf manifest" })))
    );
  }
  const reference = (label: string, assertion: Buffer) => ({
    url: `self#jumbf=c2pa.assertions/${label}`,
    hash: crypto.createHash("sha256").update(assertion.subarray(8)).digest(),
  });
  let claim = cbor({
    instanceID: "xmp:iid:essai",
    claim_generator_info: { name: "Service d'essai", version: "9.9" },
    "dc:title": "image.png",
    alg: "sha256",
    created_assertions: [
      reference("c2pa.actions.v2", actions),
      ...(assertions[1] ? [reference("c2pa.hash.data", assertions[1])] : []),
    ],
  });

  const protectedHeader = cbor(new Map<number, unknown>([[1, -7], [33, signer.certificate]]));
  const signed = cbor(["Signature1", protectedHeader, Buffer.alloc(0), claim]);
  const signature = crypto.sign("sha256", signed, { key: signer.privateKey, dsaEncoding: "ieee-p1363" });
  if (options.tamper) claim = Buffer.from(claim.toString("latin1").replace("Service d'essai", "Service d'assai"), "latin1");

  return superbox(
    "c2pa",
    superbox(
      "urn:c2pa:essai",
      superbox("c2pa.assertions", ...assertions),
      superbox("c2pa.claim.v2", box("cbor", claim)),
      superbox(
        "c2pa.signature",
        box("cbor", cbor({ tag: 18, value: [protectedHeader, new Map([["sigTst2", { tstTokens: [] }]]), null, signature] }))
      )
    )
  );
}

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer) {
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  chunk.write(type, 4, "latin1");
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, 8 + data.length)), 8 + data.length);
  return chunk;
}

/** Insère des chunks juste après `IHDR`, là où les générateurs les écrivent. */
const insertPngChunks = (png: Buffer, ...chunks: Buffer[]) => Buffer.concat([png.subarray(0, 33), ...chunks, png.subarray(33)]);

const pixels = (width: number, height: number) => {
  const raw = Buffer.alloc(width * height * 3);
  for (let index = 0; index < raw.length; index++) raw[index] = (index * 37 + (index >> 3) * 11) & 0xff;
  return sharp(raw, { raw: { width, height, channels: 3 } });
};

/** PNG signé dont l'empreinte déclarée couvre réellement le fichier. */
function signedPng(plain: Buffer, options: { tamper?: boolean } = {}): Buffer {
  const hash = crypto.createHash("sha256").update(plain).digest();
  // La taille du chunk dépend de la longueur qu'il déclare : on itère jusqu'au point fixe.
  let length = 0;
  for (let pass = 0; pass < 5; pass++) {
    const chunk = pngChunk("caBX", buildManifest({ contentHash: { hash, start: 33, length }, ...options }));
    if (chunk.length === length) return insertPngChunks(plain, chunk);
    length = chunk.length;
  }
  throw new Error("Taille du manifeste instable");
}

const jpegSegment = (marker: number, payload: Buffer) => {
  const header = Buffer.from([0xff, marker, 0, 0]);
  header.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([header, payload]);
};

/** JUMBF réparti sur deux segments APP11, comme le font les gros manifestes. */
function jpegJumbfSegments(jumbf: Buffer): Buffer[] {
  const half = 8 + Math.floor((jumbf.length - 8) / 2);
  const packet = (sequence: number, data: Buffer) => {
    const header = Buffer.alloc(8);
    header.write("JP", 0, "latin1");
    header.writeUInt16BE(1, 2);
    header.writeUInt32BE(sequence, 4);
    return jpegSegment(0xeb, Buffer.concat([header, data]));
  };
  return [packet(1, jumbf.subarray(0, half)), packet(2, Buffer.concat([jumbf.subarray(0, 8), jumbf.subarray(half)]))];
}

const riffChunk = (type: string, data: Buffer) => {
  const header = Buffer.alloc(8);
  header.write(type, 0, "latin1");
  header.writeUInt32LE(data.length, 4);
  return Buffer.concat([header, data, Buffer.alloc(data.length & 1)]);
};

const XMP_PACKET =
  '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:Description photoshop:Credit="Studio d\'essai" ' +
  'Iptc4xmpExt:DigitalSourceType="http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia">' +
  "<dc:creator><rdf:Seq><rdf:li>Karim</rdf:li></rdf:Seq></dc:creator></rdf:Description></x:xmpmeta>";

const fixtures = {} as {
  plainPng: Buffer;
  signedPng: Buffer;
  parametersPng: Buffer;
  trapPng: Buffer;
  signedJpeg: Buffer;
  signedWebp: Buffer;
};

beforeAll(async () => {
  fixtures.plainPng = await pixels(24, 16).png().toBuffer();
  fixtures.signedPng = signedPng(fixtures.plainPng);
  fixtures.parametersPng = insertPngChunks(
    fixtures.plainPng,
    pngChunk(
      "tEXt",
      Buffer.from(
        "parameters\0un phare au crépuscule, lumière dorée\nNegative prompt: flou, texte\n" +
          'Steps: 30, Sampler: DPM++ 2M, Seed: 1234567, Model: sdxl_base, Lora hashes: "a: 1, b: 2"',
        "latin1"
      )
    ),
    pngChunk("iTXt", Buffer.concat([Buffer.from("XML:com.adobe.xmp\0\0\0\0\0", "latin1"), Buffer.from(XMP_PACKET, "utf8")]))
  );

  // Des pixels qui épellent des marqueurs, stockés sans compression : les
  // IDAT contiennent ces suites d'octets en clair.
  const bait = Buffer.from("xmp caBX trainedAlgorithmicMedia XML:com.adobe.xmp OpenAI Media Service API ", "latin1");
  const raw = Buffer.alloc(64 * 8 * 3);
  for (let index = 0; index < raw.length; index++) raw[index] = bait[index % bait.length];
  fixtures.trapPng = await sharp(raw, { raw: { width: 64, height: 8, channels: 3 } }).png({ compressionLevel: 0 }).toBuffer();

  const jpeg = await pixels(32, 24)
    .jpeg({ quality: 90 })
    .withMetadata({ orientation: 6, exif: { IFD0: { Software: "Appareil d'essai", Artist: "Karim" } } })
    .toBuffer();
  fixtures.signedJpeg = Buffer.concat([
    jpeg.subarray(0, 2),
    ...jpegJumbfSegments(buildManifest()),
    jpegSegment(0xe1, Buffer.concat([Buffer.from("http://ns.adobe.com/xap/1.0/\0", "latin1"), Buffer.from(XMP_PACKET, "utf8")])),
    jpegSegment(0xfe, Buffer.from("généré pour un essai", "utf8")),
    jpeg.subarray(2),
  ]);

  const webp = await pixels(20, 20)
    .webp({ lossless: true })
    .withMetadata({ exif: { IFD0: { Software: "Encodeur d'essai" } } })
    .toBuffer();
  const body = Buffer.concat([webp.subarray(12), riffChunk("XMP ", Buffer.from(XMP_PACKET, "utf8")), riffChunk("C2PA", buildManifest())]);
  const header = Buffer.from(webp.subarray(0, 12));
  header.writeUInt32LE(body.length + 4, 4);
  fixtures.signedWebp = Buffer.concat([header, body]);
  // L'en-tête étendu annonce désormais aussi du XMP.
  fixtures.signedWebp[20] |= 0x04;
});

afterAll(() => fs.rmSync(imagesDir, { recursive: true, force: true }));

// ─── Lecture ─────────────────────────────────────────────────────

describe("origine : décodage CBOR", () => {
  it("relit ce que l'encodeur d'essai écrit", () => {
    const value = decodeCbor(cbor({ a: [1, -7, "é", Buffer.from([1, 2])], b: { c: true, d: null } })) as any;
    expect(value.a.slice(0, 3)).toEqual([1, -7, "é"]);
    expect(Buffer.isBuffer(value.a[3])).toBe(true);
    expect(value.b).toEqual({ c: true, d: null });
  });

  it("refuse un contenu tronqué ou trop profond plutôt que de boucler", () => {
    expect(() => decodeCbor(Buffer.from([0x5a, 0xff, 0xff, 0xff, 0xff]))).toThrow();
    expect(() => decodeCbor(Buffer.alloc(500, 0x81))).toThrow();
  });
});

describe("origine : image signée (critère 1)", () => {
  it("signale le manifeste, le générateur et la nature de l'image", () => {
    const report = inspectImage(fixtures.signedPng);
    expect(report.status).toBe("signed");
    expect(report.carriers).toEqual([{ kind: "c2pa", label: "caBX", bytes: expect.any(Number) }]);
    expect(report.manifest?.generator).toEqual({ name: "Service d'essai", version: "9.9" });
    expect(report.manifest?.digitalSourceType).toBe("trainedAlgorithmicMedia");
    expect(report.manifest?.claimedAt).toBe("2026-10-01T08:00:01Z");
    expect(report.manifest?.actions[0]).toMatchObject({ action: "c2pa.created", agent: "Modèle d'essai 1.0" });
    expect(report.manifest?.declaresWatermark).toBe(true);
    expect(provenanceLabel({ status: report.status, generator: report.manifest?.generator?.name })).toBe("Service d'essai");
  });

  it("contrôle la signature, l'empreinte du fichier et celle des assertions", () => {
    const signature = inspectImage(fixtures.signedPng).manifest?.signature;
    expect(signature).toMatchObject({
      validity: "consistent",
      algorithm: "ES256 (ECDSA P-256, SHA-256)",
      signer: "Générateur d'essai",
      contentHash: "match",
      assertionHashes: "match",
      timestamped: true,
    });
  });

  it("voit qu'un fichier a changé depuis sa signature", () => {
    const altered = Buffer.from(fixtures.signedPng);
    altered[altered.length - 20] ^= 0xff;
    expect(inspectImage(altered).manifest?.signature?.contentHash).toBe("mismatch");
  });

  it("déclare invalide une déclaration modifiée après signature", () => {
    const signature = inspectImage(signedPng(fixtures.plainPng, { tamper: true })).manifest?.signature;
    expect(signature?.validity).toBe("invalid");
  });

  it("garde le statut « signée » quand le manifeste est illisible", () => {
    const broken = insertPngChunks(fixtures.plainPng, pngChunk("caBX", Buffer.from("n'importe quoi")));
    const report = inspectImage(broken);
    expect(report.status).toBe("signed");
    expect(report.manifest?.partial).toBeTruthy();
  });
});

describe("origine : textes et métadonnées (critère 2)", () => {
  it("affiche le prompt et le modèle d'un bloc parameters", () => {
    const report = inspectImage(fixtures.parametersPng);
    expect(report.status).toBe("metadata");
    const parameters = report.texts?.find((entry) => entry.keyword === "parameters")?.parameters;
    expect(parameters?.prompt).toBe("un phare au crépuscule, lumière dorée");
    expect(parameters?.negativePrompt).toBe("flou, texte");
    expect(parameters?.settings).toMatchObject({ Steps: "30", Seed: "1234567", Model: "sdxl_base", "Lora hashes": '"a: 1, b: 2"' });
    expect(report.xmp).toMatchObject({ "photoshop:Credit": "Studio d'essai", "dc:creator": "Karim" });
    expect(report.carriers.map((carrier) => carrier.label)).toEqual(["tEXt parameters", "iTXt XML:com.adobe.xmp"]);
  });

  it("lit un prompt sans ligne de réglages", () => {
    expect(parseParameters("un chat\nsur un toit")).toEqual({ prompt: "un chat\nsur un toit", negativePrompt: undefined, settings: {} });
  });

  it("lit les champs XMP écrits en éléments comme en attributs", () => {
    expect(readXmp('<a xmp:CreatorTool="Outil"><dc:rights>Tous droits</dc:rights></a>')).toEqual({
      "xmp:CreatorTool": "Outil",
      "dc:rights": "Tous droits",
    });
  });
});

describe("origine : rien trouvé (critères 3 et 7)", () => {
  it("dit « aucune signature trouvée », jamais « image propre »", () => {
    const report = inspectImage(fixtures.plainPng);
    expect(report.status).toBe("none");
    expect(report.carriers).toEqual([]);
    const label = provenanceLabel({ status: "none" });
    expect(label).toBe("Aucune signature trouvée");
    expect(label.toLowerCase()).not.toContain("propre");
  });

  it("ne prend pas pour une métadonnée ce qui est écrit dans les pixels", () => {
    // Le piège est bien armé : les marqueurs sont en clair dans le fichier.
    expect(fixtures.trapPng.includes("xmp")).toBe(true);
    expect(fixtures.trapPng.includes("caBX")).toBe(true);
    expect(fixtures.trapPng.includes("trainedAlgorithmicMedia")).toBe(true);
    const report = inspectImage(fixtures.trapPng);
    expect(report.status).toBe("none");
    expect(report.manifest).toBeUndefined();
    expect(report.xmp).toBeUndefined();
  });

  it("ne se prononce pas sur un format qu'il ne sait pas lire", () => {
    const report = inspectImage(Buffer.from("GIF89a..."));
    expect(report.status).toBe("unsupported");
    expect(report.removable).toBe(false);
    expect(() => stripMetadata(Buffer.from("GIF89a..."))).toThrow();
  });
});

describe("origine : ce que le fichier déclare", () => {
  it("reconnaît une image déclarée générée par son manifeste", () => {
    const verdict = provenanceVerdict(inspectImage(fixtures.signedPng));
    expect(verdict.kind).toBe("generated");
    expect(verdict.reason).toContain("trainedAlgorithmicMedia");
    expect(verdict.reason).toContain("Service d'essai");
  });

  it("reconnaît les paramètres de génération d'un PNG", () => {
    const png = insertPngChunks(fixtures.plainPng, pngChunk("tEXt", Buffer.from("parameters\0un phare\nSteps: 20, Seed: 4", "latin1")));
    const verdict = provenanceVerdict(inspectImage(png));
    expect(verdict.kind).toBe("generated");
    expect(verdict.reason).toContain("parameters");
    // Avec une déclaration XMP en plus, c'est elle qui est citée.
    expect(provenanceVerdict(inspectImage(fixtures.parametersPng)).reason).toContain("Les métadonnées XMP indiquent");
  });

  it("lit la nature déclarée en XMP quand il n'y a pas de manifeste", () => {
    const xmp = '<x:xmpmeta><rdf:Description Iptc4xmpExt:DigitalSourceType="http://cv.iptc.org/newscodes/digitalsourcetype/digitalCapture"/></x:xmpmeta>';
    const png = insertPngChunks(
      fixtures.plainPng,
      pngChunk("iTXt", Buffer.concat([Buffer.from("XML:com.adobe.xmp\0\0\0\0\0", "latin1"), Buffer.from(xmp, "utf8")]))
    );
    expect(provenanceVerdict(inspectImage(png)).kind).toBe("capture");
  });

  it("ne conclut rien d'une image sans marque, ni dans un sens ni dans l'autre", () => {
    const verdict = provenanceVerdict(inspectImage(fixtures.plainPng));
    expect(verdict.kind).toBe("undetermined");
    expect(verdict.title).toBe("Aucune signature trouvée dans le fichier");
    expect(verdict.reason).toContain("ne prouve rien");
  });
});

// ─── Retrait ─────────────────────────────────────────────────────

describe("origine : version propre (critères 4 et 6)", () => {
  it("retire le manifeste d'un PNG sans toucher un pixel", async () => {
    const { output, removed } = stripMetadata(fixtures.signedPng);
    expect(removed).toEqual(["caBX"]);
    expect(output.equals(fixtures.plainPng)).toBe(true);
    expect(await samePixels(fixtures.signedPng, output)).toBe(true);
    expect(inspectImage(output).status).toBe("none");
  });

  it("ne garde d'un PNG que l'image et sa colorimétrie", () => {
    const { output, removed } = stripMetadata(fixtures.parametersPng);
    expect(removed).toEqual(["tEXt", "iTXt"]);
    expect(readPngChunks(output).every((chunk) => !["tEXt", "iTXt", "zTXt", "caBX", "eXIf"].includes(chunk.type))).toBe(true);
  });

  it("lit un JPEG signé dont le manifeste est réparti sur deux segments", () => {
    const report = inspectImage(fixtures.signedJpeg);
    expect(report.status).toBe("signed");
    expect(report.manifest?.generator?.name).toBe("Service d'essai");
    expect(report.manifest?.digitalSourceType).toBe("trainedAlgorithmicMedia");
    expect(report.manifest?.signature).toMatchObject({ validity: "consistent", assertionHashes: "match", contentHash: "unchecked" });
    expect(report.exif).toMatchObject({ Software: "Appareil d'essai", Artist: "Karim" });
    expect(report.xmp?.["photoshop:Credit"]).toBe("Studio d'essai");
    expect(report.texts?.[0]).toMatchObject({ keyword: "COM", text: "généré pour un essai" });
  });

  it("nettoie un JPEG sans recompression, en gardant son orientation", async () => {
    const { output, removed } = stripMetadata(fixtures.signedJpeg);
    expect(removed).toEqual(expect.arrayContaining(["APP11", "APP1", "COM"]));
    expect(await samePixels(fixtures.signedJpeg, output)).toBe(true);
    const report = inspectImage(output);
    expect(report.manifest).toBeUndefined();
    expect(report.xmp).toBeUndefined();
    expect(report.exif).toBeUndefined();
    expect(report.texts).toBeUndefined();
    // Seul reste le bloc minimal qui dit dans quel sens afficher l'image.
    expect(report.carriers).toEqual([{ kind: "exif", label: "APP1", bytes: 36 }]);
    expect((await sharp(output).metadata()).orientation).toBe(6);
    // Les données d'image sont recopiées octet pour octet.
    const scan = (file: Buffer) => file.subarray(file.indexOf(Buffer.from([0xff, 0xda])));
    expect(scan(output).equals(scan(fixtures.signedJpeg))).toBe(true);
  });

  it("lit et nettoie un WebP signé", async () => {
    const report = inspectImage(fixtures.signedWebp);
    expect(report.status).toBe("signed");
    expect(report.manifest?.generator?.name).toBe("Service d'essai");
    expect(report.manifest?.digitalSourceType).toBe("trainedAlgorithmicMedia");
    expect(report.manifest?.signature?.validity).toBe("consistent");
    expect(report.exif?.Software).toBe("Encodeur d'essai");
    expect(report.carriers.map((carrier) => carrier.label).sort()).toEqual(["C2PA", "EXIF", "XMP"]);

    const { output, removed } = stripMetadata(fixtures.signedWebp);
    expect(removed.sort()).toEqual(["C2PA", "EXIF", "XMP"]);
    expect(output.readUInt32LE(4)).toBe(output.length - 8);
    expect(await samePixels(fixtures.signedWebp, output)).toBe(true);
    expect(inspectImage(output).status).toBe("none");
    const metadata = await sharp(output).metadata();
    expect(metadata.exif).toBeUndefined();
    expect(metadata.xmp).toBeUndefined();
  });

  it("propose un nom en -clean", () => {
    expect(cleanFileName("gen-1790773024865-TmSRjB-0.png")).toBe("gen-1790773024865-TmSRjB-0-clean.png");
  });
});

// ─── Service : fichiers du module ────────────────────────────────

describe("origine : fichiers du module (critère 5)", () => {
  const digestOf = (file: string) => crypto.createHash("sha256").update(fs.readFileSync(path.join(imagesDir, file))).digest("hex");

  beforeAll(() => {
    fs.writeFileSync(path.join(imagesDir, "gen-1-a-0.png"), fixtures.signedPng);
    fs.writeFileSync(path.join(imagesDir, "gen-2-b-0.png"), fixtures.plainPng);
    fs.writeFileSync(path.join(imagesDir, "gen-3-c-0.jpg"), fixtures.signedJpeg);
    fs.writeFileSync(path.join(imagesDir, "gen-4-d-0.webp"), fixtures.signedWebp);
  });

  it("résume toute une page en un appel, sans sortir du dossier", () => {
    const summaries = inspectMany(["gen-1-a-0.png", "gen-2-b-0.png", "absente.png", "../secret.png", 42]);
    expect(summaries).toEqual({
      "gen-1-a-0.png": {
        status: "signed",
        generator: "Service d'essai",
        digitalSourceType: "trainedAlgorithmicMedia",
        declared: "generated",
      },
      "gen-2-b-0.png": { status: "none", generator: undefined, digitalSourceType: undefined, declared: "undetermined" },
    });
  });

  it("annonce le gain et la preuve que les pixels sont identiques", async () => {
    const { report, clean } = await inspectOne("gen-1-a-0.png");
    expect(report.status).toBe("signed");
    expect(clean).toMatchObject({
      removed: ["caBX"],
      pixelsIdentical: true,
      bytes: fixtures.plainPng.length,
      savedBytes: fixtures.signedPng.length - fixtures.plainPng.length,
    });
    expect((await inspectOne("gen-2-b-0.png")).clean).toBeNull();
  });

  it("laisse l'original intact sur le disque, quel que soit le format", async () => {
    for (const file of ["gen-1-a-0.png", "gen-3-c-0.jpg", "gen-4-d-0.webp"]) {
      const before = digestOf(file);
      const copy = await cleanCopy(file);
      const output = Buffer.from(copy.b64, "base64");
      expect(copy.fileName).toBe(cleanFileName(file));
      expect(copy.clean.pixelsIdentical).toBe(true);
      expect(output.length).toBe(copy.clean.bytes);
      expect(await samePixels(fs.readFileSync(path.join(imagesDir, file)), output)).toBe(true);
      expect(inspectImage(output).manifest).toBeUndefined();
      expect(digestOf(file)).toBe(before);
    }
    expect(fs.readdirSync(imagesDir).sort()).toEqual(["gen-1-a-0.png", "gen-2-b-0.png", "gen-3-c-0.jpg", "gen-4-d-0.webp"]);
  });

  it("refuse un chemin au lieu d'un nom d'image", async () => {
    await expect(cleanCopy("../gen-1-a-0.png")).rejects.toThrow();
    await expect(inspectOne("sous/dossier.png")).rejects.toThrow();
  });
});
