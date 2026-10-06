/**
 * Réglages des moteurs de traduction : ordre d'appel, plafonds, adresse et clés.
 *
 *   data/translation/settings.json   ordre, plafonds mensuels, adresse de LibreTranslate
 *   data/translation/secrets.json    clés d'API, lisible par le seul compte du serveur
 *
 * Une variable d'environnement prime sur le fichier, comme pour les autres
 * modules : `DEEPL_API_KEY`, `LIBRETRANSLATE_URL`, `LIBRETRANSLATE_API_KEY`.
 * Une clé ne quitte jamais ce fichier vers le navigateur : `keyHint` n'en rend
 * que les quatre derniers caractères.
 */

import path from "path";
import { createHash } from "crypto";
import { dataRoot, readJson, writeJson } from "../../store";
import type { EngineSettingsPatch, TranslationEngineId } from "../../types";
import { ENGINE_IDS, isEngineId } from "./engines";
import { normalizeLibreUrl } from "./libretranslate";
import { normalizeContactEmail } from "./mymemory";

export const translationDir = () => path.join(dataRoot(), "translation");
const settingsFile = () => path.join(translationDir(), "settings.json");
const secretsFile = () => path.join(translationDir(), "secrets.json");

/**
 * DeepL d'abord, plus juste vers le français ; LibreTranslate en secours (§ 7.5) ;
 * MyMemory en dernier, parce qu'il marche sans rien régler mais avec un petit
 * quota par jour.
 */
export const DEFAULT_ORDER: TranslationEngineId[] = ["deepl", "libretranslate", "mymemory"];

/**
 * Plafonds mensuels par défaut, en caractères ; 0 : aucun. Celui de DeepL est
 * le quota de l'offre gratuite : avec une autre offre, il se règle dans la
 * page « Moteurs ».
 */
export const DEFAULT_MONTHLY_LIMITS: Record<TranslationEngineId, number> = { deepl: 500_000, libretranslate: 0, mymemory: 0 };

const MAX_MONTHLY_LIMIT = 1_000_000_000;
const MAX_KEY_LENGTH = 300;

export interface EngineSettings {
  order: TranslationEngineId[];
  monthlyLimits: Record<TranslationEngineId, number>;
}

export interface EngineCredentials {
  deeplKey?: string;
  libreTranslateUrl?: string;
  libreTranslateKey?: string;
  /** Adresse de contact donnée à MyMemory : facultative, elle élève son quota du jour. */
  myMemoryEmail?: string;
}

interface StoredSettings {
  order?: unknown;
  monthlyLimits?: unknown;
  libreTranslateUrl?: unknown;
  myMemoryEmail?: unknown;
}

interface StoredSecrets {
  deeplKey?: unknown;
  libreTranslateKey?: unknown;
}

// ─── Lecture ─────────────────────────────────────────────────────

/** Ordre complet : les moteurs cités d'abord, une fois chacun, les autres à la suite. */
function completeOrder(value: unknown): TranslationEngineId[] {
  const given = Array.isArray(value) ? value.filter(isEngineId) : [];
  return [...new Set([...given, ...DEFAULT_ORDER])];
}

function cleanLimit(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= MAX_MONTHLY_LIMIT ? value : fallback;
}

export function readSettings(): EngineSettings {
  const stored = readJson<StoredSettings>(settingsFile()) ?? {};
  const limits = (stored.monthlyLimits && typeof stored.monthlyLimits === "object" ? stored.monthlyLimits : {}) as Record<string, unknown>;
  return {
    order: completeOrder(stored.order),
    monthlyLimits: {
      deepl: cleanLimit(limits.deepl, DEFAULT_MONTHLY_LIMITS.deepl),
      libretranslate: cleanLimit(limits.libretranslate, DEFAULT_MONTHLY_LIMITS.libretranslate),
      mymemory: cleanLimit(limits.mymemory, DEFAULT_MONTHLY_LIMITS.mymemory),
    },
  };
}

const ENV = {
  deeplKey: "DEEPL_API_KEY",
  libreTranslateUrl: "LIBRETRANSLATE_URL",
  libreTranslateKey: "LIBRETRANSLATE_API_KEY",
} as const;

type CredentialName = keyof typeof ENV;

const fromEnv = (name: CredentialName) => process.env[ENV[name]]?.trim() || undefined;
const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : undefined);

export function readCredentials(): EngineCredentials {
  const secrets = readJson<StoredSecrets>(secretsFile()) ?? {};
  const settings = readJson<StoredSettings>(settingsFile()) ?? {};
  const url = fromEnv("libreTranslateUrl") ?? text(settings.libreTranslateUrl);
  return {
    deeplKey: fromEnv("deeplKey") ?? text(secrets.deeplKey),
    // Une adresse mal formée, même venue de l'environnement, vaut « non configuré ».
    libreTranslateUrl: url ? (normalizeLibreUrl(url) ?? undefined) : undefined,
    libreTranslateKey: fromEnv("libreTranslateKey") ?? text(secrets.libreTranslateKey),
    myMemoryEmail: (() => {
      const email = text(settings.myMemoryEmail);
      return email ? (normalizeContactEmail(email) ?? undefined) : undefined;
    })(),
  };
}

/** Quatre derniers caractères d'une clé ; rien pour une clé trop courte pour qu'ils ne la trahissent pas. */
export function keyHint(key: string | undefined): string | undefined {
  return key && key.length >= 12 ? key.slice(-4) : undefined;
}

/**
 * Empreinte de ce qui identifie un moteur auprès de son service. Sert à
 * retenir qu'une clé a été refusée sans la garder : tant que l'empreinte ne
 * change pas, le moteur n'est plus appelé.
 */
export function credentialFingerprint(id: TranslationEngineId, credentials: EngineCredentials): string {
  const parts =
    id === "deepl"
      ? [credentials.deeplKey ?? ""]
      : id === "mymemory"
        ? [credentials.myMemoryEmail ?? ""]
        : [credentials.libreTranslateUrl ?? "", credentials.libreTranslateKey ?? ""];
  return createHash("sha256").update(`${id}\n${parts.join("\n")}`).digest("hex").slice(0, 32);
}

// ─── Écriture ────────────────────────────────────────────────────

const CONTROL = /[\u0000-\u001f\u007f]/;

function assertNotFromEnv(name: CredentialName, label: string) {
  if (fromEnv(name)) throw new Error(`${label} vient d'une variable d'environnement : cela se change là-bas.`);
}

/** Clé à enregistrer ; chaîne vide : la clé est effacée. */
function cleanKey(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length > MAX_KEY_LENGTH || CONTROL.test(value)) throw new Error(`${label} invalide.`);
  return value.trim();
}

/**
 * Applique des réglages envoyés par un administrateur. Tout est contrôlé avant
 * la première écriture : rien n'est enregistré si un champ est refusé. Un champ
 * absent n'est pas modifié.
 */
export function applySettingsPatch(patch: unknown) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new Error("Réglages invalides.");
  const input = patch as { [K in keyof EngineSettingsPatch]: unknown };

  let order: TranslationEngineId[] | undefined;
  if (input.order !== undefined) {
    const given = input.order;
    if (!Array.isArray(given) || given.length === 0 || !given.every(isEngineId) || new Set(given).size !== given.length) {
      throw new Error("Ordre des moteurs invalide.");
    }
    order = completeOrder(given);
  }

  let limits: Partial<Record<TranslationEngineId, number>> | undefined;
  if (input.monthlyLimits !== undefined) {
    const given = input.monthlyLimits;
    if (!given || typeof given !== "object" || Array.isArray(given)) throw new Error("Plafonds invalides.");
    limits = {};
    for (const id of ENGINE_IDS) {
      const value = (given as Record<string, unknown>)[id];
      if (value === undefined) continue;
      if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > MAX_MONTHLY_LIMIT) {
        throw new Error("Plafond mensuel invalide : un nombre entier de caractères, 0 pour aucun plafond.");
      }
      limits[id] = value;
    }
  }

  let url: string | undefined;
  if (input.libreTranslateUrl !== undefined) {
    assertNotFromEnv("libreTranslateUrl", "L'adresse de LibreTranslate");
    if (typeof input.libreTranslateUrl !== "string") throw new Error("Adresse de LibreTranslate invalide.");
    url = input.libreTranslateUrl.trim();
    if (url) {
      const normalized = normalizeLibreUrl(url);
      if (!normalized) throw new Error("Adresse de LibreTranslate invalide : une adresse « http » ou « https », sans identifiants.");
      url = normalized;
    }
  }

  let email: string | undefined;
  if (input.myMemoryEmail !== undefined) {
    if (typeof input.myMemoryEmail !== "string") throw new Error("Adresse de contact invalide.");
    email = input.myMemoryEmail.trim();
    if (email) {
      const normalized = normalizeContactEmail(email);
      if (!normalized) throw new Error("Adresse de contact invalide : une adresse e-mail simple, ou rien.");
      email = normalized;
    }
  }

  let deeplKey: string | undefined;
  if (input.deeplKey !== undefined) {
    assertNotFromEnv("deeplKey", "La clé DeepL");
    deeplKey = cleanKey(input.deeplKey, "Clé DeepL");
  }
  let libreKey: string | undefined;
  if (input.libreTranslateKey !== undefined) {
    assertNotFromEnv("libreTranslateKey", "La clé LibreTranslate");
    libreKey = cleanKey(input.libreTranslateKey, "Clé LibreTranslate");
  }

  if (order || limits || url !== undefined || email !== undefined) {
    const stored = readJson<StoredSettings>(settingsFile()) ?? {};
    const current = readSettings();
    const next: Record<string, unknown> = {
      order: order ?? current.order,
      monthlyLimits: { ...current.monthlyLimits, ...limits },
    };
    const keptUrl = url !== undefined ? url : text(stored.libreTranslateUrl);
    if (keptUrl) next.libreTranslateUrl = keptUrl;
    const keptEmail = email !== undefined ? email : text(stored.myMemoryEmail);
    if (keptEmail) next.myMemoryEmail = keptEmail;
    writeJson(settingsFile(), next);
  }

  if (deeplKey !== undefined || libreKey !== undefined) {
    const stored = readJson<StoredSecrets>(secretsFile()) ?? {};
    const next: Record<string, string> = {};
    const keys: [keyof StoredSecrets, string | undefined][] = [
      ["deeplKey", deeplKey],
      ["libreTranslateKey", libreKey],
    ];
    for (const [name, given] of keys) {
      const value = given !== undefined ? given : text(stored[name]);
      if (value) next[name] = value;
    }
    writeJson(secretsFile(), next, { mode: 0o600 });
  }
}
