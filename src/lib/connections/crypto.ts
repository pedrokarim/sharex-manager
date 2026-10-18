/**
 * Chiffrement des jetons et des secrets d'application (AES-256-GCM), repris
 * pour les secrets des modules (`lib/security/secret-file.ts`).
 *
 * La clé vient de `CONNECTIONS_ENCRYPTION_KEYS` (liste séparée par des
 * virgules) ou de `CONNECTIONS_ENCRYPTION_KEY` (une seule clé) : 32 octets
 * aléatoires en base64. Sans elles, elle est dérivée d'`AUTH_SECRET` par HKDF,
 * avec un contexte propre aux comptes connectés : l'instance fonctionne sans
 * réglage de plus, mais changer `AUTH_SECRET` oblige alors à reconnecter les
 * comptes.
 *
 * Chaque blob porte l'identifiant de sa clé (`kid`) et un nonce aléatoire par
 * écriture. Rotation : la première clé de `CONNECTIONS_ENCRYPTION_KEYS`
 * chiffre, toutes les clés de la liste (et la clé unique, et la clé dérivée
 * d'`AUTH_SECRET`) déchiffrent encore les blobs qui portent leur `kid` ; un
 * blob est rechiffré avec la nouvelle clé à sa prochaine écriture. Le
 * `context` (« account:acc-… ») est lié au chiffré comme donnée authentifiée :
 * un blob recopié sur un autre compte ne se déchiffre pas.
 */

import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "crypto";
import type { EncryptedBlob } from "./types";

const HKDF_SALT = "sharex-manager/connections";
const HKDF_INFO = "connections-encryption-key v1";

/** Identifiant historique de la clé unique `CONNECTIONS_ENCRYPTION_KEY`. */
const SINGLE_KEY_KID = "env-1";
const AUTH_SECRET_KID = "auth-1";

export type KeySource = "env" | "auth-secret";

interface MasterKey {
  kid: string;
  source: KeySource;
  key: Buffer;
}

function parseKey(value: string, variable: string): Buffer {
  const key = Buffer.from(value, "base64");
  if (key.length !== 32) {
    throw new Error(`${variable} doit contenir 32 octets encodés en base64 (openssl rand -base64 32).`);
  }
  return key;
}

/** `kid` d'une clé de la liste : une empreinte courte, stable quelle que soit sa place. */
function listKid(key: Buffer): string {
  return `env-${createHash("sha256").update(key).digest("hex").slice(0, 8)}`;
}

/**
 * Toutes les clés connues, la clé de chiffrement en premier. Lue à chaque
 * appel : les tests et un redémarrage avec une autre clé sont pris en compte.
 */
function keyring(): MasterKey[] {
  const keys: MasterKey[] = [];
  const list = process.env.CONNECTIONS_ENCRYPTION_KEYS?.split(",").map((value) => value.trim()).filter(Boolean) ?? [];
  for (const value of list) {
    const key = parseKey(value, "Chaque clé de CONNECTIONS_ENCRYPTION_KEYS");
    keys.push({ kid: listKid(key), source: "env", key });
  }
  const single = process.env.CONNECTIONS_ENCRYPTION_KEY?.trim();
  if (single) keys.push({ kid: SINGLE_KEY_KID, source: "env", key: parseKey(single, "CONNECTIONS_ENCRYPTION_KEY") });
  const secret = process.env.AUTH_SECRET;
  if (secret) {
    const key = Buffer.from(hkdfSync("sha256", Buffer.from(secret, "utf-8"), HKDF_SALT, HKDF_INFO, 32));
    keys.push({ kid: AUTH_SECRET_KID, source: "auth-secret", key });
  }
  return keys;
}

/** Clé de chiffrement : la première de la liste, sinon la clé unique, sinon la clé dérivée. */
function masterKey(): MasterKey {
  const [first] = keyring();
  if (!first) {
    throw new Error("Ni CONNECTIONS_ENCRYPTION_KEY(S) ni AUTH_SECRET ne sont définis : impossible de chiffrer les jetons.");
  }
  return first;
}

/**
 * Clés capables de déchiffrer un `kid`. Un blob « env-1 » écrit avec la clé
 * unique reste lisible après son passage dans la liste : les clés de la liste
 * sont alors essayées une à une.
 */
function decryptionKeys(kid: string): Buffer[] {
  const ring = keyring();
  const exact = ring.filter((entry) => entry.kid === kid).map((entry) => entry.key);
  if (exact.length > 0 || kid !== SINGLE_KEY_KID) return exact;
  return ring.filter((entry) => entry.source === "env").map((entry) => entry.key);
}

/** D'où vient la clé, pour l'avertissement de la page d'administration. */
export function keySource(): KeySource | null {
  try {
    return masterKey().source;
  } catch {
    return null;
  }
}

/** Vrai si une clé de chiffrement est disponible. */
export function hasEncryptionKey(): boolean {
  return keySource() !== null;
}

function additionalData(kid: string, context: string) {
  return Buffer.from(`sxm-connections:v1:${kid}:${context}`, "utf-8");
}

export function encrypt(plaintext: string, context = ""): EncryptedBlob {
  const { kid, key } = masterKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(additionalData(kid, context));
  const data = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
  return { v: 1, kid, iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: data.toString("base64") };
}

export function decrypt(blob: EncryptedBlob, context = ""): string {
  if (!blob || blob.v !== 1 || typeof blob.data !== "string") throw new Error("Données chiffrées invalides.");
  const keys = decryptionKeys(blob.kid);
  if (keys.length === 0) {
    throw new Error("Ces données ont été chiffrées avec une autre clé : reconnectez le compte ou ressaisissez le secret.");
  }
  for (const key of keys) {
    try {
      const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(blob.iv, "base64"));
      decipher.setAAD(additionalData(blob.kid, context));
      decipher.setAuthTag(Buffer.from(blob.tag, "base64"));
      return Buffer.concat([decipher.update(Buffer.from(blob.data, "base64")), decipher.final()]).toString("utf-8");
    } catch {
      // Clé suivante.
    }
  }
  throw new Error("Données chiffrées illisibles : la clé a changé ou le fichier a été altéré.");
}

/** Vrai si le blob a été chiffré avec une autre clé que la clé de chiffrement actuelle. */
export function needsReencryption(blob: EncryptedBlob): boolean {
  try {
    return blob.kid !== masterKey().kid;
  } catch {
    return false;
  }
}

export function encryptJson(value: unknown, context = ""): EncryptedBlob {
  return encrypt(JSON.stringify(value), context);
}

export function decryptJson<T>(blob: EncryptedBlob, context = ""): T {
  return JSON.parse(decrypt(blob, context)) as T;
}

// ─── Signature ────────────────────────────────────────────────────

/** Sous-clé dérivée pour un autre usage (signature du cookie de transaction OAuth). */
function subkey(info: string): Buffer {
  return Buffer.from(hkdfSync("sha256", masterKey().key, HKDF_SALT, info, 32));
}

export function sign(value: string, purpose: string): string {
  return createHmac("sha256", subkey(`connections-${purpose} v1`)).update(value).digest("base64url");
}

export function verifySignature(value: string, signature: string, purpose: string): boolean {
  const expected = Buffer.from(sign(value, purpose));
  const received = Buffer.from(signature);
  return expected.length === received.length && timingSafeEqual(expected, received);
}
