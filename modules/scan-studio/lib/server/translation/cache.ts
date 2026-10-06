/**
 * Cache des traductions rendues par les moteurs, gardé sur le disque.
 *
 *   data/translation/cache.json
 *
 * La même phrase, de la même langue vers la même langue, déjà demandée au même
 * moteur, n'est jamais redemandée (§ 7.5 du dossier). La clé est le texte
 * exact tel qu'il est parti, repères du glossaire compris ; la valeur est ce
 * que le moteur a rendu, avant que les termes du glossaire y soient rétablis.
 *
 * Le fichier est relu à chaque lot et réécrit après chaque requête réussie.
 */

import path from "path";
import { readJson, writeJson } from "../../store";
import type { SourceLanguage, TranslationEngineId } from "../../types";
import { translationDir } from "./settings";

const cacheFile = () => path.join(translationDir(), "cache.json");

/** Au-delà, les traductions les plus anciennes sont oubliées. */
export const MAX_CACHE_ENTRIES = 20_000;
const MAX_CACHE_BYTES = 32 * 1024 * 1024;
const SEPARATOR = "\u0001";

interface StoredCache {
  version: 1;
  /** Clé et traduction, de la plus ancienne à la plus récente. */
  entries: [string, string][];
}

const keyOf = (engine: TranslationEngineId, source: SourceLanguage, target: string, text: string) =>
  [engine, source, target.toLowerCase(), text].join(SEPARATOR);

export interface TranslationCache {
  get(engine: TranslationEngineId, source: SourceLanguage, target: string, text: string): string | undefined;
  set(engine: TranslationEngineId, source: SourceLanguage, target: string, text: string, translated: string): void;
  /** Écrit le cache s'il a changé. */
  save(): void;
}

function readEntries(): Map<string, string> {
  const stored = readJson<StoredCache>(cacheFile());
  const entries = new Map<string, string>();
  if (stored?.version === 1 && Array.isArray(stored.entries)) {
    for (const entry of stored.entries) {
      if (Array.isArray(entry) && typeof entry[0] === "string" && typeof entry[1] === "string") entries.set(entry[0], entry[1]);
    }
  }
  return entries;
}

export function openCache(limit = MAX_CACHE_ENTRIES): TranslationCache {
  let entries = readEntries();
  /** Ce que ce lot a appris, pas encore écrit. */
  const added = new Map<string, string>();

  return {
    get: (engine, source, target, text) => {
      const key = keyOf(engine, source, target, text);
      return added.get(key) ?? entries.get(key);
    },
    set(engine, source, target, text, translated) {
      added.set(keyOf(engine, source, target, text), translated);
    },
    save() {
      if (added.size === 0) return;
      // Relu avant d'écrire : un autre lot a pu enregistrer ses phrases entre-temps, on ne les efface pas.
      entries = readEntries();
      for (const [key, translated] of added) {
        // Retirée puis remise : une phrase redemandée redevient la plus récente.
        entries.delete(key);
        entries.set(key, translated);
      }
      for (const oldest of entries.keys()) {
        if (entries.size <= limit) break;
        entries.delete(oldest);
      }
      writeJson(cacheFile(), { version: 1, entries: [...entries] } satisfies StoredCache, { maxBytes: MAX_CACHE_BYTES });
      added.clear();
    },
  };
}
