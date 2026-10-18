/**
 * Moments forts d'une longue vidéo (« Découper une vidéo », dossier 01, V4).
 *
 * Fonctions pures, partagées par le serveur et le navigateur :
 *
 * - phrases horodatées tirées des mots transcrits (`sentencesOf`) ;
 * - transcription compacte pour Codex, une phrase numérotée par ligne
 *   (`#12 [03:21] …`), découpée en parties d'environ 20 000 caractères ;
 * - lecture et réparation de sa réponse : passages dans la vidéo, sur des
 *   phrases entières, de 15 à 60 s, sans chevauchement, bornés aux mots ;
 * - mots d'un extrait, remis à zéro au début du passage.
 */

import type { TimedWord } from "../engine/types";
import { formatClock, parseClock } from "./clock";

export const MOMENT_LIMITS = {
  minMs: 15_000,
  maxMs: 60_000,
  /** Plus court, un passage proposé est écarté (vidéo trop courte pour l'allonger). */
  hardMinMs: 8_000,
  maxCount: 8,
  /** Bornes d'un passage retouché à la main (±1 s par clic). */
  editMinMs: 5_000,
  editMaxMs: 90_000,
  /** Marge gardée avant le premier mot et après le dernier, sans mordre sur les voisins. */
  leadMs: 200,
  tailMs: 350,
};

/** Taille d'une partie de la transcription envoyée à Codex. */
export const TRANSCRIPT_CHUNK_CHARS = 20_000;

export interface Sentence {
  /** Numéro de la phrase dans toute la vidéo : celui que Codex rend. */
  index: number;
  startMs: number;
  endMs: number;
  text: string;
}

/** Passage proposé, en millisecondes de la source. */
export interface ClipMoment {
  id: string;
  startMs: number;
  endMs: number;
  /** Accroche courte, dans la langue de la vidéo. */
  title: string;
  /** Pourquoi ce passage marche seul. */
  reason: string;
  /** Note de 0 à 10. */
  score: number;
}

const SENTENCE_END = /[.!?…]["'»”’)\] ]*$/;

/**
 * Phrases d'une transcription : coupées après une ponctuation finale, après
 * un silence de plus de 1,5 s, ou au-delà de 40 mots (une parole sans
 * ponctuation reste découpable).
 */
export function sentencesOf(words: TimedWord[], options: { maxWords?: number; gapMs?: number } = {}): Sentence[] {
  const maxWords = options.maxWords ?? 40;
  const gapMs = options.gapMs ?? 1500;
  const sentences: Sentence[] = [];
  let current: TimedWord[] = [];
  const flush = () => {
    if (!current.length) return;
    sentences.push({
      index: sentences.length,
      startMs: current[0].startMs,
      endMs: current[current.length - 1].endMs,
      text: current.map((word) => word.text).join(" ").replace(/\s+/g, " ").trim(),
    });
    current = [];
  };
  for (const word of words) {
    if (!word.text.trim()) continue;
    const previous = current[current.length - 1];
    if (previous && (word.startMs - previous.endMs > gapMs || current.length >= maxWords)) flush();
    current.push(word);
    if (SENTENCE_END.test(word.text.trim())) flush();
  }
  flush();
  return sentences;
}

/** « 03:21 », « 1:02:03 » : l'instant d'une ligne de la transcription. */
function lineClock(ms: number): string {
  const text = formatClock(ms / 1000);
  return text.length === 4 ? `0${text}` : text;
}

/** Lignes de la transcription compacte : « #12 [03:21] texte ». */
export function compactTranscript(sentences: Sentence[]): string[] {
  return sentences.map((sentence) => `#${sentence.index} [${lineClock(sentence.startMs)}] ${sentence.text}`);
}

/** Parties de `maxChars` caractères au plus, sans couper une ligne (une ligne démesurée est tronquée). */
export function chunkTranscript(lines: string[], maxChars = TRANSCRIPT_CHUNK_CHARS): string[][] {
  const chunks: string[][] = [];
  let current: string[] = [];
  let size = 0;
  for (const raw of lines) {
    const line = raw.length > maxChars ? raw.slice(0, maxChars) : raw;
    if (current.length && size + line.length + 1 > maxChars) {
      chunks.push(current);
      current = [];
      size = 0;
    }
    current.push(line);
    size += line.length + 1;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

/** Consigne donnée à Codex pour une partie de la transcription. */
export function momentsPrompt(input: { title: string; durationMs: number; lines: string[]; part?: { index: number; total: number } }): string {
  const part = input.part && input.part.total > 1 ? input.part : null;
  const wanted = part ? "1 à 4 passages dans cette partie (aucun si elle n'en a pas de bon)" : "3 à 8 passages (moins si la vidéo n'en a pas assez de bons)";
  return [
    "Tu repères, dans la transcription d'une longue vidéo, les passages qui feraient de bons clips courts (shorts), regardés sans le reste de la vidéo.",
    "",
    "Règles :",
    `- ${wanted}, de 15 à 60 secondes chacun ;`,
    "- un passage se comprend seul : une idée complète, une histoire, une réaction forte, une chute, une révélation ;",
    "- il commence au début d'une phrase et finit à la fin d'une phrase ;",
    "- aucun chevauchement entre deux passages ;",
    "- title : une accroche courte (8 mots au plus), dans la langue de la transcription, sans guillemets ni hashtag ;",
    "- reason : une phrase, en français, qui dit pourquoi ce passage marche ;",
    "- score : de 1 à 10, la force du passage comme clip autonome.",
    "",
    "Chaque ligne est une phrase : « #numéro [instant] texte ». Donne le numéro de la première (from) et de la dernière (to) phrase du passage.",
    'Réponds uniquement par ce JSON : {"moments":[{"from":12,"to":18,"title":"…","reason":"…","score":8}]}',
    "",
    `Vidéo : « ${input.title.slice(0, 200)} », ${formatClock(input.durationMs / 1000)}.`,
    ...(part ? [`Partie ${part.index + 1} sur ${part.total} de la transcription.`] : []),
    "",
    "Transcription :",
    ...input.lines,
  ].join("\n");
}

// ─── Réponse de Codex ────────────────────────────────────────────

/** Entrées brutes de la réponse : `{ moments: [...] }` ou une liste seule, même entourée de texte. */
export function readRawMoments(answer: string): Record<string, unknown>[] {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(answer);
  const source = (fenced ? fenced[1] : answer).trim();
  const candidates: string[] = [];
  const objectStart = source.indexOf("{");
  const objectEnd = source.lastIndexOf("}");
  const listStart = source.indexOf("[");
  const listEnd = source.lastIndexOf("]");
  if (listStart !== -1 && listEnd > listStart && (objectStart === -1 || listStart < objectStart)) candidates.push(source.slice(listStart, listEnd + 1));
  if (objectStart !== -1 && objectEnd > objectStart) candidates.push(source.slice(objectStart, objectEnd + 1));
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      const list = Array.isArray(parsed) ? parsed : (parsed as { moments?: unknown })?.moments;
      if (Array.isArray(list)) return list.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object");
    } catch {
      // Candidat suivant.
    }
  }
  throw new Error("La réponse de Codex ne contient pas la liste des passages.");
}

/** Instant lu en millisecondes : nombre de secondes, ou « 3:21 ». */
function readTime(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return Math.round(value * 1000);
  if (typeof value === "string") {
    const seconds = parseClock(value.replace(/^\[|\]$/g, ""));
    return seconds === null ? null : Math.round(seconds * 1000);
  }
  return null;
}

function readIndex(value: unknown): number | null {
  const number = typeof value === "string" ? Number(value.replace(/^#/, "")) : value;
  return typeof number === "number" && Number.isInteger(number) && number >= 0 ? number : null;
}

/** Texte d'une réponse, nettoyé et borné ; coupé sur un mot. */
export function cleanText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  let text = value.replace(/[\u0000-\u001f]+/g, " ").replace(/#\S+/g, "").replace(/^["'«“\s]+|["'»”\s]+$/g, "").replace(/\s+/g, " ").trim();
  if (text.length > max) {
    const cut = text.slice(0, max);
    text = (cut.lastIndexOf(" ") > max * 0.6 ? cut.slice(0, cut.lastIndexOf(" ")) : cut).replace(/[\s,;:.–-]+$/, "");
  }
  return text;
}

/** Les premiers mots d'un passage : titre de secours. */
function fallbackTitle(sentences: Sentence[], startMs: number): string {
  const first = sentences.find((sentence) => sentence.endMs > startMs);
  return cleanText(first?.text.split(" ").slice(0, 7).join(" ") ?? "", 80) || "Passage";
}

export interface MomentContext {
  durationMs: number;
  words: TimedWord[];
  sentences: Sentence[];
}

/**
 * Passage repris sur des phrases entières, de 15 à 60 s, dans la vidéo, avec
 * une petite marge autour des mots. `null` quand il ne tient pas.
 */
export function repairRange(startMs: number, endMs: number, context: MomentContext): { startMs: number; endMs: number } | null {
  const { durationMs, sentences, words } = context;
  let start = Math.max(0, Math.min(startMs, durationMs));
  let end = Math.max(0, Math.min(endMs, durationMs));
  if (end <= start) return null;

  if (sentences.length) {
    // Début : la phrase qui le contient, sinon la suivante ; fin : la phrase qui la contient, sinon la précédente.
    let first = sentences.findIndex((sentence) => sentence.endMs > start);
    let last = -1;
    for (let index = sentences.length - 1; index >= 0; index--) {
      if (sentences[index].startMs < end) {
        last = index;
        break;
      }
    }
    if (first === -1 || last === -1 || last < first) return null;
    // Trop court : les phrases suivantes, puis les précédentes, tant que le passage reste sous 60 s.
    const span = () => sentences[last].endMs - sentences[first].startMs;
    while (span() < MOMENT_LIMITS.minMs && last + 1 < sentences.length && sentences[last + 1].endMs - sentences[first].startMs <= MOMENT_LIMITS.maxMs) last++;
    while (span() < MOMENT_LIMITS.minMs && first > 0 && sentences[last].endMs - sentences[first - 1].startMs <= MOMENT_LIMITS.maxMs) first--;
    // Trop long : on retire des phrases à la fin, sans descendre sous 15 s.
    while (span() > MOMENT_LIMITS.maxMs && last > first && sentences[last - 1].endMs - sentences[first].startMs >= MOMENT_LIMITS.minMs) last--;
    start = sentences[first].startMs;
    end = sentences[last].endMs;
    if (end - start > MOMENT_LIMITS.maxMs) {
      // Une phrase démesurée : coupée au dernier mot qui finit avant 60 s.
      const fitting = words.filter((word) => word.startMs >= start && word.endMs <= start + MOMENT_LIMITS.maxMs);
      end = fitting.length ? fitting[fitting.length - 1].endMs : start + MOMENT_LIMITS.maxMs;
    }
  } else if (end - start > MOMENT_LIMITS.maxMs) {
    end = start + MOMENT_LIMITS.maxMs;
  }
  if (end - start < MOMENT_LIMITS.hardMinMs) return null;

  // Marge autour des mots, sans entamer le mot d'avant ni celui d'après.
  const before = words.filter((word) => word.endMs <= start).at(-1);
  const after = words.find((word) => word.startMs >= end);
  const paddedStart = Math.max(0, before ? Math.max(before.endMs, start - MOMENT_LIMITS.leadMs) : start - MOMENT_LIMITS.leadMs);
  const paddedEnd = Math.min(durationMs, after ? Math.min(after.startMs, end + MOMENT_LIMITS.tailMs) : end + MOMENT_LIMITS.tailMs);
  return { startMs: Math.round(Math.min(start, paddedStart)), endMs: Math.round(Math.max(end, paddedEnd)) };
}

/**
 * Passages valides d'une réponse : bornés, réparés, sans chevauchement (le
 * mieux noté l'emporte), huit au plus, rangés dans l'ordre de la vidéo.
 */
export function repairMoments(raw: Record<string, unknown>[], context: MomentContext): ClipMoment[] {
  const candidates: Omit<ClipMoment, "id">[] = [];
  for (const entry of raw) {
    const from = readIndex(entry.from);
    const to = readIndex(entry.to);
    let startMs: number | null = null;
    let endMs: number | null = null;
    const byIndex = (index: number | null) => (index === null ? undefined : context.sentences.find((sentence) => sentence.index === index));
    const first = byIndex(from);
    const last = byIndex(to);
    if (first && last) {
      startMs = Math.min(first.startMs, last.startMs);
      endMs = Math.max(first.endMs, last.endMs);
    } else {
      startMs = readTime(entry.start);
      endMs = readTime(entry.end);
    }
    if (startMs === null || endMs === null) continue;
    const range = repairRange(startMs, endMs, context);
    if (!range) continue;
    const score = Number(entry.score);
    candidates.push({
      ...range,
      title: cleanText(entry.title, 90) || fallbackTitle(context.sentences, range.startMs),
      reason: cleanText(entry.reason, 240),
      score: Number.isFinite(score) ? Math.round(Math.min(10, Math.max(0, score)) * 10) / 10 : 5,
    });
  }

  const kept: Omit<ClipMoment, "id">[] = [];
  for (const candidate of [...candidates].sort((a, b) => b.score - a.score)) {
    if (kept.length >= MOMENT_LIMITS.maxCount) break;
    if (kept.some((other) => candidate.startMs < other.endMs && other.startMs < candidate.endMs)) continue;
    kept.push(candidate);
  }
  return kept.sort((a, b) => a.startMs - b.startMs).map((moment, index) => ({ id: `m${index + 1}`, ...moment }));
}

/**
 * Analyse complète : phrases, transcription compacte, une demande à Codex par
 * partie (`ask`), réponses réunies puis réparées. Une partie dont la réponse
 * est illisible est passée ; aucune réponse lisible : l'erreur remonte.
 */
export async function analyzeMoments(
  input: { title: string; durationMs: number; words: TimedWord[] },
  ask: (prompt: string, part: { index: number; total: number }) => Promise<string>,
  options: { maxChars?: number } = {}
): Promise<ClipMoment[]> {
  const sentences = sentencesOf(input.words);
  if (!sentences.length) throw new Error("Aucune parole reconnue dans cette vidéo : rien à découper.");
  const chunks = chunkTranscript(compactTranscript(sentences), options.maxChars ?? TRANSCRIPT_CHUNK_CHARS);
  const raw: Record<string, unknown>[] = [];
  let failure: unknown = null;
  let answered = 0;
  for (const [index, lines] of chunks.entries()) {
    const part = { index, total: chunks.length };
    try {
      const answer = await ask(momentsPrompt({ title: input.title, durationMs: input.durationMs, lines, part }), part);
      raw.push(...readRawMoments(answer));
      answered++;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw error;
      failure = error;
    }
  }
  if (!answered && failure) throw failure;
  const moments = repairMoments(raw, { durationMs: input.durationMs, words: input.words, sentences });
  if (!moments.length) throw new Error("Codex n’a proposé aucun passage exploitable : relancez la découpe.");
  return moments;
}

// ─── Passages retouchés et extraits ──────────────────────────────

/**
 * Passages choisis par l'utilisateur : ceux proposés, au titre retouché et
 * aux bornes décalées à la main. Contrôlés sans être recalés sur les mots :
 * le décalage voulu est gardé.
 */
export function cleanMomentEdits(edits: unknown, proposed: ClipMoment[], durationMs: number): ClipMoment[] {
  if (!Array.isArray(edits) || edits.length === 0) throw new Error("Cochez au moins un passage.");
  if (edits.length > MOMENT_LIMITS.maxCount) throw new Error(`${MOMENT_LIMITS.maxCount} passages au plus.`);
  const seen = new Set<string>();
  const moments = edits.map((edit) => {
    const entry = (edit && typeof edit === "object" ? edit : {}) as Record<string, unknown>;
    const original = proposed.find((moment) => moment.id === entry.id);
    if (!original || seen.has(original.id)) throw new Error("Passage inconnu : relancez la découpe.");
    seen.add(original.id);
    const startMs = Math.round(Math.max(0, Math.min(Number(entry.startMs), durationMs)));
    const endMs = Math.round(Math.max(0, Math.min(Number(entry.endMs), durationMs)));
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs - startMs < MOMENT_LIMITS.editMinMs) {
      throw new Error(`« ${original.title} » : le passage doit durer au moins ${MOMENT_LIMITS.editMinMs / 1000} secondes.`);
    }
    if (endMs - startMs > MOMENT_LIMITS.editMaxMs) {
      throw new Error(`« ${original.title} » : le passage dépasse ${MOMENT_LIMITS.editMaxMs / 1000} secondes.`);
    }
    return { ...original, startMs, endMs, title: cleanText(entry.title, 90) || original.title };
  });
  return moments.sort((a, b) => a.startMs - b.startMs);
}

/** Mots d'un passage, remis à zéro à son début et bornés à sa durée. */
export function momentWords(words: TimedWord[], startMs: number, endMs: number): TimedWord[] {
  const length = endMs - startMs;
  return words
    .filter((word) => word.endMs > startMs && word.startMs < endMs)
    .map((word) => {
      const wordStart = Math.max(0, word.startMs - startMs);
      return { ...word, startMs: wordStart, endMs: Math.max(wordStart, Math.min(length, word.endMs - startMs)) };
    });
}
