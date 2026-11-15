/**
 * Règles pures des tags et des collections (docs/organisation.md) : validation,
 * évaluation d'une collection sur un fichier, réécriture des règles quand un
 * tag disparaît. Aucune dépendance Node ni Bun : testable sous Vitest, et
 * utilisable par l'interface.
 */
import { z } from "zod";
import { fileKind } from "@/lib/media-kind";
import type { FileInfo } from "@/types/files";
import {
  COLLECTION_DESCRIPTION_MAX,
  COLLECTION_NAME_MAX,
  TAG_DESCRIPTION_MAX,
  hasAnyRule,
  slugify,
  type CollectionOrder,
  type CollectionRules,
  type CollectionSort,
} from "./types";

/** Erreur métier, traduite en 400 par les routes. */
export type OrganizationErrorCode =
  | "invalid_name"
  | "invalid_description"
  | "invalid_rules"
  | "empty_rules"
  | "too_many_tags"
  | "same_tag";

export class OrganizationError extends Error {
  constructor(
    public readonly code: OrganizationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "OrganizationError";
  }
}

/** Plus grand nombre de jours d'une période relative (dix ans). */
export const PERIOD_LAST_DAYS_MAX = 3650;
/** Plus grand nombre de tags cités par une liste de règles. */
export const RULE_TAGS_MAX = 30;
/** Longueur maximale du texte cherché par une collection. */
export const RULE_SEARCH_MAX = 100;

const DAY_MS = 86_400_000;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

const isoDay = z
  .string()
  .regex(ISO_DAY)
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)));

const slugList = z
  .array(z.string().max(80))
  .max(RULE_TAGS_MAX)
  .optional();

/** Schéma des règles reçues (route, base) ; les slugs sont normalisés ensuite. */
export const collectionRulesSchema = z
  .object({
    tagsAll: slugList,
    tagsAny: slugList,
    tagsNone: slugList,
    kinds: z.array(z.enum(["image", "video", "file"])).max(3).optional(),
    starred: z.boolean().optional(),
    secure: z.boolean().optional(),
    period: z
      .union([
        z.object({ lastDays: z.number().int().min(1).max(PERIOD_LAST_DAYS_MAX) }).strict(),
        z.object({ from: isoDay.optional(), to: isoDay.optional() }).strict(),
      ])
      .optional(),
    search: z.string().max(RULE_SEARCH_MAX).optional(),
  })
  .strict();

function cleanSlugs(values: string[] | undefined): string[] | undefined {
  if (!values) return undefined;
  const slugs = [...new Set(values.map(slugify).filter(Boolean))];
  return slugs.length ? slugs : undefined;
}

/**
 * Règles normalisées : slugs nettoyés et dédoublonnés, listes vides et
 * période vide retirées, texte resserré. Les clés absentes ne filtrent rien.
 */
export function normalizeRules(rules: CollectionRules): CollectionRules {
  const out: CollectionRules = {};
  const tagsAll = cleanSlugs(rules.tagsAll);
  const tagsAny = cleanSlugs(rules.tagsAny);
  const tagsNone = cleanSlugs(rules.tagsNone);
  if (tagsAll) out.tagsAll = tagsAll;
  if (tagsAny) out.tagsAny = tagsAny;
  if (tagsNone) out.tagsNone = tagsNone;
  if (rules.kinds?.length) out.kinds = [...new Set(rules.kinds)];
  if (rules.starred !== undefined) out.starred = rules.starred;
  if (rules.secure !== undefined) out.secure = rules.secure;
  const period = rules.period;
  if (period) {
    if ("lastDays" in period) out.period = { lastDays: period.lastDays };
    else if (period.from || period.to) {
      out.period = {
        ...(period.from ? { from: period.from } : {}),
        ...(period.to ? { to: period.to } : {}),
      };
    }
  }
  const search = rules.search?.replace(/\s+/g, " ").trim();
  if (search) out.search = search;
  return out;
}

/** Règles validées et normalisées, ou `null` si l'entrée n'en est pas. */
export function parseCollectionRules(input: unknown): CollectionRules | null {
  const parsed = collectionRulesSchema.safeParse(input);
  return parsed.success ? normalizeRules(parsed.data) : null;
}

/** Règles lues en base : jamais d'exception, une valeur abîmée donne `{}`. */
export function rulesFromJson(json: string | null | undefined): CollectionRules {
  if (!json) return {};
  try {
    return parseCollectionRules(JSON.parse(json)) ?? {};
  } catch {
    return {};
  }
}

/** Bornes d'une période en millisecondes, `to` compris jusqu'à la fin du jour (UTC). */
export function periodBounds(
  period: NonNullable<CollectionRules["period"]>,
  now: Date,
): { start: number | null; end: number | null } {
  if ("lastDays" in period) {
    return { start: now.getTime() - period.lastDays * DAY_MS, end: null };
  }
  return {
    start: period.from ? Date.parse(`${period.from}T00:00:00Z`) : null,
    end: period.to ? Date.parse(`${period.to}T00:00:00Z`) + DAY_MS - 1 : null,
  };
}

/**
 * Vrai si le fichier satisfait toutes les règles de la collection. Une
 * collection sans aucune règle (par exemple après la suppression du seul tag
 * qu'elle citait) ne retient rien : elle ne devient jamais la galerie entière.
 */
export function matchesCollection(
  file: Pick<FileInfo, "name" | "createdAt" | "isSecure" | "isStarred">,
  slugs: readonly string[] | ReadonlySet<string>,
  rules: CollectionRules,
  now: Date,
): boolean {
  if (!hasAnyRule(rules)) return false;
  const tags: ReadonlySet<string> = slugs instanceof Set ? slugs : new Set(slugs as readonly string[]);

  if (rules.tagsAll?.length && !rules.tagsAll.every((slug) => tags.has(slug))) return false;
  if (rules.tagsAny?.length && !rules.tagsAny.some((slug) => tags.has(slug))) return false;
  if (rules.tagsNone?.length && rules.tagsNone.some((slug) => tags.has(slug))) return false;
  if (rules.kinds?.length && !rules.kinds.includes(fileKind(file.name))) return false;
  if (rules.starred !== undefined && Boolean(file.isStarred) !== rules.starred) return false;
  if (rules.secure !== undefined && Boolean(file.isSecure) !== rules.secure) return false;

  if (rules.period) {
    const time = new Date(file.createdAt).getTime();
    const { start, end } = periodBounds(rules.period, now);
    if (start !== null && !(time >= start)) return false;
    if (end !== null && !(time <= end)) return false;
  }

  const search = rules.search?.trim().toLowerCase();
  if (search && !file.name.toLowerCase().includes(search)) return false;
  return true;
}

/** Tags cités par les règles, toutes listes confondues. */
export function rulesTagSlugs(rules: CollectionRules): string[] {
  return [...new Set([...(rules.tagsAll ?? []), ...(rules.tagsAny ?? []), ...(rules.tagsNone ?? [])])];
}

/**
 * Règles où le slug `from` est remplacé par `to` (renommage, fusion), ou
 * retiré si `to` vaut `null` (suppression). Rend les mêmes règles, normalisées.
 */
export function replaceRuleSlug(rules: CollectionRules, from: string, to: string | null): CollectionRules {
  const swap = (list: string[] | undefined) =>
    list?.flatMap((slug) => (slug === from ? (to ? [to] : []) : [slug]));
  return normalizeRules({
    ...rules,
    tagsAll: swap(rules.tagsAll),
    tagsAny: swap(rules.tagsAny),
    tagsNone: swap(rules.tagsNone),
  });
}

// ─── Noms et slugs ───────────────────────────────────────────────

/** Nom de collection nettoyé, ou `null` s'il ne reste rien. */
export function cleanCollectionName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.replace(/\s+/g, " ").trim().slice(0, COLLECTION_NAME_MAX);
  return name || null;
}

/** Description nettoyée ; `null` si vide. Trop longue : `undefined` (refus). */
export function cleanDescription(raw: unknown, max: number): string | null | undefined {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "string") return undefined;
  const text = raw.trim();
  if (text.length > max) return undefined;
  return text || null;
}

export const cleanTagDescription = (raw: unknown) => cleanDescription(raw, TAG_DESCRIPTION_MAX);
export const cleanCollectionDescription = (raw: unknown) => cleanDescription(raw, COLLECTION_DESCRIPTION_MAX);

/**
 * Premier slug libre à partir de `base` : `base`, puis `base-2`, `base-3`…
 * Un nom sans lettre ni chiffre (« !!! ») donne `fallback`.
 */
export function uniqueSlug(base: string, taken: ReadonlySet<string>, fallback = "collection"): string {
  const root = base || fallback;
  if (!taken.has(root)) return root;
  for (let index = 2; ; index++) {
    const candidate = `${root.slice(0, 55)}-${index}`;
    if (!taken.has(candidate)) return candidate;
  }
}

export const COLLECTION_SORTS: readonly CollectionSort[] = ["date", "name", "size"];
export const COLLECTION_ORDERS: readonly CollectionOrder[] = ["asc", "desc"];

/** Un nom de fichier seul, jamais un chemin : « ../ » sortirait du dossier d'envoi. */
export function isPlainFileName(name: unknown): name is string {
  return (
    typeof name === "string" &&
    name.length > 0 &&
    name.length <= 255 &&
    !/[\\/\0]/.test(name) &&
    !name.startsWith(".")
  );
}
