/**
 * Fonctions pures du glossaire d'un dossier : comparaison des termes,
 * recherche, contrôle avant enregistrement.
 */

import type { GlossaryEntry } from "./types";

/** Bornes appliquées par le serveur (`sanitizeGlossary`). */
export const GLOSSARY_LIMITS = { term: 200, note: 500 };

/** Deux termes sont les mêmes à la casse et aux espaces près. */
export function glossaryKey(source: string): string {
  return source.replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

export type GlossaryIssue = "empty-source" | "duplicate" | "empty-target" | "too-long";

export const GLOSSARY_ISSUE_LABELS: Record<GlossaryIssue, string> = {
  "empty-source": "Le terme d’origine est vide.",
  duplicate: "Ce terme figure déjà dans le glossaire.",
  "empty-target": "Indiquez la traduction imposée, ou marquez le terme comme nom propre.",
  "too-long": "200 caractères au plus pour un terme, 500 pour une note.",
};

/** Problème de chaque ligne, dans l'ordre des lignes ; `null` quand la ligne est bonne. */
export function validateGlossary(entries: GlossaryEntry[]): (GlossaryIssue | null)[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const key = glossaryKey(entry.source);
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return entries.map((entry) => {
    const key = glossaryKey(entry.source);
    if (!key) return "empty-source";
    if ((counts.get(key) ?? 0) > 1) return "duplicate";
    if (!entry.keep && !entry.target.trim()) return "empty-target";
    if (entry.source.trim().length > GLOSSARY_LIMITS.term || entry.target.trim().length > GLOSSARY_LIMITS.term) return "too-long";
    if ((entry.note ?? "").trim().length > GLOSSARY_LIMITS.note) return "too-long";
    return null;
  });
}

/** Lignes prêtes à enregistrer : espaces rognés, champs vides retirés. */
export function cleanGlossary(entries: GlossaryEntry[]): GlossaryEntry[] {
  return entries.map((entry) => {
    const clean: GlossaryEntry = { source: entry.source.replace(/\s+/g, " ").trim(), target: entry.target.replace(/\s+/g, " ").trim() };
    if (entry.keep) clean.keep = true;
    const note = (entry.note ?? "").replace(/\s+/g, " ").trim();
    if (note) clean.note = note;
    return clean;
  });
}

/** La ligne contient la recherche, dans le terme, sa traduction ou sa note. */
export function matchesGlossarySearch(entry: GlossaryEntry, search: string): boolean {
  const needle = glossaryKey(search);
  if (!needle) return true;
  return [entry.source, entry.target, entry.note ?? ""].some((field) => glossaryKey(field).includes(needle));
}
