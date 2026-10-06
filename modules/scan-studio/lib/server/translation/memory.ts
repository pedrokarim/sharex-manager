/**
 * Mémoire de traduction d'un dossier : les phrases déjà traduites et validées,
 * reprises telles quelles sans appeler de moteur (§ 6.5 du dossier).
 *
 *   data/translation/memory/<dossier>.json
 *
 * Elle se remplit à l'enregistrement d'une page (`savePage`) : chaque zone dont
 * la traduction est validée y dépose sa phrase d'origine et sa traduction, par
 * langue cible. La dernière validation l'emporte.
 */

import fs from "fs";
import path from "path";
import { readJson, writeJson } from "../../store";
import { isId, type ScanRegion } from "../../types";
import { translationDir } from "./settings";

const memoryFile = (folderId: string) => path.join(translationDir(), "memory", `${folderId}.json`);

/** Au-delà, par langue cible, les phrases les plus anciennes sont oubliées. */
export const MAX_MEMORY_ENTRIES = 20_000;
const MAX_MEMORY_BYTES = 32 * 1024 * 1024;
const MAX_TEXT_LENGTH = 2000;

/** Langue cible vers ses paires (phrase d'origine, traduction), de la plus ancienne à la plus récente. */
type StoredMemory = Record<string, [string, string][]>;

export interface MemoryPair {
  source: string;
  translation: string;
}

/** Deux phrases qui ne diffèrent que par leurs espaces sont la même. La casse, elle, compte. */
export const memoryKey = (text: string) => text.replace(/\s+/g, " ").trim();

function readMemory(folderId: string): StoredMemory {
  if (!isId(folderId)) return {};
  const stored = readJson<StoredMemory>(memoryFile(folderId));
  return stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
}

function pairsOf(memory: StoredMemory, language: string): Map<string, string> {
  const pairs = new Map<string, string>();
  const stored = memory[language];
  if (!Array.isArray(stored)) return pairs;
  for (const pair of stored) {
    if (Array.isArray(pair) && typeof pair[0] === "string" && typeof pair[1] === "string") pairs.set(pair[0], pair[1]);
  }
  return pairs;
}

/** Phrases validées d'un dossier vers une langue : clé `memoryKey`, valeur la traduction. */
export function openMemory(folderId: string, targetLanguage: string): Map<string, string> {
  return pairsOf(readMemory(folderId), targetLanguage.toLowerCase());
}

/** Les paires qu'une page apporte à la mémoire : zones validées, lues et traduites. */
export function approvedPairs(regions: ScanRegion[]): MemoryPair[] {
  const pairs: MemoryPair[] = [];
  for (const region of regions) {
    if (region.translation?.status !== "approved") continue;
    const source = memoryKey(region.reading?.clean ?? "");
    const translation = (region.translation.text ?? "").trim();
    if (!source || !translation || source.length > MAX_TEXT_LENGTH || translation.length > MAX_TEXT_LENGTH) continue;
    pairs.push({ source, translation });
  }
  return pairs;
}

/** Ajoute des paires à la mémoire d'un dossier. N'écrit rien si elles y sont déjà, à l'identique. */
export function recordMemory(folderId: string, targetLanguage: string, pairs: MemoryPair[]) {
  if (!isId(folderId) || pairs.length === 0) return;
  const language = targetLanguage.toLowerCase();
  const memory = readMemory(folderId);
  const known = pairsOf(memory, language);

  let changed = false;
  for (const pair of pairs) {
    const source = memoryKey(pair.source);
    if (!source || !pair.translation || known.get(source) === pair.translation) continue;
    known.delete(source);
    known.set(source, pair.translation);
    changed = true;
  }
  if (!changed) return;

  for (const oldest of known.keys()) {
    if (known.size <= MAX_MEMORY_ENTRIES) break;
    known.delete(oldest);
  }
  memory[language] = [...known];
  writeJson(memoryFile(folderId), memory, { maxBytes: MAX_MEMORY_BYTES });
}

/** Le dossier disparaît : sa mémoire aussi. */
export function forgetMemory(folderId: string) {
  if (isId(folderId)) fs.rmSync(memoryFile(folderId), { force: true });
}
