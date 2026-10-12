/**
 * Modèles de titre et de description, communs à tous les services (fonctions
 * pures, utilisables dans le navigateur). Chaque connecteur applique ensuite
 * ses propres limites.
 *
 * Variables reconnues : {title} (nom du projet), {hook} (accroche de la
 * marque), {tags} (tags en mots-dièse), {date} (date du jour), {brand} (nom
 * de la marque). Une variable inconnue reste telle quelle.
 */

export interface TemplateVariables {
  title?: string;
  hook?: string;
  tags?: string[];
  date?: Date | number;
  brand?: string;
  /** Langue de la date (BCP 47), « fr » par défaut. */
  language?: string;
}

export function hashtags(tags: string[]): string {
  return tags
    .map((tag) => tag.replace(/[#\s]+/g, ""))
    .filter(Boolean)
    .map((tag) => `#${tag}`)
    .join(" ");
}

export function formatTemplateDate(date: Date | number, language = "fr"): string {
  const value = typeof date === "number" ? new Date(date) : date;
  try {
    return value.toLocaleDateString(language, { day: "numeric", month: "long", year: "numeric" });
  } catch {
    return value.toISOString().slice(0, 10);
  }
}

export function renderTemplate(template: string, variables: TemplateVariables): string {
  const values: Record<string, string> = {
    title: variables.title ?? "",
    hook: variables.hook ?? "",
    tags: hashtags(variables.tags ?? []),
    date: formatTemplateDate(variables.date ?? Date.now(), variables.language),
    brand: variables.brand ?? "",
  };
  return String(template ?? "")
    .replace(/\{(title|hook|tags|date|brand)\}/g, (_, name: string) => values[name])
    // Une variable vide ne laisse ni espaces doublés ni lignes blanches en trop.
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Retire les chevrons, refusés par plusieurs services (YouTube) dans les titres et descriptions. */
export function stripAngleBrackets(text: string): string {
  return text.replace(/[<>]/g, "");
}

/** Coupe à `max` caractères (points de code, jamais au milieu d'un émoji), avec « … » si besoin. */
export function truncateChars(text: string, max: number): string {
  const chars = Array.from(text);
  if (chars.length <= max) return text;
  return `${chars.slice(0, Math.max(0, max - 1)).join("").trimEnd()}…`;
}

const encoder = new TextEncoder();

export function byteLength(text: string): number {
  return encoder.encode(text).length;
}

/** Coupe à `maxBytes` octets en UTF-8, sans couper un caractère, avec « … » si besoin. */
export function truncateBytes(text: string, maxBytes: number): string {
  if (byteLength(text) <= maxBytes) return text;
  const ellipsis = "…";
  const budget = maxBytes - byteLength(ellipsis);
  let used = 0;
  let out = "";
  for (const char of text) {
    const size = byteLength(char);
    if (used + size > budget) break;
    used += size;
    out += char;
  }
  return `${out.trimEnd()}${ellipsis}`;
}

/**
 * Nettoie une liste de tags et la borne : doublons (sans tenir compte de la
 * casse) et tags vides retirés, puis on garde les premiers tant que
 * `measure(liste)` reste sous `maxTotal`.
 */
export function fitTags(
  tags: unknown,
  maxTotal: number,
  measure: (tags: string[]) => number = (list) => list.join(",").length
): string[] {
  if (!Array.isArray(tags)) return [];
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const raw of tags) {
    if (typeof raw !== "string") continue;
    const tag = stripAngleBrackets(raw).replace(/\s+/g, " ").trim();
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    if (measure([...kept, tag]) > maxTotal) continue;
    seen.add(key);
    kept.push(tag);
  }
  return kept;
}

/**
 * Mentions dont la licence exige l'attribution (Creative Commons BY et
 * dérivées). CC0 et le domaine public n'en demandent pas.
 */
export function creditsRequiringAttribution(credits: (string | undefined | null)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const credit of credits) {
    if (typeof credit !== "string") continue;
    const text = credit.trim();
    if (!text || seen.has(text)) continue;
    if (!/\bCC[\s-]?BY\b/i.test(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
}

/** Ajoute les crédits en fin de description, une ligne par mention. */
export function appendCredits(description: string, credits: string[]): string {
  if (credits.length === 0) return description;
  const block = `Crédits :\n${credits.map((credit) => `– ${credit}`).join("\n")}`;
  return description.trim() ? `${description.trim()}\n\n${block}` : block;
}
