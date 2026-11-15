/**
 * Droits des morceaux de la banque de musique (dossier 01 quater, § 4).
 *
 * Pour chaque morceau, le serveur garde dans `data/music-rights.json` :
 * - la preuve de licence prise à son entrée dans la banque (réponse
 *   Openverse complète, empreinte du fichier, capture de la Wayback Machine),
 *   jamais remplacée ensuite ;
 * - les contrôles (fiche Openverse, API Jamendo quand une clé existe) ;
 * - la note posée à la main ou par un blocage, et l'historique des états.
 *
 * L'état affiché se déduit de ces données (`effectiveRights`) : la note du
 * fichier prime, puis la note statique de `library.json`, puis les contrôles.
 * Une erreur réseau ne change jamais l'état.
 */

import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import { recordAiUsage, usageError } from "@/lib/ai-usage";
import { DATA_DIR, ensureDirs } from "./store";
import { MUSIC_USER_AGENT, musicCredit, readLibrary, trackFilePath, type MusicTrack } from "./music";
import type { RightsCheck, TrackEvidence, TrackRightsNote, TrackRightsRecord, TrackRightsState } from "./rights-types";

const RIGHTS_FILE = path.join(DATA_DIR, "music-rights.json");
const OPENVERSE_AUDIO = "https://api.openverse.org/v1/audio/";
const WAYBACK_SAVE = "https://web.archive.org/save/";
const JAMENDO_TRACKS = "https://api.jamendo.com/v3.0/tracks/";

/** Un contrôle par semaine et par morceau suffit (§ 4.2). */
const CHECK_EVERY_MS = 7 * 24 * 60 * 60 * 1000;
/** La tâche de fond se réveille une fois par jour. */
const TASK_EVERY_MS = 24 * 60 * 60 * 1000;
/** Premier passage quelques minutes après le démarrage, une fois les téléchargements lancés. */
const TASK_START_DELAY_MS = 3 * 60 * 1000;
/** Délais courts : un service lent ne doit pas bloquer la file des contrôles. */
const OPENVERSE_TIMEOUT_MS = 15_000;
const WAYBACK_TIMEOUT_MS = 20_000;
const JAMENDO_TIMEOUT_MS = 15_000;
/** Bornes du fichier : il ne grossit pas sans fin. */
const MAX_CHECKS = 40;
const MAX_HISTORY = 100;

/** Pause minimale entre deux appels aux services ; modifiable par les tests seulement. */
const timing = { pauseMs: 2000 };

/** Réglage réservé aux tests : raccourcit la pause entre deux appels. */
export function configureRightsChecks(options: { pauseMs?: number }) {
  if (typeof options.pauseMs === "number" && options.pauseMs >= 0) timing.pauseMs = options.pauseMs;
}

type RightsFile = Record<string, TrackRightsRecord>;

// ─── Stockage ────────────────────────────────────────────────────

function readRightsFile(): RightsFile {
  try {
    const parsed = JSON.parse(fs.readFileSync(RIGHTS_FILE, "utf-8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as RightsFile) : {};
  } catch {
    return {};
  }
}

/** Écriture atomique : un nom temporaire unique, puis un renommage. */
function writeRightsFile(records: RightsFile) {
  ensureDirs();
  const temporary = `${RIGHTS_FILE}.${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(records, null, 2));
  fs.renameSync(temporary, RIGHTS_FILE);
}

function emptyRecord(trackId: string): TrackRightsRecord {
  return { trackId, checks: [], history: [] };
}

/**
 * Lecture, modification et écriture d'un seul tenant (sans attente entre
 * les deux) : deux contrôles qui se terminent ensemble ne s'écrasent pas.
 */
function updateRecord(trackId: string, change: (record: TrackRightsRecord) => void): TrackRightsRecord {
  const records = readRightsFile();
  const record = normalizeRecord(trackId, records[trackId]);
  change(record);
  record.checks = record.checks.slice(-MAX_CHECKS);
  record.history = record.history.slice(-MAX_HISTORY);
  records[trackId] = record;
  writeRightsFile(records);
  return record;
}

function normalizeRecord(trackId: string, value: TrackRightsRecord | undefined): TrackRightsRecord {
  if (!value || typeof value !== "object") return emptyRecord(trackId);
  return {
    ...value,
    trackId,
    checks: Array.isArray(value.checks) ? value.checks : [],
    history: Array.isArray(value.history) ? value.history : [],
  };
}

/** Tout ce que le serveur sait des droits d'un morceau, ou rien s'il n'a jamais été vu. */
export function getTrackRightsRecord(trackId: string): TrackRightsRecord | undefined {
  const record = readRightsFile()[trackId];
  return record ? normalizeRecord(trackId, record) : undefined;
}

/** Tous les dossiers d'un coup, pour une liste (une seule lecture du fichier). */
export function readTrackRightsRecords(): RightsFile {
  return readRightsFile();
}

/**
 * Pose la note d'un morceau (blocage enregistré, levée ou pose à la main) et
 * l'inscrit dans l'historique. La note prime ensuite sur les contrôles.
 */
export function setTrackRightsNote(trackId: string, note: TrackRightsNote, historyNote: string): void {
  const at = new Date().toISOString();
  updateRecord(trackId, (record) => {
    record.note = { ...note, since: note.since ?? at.slice(0, 10) };
    record.history.push({ at, state: note.state, note: historyNote });
  });
}

// ─── État effectif ───────────────────────────────────────────────

/** « CC BY 3.0 », « CC0 » : la licence écrite comme dans la banque. */
function licenseLabel(license: unknown, version: unknown): string | undefined {
  if (typeof license !== "string" || !license) return undefined;
  if (license.toLowerCase() === "cc0") return "CC0";
  return `CC ${license.toUpperCase()} ${typeof version === "string" ? version : ""}`.trim();
}

/** La licence d'une adresse Creative Commons (« …/licenses/by/3.0/ » → « CC BY 3.0 »). */
function licenseFromUrl(url: unknown): string | undefined {
  if (typeof url !== "string") return undefined;
  if (/publicdomain\/zero/i.test(url)) return "CC0";
  const match = /licenses\/([a-z-]+)\/(\d+(?:\.\d+)?)/i.exec(url);
  return match ? licenseLabel(match[1], match[2]) : undefined;
}

function sameLicense(a: string | undefined, b: string | undefined): boolean {
  const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, " ").trim();
  return !a || !b || normalize(a) === normalize(b);
}

/** Un contrôle Openverse arrivé au bout qui trouve le morceau absent ou sous une autre licence. */
function isBadCheck(check: RightsCheck, expectedLicense: string): boolean {
  return check.listed === false || !sameLicense(check.license, expectedLicense);
}

function badReason(check: RightsCheck, expectedLicense: string): string {
  return check.listed === false
    ? "Absent d’Openverse"
    : `Licence changée sur Openverse (${check.license ?? "inconnue"} au lieu de ${expectedLicense})`;
}

/** Date du dernier contrôle arrivé au bout, toutes sources confondues. */
export function lastSuccessfulCheck(record: TrackRightsRecord | undefined): string | undefined {
  return record?.checks.filter((check) => check.ok).at(-1)?.at;
}

/**
 * Ce que disent les contrôles Openverse arrivés au bout (les erreurs réseau
 * sont ignorées) : deux écarts de suite retirent le morceau, un seul écart
 * attend confirmation sans changer l'état.
 */
function stateFromChecks(checks: RightsCheck[], expectedLicense: string): TrackRightsNote {
  const answered = checks.filter((check) => check.source === "openverse" && check.ok);
  const last = answered.at(-1);
  if (!last) return { state: "unknown", reason: "Aucun contrôle n’a encore abouti" };
  const day = (check: RightsCheck) => check.at.slice(0, 10);
  if (!isBadCheck(last, expectedLicense)) return { state: "clear", since: day(last) };
  const previous = answered.at(-2);
  if (previous && isBadCheck(previous, expectedLicense)) {
    return { state: "withdrawn", reason: `${badReason(last, expectedLicense)} aux deux derniers contrôles`, since: day(previous) };
  }
  const before = stateFromChecks(answered.slice(0, -1), expectedLicense);
  return { ...before, reason: `${badReason(last, expectedLicense)} au dernier contrôle, à confirmer` };
}

/**
 * État des droits d'un morceau : la note du fichier (blocage, décision à la
 * main) prime, puis la note statique de `library.json`, puis les contrôles.
 * `records` évite de relire le fichier pour chaque morceau d'une liste.
 */
export function effectiveRights(track: MusicTrack, records?: RightsFile): TrackRightsNote | undefined {
  const stored = records ? records[track.id] : getTrackRightsRecord(track.id);
  const record = stored ? normalizeRecord(track.id, stored) : undefined;
  if (record?.note) return record.note;
  if (track.rights) return track.rights;
  return stateFromChecks(record?.checks ?? [], record?.evidence?.license ?? track.license);
}

// ─── File des appels ─────────────────────────────────────────────

let queue: Promise<unknown> = Promise.resolve();
let lastCallAt = 0;

/**
 * Un appel aux services à la fois, avec la pause minimale entre deux : la
 * preuve, les contrôles du démarrage et ceux demandés à la main passent tous
 * par ici.
 */
function throttled<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = lastCallAt + timing.pauseMs - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    try {
      return await task();
    } finally {
      lastCallAt = Date.now();
    }
  });
  queue = run.catch(() => undefined);
  return run;
}

interface OpenverseRead {
  ok: boolean;
  status?: number;
  body?: Record<string, unknown>;
  error?: string;
}

/** Fiche Openverse d'un morceau ; 404 veut dire « absent », pas « erreur ». */
async function readOpenverse(trackId: string, feature: string): Promise<OpenverseRead> {
  const note = (ok: boolean, error?: unknown) =>
    recordAiUsage({ provider: "openverse", module: "clip-studio", feature, unit: "calls", amount: 1, ok, ...(ok ? {} : { error: usageError(error) }) });
  try {
    const response = await fetch(`${OPENVERSE_AUDIO}${trackId}/`, {
      headers: { "user-agent": MUSIC_USER_AGENT, accept: "application/json" },
      signal: AbortSignal.timeout(OPENVERSE_TIMEOUT_MS),
    });
    if (response.status === 404) {
      note(true);
      return { ok: true, status: 404 };
    }
    if (!response.ok) throw new Error(`Openverse ne répond pas (HTTP ${response.status}).`);
    const body = (await response.json()) as Record<string, unknown>;
    note(true);
    return { ok: true, status: response.status, body };
  } catch (error) {
    note(false, error);
    return { ok: false, error: usageError(error) };
  }
}

function openverseCheck(read: OpenverseRead): RightsCheck {
  const at = new Date().toISOString();
  if (!read.ok) return { at, source: "openverse", ok: false, note: read.error };
  if (read.status === 404) return { at, source: "openverse", ok: true, listed: false };
  return { at, source: "openverse", ok: true, listed: true, license: licenseLabel(read.body?.license, read.body?.license_version) };
}

// ─── Preuve de licence ───────────────────────────────────────────

async function fileSha256(file: string): Promise<string | undefined> {
  if (!fs.existsSync(file)) return undefined;
  return new Promise((resolve) => {
    const hash = createHash("sha256");
    fs.createReadStream(file)
      .on("data", (chunk) => hash.update(chunk))
      .on("end", () => resolve(hash.digest("hex")))
      .on("error", () => resolve(undefined));
  });
}

/** Adresse https d'une capture de la Wayback Machine, ou rien. */
function archiveAddress(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value, "https://web.archive.org");
    return url.protocol === "https:" && url.hostname === "web.archive.org" && /^\/web\/\d{8,}/.test(url.pathname) ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Demande une capture de la fiche Openverse à la Wayback Machine. Au mieux :
 * délai court, et un échec ne fait que laisser la preuve sans archive.
 */
async function requestArchive(address: string): Promise<string | undefined> {
  try {
    const response = await fetch(`${WAYBACK_SAVE}${address}`, {
      headers: { "user-agent": MUSIC_USER_AGENT },
      redirect: "follow",
      signal: AbortSignal.timeout(WAYBACK_TIMEOUT_MS),
    });
    if (!response.ok) return undefined;
    return archiveAddress(response.url) ?? archiveAddress(response.headers.get("content-location"));
  } catch {
    return undefined;
  }
}

const capturing = new Map<string, Promise<TrackEvidence | undefined>>();

/**
 * Range la preuve de licence d'un morceau : la réponse Openverse complète,
 * l'empreinte du fichier téléchargé, une capture de la Wayback Machine, la
 * licence et la mention. La plus ancienne preuve est gardée ; une preuve
 * prise avant le téléchargement reçoit seulement l'empreinte qui lui manquait.
 * `openverse` reprend une réponse déjà lue (ajout depuis Découvrir).
 */
export function captureTrackEvidence(track: MusicTrack, openverse?: unknown): Promise<TrackEvidence | undefined> {
  const pending = capturing.get(track.id);
  if (pending) return pending;
  const task = captureOnce(track, openverse).finally(() => capturing.delete(track.id));
  capturing.set(track.id, task);
  return task;
}

async function captureOnce(track: MusicTrack, known?: unknown): Promise<TrackEvidence | undefined> {
  const existing = getTrackRightsRecord(track.id)?.evidence;
  if (existing) {
    if (existing.audioSha256) return existing;
    const audioSha256 = await fileSha256(trackFilePath(track));
    if (!audioSha256) return existing;
    return updateRecord(track.id, (record) => {
      if (record.evidence && !record.evidence.audioSha256) record.evidence = { ...record.evidence, audioSha256 };
    }).evidence;
  }

  let body = known && typeof known === "object" ? (known as Record<string, unknown>) : undefined;
  let check: RightsCheck | undefined;
  if (!body) {
    const read = await throttled(() => readOpenverse(track.id, "Preuve de licence"));
    check = openverseCheck(read);
    body = read.body;
  }
  if (!body) {
    // Absent ou injoignable : pas de preuve, mais le contrôle compte.
    if (check) updateRecord(track.id, (record) => void record.checks.push(check!));
    return undefined;
  }

  const audioSha256 = await fileSha256(trackFilePath(track));
  const archiveUrl = await throttled(() => requestArchive(`${OPENVERSE_AUDIO}${track.id}/`));
  const evidence: TrackEvidence = {
    capturedAt: new Date().toISOString(),
    openverse: body,
    ...(audioSha256 ? { audioSha256 } : {}),
    ...(archiveUrl ? { archiveUrl } : {}),
    license: licenseLabel(body.license, body.license_version) ?? track.license,
    licenseUrl: typeof body.license_url === "string" && body.license_url.startsWith("https://") ? body.license_url : track.licenseUrl,
    attribution: musicCredit(track),
  };
  const saved = updateRecord(track.id, (record) => {
    // Une autre capture a pu aboutir pendant l'attente : la sienne reste.
    if (!record.evidence) record.evidence = evidence;
    if (check) record.checks.push(check);
  });
  return saved.evidence;
}

// ─── Contrôles ───────────────────────────────────────────────────

/** Identifiant Jamendo d'un morceau, lu dans l'adresse de sa page. */
function jamendoTrackId(track: MusicTrack): string | undefined {
  const match = /jamendo\.com\/track\/(\d+)/.exec(track.pageUrl ?? "");
  return match?.[1];
}

/** Fiche Jamendo par l'API v3, seulement si une clé `client_id` est configurée. */
async function checkJamendo(track: MusicTrack): Promise<RightsCheck | undefined> {
  const clientId = process.env.JAMENDO_CLIENT_ID?.trim();
  const id = jamendoTrackId(track);
  if (!clientId || !id) return undefined;
  const at = new Date().toISOString();
  try {
    const params = new URLSearchParams({ client_id: clientId, format: "json", id });
    const response = await fetch(`${JAMENDO_TRACKS}?${params}`, {
      headers: { "user-agent": MUSIC_USER_AGENT, accept: "application/json" },
      signal: AbortSignal.timeout(JAMENDO_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`Jamendo ne répond pas (HTTP ${response.status}).`);
    const body = (await response.json()) as { headers?: { status?: string; error_message?: string }; results?: Array<Record<string, unknown>> };
    if (body.headers?.status && body.headers.status !== "success") throw new Error(body.headers.error_message || "Réponse Jamendo en erreur.");
    const result = body.results?.[0];
    if (!result) return { at, source: "jamendo", ok: true, listed: false };
    // Point d'extension – inscription Content ID (§ 4.2, question ouverte 1) :
    // aucun champ connu de l'API v3 ne la donne. Quand il sera trouvé dans
    // `result`, renvoyer en plus un contrôle `{ source: "content-id", ok: true,
    // listed: <inscrit> }` et en déduire l'état `at-risk` dans `effectiveRights`.
    return { at, source: "jamendo", ok: true, listed: true, license: licenseFromUrl(result.license_ccurl) };
  } catch (error) {
    return { at, source: "jamendo", ok: false, note: usageError(error) };
  }
}

function findTrack(trackId: string): MusicTrack | undefined {
  return readLibrary().find((track) => track.id === trackId);
}

/**
 * Contrôles du § 4.2 pour un morceau : fiche Openverse, puis API Jamendo
 * quand une clé existe. Le changement d'état qui en découle s'inscrit dans
 * l'historique ; une erreur réseau est gardée comme contrôle manqué, sans
 * effet sur l'état.
 */
export async function checkTrackRights(trackId: string): Promise<TrackRightsRecord> {
  const track = findTrack(String(trackId));
  if (!track) throw new Error("Morceau introuvable dans la banque.");
  const before = effectiveRights(track);
  const openverse = openverseCheck(await throttled(() => readOpenverse(track.id, "Contrôle des droits")));
  const jamendo = await throttled(() => checkJamendo(track));

  const record = updateRecord(track.id, (current) => {
    current.checks.push(openverse);
    if (jamendo) current.checks.push(jamendo);
  });
  const after = effectiveRights(track);
  if (after && after.state !== before?.state) {
    return updateRecord(track.id, (current) => {
      current.history.push({ at: openverse.at, state: after.state, note: `Contrôle Openverse : ${after.reason ?? "fiche et licence inchangées"}` });
    });
  }
  return record;
}

/** Un morceau dont le dernier contrôle Openverse abouti date de plus d'une semaine. */
function isDue(record: TrackRightsRecord | undefined, now: number): boolean {
  const last = record?.checks.filter((check) => check.source === "openverse" && check.ok).at(-1)?.at;
  return !last || now - Date.parse(last) >= CHECK_EVERY_MS;
}

let running: Promise<number> | null = null;

/**
 * Contrôle hebdomadaire : les morceaux à revoir, un à la fois, avec la pause
 * de la file entre deux appels. Renvoie le nombre de morceaux contrôlés.
 */
export function runWeeklyRightsCheck(): Promise<number> {
  if (running) return running;
  running = (async () => {
    let count = 0;
    const records = readRightsFile();
    const now = Date.now();
    for (const track of readLibrary()) {
      if (!isDue(records[track.id], now)) continue;
      await checkTrackRights(track.id).catch(() => undefined);
      count += 1;
    }
    return count;
  })().finally(() => {
    running = null;
  });
  return running;
}

/** Aucun appel réseau pendant la compilation de Next.js ni sous Vitest. */
function backgroundAllowed(): boolean {
  if (process.env.NEXT_PHASE === "phase-production-build") return false;
  if (process.env.VITEST || "__vitest_worker__" in globalThis) return false;
  return true;
}

/**
 * Tâche de fond : un premier passage peu après le démarrage, puis un réveil
 * par jour, qui ne contrôle que les morceaux vus il y a plus de sept jours.
 * Démarrée une seule fois par processus.
 */
export function startMusicRightsChecks() {
  if (!backgroundAllowed()) return;
  const flags = globalThis as { __clipStudioRightsChecks?: boolean };
  if (flags.__clipStudioRightsChecks) return;
  flags.__clipStudioRightsChecks = true;
  const run = () => void runWeeklyRightsCheck().catch(() => undefined);
  // Les minuteries ne retiennent pas le processus à l'arrêt.
  for (const timer of [setTimeout(run, TASK_START_DELAY_MS), setInterval(run, TASK_EVERY_MS)]) {
    (timer as unknown as { unref?: () => void }).unref?.();
  }
}

/** Les états qu'un admin peut poser à la main. */
export function isTrackRightsState(value: unknown): value is TrackRightsState {
  return value === "clear" || value === "at-risk" || value === "claimed" || value === "withdrawn" || value === "unknown";
}
