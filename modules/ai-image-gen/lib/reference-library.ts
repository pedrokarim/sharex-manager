/**
 * Bibliothèque de références : des images enregistrées une fois, avec un nom
 * et un rôle, qu'on rejoint ensuite aux générations sans les redéposer. Les
 * fichiers vivent dans `data/references/` (servis comme médias du module),
 * l'index dans `data/reference-library.json`.
 */

import fs from "fs";
import path from "path";
import { decodeImage } from "./image-type";
import { normalizeReferenceRole, type ReferenceRole } from "./reference-roles";
import { DATA_DIR, IMAGES_DIR, ensureDataDirs, randomSlug, readJson, writeJson } from "./store";

export const LIBRARY_DIR = path.join(DATA_DIR, "references");
const LIBRARY_FILE = path.join(DATA_DIR, "reference-library.json");
const LIBRARY_LIMIT = 200;
const NAME_LIMIT = 80;

export interface LibraryReference {
  id: string;
  /** Nom du fichier dans `data/references/`. */
  file: string;
  name: string;
  role: ReferenceRole;
  createdAt: number;
}

export type SaveReferenceInput =
  | { b64: string; name?: string; role?: ReferenceRole }
  /** Image déjà archivée par le studio (image de départ ou rendu). */
  | { historyFile: string; name?: string; role?: ReferenceRole };

function readLibrary(): LibraryReference[] {
  return readJson<LibraryReference[]>(LIBRARY_FILE, []);
}

function writeLibrary(entries: LibraryReference[]) {
  writeJson(LIBRARY_FILE, entries);
}

function cleanName(name: unknown, fallback: string): string {
  const value = typeof name === "string" ? name.replace(/\s+/g, " ").trim() : "";
  return (value || fallback).slice(0, NAME_LIMIT);
}

export function listLibrary(): LibraryReference[] {
  return readLibrary();
}

export function saveToLibrary(input: SaveReferenceInput): LibraryReference {
  ensureDataDirs();
  if (!fs.existsSync(LIBRARY_DIR)) fs.mkdirSync(LIBRARY_DIR, { recursive: true });

  const entries = readLibrary();
  if (entries.length >= LIBRARY_LIMIT) {
    throw new Error(`La bibliothèque est pleine (${LIBRARY_LIMIT} références). Retirez-en une avant d’en ajouter.`);
  }

  // Le type et l'extension se lisent dans les octets, jamais dans ce que
  // le navigateur annonce.
  let buffer: Buffer;
  if ("historyFile" in input) {
    const full = path.join(IMAGES_DIR, path.basename(String(input.historyFile)));
    if (!fs.existsSync(full)) throw new Error("Cette image n’existe plus dans le studio.");
    buffer = fs.readFileSync(full);
  } else {
    buffer = decodeImage(input.b64).buffer;
  }
  const { kind } = decodeImage(buffer.toString("base64"));

  const id = `ref-${Date.now()}-${randomSlug(6)}`;
  const file = `${id}.${kind.extension}`;
  fs.writeFileSync(path.join(LIBRARY_DIR, file), buffer);

  const entry: LibraryReference = {
    id,
    file,
    name: cleanName(input.name, "Référence"),
    role: normalizeReferenceRole(input.role),
    createdAt: Date.now(),
  };
  writeLibrary([entry, ...entries]);
  return entry;
}

export function updateLibraryEntry(
  id: string,
  changes: { name?: string; role?: ReferenceRole }
): LibraryReference {
  const entries = readLibrary();
  const entry = entries.find((item) => item.id === id);
  if (!entry) throw new Error("Cette référence n’existe plus.");
  if (changes.name !== undefined) entry.name = cleanName(changes.name, entry.name);
  if (changes.role !== undefined) entry.role = normalizeReferenceRole(changes.role);
  writeLibrary(entries);
  return entry;
}

export function removeLibraryEntry(id: string): { success: boolean } {
  const entries = readLibrary();
  const entry = entries.find((item) => item.id === id);
  if (!entry) return { success: false };
  const full = path.join(LIBRARY_DIR, path.basename(entry.file));
  if (fs.existsSync(full)) fs.unlinkSync(full);
  writeLibrary(entries.filter((item) => item.id !== id));
  return { success: true };
}
