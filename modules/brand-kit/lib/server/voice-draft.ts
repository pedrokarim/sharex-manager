/**
 * « Proposer à partir de mes textes » (fiche de voix, étape S1) : Codex lit
 * les textes collés par le créateur et propose une fiche. Le travail tourne en
 * arrière-plan, suivi par l'éditeur ; la proposition reste en mémoire
 * jusqu'à ce que le créateur la relise et en reprenne ce qu'il veut. Rien
 * n'est jamais écrit dans la marque d'ici.
 */

import { askCodex, extractJson, findCodex, type CodexOptions } from "@/modules/ai-image-gen/lib/codex-text";
import { newItemId } from "../defaults";
import { cleanDraftSource, cleanVoiceSheetDraft, isAnswered, VOICE_SHEET_FIELDS, voiceSheetDraftPrompt, type VoiceSheetDraft } from "../voice-sheet";
import { requireKit } from "./kits";

export interface VoiceDraftJob {
  id: string;
  kitId: string;
  status: "running" | "done" | "error" | "canceled";
  draft?: VoiceSheetDraft;
  error?: string;
  createdAt: number;
  finishedAt?: number;
}

/** Appel de Codex, remplaçable par les tests. */
export type AskCodex = (prompt: string, options: CodexOptions) => Promise<string>;

const MAX_RUNNING = 2;
const KEPT = 20;
/** Moins que cela, il n'y a pas de quoi lire une façon de parler. */
const MIN_SOURCE = 80;
const jobs = new Map<string, VoiceDraftJob>();
const controllers = new Map<string, AbortController>();

const defaultAsk: AskCodex = (prompt, options) => askCodex(prompt, { ...options, origin: { module: "brand-kit", feature: "Fiche de voix" } });

/**
 * Proposition de fiche à partir des textes : la réponse de Codex, bornée
 * comme une fiche saisie à la main. Échoue quand elle ne remplit aucun champ.
 */
export async function draftVoiceSheet(source: string, language: string, ask: AskCodex = defaultAsk, signal?: AbortSignal): Promise<VoiceSheetDraft> {
  const answer = await ask(voiceSheetDraftPrompt(source, language), { signal });
  const draft = cleanVoiceSheetDraft(extractJson<Record<string, unknown>>(answer));
  if (!VOICE_SHEET_FIELDS.some((field) => isAnswered(draft, field))) {
    throw new Error("Codex n’a rien trouvé à reprendre dans ces textes. Ajoutez une bio, des descriptions ou la transcription d’une vidéo.");
  }
  return draft;
}

function keep(job: VoiceDraftJob) {
  jobs.set(job.id, job);
  // Les plus anciens partent d'abord (ordre d'insertion), jamais un travail en cours.
  for (const [id, entry] of jobs) {
    if (jobs.size <= KEPT) break;
    if (entry.status !== "running") jobs.delete(id);
  }
}

/** Lance la proposition pour une marque ; le suivi se fait par `getVoiceDraftJob`. */
export function startVoiceDraft(kitId: unknown, input: unknown, ask: AskCodex = defaultAsk): VoiceDraftJob {
  const kit = requireKit(kitId);
  const source = cleanDraftSource((input as { text?: unknown } | null)?.text);
  if (source.length < MIN_SOURCE) throw new Error("Collez un peu plus de texte : une bio, des descriptions ou la transcription d’une vidéo.");
  if (controllers.size >= MAX_RUNNING) throw new Error("Deux propositions sont déjà en cours : attendez qu’une se termine.");
  if (ask === defaultAsk && !findCodex()) throw new Error("Codex CLI est introuvable sur ce serveur : il en a besoin pour lire vos textes.");

  const job: VoiceDraftJob = { id: newItemId("job"), kitId: kit.id, status: "running", createdAt: Date.now() };
  keep(job);
  const controller = new AbortController();
  controllers.set(job.id, controller);
  void draftVoiceSheet(source, kit.language, ask, controller.signal)
    .then((draft) => keep({ ...job, status: "done", draft, finishedAt: Date.now() }))
    .catch((error: unknown) => {
      const canceled = controller.signal.aborted;
      keep({
        ...job,
        status: canceled ? "canceled" : "error",
        ...(canceled ? {} : { error: error instanceof Error && error.message ? error.message : "La proposition a échoué. Réessayez." }),
        finishedAt: Date.now(),
      });
    })
    .finally(() => controllers.delete(job.id));
  return job;
}

export function getVoiceDraftJob(id: unknown): VoiceDraftJob | null {
  return jobs.get(String(id)) ?? null;
}

export function cancelVoiceDraft(id: unknown) {
  controllers.get(String(id))?.abort();
}
