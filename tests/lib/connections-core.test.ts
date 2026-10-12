import { createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { decrypt, decryptJson, encrypt, encryptJson, keySource, sign, verifySignature } from "@/lib/connections/crypto";
import { allConnectors, capabilitiesForScopes, getConnector, listConnectors } from "@/lib/connections/registry";
import { appendCredits, creditsRequiringAttribution, renderTemplate, truncateBytes, truncateChars } from "@/lib/connections/templates";
import { normalizeYoutubeOptions, sanitizeTags, videoResource, youtubeTagsLength } from "@/lib/connections/connectors/youtube/metadata";
import { youtubeQuota } from "@/lib/connections/connectors/youtube/quota";
import { zonedDay } from "@/lib/connections/quota";
import { isBrand } from "@/components/brand-logo";
import { childEnv } from "@/lib/child-env";
import { CLI_ENV_PREFIXES } from "@/modules/ai-image-gen/lib/engines/cli-runner";

const saved = { ...process.env };
beforeEach(() => {
  delete process.env.CONNECTIONS_ENCRYPTION_KEY;
  process.env.AUTH_SECRET = "secret-de-test-assez-long-pour-hkdf";
});
afterEach(() => {
  for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
  Object.assign(process.env, saved);
});

describe("chiffrement des jetons", () => {
  test("aller-retour, nonce différent à chaque écriture", () => {
    const first = encrypt("jeton-secret", "account:acc-1");
    const second = encrypt("jeton-secret", "account:acc-1");
    expect(first.iv).not.toBe(second.iv);
    expect(first.data).not.toContain("jeton");
    expect(decrypt(first, "account:acc-1")).toBe("jeton-secret");
    expect(decryptJson(encryptJson({ a: 1 }, "x"), "x")).toEqual({ a: 1 });
  });

  test("refuse un blob altéré", () => {
    const blob = encrypt("jeton-secret");
    const data = Buffer.from(blob.data, "base64");
    data[0] ^= 0xff;
    expect(() => decrypt({ ...blob, data: data.toString("base64") })).toThrow(/illisibles/);
    const tag = Buffer.from(blob.tag, "base64");
    tag[3] ^= 1;
    expect(() => decrypt({ ...blob, tag: tag.toString("base64") })).toThrow();
  });

  test("refuse un blob recopié sous un autre contexte", () => {
    const blob = encrypt("jeton", "account:acc-1");
    expect(() => decrypt(blob, "account:acc-2")).toThrow();
  });

  test("refuse une mauvaise clé", () => {
    process.env.CONNECTIONS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    const blob = encrypt("jeton");
    expect(blob.kid).toBe("env-1");
    expect(keySource()).toBe("env");
    process.env.CONNECTIONS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    expect(() => decrypt(blob)).toThrow();
    // Retour à la clé dérivée : l'identifiant de clé ne correspond plus.
    delete process.env.CONNECTIONS_ENCRYPTION_KEY;
    expect(() => decrypt(blob)).toThrow(/autre clé/);
  });

  test("refuse une clé explicite qui ne fait pas 32 octets", () => {
    process.env.CONNECTIONS_ENCRYPTION_KEY = Buffer.alloc(16).toString("base64");
    expect(() => encrypt("x")).toThrow(/32 octets/);
  });

  test("clé dérivée d'AUTH_SECRET par HKDF, et changer AUTH_SECRET rend les blobs illisibles", () => {
    const blob = encrypt("jeton", "ctx");
    expect(blob.kid).toBe("auth-1");
    expect(keySource()).toBe("auth-secret");
    const key = Buffer.from(hkdfSync("sha256", Buffer.from(process.env.AUTH_SECRET!), "sharex-manager/connections", "connections-encryption-key v1", 32));
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(blob.iv, "base64"));
    decipher.setAAD(Buffer.from("sxm-connections:v1:auth-1:ctx"));
    decipher.setAuthTag(Buffer.from(blob.tag, "base64"));
    expect(Buffer.concat([decipher.update(Buffer.from(blob.data, "base64")), decipher.final()]).toString()).toBe("jeton");
    process.env.AUTH_SECRET = "un-autre-secret";
    expect(() => decrypt(blob, "ctx")).toThrow();
  });

  test("signature du cookie de transaction", () => {
    const signature = sign("charge", "oauth-transaction");
    expect(verifySignature("charge", signature, "oauth-transaction")).toBe(true);
    expect(verifySignature("charge2", signature, "oauth-transaction")).toBe(false);
    expect(verifySignature("charge", signature, "autre-usage")).toBe(false);
  });
});

describe("registre des connecteurs", () => {
  test("chaque connecteur a un logo officiel et des identifiants uniques", () => {
    const ids = allConnectors().map((connector) => connector.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const connector of allConnectors()) expect(isBrand(connector.logo), connector.id).toBe(true);
    expect(ids).toEqual(expect.arrayContaining(["youtube", "facebook", "instagram", "threads", "x"]));
  });

  test("capacités cohérentes avec les portées proposées", () => {
    for (const connector of allConnectors()) {
      if (connector.status === "planned") {
        expect(connector.oauth.scopeSets).toHaveLength(0);
        expect(capabilitiesForScopes(connector, ["n'importe quoi"])).toHaveLength(0);
        continue;
      }
      const offered = new Set(connector.oauth.scopeSets.flatMap((set) => set.scopes));
      for (const entry of connector.capabilities) {
        expect(entry.scopes.length, `${connector.id} ${entry.capability}`).toBeGreaterThan(0);
        // Les capacités des suites de publication ne viennent qu'à la demande (connexion incrémentale).
        // Le profil d'une Page Facebook aussi : la seconde configuration de Meta le porte.
        const onDemand = ["comment.create", "captions.upload", "cover.set"].includes(entry.capability) || (connector.id === "facebook" && entry.capability === "profile.details");
        expect(onDemand || entry.scopes.some((scope) => offered.has(scope)), `${connector.id} ${entry.capability}`).toBe(true);
      }
      for (const set of connector.oauth.scopeSets) expect(capabilitiesForScopes(connector, set.scopes).length).toBeGreaterThan(0);
      expect(connector.oauth.authorizeUrl).toMatch(/^https:\/\//);
      expect(connector.oauth.tokenUrl).toMatch(/^https:\/\//);
    }
  });

  test("YouTube : « Tout » permet la gestion, « Lecture et envoi » non", () => {
    const youtube = getConnector("youtube")!;
    const [all, upload] = youtube.oauth.scopeSets;
    expect(capabilitiesForScopes(youtube, all.scopes).sort()).toEqual(
      ["cover.set", "playlists.manage", "posts.list", "posts.manage", "profile.banner", "profile.details", "profile.sections", "profile.watermark", "publish.video"].sort()
    );
    const limited = capabilitiesForScopes(youtube, upload.scopes);
    expect(limited).toContain("publish.video");
    expect(limited).toContain("posts.list");
    expect(limited).not.toContain("posts.manage");
    expect(all.scopes.join(" ")).not.toMatch(/force-ssl|youtubepartner/);
  });

  test("champs de publication valides, décrits sans fonction", () => {
    for (const info of listConnectors()) {
      const keys = info.publishFields.map((field) => field.key);
      expect(new Set(keys).size).toBe(keys.length);
      for (const field of info.publishFields) {
        expect(field.label.length).toBeGreaterThan(0);
        if (field.kind === "text" || field.kind === "textarea") expect(field.maxLength).toBeGreaterThan(0);
        if (field.kind === "tags") expect(field.maxTotal).toBeGreaterThan(0);
        if (field.kind === "select") expect(field.choices.length).toBeGreaterThan(0);
      }
      expect(JSON.parse(JSON.stringify(info))).toEqual(info);
      if (info.status === "ready" && info.capabilities.includes("publish.video")) expect(info.publishFields.length).toBeGreaterThan(0);
    }
  });
});

describe("modèles de titre et de description", () => {
  test("variables remplies, inconnues laissées telles quelles", () => {
    const text = renderTemplate("{brand} – {title} {inconnue}\n{tags}", { brand: "Riso", title: "Top 5", tags: ["anime", "jeu vidéo"] });
    expect(text).toBe("Riso – Top 5 {inconnue}\n#anime #jeuvidéo");
    expect(renderTemplate("{date}", { date: new Date("2026-10-11T12:00:00Z"), language: "fr" })).toBe("11 octobre 2026");
  });

  test("troncatures : 100 caractères, 5 000 octets, 500 caractères de tags", () => {
    expect(Array.from(truncateChars("é".repeat(150), 100))).toHaveLength(100);
    const bytes = new TextEncoder().encode(truncateBytes("😀".repeat(2000), 5000)).length;
    expect(bytes).toBeLessThanOrEqual(5000);
    const tags = sanitizeTags(Array.from({ length: 80 }, (_, i) => `tag numéro ${i}`));
    expect(youtubeTagsLength(tags)).toBeLessThanOrEqual(500);
    expect(youtubeTagsLength(["a b", "c"])).toBe(3 + 2 + 1 + 1);
  });

  test("options YouTube : chevrons retirés, visibilité toujours présente, programmation en privé", () => {
    const options = normalizeYoutubeOptions(
      { title: "<b>Titre</b>", description: "a > b", privacy: "public", publishAt: new Date(Date.now() + 86_400_000).toISOString(), tags: ["x", "X"] },
      { module: "clip-studio", id: "exp-1", file: "a.mp4", bytes: 1, kind: "video", name: "Projet" }
    );
    expect(options.title).toBe("bTitre/b");
    expect(options.description).toBe("a  b");
    expect(options.privacy).toBe("private");
    expect(options.tags).toEqual(["x"]);
    const resource = videoResource(options);
    expect(resource.status.privacyStatus).toBe("private");
    expect(resource.status).toHaveProperty("publishAt");
    const unlisted = videoResource(normalizeYoutubeOptions({ privacy: "unlisted" }, { module: "m", id: "i", file: "f", bytes: 1, kind: "video", name: "Nom" }));
    expect(unlisted.status.privacyStatus).toBe("unlisted");
    expect(unlisted.status).not.toHaveProperty("publishAt");
    expect(unlisted.snippet.title).toBe("Nom");
    expect(() => normalizeYoutubeOptions({ publishAt: "2001-01-01T00:00:00Z" }, { module: "m", id: "i", file: "f", bytes: 1, kind: "video" })).toThrow(/futur/);
  });

  test("crédits : seules les licences qui exigent l'attribution", () => {
    const credits = creditsRequiringAttribution(["« A » par B, CC BY 4.0", "« C » par D, CC0", undefined, "« A » par B, CC BY 4.0", "x, CC BY-SA 3.0"]);
    expect(credits).toEqual(["« A » par B, CC BY 4.0", "x, CC BY-SA 3.0"]);
    expect(appendCredits("Description", credits)).toBe("Description\n\nCrédits :\n– « A » par B, CC BY 4.0\n– x, CC BY-SA 3.0");
  });

  test("jour du quota YouTube : fuseau du Pacifique, remise à zéro à minuit", () => {
    // 11/10/2026 à 06:00 UTC = 10/10/2026 à 23:00, heure du Pacifique (UTC−7).
    const now = Date.parse("2026-10-11T06:00:00Z");
    expect(zonedDay(now, "America/Los_Angeles")).toBe("2026-10-10");
    expect(youtubeQuota.nextReset(now)).toBe(Date.parse("2026-10-11T07:00:00Z"));
    // Hiver (UTC−8).
    expect(youtubeQuota.nextReset(Date.parse("2026-12-01T12:00:00Z"))).toBe(Date.parse("2026-12-02T08:00:00Z"));
    expect(youtubeQuota.cost("videos.insert")).toEqual({ bucket: "uploads", units: 1 });
    expect(youtubeQuota.cost("videos.update")).toEqual({ bucket: "general", units: 50 });
    expect(youtubeQuota.cost("videos.list")).toEqual({ bucket: "general", units: 1 });
  });
});

describe("sous-processus", () => {
  test("childEnv ne laisse jamais passer YOUTUBE_* ni CONNECTIONS_*, même avec les préfixes de Codex", () => {
    process.env.YOUTUBE_CLIENT_ID = "id";
    process.env.YOUTUBE_CLIENT_SECRET = "secret";
    process.env.CONNECTIONS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    for (const prefixes of [[], ["CODEX_", "OPENAI_"], CLI_ENV_PREFIXES]) {
      const env = childEnv({ prefixes });
      for (const key of Object.keys(env)) expect(key.toUpperCase()).not.toMatch(/^(YOUTUBE_|CONNECTIONS_|AUTH_SECRET)/);
    }
  });
});
