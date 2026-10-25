/**
 * Historique des scripts (dossier 01 illustrations, étape S3) : ce que la
 * marque a déjà fait ces quatre dernières semaines, pour que le script
 * suivant ne reprenne ni le même sujet ni la même forme d'accroche.
 *
 * Trois sources, de la plus précise à la plus pauvre :
 *
 * 1. le **journal des scripts** (`data/script-history.json`), écrit par
 *    l'assistant quand un projet sort d'un script : titre, accroche dite et
 *    sa forme (`family`), concept suivi, promesse ;
 * 2. les **travaux de l'assistant** encore gardés (`assistant.json`, les 20
 *    derniers), qui ont l'accroche et sa forme ;
 * 3. les **projets** faits par l'assistant (`brief` : titre, demande,
 *    script), pour ce qui précède le journal : le sujet seulement, la
 *    première ligne dite tenant lieu d'accroche.
 *
 * Un même script n'est compté qu'une fois (même travail, même projet ou
 * même titre). `recentScripts` est pur ; seul le journal touche le disque.
 */

import fs from "fs";
import path from "path";
import { HOOK_FAMILIES, cleanScriptText } from "./script-rules";
import { DATA_DIR, ensureDirs } from "./store";

/** Fenêtre de l'historique : quatre semaines. */
export const HISTORY_WINDOW_MS = 28 * 24 * 60 * 60 * 1000;
/** Lignes gardées dans le journal. */
export const HISTORY_LIMIT = 300;
/** Scripts passés au modèle, les plus récents d'abord. */
export const HISTORY_SHOWN = 20;

const KIT_ID = /^kit-[a-z0-9]{6,32}$/;
const FAMILY_IDS = new Set(HOOK_FAMILIES.map((family) => family.id));

/** Un script fait, tel que le journal le garde. */
export interface ScriptRecord {
  at: number;
  kitId?: string;
  title: string;
  /** Accroche dite par la voix. */
  hook?: string;
  /** Forme de l'accroche (`HOOK_FAMILIES`). */
  family?: string;
  /** Concept de la niche suivi par le script (son nom). */
  concept?: string;
  promise?: string;
  /** Demande de l'utilisateur. */
  prompt?: string;
  jobId?: string;
  projectId?: string;
}

/** Un travail de l'assistant, réduit à ce que l'historique en lit. */
export interface HistoryJob {
  id: string;
  status: string;
  createdAt: number;
  request: { brief?: string; brandKitId?: string };
  title?: string;
  hook?: { text?: string; family?: string };
  aim?: { promise?: string; concept?: string };
  projectId?: string;
}

/** Un projet, réduit à ce que l'historique en lit. */
export interface HistoryProject {
  id: string;
  name?: string;
  createdAt: number;
  brandKitId?: string;
  origin?: string;
  brief?: { prompt?: string; title?: string; script?: string[] };
}

/** Un script récent, tel qu'il part dans la consigne. */
export interface RecentScript {
  /** Jour (AAAA-MM-JJ). */
  day: string;
  title: string;
  hook?: string;
  family?: string;
  concept?: string;
  /** Demande de départ, courte. */
  topic?: string;
}

export interface RecentScripts {
  /** Du plus récent au plus ancien. */
  scripts: RecentScript[];
  /** Forme d'accroche du dernier script, quand elle est connue. */
  lastFamily?: string;
}

const clean = (value: unknown, max: number) => cleanScriptText(value, max);
const family = (value: unknown) => (typeof value === "string" && FAMILY_IDS.has(value) ? value : undefined);
const sameKit = (kitId: string | null, other: unknown) => (kitId ? other === kitId : !other);
const titleKey = (title: string) => title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const dayOf = (at: number) => new Date(at).toISOString().slice(0, 10);

/** Une ligne du journal relue : champs connus, bornés ; `null` si elle est inutilisable. */
export function cleanRecord(raw: unknown): ScriptRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const entry = raw as Record<string, unknown>;
  const at = typeof entry.at === "number" && Number.isFinite(entry.at) ? entry.at : 0;
  const title = clean(entry.title, 200);
  if (!at || !title) return null;
  const optional = (key: keyof ScriptRecord, max: number) => {
    const value = clean(entry[key], max);
    return value ? { [key]: value } : {};
  };
  return {
    at,
    ...(typeof entry.kitId === "string" && KIT_ID.test(entry.kitId) ? { kitId: entry.kitId } : {}),
    title,
    ...optional("hook", 200),
    ...(family(entry.family) ? { family: entry.family as string } : {}),
    ...optional("concept", 120),
    ...optional("promise", 200),
    ...optional("prompt", 300),
    ...(typeof entry.jobId === "string" && /^asst-[a-z0-9]{4,40}$/.test(entry.jobId) ? { jobId: entry.jobId } : {}),
    ...(typeof entry.projectId === "string" && /^[a-z0-9][a-z0-9-]{2,80}$/i.test(entry.projectId) ? { projectId: entry.projectId } : {}),
  };
}

/**
 * Scripts de la marque (ou sans marque) des quatre dernières semaines, les
 * plus récents d'abord, sans doublon. Pur.
 */
export function recentScripts(input: { kitId: string | null; now: number; records: readonly ScriptRecord[]; jobs?: readonly HistoryJob[]; projects?: readonly HistoryProject[] }): RecentScripts {
  const since = input.now - HISTORY_WINDOW_MS;
  const entries: (RecentScript & { at: number; jobId?: string; projectId?: string })[] = [];
  const seenJobs = new Set<string>();
  const seenProjects = new Set<string>();
  const seenTitles = new Set<string>();
  const push = (entry: RecentScript & { at: number; jobId?: string; projectId?: string }) => {
    const key = titleKey(entry.title);
    if ((entry.jobId && seenJobs.has(entry.jobId)) || (entry.projectId && seenProjects.has(entry.projectId)) || (key && seenTitles.has(key))) return;
    if (entry.jobId) seenJobs.add(entry.jobId);
    if (entry.projectId) seenProjects.add(entry.projectId);
    if (key) seenTitles.add(key);
    entries.push(entry);
  };

  for (const record of input.records) {
    if (record.at < since || record.at > input.now || !sameKit(input.kitId, record.kitId)) continue;
    push({
      at: record.at,
      day: dayOf(record.at),
      title: record.title,
      ...(record.hook ? { hook: record.hook } : {}),
      ...(record.family ? { family: record.family } : {}),
      ...(record.concept ? { concept: record.concept } : {}),
      ...(record.prompt ? { topic: clean(record.prompt, 160) } : {}),
      ...(record.jobId ? { jobId: record.jobId } : {}),
      ...(record.projectId ? { projectId: record.projectId } : {}),
    });
  }
  for (const job of input.jobs ?? []) {
    if (job.status !== "done" || job.createdAt < since || job.createdAt > input.now || !sameKit(input.kitId, job.request?.brandKitId)) continue;
    const title = clean(job.title, 200);
    if (!title) continue;
    const hook = clean(job.hook?.text, 200);
    const concept = clean(job.aim?.concept, 120);
    const topic = clean(job.request?.brief, 160);
    push({
      at: job.createdAt,
      day: dayOf(job.createdAt),
      title,
      ...(hook ? { hook } : {}),
      ...(family(job.hook?.family) ? { family: job.hook?.family } : {}),
      ...(concept ? { concept } : {}),
      ...(topic ? { topic } : {}),
      jobId: job.id,
      ...(job.projectId ? { projectId: job.projectId } : {}),
    });
  }
  for (const project of input.projects ?? []) {
    if (project.origin !== "assistant" || !project.brief || project.createdAt < since || project.createdAt > input.now || !sameKit(input.kitId, project.brandKitId)) continue;
    const title = clean(project.brief.title || project.name, 200);
    if (!title) continue;
    const hook = clean(project.brief.script?.[0], 200);
    const topic = clean(project.brief.prompt, 160);
    push({ at: project.createdAt, day: dayOf(project.createdAt), title, ...(hook ? { hook } : {}), ...(topic ? { topic } : {}), projectId: project.id });
  }

  const sorted = entries.sort((a, b) => b.at - a.at).slice(0, HISTORY_SHOWN);
  const scripts = sorted.map(({ at: _at, jobId: _job, projectId: _project, ...rest }) => rest);
  // La forme du dernier script, seulement s'il est bien le dernier : un plus ancien ne dit rien de l'enchaînement.
  const lastFamily = sorted[0]?.family;
  return { scripts, ...(lastFamily ? { lastFamily } : {}) };
}

// ─── Journal ─────────────────────────────────────────────────────

const HISTORY_FILE = () => path.join(DATA_DIR, "script-history.json");

export function readScriptRecords(): ScriptRecord[] {
  try {
    const raw = JSON.parse(fs.readFileSync(HISTORY_FILE(), "utf-8")) as unknown;
    return (Array.isArray(raw) ? raw : []).map(cleanRecord).filter((record): record is ScriptRecord => record !== null);
  } catch {
    return [];
  }
}

/** Ajoute un script fait au journal, le plus récent en tête, borné. Un échec d'écriture ne fait jamais échouer le clip. */
export function recordScript(record: ScriptRecord): void {
  const entry = cleanRecord(record);
  if (!entry) return;
  try {
    ensureDirs();
    const records = [entry, ...readScriptRecords().filter((existing) => !(entry.jobId && existing.jobId === entry.jobId))].slice(0, HISTORY_LIMIT);
    const file = HISTORY_FILE();
    const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(records, null, 2));
    fs.renameSync(temporary, file);
  } catch {
    // Le journal ne sert qu'à varier les scripts suivants.
  }
}
