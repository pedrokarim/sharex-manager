/**
 * Modèles des textes de publication, communs à tous les services (fonctions
 * pures, utilisables dans le navigateur). Chaque connecteur applique ensuite
 * ses propres limites.
 *
 * Variables reconnues : {title} (nom du projet), {hook} (accroche de la
 * marque), {summary} (résumé du clip), {cta} (appel à l'action du carton de
 * fin), {tags} (tags en mots-dièse), {hashtags} (mots-dièse visibles),
 * {links} (liens de la marque, un par ligne), {credits} (bloc des crédits),
 * {date} (date du jour), {brand} (nom de la marque). Une variable inconnue
 * reste telle quelle ; une variable vide emporte la ligne qu'elle laisserait
 * vide.
 */

/** Un lien de la marque : libellé facultatif et adresse http(s). */
export interface TemplateLink {
  label?: string;
  url: string;
}

export interface TemplateVariables {
  title?: string;
  hook?: string;
  summary?: string;
  cta?: string;
  tags?: string[];
  hashtags?: string[];
  links?: TemplateLink[];
  credits?: string[];
  date?: Date | number;
  brand?: string;
  /** Langue de la date et des libellés (BCP 47), « fr » par défaut. */
  language?: string;
}

/** Noms des variables, dans l'ordre où l'interface les propose. */
export const TEMPLATE_VARIABLE_NAMES = ["title", "hook", "summary", "cta", "hashtags", "tags", "links", "credits", "date", "brand"] as const;
export type TemplateVariableName = (typeof TEMPLATE_VARIABLE_NAMES)[number];

const VARIABLE = new RegExp(`\\{(${TEMPLATE_VARIABLE_NAMES.join("|")})\\}`, "g");

const isFrench = (language?: string) => !language || /^fr\b/i.test(language);

/** Mot-dièse réduit à son mot : sans « # » ni espace. */
export function hashtagWord(tag: string): string {
  return String(tag ?? "").replace(/[#\s]+/g, "");
}

export function hashtags(tags: string[]): string {
  return tags
    .map(hashtagWord)
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

/** Liens, un par ligne : « Libellé : adresse », ou l'adresse seule. */
export function formatLinks(links: TemplateLink[] | undefined, language?: string): string {
  const separator = isFrench(language) ? " : " : ": ";
  return (links ?? [])
    .filter((link) => link && typeof link.url === "string" && link.url.trim())
    .map((link) => (link.label?.trim() ? `${link.label.trim()}${separator}${link.url.trim()}` : link.url.trim()))
    .join("\n");
}

/** Bloc des crédits, une mention par ligne ; vide sans crédit. */
export function creditsBlock(credits: string[] | undefined, language?: string): string {
  const list = (credits ?? []).map((credit) => String(credit ?? "").trim()).filter(Boolean);
  if (list.length === 0) return "";
  const heading = isFrench(language) ? "Crédits :" : "Credits:";
  return `${heading}\n${list.map((credit) => `– ${credit}`).join("\n")}`;
}

/** Valeurs des variables, telles qu'elles s'insèrent dans un modèle. */
export function templateValues(variables: TemplateVariables): Record<TemplateVariableName, string> {
  return {
    title: variables.title ?? "",
    hook: variables.hook ?? "",
    summary: variables.summary ?? "",
    cta: variables.cta ?? "",
    tags: hashtags(variables.tags ?? []),
    hashtags: hashtags(variables.hashtags ?? []),
    links: formatLinks(variables.links, variables.language),
    credits: creditsBlock(variables.credits, variables.language),
    date: formatTemplateDate(variables.date ?? Date.now(), variables.language),
    brand: variables.brand ?? "",
  };
}

/** Le modèle cite-t-il cette variable ? */
export function usesVariable(template: string, name: TemplateVariableName): boolean {
  return String(template ?? "").includes(`{${name}}`);
}

export function renderTemplate(template: string, variables: TemplateVariables): string {
  const values = templateValues(variables);
  const kept: string[] = [];
  for (const line of String(template ?? "").replace(/\r\n?/g, "\n").split("\n")) {
    let used = false;
    const filled = line.replace(VARIABLE, (_, name: TemplateVariableName) => {
      used = true;
      return values[name];
    });
    // Une variable vide ne laisse pas derrière elle une ligne blanche.
    if (used && !filled.trim()) continue;
    kept.push(filled);
  }
  return (
    kept
      .join("\n")
      // Ni espaces doublés ni lignes blanches en trop.
      .replace(/[ \t]{2,}/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
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
