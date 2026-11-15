/**
 * Les règles d'une collection, résumées en une ligne lisible :
 * « Vidéos · tag Valorant · 30 derniers jours ». Fonction pure, sans
 * dépendance Node : la liste, l'en-tête d'une collection et la galerie la
 * partagent.
 */
import type { FileKind } from "@/lib/media-kind";
import type { CollectionRules } from "./types";

const NBSP = " ";

const KIND_WORDS: Record<FileKind, string> = {
  image: "images",
  video: "vidéos",
  file: "autres fichiers",
};
const KIND_ORDER: FileKind[] = ["image", "video", "file"];

/** « a », « a et b », « a, b et c » ; `word` remplace « et » (« ou », « ni »). */
export function joinWords(words: string[], word = "et"): string {
  if (words.length <= 1) return words[0] ?? "";
  return `${words.slice(0, -1).join(", ")} ${word} ${words[words.length - 1]}`;
}

const DATE_FORMAT = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** « 1er nov. 2026 », « 15 nov. 2026 » pour une date AAAA-MM-JJ ; le texte tel quel s'il ne se lit pas. */
export function formatRuleDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (Number.isNaN(date.getTime())) return value;
  const text = DATE_FORMAT.format(date);
  return date.getUTCDate() === 1 ? text.replace(/^1(?=\s)/, "1er") : text;
}

function tagList(slugs: string[], tagNames: Readonly<Record<string, string>>, word: string): string {
  return joinWords(
    slugs.map((slug) => tagNames[slug] ?? slug),
    word,
  );
}

/**
 * Chaque condition présente donne un morceau, dans un ordre fixe : types,
 * tags, favoris, sécurisés, période, texte. `tagNames` traduit un slug en nom
 * affiché ; un slug inconnu s'affiche tel quel.
 */
export function describeRuleParts(
  rules: CollectionRules,
  tagNames: Readonly<Record<string, string>> = {},
): string[] {
  const parts: string[] = [];

  const kinds = KIND_ORDER.filter((kind) => rules.kinds?.includes(kind));
  if (kinds.length) parts.push(joinWords(kinds.map((kind) => KIND_WORDS[kind])));

  const all = rules.tagsAll ?? [];
  if (all.length) parts.push(`${all.length > 1 ? "tags" : "tag"} ${tagList(all, tagNames, "et")}`);

  const any = rules.tagsAny ?? [];
  // « tag Valorant ou Apex » : un seul des deux suffit.
  if (any.length) parts.push(`tag ${tagList(any, tagNames, "ou")}`);

  const none = rules.tagsNone ?? [];
  if (none.length === 1) parts.push(`sans le tag ${tagList(none, tagNames, "ni")}`);
  else if (none.length > 1) parts.push(`sans les tags ${tagList(none, tagNames, "ni")}`);

  if (rules.starred === true) parts.push("favoris");
  else if (rules.starred === false) parts.push("hors favoris");

  if (rules.secure === true) parts.push("sécurisés");
  else if (rules.secure === false) parts.push("hors fichiers sécurisés");

  const period = rules.period;
  if (period && "lastDays" in period) {
    const days = Math.max(1, Math.round(period.lastDays));
    parts.push(days === 1 ? "dernières 24 heures" : `${days} derniers jours`);
  } else if (period) {
    const { from, to } = period;
    if (from && to) parts.push(`du ${formatRuleDate(from)} au ${formatRuleDate(to)}`);
    else if (from) parts.push(`depuis le ${formatRuleDate(from)}`);
    else if (to) parts.push(`jusqu’au ${formatRuleDate(to)}`);
  }

  const search = rules.search?.trim();
  if (search) parts.push(`nom contenant «${NBSP}${search}${NBSP}»`);

  return parts;
}

/** La ligne complète, première lettre en capitale ; « Aucune règle » si rien ne filtre. */
export function describeRules(
  rules: CollectionRules,
  tagNames: Readonly<Record<string, string>> = {},
): string {
  const line = describeRuleParts(rules, tagNames).join(" · ");
  if (!line) return "Aucune règle";
  return line.charAt(0).toLocaleUpperCase("fr-FR") + line.slice(1);
}

/** Table slug → nom affiché, pour `describeRules`. */
export function tagNameMap(tags: ReadonlyArray<{ slug: string; name: string }>): Record<string, string> {
  return Object.fromEntries(tags.map((tag) => [tag.slug, tag.name]));
}
