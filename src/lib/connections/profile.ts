/**
 * Profil d'un compte connecté : fonctions pures, communes au serveur et au
 * navigateur (dossier 07, § 8.12). Contrôle des valeurs avant envoi,
 * mots-clés au format des services, préremplissage depuis une image de
 * marque, différence lisible entre la valeur actuelle et la valeur proposée.
 *
 * Rien ici ne cite un service : chaque connecteur déclare ses éléments
 * (`Connector.profileFields`), avec leurs limites.
 */

import type { ProfileField, ProfileLocalization, ProfileValue } from "./types";
import { formatLinks, stripAngleBrackets, type TemplateLink } from "./templates";

// ─── Mots-clés ────────────────────────────────────────────────────

/**
 * Lit une liste de mots-clés séparés par des espaces ; un mot-clé de
 * plusieurs mots est entre guillemets (`"jeu vidéo" anime`), comme les rend
 * YouTube.
 */
export function parseKeywords(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === "string").map((entry) => entry.trim()).filter(Boolean);
  if (typeof value !== "string") return [];
  const out: string[] = [];
  const pattern = /"([^"]*)"|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(value))) {
    const word = (match[1] ?? match[2] ?? "").replace(/\s+/g, " ").trim();
    if (word) out.push(word);
  }
  return out;
}

/** Écrit la liste comme le service l'attend : séparée par des espaces, guillemets autour d'un mot-clé de plusieurs mots. */
export function formatKeywords(keywords: string[]): string {
  return keywords.map((keyword) => (/\s/.test(keyword) ? `"${keyword}"` : keyword)).join(" ");
}

/** Longueur de la liste telle que le service la compte (chaîne formatée). */
export function keywordsLength(keywords: string[]): number {
  return Array.from(formatKeywords(keywords)).length;
}

/** Nettoie un mot-clé : ni guillemet, ni chevron, ni espace en trop. */
export function cleanKeyword(keyword: string): string {
  return stripAngleBrackets(String(keyword ?? "")).replace(/["\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Garde les premiers mots-clés, sans doublon (casse ignorée), tant que la
 * liste formatée tient dans `max` caractères.
 */
export function fitKeywords(keywords: string[], max: number): string[] {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const raw of keywords) {
    const keyword = cleanKeyword(raw);
    const key = keyword.toLocaleLowerCase("fr");
    if (!keyword || seen.has(key)) continue;
    if (keywordsLength([...kept, keyword]) > max) continue;
    seen.add(key);
    kept.push(keyword);
  }
  return kept;
}

// ─── Contrôle des valeurs ─────────────────────────────────────────

const LANGUAGE_CODE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;
const COUNTRY_CODE = /^[A-Z]{2}$/;
const VIDEO_ID = /^[A-Za-z0-9_-]{6,64}$/;
/** Plafond de sécurité d'un texte quand le service n'en déclare pas. */
const DEFAULT_MAX = 10_000;
const MAX_LOCALIZATIONS = 60;

const charCount = (text: string) => Array.from(text).length;

/** Libellé entre guillemets français, pour les messages. */
const quoted = (label: string) => `« ${label} »`;

function cleanText(value: unknown, multiline: boolean): string {
  if (typeof value !== "string") return "";
  const normalized = value.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
  return (multiline ? normalized : normalized.replace(/\n+/g, " ")).trim();
}

function checkLength(field: Pick<ProfileField, "label">, text: string, max: number | undefined, what = "") {
  const limit = max ?? DEFAULT_MAX;
  if (charCount(text) > limit) throw new Error(`${quoted(field.label)}${what} dépasse ${limit.toLocaleString("fr-FR")} caractères.`);
}

/** Langue BCP 47 valide (« fr », « en-US »). */
export function isLanguageCode(value: unknown): value is string {
  return typeof value === "string" && LANGUAGE_CODE.test(value);
}

/** Pays ISO 3166-1 alpha-2 valide (« FR »). */
export function isCountryCode(value: unknown): value is string {
  return typeof value === "string" && COUNTRY_CODE.test(value);
}

/** Adresse web http(s) complète, ou `null`. */
export function cleanWebsite(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Contrôle une valeur reçue pour un élément, selon sa nature et ses limites.
 * Lève une erreur en français ; rend la valeur nettoyée, prête à envoyer.
 */
export function cleanProfileValue(field: ProfileField, value: unknown): ProfileValue {
  switch (field.kind) {
    case "text":
    case "textarea": {
      const text = cleanText(value, field.kind === "textarea");
      checkLength(field, text, field.maxLength);
      return text;
    }
    case "url": {
      const text = cleanText(value, false);
      if (!text) {
        if (field.clearable) return "";
        throw new Error(`${quoted(field.label)} est vide.`);
      }
      const url = cleanWebsite(text);
      if (!url) throw new Error(`${quoted(field.label)} : adresse complète en http:// ou https:// attendue.`);
      checkLength(field, url, field.maxLength);
      return url;
    }
    case "keywords": {
      const keywords: string[] = [];
      const seen = new Set<string>();
      for (const raw of parseKeywords(value)) {
        const keyword = cleanKeyword(raw);
        const key = keyword.toLocaleLowerCase("fr");
        if (!keyword || seen.has(key)) continue;
        seen.add(key);
        keywords.push(keyword);
      }
      const limit = field.maxLength ?? DEFAULT_MAX;
      if (keywordsLength(keywords) > limit) throw new Error(`${quoted(field.label)} dépasse ${limit.toLocaleString("fr-FR")} caractères au total.`);
      return keywords;
    }
    case "language":
    case "country":
    case "video": {
      const text = typeof value === "string" ? value.trim() : "";
      if (!text) {
        if (field.clearable) return "";
        throw new Error(`${quoted(field.label)} est vide.`);
      }
      const valid = field.kind === "language" ? isLanguageCode(text) : field.kind === "country" ? isCountryCode(text) : VIDEO_ID.test(text);
      if (!valid) throw new Error(`${quoted(field.label)} : valeur refusée.`);
      return text;
    }
    case "localizations": {
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${quoted(field.label)} : traductions attendues.`);
      const entries = Object.entries(value as Record<string, unknown>);
      if (entries.length > MAX_LOCALIZATIONS) throw new Error(`${quoted(field.label)} : ${MAX_LOCALIZATIONS} langues au plus.`);
      const out: Record<string, ProfileLocalization> = {};
      for (const [language, raw] of entries) {
        if (!LANGUAGE_CODE.test(language)) throw new Error(`${quoted(field.label)} : langue ${quoted(language.slice(0, 20))} refusée.`);
        const entry = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
        const title = cleanText(entry.title, false);
        const description = cleanText(entry.description, true);
        checkLength(field, title, field.itemLimits?.title, ` (nom en ${language})`);
        checkLength(field, description, field.itemLimits?.description, ` (description en ${language})`);
        if (!title && !description) continue;
        out[language] = { title, description };
      }
      return out;
    }
    case "image":
      throw new Error(`${quoted(field.label)} est une image : elle s’envoie depuis la marque.`);
  }
}

// ─── Comparaison ──────────────────────────────────────────────────

/** Forme comparable d'une valeur : les mots-clés gardent leur ordre, les traductions sont triées par langue. */
function comparable(value: ProfileValue | undefined): string {
  if (value === undefined) return "";
  if (typeof value === "string") return value.replace(/\r\n?/g, "\n").trim();
  if (Array.isArray(value)) return JSON.stringify(value.map((entry) => entry.trim()));
  const sorted = Object.keys(value)
    .sort()
    .map((language) => [language, value[language].title.trim(), value[language].description.replace(/\r\n?/g, "\n").trim()]);
  return JSON.stringify(sorted);
}

/** Deux valeurs reviennent-elles au même chez le service ? */
export function sameProfileValue(a: ProfileValue | undefined, b: ProfileValue | undefined): boolean {
  return comparable(a) === comparable(b);
}

/** Différence de deux listes : ajoutés et retirés (casse ignorée). */
export function listDiff(before: string[], after: string[]): { added: string[]; removed: string[] } {
  const key = (entry: string) => entry.toLocaleLowerCase("fr");
  const beforeKeys = new Set(before.map(key));
  const afterKeys = new Set(after.map(key));
  return { added: after.filter((entry) => !beforeKeys.has(key(entry))), removed: before.filter((entry) => !afterKeys.has(key(entry))) };
}

export type DiffPart = { kind: "same" | "added" | "removed"; text: string };

/** Découpe en mots, espaces et retours à la ligne gardés : la différence se relit telle quelle. */
function tokens(text: string): string[] {
  return text.match(/\s+|[^\s]+/g) ?? [];
}

/**
 * Différence mot à mot de deux textes (plus longue sous-suite commune).
 * Au-delà de 1 500 mots de part et d'autre, rend le tout retiré puis ajouté.
 */
export function wordDiff(before: string, after: string): DiffPart[] {
  const a = tokens(before);
  const b = tokens(after);
  if (a.length * b.length > 2_250_000) {
    return [
      ...(before ? [{ kind: "removed" as const, text: before }] : []),
      ...(after ? [{ kind: "added" as const, text: after }] : []),
    ];
  }
  // Table des longueurs, de la fin vers le début.
  const width = b.length + 1;
  const table = new Uint16Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i * width + j] = a[i] === b[j] ? table[(i + 1) * width + j + 1] + 1 : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    }
  }
  const parts: DiffPart[] = [];
  const push = (kind: DiffPart["kind"], text: string) => {
    const last = parts[parts.length - 1];
    if (last && last.kind === kind) last.text += text;
    else parts.push({ kind, text });
  };
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push("same", a[i]);
      i += 1;
      j += 1;
    } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) {
      push("removed", a[i]);
      i += 1;
    } else {
      push("added", b[j]);
      j += 1;
    }
  }
  while (i < a.length) push("removed", a[i++]);
  while (j < b.length) push("added", b[j++]);
  return parts;
}

// ─── Marque ───────────────────────────────────────────────────────

/**
 * Ce qu'une image de marque fournit au profil, déjà mis en forme par le
 * module de la marque (modèle de description rendu) : le cœur ne connaît pas
 * la forme d'une marque.
 */
export interface ProfileBrandInput {
  name: string;
  bio: string;
  /** Description de la chaîne, modèle déjà rendu. */
  description: string;
  keywords: string[];
  language: string;
  /** Pays ISO 3166-1 alpha-2, ou vide. */
  country: string;
  links: TemplateLink[];
}

/** Valeur proposée par la marque pour un élément modifiable ; `undefined` : la marque ne fournit rien. */
export function brandProfileValue(field: ProfileField, brand: ProfileBrandInput | null): ProfileValue | undefined {
  if (!brand || !field.brand) return undefined;
  switch (field.brand) {
    case "name":
      return brand.name;
    case "bio":
      return brand.bio;
    case "description":
      return brand.description;
    case "keywords":
      return fitKeywords(brand.keywords, field.maxLength ?? DEFAULT_MAX);
    case "language":
      return isLanguageCode(brand.language) ? brand.language : undefined;
    case "country":
      return isCountryCode(brand.country) ? brand.country : field.clearable ? "" : undefined;
    case "links":
      return formatLinks(brand.links, brand.language);
    case "website":
      return brand.links.map((link) => cleanWebsite(link.url)).find((url): url is string => Boolean(url)) ?? "";
  }
}

/** Texte à copier pour un élément à changer chez le service ; vide : rien à copier. */
export function brandCopyText(field: ProfileField, brand: ProfileBrandInput | null): string {
  const value = brandProfileValue(field, brand);
  if (value === undefined) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.join(", ");
  return "";
}

/** Adresse d'aide chez le service, pour ce compte. */
export function resolveManualUrl(template: string, account: { externalId: string; handle?: string; url?: string }): string {
  const handle = (account.handle ?? "").replace(/^@/, "");
  return template
    .replace(/\{externalId\}/g, encodeURIComponent(account.externalId))
    .replace(/\{handle\}/g, encodeURIComponent(handle))
    .replace(/\{url\}/g, account.url ?? "");
}

// ─── Langues et pays ──────────────────────────────────────────────

/** Langues proposées (BCP 47) ; une langue déjà choisie hors de la liste reste affichée. */
export const PROFILE_LANGUAGES = [
  "fr", "en", "es", "de", "it", "pt", "pt-BR", "nl", "pl", "ru", "uk", "tr", "ar", "he", "fa", "hi", "bn", "ur", "id", "ms", "th", "vi",
  "ja", "ko", "zh-Hans", "zh-Hant", "sv", "no", "da", "fi", "cs", "sk", "hu", "ro", "bg", "el", "hr", "sr", "sl", "ca", "eu", "gl", "br",
  "co", "ht", "mg", "sw", "tl", "en-GB", "es-419", "fr-CA",
] as const;

/** Pays ISO 3166-1 alpha-2. */
export const PROFILE_COUNTRIES = (
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ " +
  "DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT " +
  "JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI " +
  "NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK " +
  "TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW"
).split(" ");

function displayName(type: "language" | "region", code: string): string {
  try {
    const names = new Intl.DisplayNames(["fr"], { type });
    const name = names.of(code);
    return name && name !== code ? name.charAt(0).toLocaleUpperCase("fr") + name.slice(1) : code;
  } catch {
    return code;
  }
}

/** « Français », « Anglais (États-Unis) »… ; le code seul si le navigateur ne le connaît pas. */
export function languageLabel(code: string): string {
  return code ? displayName("language", code) : "";
}

/** « France », « Belgique »… */
export function countryLabel(code: string): string {
  return code ? displayName("region", code) : "";
}
