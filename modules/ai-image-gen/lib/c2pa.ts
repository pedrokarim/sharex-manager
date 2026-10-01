/**
 * Lecture d'un manifeste C2PA : un conteneur JUMBF, dont les boîtes portent
 * du CBOR, signé par une structure COSE.
 *
 * Tout est lu ici sans dépendance : les quelques champs utiles, et un contrôle
 * de cohérence de la signature. Ce contrôle dit que la signature correspond
 * au certificat **embarqué** dans le manifeste ; il ne dit pas que ce
 * certificat est de confiance, ce qui demanderait une liste d'autorités.
 */

import crypto from "node:crypto";
import type { ManifestAction, ManifestSignature, ProvenanceManifest } from "./provenance-types";

// ─── CBOR ────────────────────────────────────────────────────────

const MAX_DEPTH = 64;
const MAX_ITEMS = 200_000;

export interface CborTag {
  tag: number;
  value: unknown;
}

function isTag(value: unknown): value is CborTag {
  return typeof value === "object" && value !== null && "tag" in value && "value" in value;
}

/**
 * Décode un élément CBOR. Les tables deviennent des objets, leurs clés étant
 * converties en texte (« 1 », « x5chain ») ; les chaînes d'octets restent des
 * `Buffer`. Borné en profondeur et en volume : un fichier importé peut être
 * malveillant.
 */
export function decodeCbor(data: Buffer): unknown {
  let offset = 0;
  let items = 0;

  const need = (count: number) => {
    if (offset + count > data.length) throw new Error("CBOR tronqué");
  };

  const readLength = (info: number): number | null => {
    if (info < 24) return info;
    if (info === 24) {
      need(1);
      return data[offset++];
    }
    if (info === 25) {
      need(2);
      offset += 2;
      return data.readUInt16BE(offset - 2);
    }
    if (info === 26) {
      need(4);
      offset += 4;
      return data.readUInt32BE(offset - 4);
    }
    if (info === 27) {
      need(8);
      offset += 8;
      return Number(data.readBigUInt64BE(offset - 8));
    }
    if (info === 31) return null; // longueur indéfinie
    throw new Error("CBOR invalide");
  };

  const read = (depth: number): unknown => {
    if (depth > MAX_DEPTH || ++items > MAX_ITEMS) throw new Error("CBOR trop profond ou trop volumineux");
    need(1);
    const head = data[offset++];
    const major = head >> 5;
    const info = head & 0x1f;

    if (major === 7) {
      if (info === 20) return false;
      if (info === 21) return true;
      if (info === 22 || info === 23) return null;
      if (info === 25) {
        need(2);
        offset += 2;
        return halfFloat(data.readUInt16BE(offset - 2));
      }
      if (info === 26) {
        need(4);
        offset += 4;
        return data.readFloatBE(offset - 4);
      }
      if (info === 27) {
        need(8);
        offset += 8;
        return data.readDoubleBE(offset - 8);
      }
      if (info === 24) {
        need(1);
        offset++;
        return null;
      }
      if (info === 31) return BREAK;
      return null;
    }

    const length = readLength(info);
    switch (major) {
      case 0:
        return length ?? 0;
      case 1:
        return -1 - (length ?? 0);
      case 2:
      case 3: {
        let bytes: Buffer;
        if (length === null) {
          const parts: Buffer[] = [];
          for (;;) {
            const part = read(depth + 1);
            if (part === BREAK) break;
            parts.push(Buffer.isBuffer(part) ? part : Buffer.from(String(part), "utf8"));
          }
          bytes = Buffer.concat(parts);
        } else {
          need(length);
          bytes = data.subarray(offset, offset + length);
          offset += length;
        }
        return major === 2 ? bytes : bytes.toString("utf8");
      }
      case 4: {
        const list: unknown[] = [];
        for (let index = 0; length === null || index < length; index++) {
          const value = read(depth + 1);
          if (value === BREAK) break;
          list.push(value);
        }
        return list;
      }
      case 5: {
        const map: Record<string, unknown> = {};
        for (let index = 0; length === null || index < length; index++) {
          const key = read(depth + 1);
          if (key === BREAK) break;
          map[Buffer.isBuffer(key) ? key.toString("hex") : String(key)] = read(depth + 1);
        }
        return map;
      }
      default:
        return { tag: length ?? 0, value: read(depth + 1) } satisfies CborTag;
    }
  };

  return read(0);
}

const BREAK = Symbol("break");

function halfFloat(half: number): number {
  const exponent = (half >> 10) & 0x1f;
  const mantissa = half & 0x3ff;
  const sign = half & 0x8000 ? -1 : 1;
  if (exponent === 0) return sign * 2 ** -14 * (mantissa / 1024);
  if (exponent === 31) return mantissa ? NaN : sign * Infinity;
  return sign * 2 ** (exponent - 15) * (1 + mantissa / 1024);
}

/** En-tête CBOR d'une chaîne d'octets ou de texte, pour reconstruire ce que COSE signe. */
function cborHead(major: number, length: number): Buffer {
  if (length < 24) return Buffer.from([(major << 5) | length]);
  if (length < 0x100) return Buffer.from([(major << 5) | 24, length]);
  if (length < 0x10000) {
    const head = Buffer.alloc(3);
    head[0] = (major << 5) | 25;
    head.writeUInt16BE(length, 1);
    return head;
  }
  const head = Buffer.alloc(5);
  head[0] = (major << 5) | 26;
  head.writeUInt32BE(length, 1);
  return head;
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value) && !Buffer.isBuffer(value) && !isTag(value)
    ? (value as Record<string, unknown>)
    : null;

const asText = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, 300) : undefined;

// ─── JUMBF ───────────────────────────────────────────────────────

interface Box {
  type: string;
  /** Début de la boîte, en-tête compris. */
  start: number;
  /** Début de son contenu. */
  contentStart: number;
  end: number;
}

function readBoxes(data: Buffer, start: number, end: number): Box[] {
  const boxes: Box[] = [];
  let offset = start;
  while (offset + 8 <= end) {
    let size = data.readUInt32BE(offset);
    const type = data.toString("latin1", offset + 4, offset + 8);
    let contentStart = offset + 8;
    if (size === 1) {
      if (offset + 16 > end) break;
      size = Number(data.readBigUInt64BE(offset + 8));
      contentStart = offset + 16;
    } else if (size === 0) {
      size = end - offset;
    }
    if (size < contentStart - offset || offset + size > end) break;
    boxes.push({ type, start: offset, contentStart, end: offset + size });
    offset += size;
  }
  return boxes;
}

interface Superbox {
  label: string;
  box: Box;
  /** Boîtes de contenu, après la description. */
  children: Box[];
}

/** Ouvre une superboîte `jumb` : sa description donne son étiquette. */
function openSuperbox(data: Buffer, box: Box): Superbox | null {
  if (box.type !== "jumb") return null;
  const [description, ...children] = readBoxes(data, box.contentStart, box.end);
  if (!description || description.type !== "jumd") return null;
  // 16 octets de type, 1 octet de drapeaux, puis l'étiquette terminée par un zéro.
  const toggles = data[description.contentStart + 16];
  let label = "";
  if (toggles & 0x02) {
    const from = description.contentStart + 17;
    const zero = data.indexOf(0, from);
    label = data.toString("utf8", from, zero === -1 || zero > description.end ? description.end : zero);
  }
  return { label, box, children };
}

const childSuperboxes = (data: Buffer, parent: Superbox): Superbox[] =>
  parent.children.map((child) => openSuperbox(data, child)).filter((entry): entry is Superbox => entry !== null);

/** Contenu de la première boîte `cbor` d'une superboîte. */
function cborContent(data: Buffer, superbox: Superbox): Buffer | null {
  const box = superbox.children.find((child) => child.type === "cbor");
  return box ? data.subarray(box.contentStart, box.end) : null;
}

// ─── Signature ───────────────────────────────────────────────────

const COSE_ALGORITHMS: Record<string, { label: string; hash: string; kind: "ecdsa" | "pss" | "eddsa" }> = {
  "-7": { label: "ES256 (ECDSA P-256, SHA-256)", hash: "sha256", kind: "ecdsa" },
  "-35": { label: "ES384 (ECDSA P-384, SHA-384)", hash: "sha384", kind: "ecdsa" },
  "-36": { label: "ES512 (ECDSA P-521, SHA-512)", hash: "sha512", kind: "ecdsa" },
  "-37": { label: "PS256 (RSA-PSS, SHA-256)", hash: "sha256", kind: "pss" },
  "-38": { label: "PS384 (RSA-PSS, SHA-384)", hash: "sha384", kind: "pss" },
  "-39": { label: "PS512 (RSA-PSS, SHA-512)", hash: "sha512", kind: "pss" },
  "-8": { label: "EdDSA (Ed25519)", hash: "", kind: "eddsa" },
};

const HASH_SIZES: Record<string, number> = { sha256: 32, sha384: 48, sha512: 64 };

/** « CN=…\nO=… » d'un certificat, ramené à une ligne lisible. */
function certificateName(distinguishedName: string): string {
  const fields = new Map<string, string>();
  for (const line of distinguishedName.split("\n")) {
    const at = line.indexOf("=");
    // Les virgules d'un nom sont échappées dans la forme texte du certificat.
    if (at > 0) fields.set(line.slice(0, at), line.slice(at + 1).replace(/\\(.)/g, "$1"));
  }
  const name = fields.get("CN");
  const organization = fields.get("O");
  if (name && organization && name !== organization) return `${name} (${organization})`;
  return name ?? organization ?? distinguishedName.replace(/\n/g, ", ");
}

function firstCertificate(value: unknown): Buffer | null {
  if (Buffer.isBuffer(value)) return value;
  if (Array.isArray(value) && Buffer.isBuffer(value[0])) return value[0];
  return null;
}

/**
 * Lit la signature COSE d'un manifeste et contrôle qu'elle correspond au
 * certificat embarqué. `claim` est la déclaration signée, octet pour octet.
 */
function readSignature(signatureCbor: Buffer, claim: Buffer): ManifestSignature {
  const signature: ManifestSignature = {
    validity: "unverified",
    timestamped: false,
    contentHash: "unchecked",
    assertionHashes: "unchecked",
  };

  let decoded: unknown;
  try {
    decoded = decodeCbor(signatureCbor);
  } catch {
    return { ...signature, detail: "Signature illisible." };
  }
  const structure = isTag(decoded) ? decoded.value : decoded;
  if (!Array.isArray(structure) || structure.length < 4 || !Buffer.isBuffer(structure[0])) {
    return { ...signature, detail: "Structure de signature inattendue." };
  }
  const [protectedBytes, unprotectedRaw, , signatureBytes] = structure as [Buffer, unknown, unknown, unknown];

  let protectedHeader: Record<string, unknown> = {};
  try {
    protectedHeader = asRecord(decodeCbor(protectedBytes)) ?? {};
  } catch {
    // En-tête illisible : on garde ce qu'on a.
  }
  const unprotected = asRecord(unprotectedRaw) ?? {};
  signature.timestamped = "sigTst" in unprotected || "sigTst2" in unprotected;

  const algorithm = COSE_ALGORITHMS[String(protectedHeader["1"])];
  signature.algorithm = algorithm?.label ?? (protectedHeader["1"] !== undefined ? `COSE ${protectedHeader["1"]}` : undefined);

  const der =
    firstCertificate(protectedHeader["33"]) ??
    firstCertificate(protectedHeader["x5chain"]) ??
    firstCertificate(unprotected["33"]) ??
    firstCertificate(unprotected["x5chain"]);
  if (!der) return { ...signature, detail: "Aucun certificat dans la signature." };

  let certificate: crypto.X509Certificate;
  try {
    certificate = new crypto.X509Certificate(der);
  } catch {
    return { ...signature, detail: "Certificat illisible." };
  }
  signature.signer = certificateName(certificate.subject);
  signature.issuer = certificateName(certificate.issuer);
  signature.validFrom = new Date(certificate.validFrom).toISOString();
  signature.validTo = new Date(certificate.validTo).toISOString();

  if (!algorithm) return { ...signature, detail: "Algorithme de signature non géré." };
  if (!Buffer.isBuffer(signatureBytes)) return { ...signature, detail: "Signature absente." };

  // Ce que COSE signe : ["Signature1", en-tête protégé, données externes vides, déclaration].
  const context = "Signature1";
  const signed = Buffer.concat([
    Buffer.from([0x84]),
    cborHead(3, context.length),
    Buffer.from(context, "utf8"),
    cborHead(2, protectedBytes.length),
    protectedBytes,
    cborHead(2, 0),
    cborHead(2, claim.length),
    claim,
  ]);

  try {
    const key = certificate.publicKey;
    const valid =
      algorithm.kind === "ecdsa"
        ? crypto.verify(algorithm.hash, signed, { key, dsaEncoding: "ieee-p1363" }, signatureBytes)
        : algorithm.kind === "pss"
          ? crypto.verify(
              algorithm.hash,
              signed,
              { key, padding: crypto.constants.RSA_PKCS1_PSS_PADDING, saltLength: HASH_SIZES[algorithm.hash] },
              signatureBytes
            )
          : crypto.verify(null, signed, key, signatureBytes);
    signature.validity = valid ? "consistent" : "invalid";
    if (!valid) signature.detail = "La signature ne correspond pas à la déclaration.";
  } catch {
    signature.detail = "Contrôle de la signature impossible sur ce serveur.";
  }
  return signature;
}

// ─── Manifeste ───────────────────────────────────────────────────

/** `http://cv.iptc.org/newscodes/digitalsourcetype/x` → `x`. */
export function shortSourceType(value: unknown): string | undefined {
  const text = asText(value);
  if (!text) return undefined;
  return text.slice(text.lastIndexOf("/") + 1) || undefined;
}

function agentName(value: unknown): string | undefined {
  const record = asRecord(value);
  if (!record) return asText(value);
  const name = asText(record.name);
  const version = asText(record.version);
  return name && version ? `${name} ${version}` : name;
}

function readActions(value: unknown): ManifestAction[] {
  const record = asRecord(value);
  if (!record || !Array.isArray(record.actions)) return [];
  return record.actions.slice(0, 50).flatMap((entry) => {
    const action = asRecord(entry);
    const name = action && asText(action.action);
    if (!action || !name) return [];
    return [
      {
        action: name,
        when: asText(isTag(action.when) ? action.when.value : action.when),
        agent: agentName(action.softwareAgent),
        digitalSourceType: shortSourceType(action.digitalSourceType),
      },
    ];
  });
}

/** `self#jumbf=c2pa.assertions/c2pa.actions.v2` → `c2pa.actions.v2`. */
function assertionLabelOf(url: unknown): string | undefined {
  const text = asText(url);
  return text ? text.slice(text.lastIndexOf("/") + 1) : undefined;
}

/** Plages du fichier exclues de l'empreinte, d'après l'assertion `c2pa.hash.data`. */
function checkContentHash(assertion: unknown, file: Buffer): "match" | "mismatch" | "unchecked" {
  const record = asRecord(assertion);
  const algorithm = record && asText(record.alg);
  if (!record || !Buffer.isBuffer(record.hash) || !algorithm || !(algorithm in HASH_SIZES)) return "unchecked";
  const exclusions = (Array.isArray(record.exclusions) ? record.exclusions : [])
    .map((entry) => asRecord(entry))
    .filter((entry): entry is Record<string, unknown> => entry !== null)
    .map((entry) => ({ start: Number(entry.start), length: Number(entry.length) }))
    .filter((entry) => Number.isFinite(entry.start) && Number.isFinite(entry.length) && entry.start >= 0 && entry.length >= 0)
    .sort((a, b) => a.start - b.start);

  const hash = crypto.createHash(algorithm);
  let cursor = 0;
  for (const exclusion of exclusions) {
    if (exclusion.start > file.length) break;
    if (exclusion.start > cursor) hash.update(file.subarray(cursor, exclusion.start));
    cursor = Math.max(cursor, exclusion.start + exclusion.length);
  }
  if (cursor < file.length) hash.update(file.subarray(cursor));
  return hash.digest().equals(record.hash) ? "match" : "mismatch";
}

/**
 * Lit un manifeste C2PA. `jumbf` est le contenu du chunk ou des segments qui
 * le portent ; `file` est le fichier entier, pour contrôler son empreinte.
 */
export function readManifest(jumbf: Buffer, file: Buffer): ProvenanceManifest {
  const empty: ProvenanceManifest = { manifestCount: 0, actions: [], assertions: [] };
  try {
    const store = readBoxes(jumbf, 0, jumbf.length)
      .map((box) => openSuperbox(jumbf, box))
      .find((entry) => entry !== null);
    if (!store) return { ...empty, partial: "Conteneur JUMBF illisible." };

    const manifests = childSuperboxes(jumbf, store);
    // Le dernier manifeste est le manifeste actif ; les précédents sont ses ingrédients.
    const active = manifests[manifests.length - 1];
    if (!active) return { ...empty, partial: "Aucun manifeste dans le conteneur." };

    const manifest: ProvenanceManifest = { ...empty, manifestCount: manifests.length };
    const parts = childSuperboxes(jumbf, active);
    const assertionStore = parts.find((part) => part.label === "c2pa.assertions");
    const assertions = assertionStore ? childSuperboxes(jumbf, assertionStore) : [];
    manifest.assertions = assertions.map((assertion) => ({
      label: assertion.label,
      bytes: assertion.box.end - assertion.box.start,
    }));

    const decodeAssertion = (assertion: Superbox): unknown => {
      const content = cborContent(jumbf, assertion);
      if (!content) return null;
      try {
        return decodeCbor(content);
      } catch {
        return null;
      }
    };

    for (const assertion of assertions) {
      if (assertion.label.startsWith("c2pa.actions")) {
        manifest.actions.push(...readActions(decodeAssertion(assertion)));
      }
    }
    manifest.digitalSourceType = manifest.actions.find((action) => action.digitalSourceType)?.digitalSourceType;
    manifest.declaresWatermark = manifest.actions.some((action) => action.action.startsWith("c2pa.watermarked"));
    manifest.claimedAt = manifest.actions
      .map((action) => action.when)
      .filter((when): when is string => Boolean(when))
      .sort()
      .at(-1);

    const claimBox = parts.find((part) => part.label.startsWith("c2pa.claim"));
    const claimBytes = claimBox ? cborContent(jumbf, claimBox) : null;
    let claim: Record<string, unknown> | null = null;
    if (claimBytes) {
      try {
        claim = asRecord(decodeCbor(claimBytes));
      } catch {
        manifest.partial = "Déclaration illisible.";
      }
    } else {
      manifest.partial = "Déclaration absente.";
    }

    if (claim) {
      const info = Array.isArray(claim.claim_generator_info) ? claim.claim_generator_info[0] : claim.claim_generator_info;
      const generator = asRecord(info);
      const name = (generator && asText(generator.name)) ?? asText(claim.claim_generator);
      if (name) manifest.generator = { name, version: generator ? asText(generator.version) : undefined };
      manifest.title = asText(claim["dc:title"]);
      manifest.instanceId = asText(claim.instanceID);
    }

    const signatureBox = parts.find((part) => part.label === "c2pa.signature");
    const signatureBytes = signatureBox ? cborContent(jumbf, signatureBox) : null;
    if (signatureBytes && claimBytes) {
      const signature = readSignature(signatureBytes, claimBytes);

      const dataHash = assertions.find((assertion) => assertion.label.startsWith("c2pa.hash.data"));
      if (dataHash) signature.contentHash = checkContentHash(decodeAssertion(dataHash), file);

      // La déclaration cite l'empreinte de chaque assertion : le contenu de sa
      // superboîte, description comprise, sans son en-tête.
      const references = claim
        ? [claim.created_assertions, claim.gathered_assertions, claim.assertions].flatMap((list) =>
            Array.isArray(list) ? list : []
          )
        : [];
      let checked = 0;
      let mismatch = false;
      for (const entry of references) {
        const reference = asRecord(entry);
        const label = reference && assertionLabelOf(reference.url);
        const target = assertions.find((assertion) => assertion.label === label);
        const algorithm = (reference && asText(reference.alg)) ?? (claim && asText(claim.alg)) ?? "sha256";
        if (!reference || !target || !Buffer.isBuffer(reference.hash) || !(algorithm in HASH_SIZES)) continue;
        const digest = crypto
          .createHash(algorithm)
          .update(jumbf.subarray(target.box.contentStart, target.box.end))
          .digest();
        checked++;
        if (!digest.equals(reference.hash)) mismatch = true;
      }
      if (checked > 0) signature.assertionHashes = mismatch ? "mismatch" : "match";
      manifest.signature = signature;
    }

    return manifest;
  } catch (error) {
    return { ...empty, manifestCount: 1, partial: error instanceof Error ? error.message : "Manifeste illisible." };
  }
}
