/**
 * Chiffrement des jetons et des secrets d'application (AES-256-GCM).
 *
 * La clé vient de `CONNECTIONS_ENCRYPTION_KEY` (32 octets aléatoires en
 * base64). Sans elle, elle est dérivée d'`AUTH_SECRET` par HKDF, avec un
 * contexte propre aux comptes connectés : l'instance fonctionne sans réglage
 * de plus, mais changer `AUTH_SECRET` oblige alors à reconnecter les comptes.
 *
 * Chaque blob porte l'identifiant de sa clé (`kid`), pour une rotation future,
 * et un nonce aléatoire par écriture. Le `context` (« account:acc-… ») est lié
 * au chiffré comme donnée authentifiée : un blob recopié sur un autre compte
 * ne se déchiffre pas.
 */

import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "crypto";
import type { EncryptedBlob } from "./types";

const HKDF_SALT = "sharex-manager/connections";
const HKDF_INFO = "connections-encryption-key v1";

export type KeySource = "env" | "auth-secret";

interface MasterKey {
  kid: string;
  source: KeySource;
  key: Buffer;
}

/** Lue à chaque appel : les tests et un redémarrage avec une autre clé sont pris en compte. */
function masterKey(): MasterKey {
  const explicit = process.env.CONNECTIONS_ENCRYPTION_KEY?.trim();
  if (explicit) {
    const key = Buffer.from(explicit, "base64");
    if (key.length !== 32) {
      throw new Error("CONNECTIONS_ENCRYPTION_KEY doit contenir 32 octets encodés en base64 (openssl rand -base64 32).");
    }
    return { kid: "env-1", source: "env", key };
  }
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("Ni CONNECTIONS_ENCRYPTION_KEY ni AUTH_SECRET ne sont définis : impossible de chiffrer les jetons.");
  }
  const key = Buffer.from(hkdfSync("sha256", Buffer.from(secret, "utf-8"), HKDF_SALT, HKDF_INFO, 32));
  return { kid: "auth-1", source: "auth-secret", key };
}

/** D'où vient la clé, pour l'avertissement de la page d'administration. */
export function keySource(): KeySource | null {
  try {
    return masterKey().source;
  } catch {
    return null;
  }
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
  const { kid, key } = masterKey();
  if (blob.kid !== kid) {
    throw new Error("Ces données ont été chiffrées avec une autre clé : reconnectez le compte ou ressaisissez le secret.");
  }
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(blob.iv, "base64"));
    decipher.setAAD(additionalData(kid, context));
    decipher.setAuthTag(Buffer.from(blob.tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(blob.data, "base64")), decipher.final()]).toString("utf-8");
  } catch {
    throw new Error("Données chiffrées illisibles : la clé a changé ou le fichier a été altéré.");
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
