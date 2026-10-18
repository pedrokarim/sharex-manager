/**
 * Recherche inversée d'images : point d'entrée serveur du module.
 *
 * Les fonctions listées dans `module.json` sont ouvertes aux comptes
 * connectés ; les autres (les clés d'API) restent réservées aux
 * administrateurs.
 */

import type { ModuleHooks } from "@/types/modules";
import { hasInlineEngine } from "./lib/engines";
import {
  closeSearch as closeOpenSearch,
  externalLinks,
  openSearch as openStoredSearch,
  runSearchEngine,
  startSearch as startNewSearch,
  type SearchInput,
} from "./lib/search";
import { clearRecords, isKeyName, isSearchId, keyStatus, readHistory, readKeys, removeRecord, thumbUrl, writeKey } from "./lib/store";
import { readSerpApiLimits, readTraceMoeLimits } from "@/lib/ai-usage/remote";
import type { AiLimit, AiModuleReport } from "@/lib/ai-usage/types";
import { ENGINES, bestMatchOf, type Catalogue, type EngineId, type HistoryEntry } from "./lib/types";

// ─── Moteurs ─────────────────────────────────────────────────────

export async function getCatalogue(): Promise<Catalogue> {
  const keys = keyStatus();
  return {
    engines: ENGINES.map((engine) => ({
      ...engine,
      inlineReady: hasInlineEngine(engine.id) && (engine.inline === "free" || (engine.inline !== "none" && keys[engine.inline].configured)),
    })),
    keys,
  };
}

/** Enregistre ou efface une clé d'API. Réservé aux administrateurs. */
export async function saveKey(name: string, value: string) {
  if (!isKeyName(name)) throw new Error("Clé inconnue.");
  if (typeof value !== "string" || value.length > 300) throw new Error("Clé invalide.");
  if (keyStatus()[name].fromEnv) throw new Error("Cette clé vient d’une variable d’environnement : elle se change là-bas.");
  writeKey(name, value);
  return keyStatus();
}

// ─── Consommation des IA (écran `/admin/ai`) ─────────────────────

/** Réservé aux administrateurs (absent de `functions`), déclaré dans `aiUsage.limits`. Aucune clé n’en sort. */
export async function getAiLimits(): Promise<AiModuleReport> {
  const keys = keyStatus();
  const settingsHref = "/m/reverse-search/settings";
  const access = (name: "saucenao" | "serpapi" | "tracemoe") => (keys[name].fromEnv ? "env" : keys[name].configured ? "key" : "none") as "env" | "key" | "none";
  return {
    serpapi: { access: access("serpapi"), remoteReadable: keys.serpapi.configured, settingsHref },
    saucenao: { access: access("saucenao"), settingsHref },
    // trace.moe répond sans clé : une clé n’ajoute que du quota.
    tracemoe: { access: keys.tracemoe.configured ? access("tracemoe") : "open", remoteReadable: true, settingsHref },
  };
}

/** Réservé aux administrateurs, déclaré dans `aiUsage.remote` : solde de SerpApi et de trace.moe, sans rien dépenser. */
export async function readAiRemoteLimits(provider: string): Promise<AiLimit[] | null> {
  if (provider === "tracemoe") return readTraceMoeLimits(readKeys().tracemoe);
  if (provider === "serpapi") {
    const key = readKeys().serpapi;
    if (!key) throw new Error("Aucune clé SerpApi n’est enregistrée dans la recherche inversée.");
    return readSerpApiLimits(key);
  }
  return null;
}

// ─── Recherche ───────────────────────────────────────────────────

export async function startSearch(input: SearchInput) {
  return startNewSearch(input);
}

export async function openSearch(id: string) {
  return openStoredSearch(id);
}

export async function closeSearch(id: string) {
  return closeOpenSearch(id);
}

export async function runEngine(id: string, engine: string, origin?: string) {
  return runSearchEngine(id, engine, origin);
}

export async function getLinks(id: string, origin: string) {
  return externalLinks(id, origin);
}

// ─── Historique ──────────────────────────────────────────────────

export async function listHistory(query: { search?: string; offset?: number; limit?: number } = {}) {
  const search = typeof query?.search === "string" ? query.search.trim().toLowerCase() : "";
  const offset = Math.max(0, Math.floor(Number(query?.offset) || 0));
  const limit = Math.min(Math.max(Math.floor(Number(query?.limit) || 48), 1), 120);

  const entries: HistoryEntry[] = readHistory().map((record) => {
    const results = Object.values(record.results);
    return {
      id: record.id,
      createdAt: record.createdAt,
      name: record.query.name,
      preview: thumbUrl(record.id),
      engines: results.map((result) => result!.engine) as EngineId[],
      best: bestMatchOf(record.results),
      matchCount: results.reduce((sum, result) => sum + (result?.matches.filter((match) => !match.weak).length ?? 0), 0),
    };
  });
  const filtered = search
    ? entries.filter((entry) => entry.name.toLowerCase().includes(search) || entry.best?.title.toLowerCase().includes(search))
    : entries;
  return { entries: filtered.slice(offset, offset + limit), total: filtered.length, hasMore: offset + limit < filtered.length };
}

export async function deleteSearch(id: string) {
  if (!isSearchId(id)) throw new Error("Recherche invalide.");
  return { deleted: removeRecord(id) };
}

export async function clearHistory() {
  return { deleted: clearRecords() };
}

// ─── Cycle de vie ────────────────────────────────────────────────

const moduleHooks: ModuleHooks = {};

export function initModule() {
  return moduleHooks;
}

export default moduleHooks;
