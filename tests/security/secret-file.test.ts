import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { randomBytes } from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { decrypt, encrypt, keySource } from "@/lib/connections/crypto";
import {
  migrateSecretFile,
  readSecretJson,
  secretFileState,
  SECRET_FILE_FORMAT,
  writeSecretJson,
} from "@/lib/security/secret-file";

const saved = { ...process.env };
let directory = "";
let file = "";
const CONTEXT = "module:test:secrets";

beforeEach(() => {
  delete process.env.CONNECTIONS_ENCRYPTION_KEY;
  delete process.env.CONNECTIONS_ENCRYPTION_KEYS;
  process.env.AUTH_SECRET = "secret-de-test-assez-long-pour-hkdf";
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "sxm-secret-file-"));
  file = path.join(directory, "secrets.json");
});

afterEach(() => {
  for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
  Object.assign(process.env, saved);
  fs.rmSync(directory, { recursive: true, force: true });
});

const key = () => randomBytes(32).toString("base64");

describe("fichiers de secrets des modules", () => {
  it("chiffre à l'écriture, en droits 600, et relit", () => {
    writeSecretJson(file, CONTEXT, { apiKeys: { openai: "sk-test-1234567890" } });
    const raw = fs.readFileSync(file, "utf-8");
    expect(raw).not.toContain("sk-test");
    expect(JSON.parse(raw).format).toBe(SECRET_FILE_FORMAT);
    expect(readSecretJson(file, CONTEXT, {})).toEqual({ apiKeys: { openai: "sk-test-1234567890" } });
    expect(secretFileState(file)).toBe("encrypted");
    if (process.platform !== "win32") expect(fs.statSync(file).mode & 0o777).toBe(0o600);
  });

  it("lit un ancien fichier en clair et le chiffre à la migration", () => {
    fs.writeFileSync(file, JSON.stringify({ deeplKey: "cle-deepl:fx" }));
    expect(secretFileState(file)).toBe("plain");
    expect(readSecretJson(file, CONTEXT, {})).toEqual({ deeplKey: "cle-deepl:fx" });
    expect(migrateSecretFile(file, CONTEXT)).toBe(true);
    expect(fs.readFileSync(file, "utf-8")).not.toContain("cle-deepl");
    expect(readSecretJson(file, CONTEXT, {})).toEqual({ deeplKey: "cle-deepl:fx" });
    expect(migrateSecretFile(file, CONTEXT)).toBe(false);
  });

  it("refuse un chiffré recopié dans un autre module", () => {
    writeSecretJson(file, CONTEXT, { key: "valeur" });
    expect(readSecretJson(file, "module:autre:secrets", { fallback: true })).toEqual({ fallback: true });
  });

  it("renvoie la valeur de repli pour un fichier absent ou abîmé", () => {
    expect(readSecretJson(file, CONTEXT, null)).toBeNull();
    fs.writeFileSync(file, "{ abîmé");
    expect(readSecretJson(file, CONTEXT, { vide: true })).toEqual({ vide: true });
  });

  it("garde le fichier en clair, en 600, sans aucune clé disponible", () => {
    Reflect.deleteProperty(process.env, "AUTH_SECRET");
    expect(keySource()).toBeNull();
    writeSecretJson(file, CONTEXT, { key: "valeur" });
    expect(JSON.parse(fs.readFileSync(file, "utf-8"))).toEqual({ key: "valeur" });
    expect(migrateSecretFile(file, CONTEXT)).toBe(false);
  });
});

describe("rotation des clés", () => {
  it("passe de la clé dérivée à une clé explicite sans perdre les secrets", () => {
    writeSecretJson(file, CONTEXT, { key: "valeur" });
    expect(JSON.parse(fs.readFileSync(file, "utf-8")).blob.kid).toBe("auth-1");

    process.env.CONNECTIONS_ENCRYPTION_KEYS = key();
    expect(secretFileState(file)).toBe("stale-key");
    expect(readSecretJson(file, CONTEXT, {})).toEqual({ key: "valeur" });
    expect(migrateSecretFile(file, CONTEXT)).toBe(true);
    expect(JSON.parse(fs.readFileSync(file, "utf-8")).blob.kid).toMatch(/^env-[0-9a-f]{8}$/);
    expect(secretFileState(file)).toBe("encrypted");
  });

  it("chiffre avec la première clé et déchiffre avec les suivantes", () => {
    const oldKey = key();
    const newKey = key();
    process.env.CONNECTIONS_ENCRYPTION_KEYS = oldKey;
    const blob = encrypt("jeton", "ctx");

    process.env.CONNECTIONS_ENCRYPTION_KEYS = `${newKey},${oldKey}`;
    expect(decrypt(blob, "ctx")).toBe("jeton");
    const fresh = encrypt("jeton", "ctx");
    expect(fresh.kid).not.toBe(blob.kid);

    // Ancienne clé retirée : les blobs qu'elle a chiffrés ne se lisent plus.
    process.env.CONNECTIONS_ENCRYPTION_KEYS = newKey;
    Reflect.deleteProperty(process.env, "AUTH_SECRET");
    expect(() => decrypt(blob, "ctx")).toThrow(/autre clé/);
    expect(decrypt(fresh, "ctx")).toBe("jeton");
  });

  it("relit un blob de l'ancienne clé unique après son passage dans la liste", () => {
    const single = key();
    process.env.CONNECTIONS_ENCRYPTION_KEY = single;
    const blob = encrypt("jeton", "ctx");
    expect(blob.kid).toBe("env-1");

    delete process.env.CONNECTIONS_ENCRYPTION_KEY;
    process.env.CONNECTIONS_ENCRYPTION_KEYS = `${key()},${single}`;
    expect(decrypt(blob, "ctx")).toBe("jeton");
  });

  it("refuse une clé de la liste qui ne fait pas 32 octets", () => {
    process.env.CONNECTIONS_ENCRYPTION_KEYS = Buffer.alloc(16).toString("base64");
    expect(() => encrypt("x")).toThrow(/32 octets/);
  });
});
