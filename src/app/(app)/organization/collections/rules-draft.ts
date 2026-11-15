/**
 * L'état de l'éditeur de collection et sa traduction en `CollectionRules`.
 * L'éditeur travaille sur des champs de formulaire (textes, choix à trois
 * positions) ; seules les conditions réellement remplies partent au serveur.
 */
import type { FileKind } from "@/lib/media-kind";
import type { CollectionRules } from "@/lib/organization/types";

/** Favoris ou sécurisés : sans condition, seulement eux, ou tous sauf eux. */
export type TriState = "any" | "only" | "exclude";
export type PeriodMode = "any" | "last" | "range";

export interface RulesDraft {
  tagsAll: string[];
  tagsAny: string[];
  tagsNone: string[];
  kinds: FileKind[];
  starred: TriState;
  secure: TriState;
  periodMode: PeriodMode;
  /** Saisie libre du nombre de jours : lue à l'envoi. */
  lastDays: string;
  from: string;
  to: string;
  search: string;
}

export const EMPTY_DRAFT: RulesDraft = {
  tagsAll: [],
  tagsAny: [],
  tagsNone: [],
  kinds: [],
  starred: "any",
  secure: "any",
  periodMode: "any",
  lastDays: "30",
  from: "",
  to: "",
  search: "",
};

const LAST_DAYS_MAX = 3650;

const fromTri = (value: boolean | undefined): TriState =>
  value === true ? "only" : value === false ? "exclude" : "any";
const toTri = (value: TriState): boolean | undefined =>
  value === "only" ? true : value === "exclude" ? false : undefined;

export function draftFromRules(rules: CollectionRules | undefined): RulesDraft {
  if (!rules) return { ...EMPTY_DRAFT };
  const period = rules.period;
  const last = period && "lastDays" in period ? period : null;
  const range = period && !("lastDays" in period) ? period : null;
  return {
    tagsAll: [...(rules.tagsAll ?? [])],
    tagsAny: [...(rules.tagsAny ?? [])],
    tagsNone: [...(rules.tagsNone ?? [])],
    kinds: [...(rules.kinds ?? [])],
    starred: fromTri(rules.starred),
    secure: fromTri(rules.secure),
    periodMode: last ? "last" : range && (range.from || range.to) ? "range" : "any",
    lastDays: last ? String(last.lastDays) : EMPTY_DRAFT.lastDays,
    from: range?.from ?? "",
    to: range?.to ?? "",
    search: rules.search ?? "",
  };
}

/** Le nombre de jours saisi, borné ; `null` s'il ne se lit pas. */
export function parseLastDays(raw: string): number | null {
  const days = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(days) || days < 1) return null;
  return Math.min(days, LAST_DAYS_MAX);
}

export function rulesFromDraft(draft: RulesDraft): CollectionRules {
  const rules: CollectionRules = {};
  if (draft.tagsAll.length) rules.tagsAll = [...draft.tagsAll];
  if (draft.tagsAny.length) rules.tagsAny = [...draft.tagsAny];
  if (draft.tagsNone.length) rules.tagsNone = [...draft.tagsNone];
  if (draft.kinds.length) rules.kinds = [...draft.kinds];
  const starred = toTri(draft.starred);
  if (starred !== undefined) rules.starred = starred;
  const secure = toTri(draft.secure);
  if (secure !== undefined) rules.secure = secure;
  if (draft.periodMode === "last") {
    const lastDays = parseLastDays(draft.lastDays);
    if (lastDays) rules.period = { lastDays };
  } else if (draft.periodMode === "range" && (draft.from || draft.to)) {
    rules.period = {
      ...(draft.from ? { from: draft.from } : {}),
      ...(draft.to ? { to: draft.to } : {}),
    };
  }
  const search = draft.search.trim();
  if (search) rules.search = search;
  return rules;
}
