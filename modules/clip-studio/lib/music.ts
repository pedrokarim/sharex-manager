/**
 * Banque de musique libre de droits.
 *
 * Deux sources, fusionnées :
 * - `music/library.json`, versionné avec le module : la sélection de base,
 *   enrichie au fil des versions ;
 * - `data/music-added.json` : les morceaux ajoutés depuis l'éditeur, trouvés
 *   dans Openverse.
 *
 * Les fichiers sont téléchargés dans les données du module au démarrage,
 * un par un, s'ils manquent : un nouveau morceau du manifeste arrive donc au
 * redéploiement suivant, sans rien faire. Seules les licences CC0 et CC BY
 * sont admises (usage commercial et modification autorisés, avec mention de
 * l'auteur pour CC BY).
 */

import fs from "fs";
import path from "path";
import { ensureResource, resourcePath, resourceState, type ResourceSpec, type ResourceState } from "./resources";
import { DATA_DIR, ensureDirs } from "./store";

const MODULE_DIR = path.join(process.cwd(), "modules", "clip-studio");
const LIBRARY_FILE = path.join(MODULE_DIR, "music", "library.json");
const ADDED_FILE = path.join(DATA_DIR, "music-added.json");
const OPENVERSE = "https://api.openverse.org/v1/audio/";
const USER_AGENT = "ShareX-Manager/clip-studio (https://github.com/pedrokarim/sharex-manager)";

export const MOODS = ["energetic", "happy", "chill", "epic", "suspense", "inspiring", "funky", "ambient"] as const;
export type Mood = (typeof MOODS)[number];

export interface MusicTrack {
  id: string;
  title: string;
  artist: string;
  mood: Mood;
  durationMs: number;
  genres: string[];
  license: string;
  licenseUrl?: string;
  pageUrl?: string;
  audioUrl: string;
  /** Ajouté depuis l'éditeur, donc retirable. */
  added?: boolean;
}

export interface MusicEntry extends MusicTrack {
  state: ResourceState;
  /** Adresse de lecture locale, quand le fichier est téléchargé. */
  url?: string;
  credit: string;
}

// ─── Banque ──────────────────────────────────────────────────────

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return fallback;
  }
}

export function readLibrary(): MusicTrack[] {
  const base = readJson<MusicTrack[]>(LIBRARY_FILE, []);
  const added = readJson<MusicTrack[]>(ADDED_FILE, []).map((track) => ({ ...track, added: true }));
  const ids = new Set(base.map((track) => track.id));
  return [...base, ...added.filter((track) => !ids.has(track.id))];
}

function spec(track: MusicTrack): ResourceSpec {
  return { id: `music:${track.id}`, label: track.title, url: track.audioUrl, target: `music/${track.id}.mp3` };
}

/** Mention à reprendre dans la description d'une vidéo publiée. */
export function musicCredit(track: Pick<MusicTrack, "title" | "artist" | "license" | "pageUrl">): string {
  return `« ${track.title} » par ${track.artist}, ${track.license}${track.pageUrl ? ` (${track.pageUrl})` : ""}`;
}

export function listMusic(): MusicEntry[] {
  return readLibrary().map((track) => {
    const state = resourceState(spec(track));
    return {
      ...track,
      state,
      url: state.status === "ready" ? `/api/modules/clip-studio/data/resources/music/${track.id}.mp3` : undefined,
      credit: musicCredit(track),
    };
  });
}

/** Au démarrage : les morceaux manquants, un par un pour ménager la source. */
export function prefetchMusic() {
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  void (async () => {
    for (const track of readLibrary()) {
      await ensureResource(spec(track)).catch(() => undefined);
    }
  })();
}

export async function downloadTrack(id: string) {
  const track = readLibrary().find((entry) => entry.id === id);
  if (!track) throw new Error("Morceau introuvable dans la banque.");
  await ensureResource(spec(track));
}

// ─── Découverte dans Openverse ───────────────────────────────────

interface OpenverseAudio {
  id: string;
  title?: string;
  creator?: string;
  license: string;
  license_version?: string;
  license_url?: string;
  foreign_landing_url?: string;
  url: string;
  duration?: number;
  genres?: string[];
  source?: string;
  tags?: { name: string }[];
}

export interface MusicCandidate extends MusicTrack {
  instrumental: boolean;
  inLibrary: boolean;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const searchCache = new Map<string, { at: number; results: MusicCandidate[] }>();

function toTrack(item: OpenverseAudio, mood: Mood): MusicTrack {
  return {
    id: item.id,
    title: (item.title ?? "Sans titre").trim().slice(0, 120),
    artist: (item.creator ?? "Artiste inconnu").trim().slice(0, 80),
    mood,
    durationMs: Math.round(item.duration ?? 0),
    genres: (item.genres ?? []).slice(0, 5),
    license: item.license === "cc0" ? "CC0" : `CC BY ${item.license_version ?? ""}`.trim(),
    licenseUrl: item.license_url,
    pageUrl: item.foreign_landing_url,
    audioUrl: item.url,
  };
}

async function openverse<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { "user-agent": USER_AGENT, accept: "application/json" } });
  if (response.status === 429) throw new Error("Openverse limite le nombre de recherches : réessayez dans une minute.");
  if (!response.ok) throw new Error(`Openverse ne répond pas (HTTP ${response.status}).`);
  return (await response.json()) as T;
}

/** Morceaux de Jamendo sous CC0 ou CC BY, par mots-clés. */
export async function searchMusic(input: { query: string; page?: number }): Promise<MusicCandidate[]> {
  const query = String(input.query ?? "").trim().slice(0, 80);
  if (query.length < 2) return [];
  const page = Math.min(10, Math.max(1, Math.round(Number(input.page) || 1)));
  const key = `${query.toLowerCase()}|${page}`;
  const cached = searchCache.get(key);
  const library = new Set(readLibrary().map((track) => track.id));
  if (cached && Date.now() - cached.at < 10 * 60 * 1000) {
    return cached.results.map((result) => ({ ...result, inLibrary: library.has(result.id) }));
  }

  // Les requêtes anonymes sont limitées à 20 résultats par page.
  const fetchPage = async (q: string) => {
    const params = new URLSearchParams({ q, source: "jamendo", license: "cc0,by", page_size: "20", page: String(page) });
    return (await openverse<{ results: OpenverseAudio[] }>(`${OPENVERSE}?${params}`)).results;
  };
  let items = await fetchPage(query);
  // Openverse exige tous les mots : « epic orchestral » ne trouve rien. On
  // complète alors avec chaque mot séparément.
  const words = query.split(/\s+/).filter((word) => word.length > 1).slice(0, 3);
  if (items.length < 5 && words.length > 1) {
    const seen = new Set(items.map((item) => item.id));
    for (const word of words) {
      for (const item of await fetchPage(word)) {
        if (!seen.has(item.id)) {
          seen.add(item.id);
          items.push(item);
        }
      }
    }
    items = items.slice(0, 40);
  }
  const results = items
    .filter((item) => (item.duration ?? 0) >= 20_000)
    .map((item) => ({
      ...toTrack(item, "chill"),
      instrumental: (item.tags ?? []).some((tag) => tag.name === "instrumental"),
      inLibrary: library.has(item.id),
    }));
  searchCache.set(key, { at: Date.now(), results });
  return results;
}

/**
 * Ajoute un morceau d'Openverse à la banque. Seul l'identifiant vient du
 * navigateur : titre, licence et adresse sont relus chez Openverse.
 */
export async function addMusic(input: { id: string; mood?: string }): Promise<MusicEntry> {
  const id = String(input.id ?? "");
  if (!UUID.test(id)) throw new Error("Identifiant Openverse invalide.");
  const mood = (MOODS as readonly string[]).includes(String(input.mood)) ? (input.mood as Mood) : "chill";
  const existing = readLibrary().find((track) => track.id === id);
  if (existing) return listMusic().find((track) => track.id === id)!;

  const item = await openverse<OpenverseAudio>(`${OPENVERSE}${id}/`);
  if (item.license !== "cc0" && item.license !== "by") {
    throw new Error("Seuls les morceaux sous CC0 ou CC BY peuvent entrer dans la banque.");
  }
  const host = new URL(item.url).hostname;
  if (!/(^|\.)jamendo\.com$/.test(host)) throw new Error("Seuls les morceaux hébergés par Jamendo sont acceptés.");

  const track = toTrack(item, mood);
  ensureDirs();
  const added = readJson<MusicTrack[]>(ADDED_FILE, []);
  const temporary = `${ADDED_FILE}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify([...added, track], null, 2));
  fs.renameSync(temporary, ADDED_FILE);

  void ensureResource(spec(track)).catch(() => undefined);
  return listMusic().find((entry) => entry.id === id)!;
}

/** Retire un morceau ajouté depuis l'éditeur ; la sélection de base reste. */
export function removeMusic(id: string) {
  const added = readJson<MusicTrack[]>(ADDED_FILE, []);
  const track = added.find((entry) => entry.id === id);
  if (!track) throw new Error("Seuls les morceaux ajoutés depuis l'éditeur peuvent être retirés.");
  fs.writeFileSync(ADDED_FILE, JSON.stringify(added.filter((entry) => entry.id !== id), null, 2));
  fs.rmSync(resourcePath(spec(track)), { force: true });
}

/** Un morceau prêt de l'humeur demandée, pour l'assistant. */
export function pickTrack(mood: string | undefined, minDurationMs = 0): MusicEntry | undefined {
  const ready = listMusic().filter((track) => track.state.status === "ready");
  const matching = ready.filter((track) => track.mood === mood);
  const pool = matching.length ? matching : ready;
  const longEnough = pool.filter((track) => track.durationMs >= minDurationMs);
  const candidates = longEnough.length ? longEnough : pool;
  return candidates[Math.floor(Math.random() * candidates.length)];
}
