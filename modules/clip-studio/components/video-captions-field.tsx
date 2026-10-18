"use client";

import { useEffect, useState } from "react";
import { Captions } from "lucide-react";
import { FormStatus, errorMessage, useFeedback } from "@/components/feedback";
import { ShimmerText } from "@/components/loading";
import { Button } from "@/components/ui/button";
import { spokenItem } from "../engine/edit";
import type { ClipProject, TimedWord, TranscriptInfo, VideoItem } from "../engine/types";
import { cancelTranscription, getTranscriptionJob, startTranscription, type TranscriptionJob } from "../lib/client";

/**
 * Range la transcription d’un média dans le projet et pose les sous-titres de
 * la vidéo `itemId`. Rend `true` si des sous-titres ont été posés.
 */
export type TranscribedHandler = (itemId: string, ref: string, words: TimedWord[], transcript: TranscriptInfo) => boolean;

// ─── Suivi des transcriptions, hors des composants ───────────────

/**
 * Une transcription continue si l’inspecteur se ferme ou change d’élément :
 * son suivi vit ici, et son résultat est rangé dans le projet par la fonction
 * donnée au lancement, même si plus rien ne l’affiche.
 */
interface Run {
  job: TranscriptionJob | null;
  /** Des sous-titres ont été posés à la fin du travail. */
  added?: boolean;
  listeners: Set<(job: TranscriptionJob | null, error?: string) => void>;
}

const runs = new Map<string, Run>();
const POLL_MS = 1500;
const MAX_POLL_FAILURES = 4;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function publish(ref: string, run: Run, job: TranscriptionJob | null, error?: string) {
  run.job = job;
  for (const listener of run.listeners) listener(job, error);
}

function launch(ref: string, apply: (job: TranscriptionJob) => boolean): Run {
  const existing = runs.get(ref);
  if (existing) return existing;
  const run: Run = { job: null, listeners: new Set() };
  runs.set(ref, run);
  void (async () => {
    try {
      let job = await startTranscription({ ref });
      publish(ref, run, job);
      let failures = 0;
      while (job.status === "running") {
        await wait(POLL_MS);
        try {
          const next = await getTranscriptionJob(job.id);
          if (!next) throw new Error("Transcription introuvable sur le serveur.");
          job = next;
          failures = 0;
          publish(ref, run, job);
        } catch (error) {
          if (++failures >= MAX_POLL_FAILURES) throw error;
        }
      }
      runs.delete(ref);
      if (job.status === "done") run.added = apply(job);
      publish(ref, run, job);
    } catch (error) {
      runs.delete(ref);
      publish(ref, run, null, errorMessage(error, "Transcription impossible."));
    }
  })();
  return run;
}

function stageLabel(job: TranscriptionJob | null): string {
  if (!job || job.stage === "extracting") return "Extraction du son…";
  if (job.stage === "saving" || job.stage === "done") return "Enregistrement des mots…";
  const chunks = job.chunks;
  return chunks && chunks.total > 1 ? `Transcription, morceau ${Math.min(chunks.done + 1, chunks.total)} sur ${chunks.total}…` : "Transcription par OpenAI…";
}

// ─── Champ de l’inspecteur ───────────────────────────────────────

/**
 * Groupe « Sous-titres » d’une vidéo : transcrit sa parole (Whisper d’OpenAI,
 * une fois par média) puis pose des sous-titres animés calés sur son
 * placement, son rognage et sa vitesse.
 */
export function VideoCaptionsField({
  project,
  item,
  onTranscribed,
}: {
  project: ClipProject;
  item: VideoItem;
  onTranscribed?: TranscribedHandler;
}) {
  const feedback = useFeedback({ successDuration: 4000 });
  const ref = item.source.ref;
  const [job, setJob] = useState<TranscriptionJob | null>(() => runs.get(ref)?.job ?? null);
  const [busy, setBusy] = useState(() => runs.has(ref));
  const [canceling, setCanceling] = useState(false);

  // Se raccroche à une transcription déjà lancée pour ce média.
  useEffect(() => {
    const run = runs.get(ref);
    if (!run) return;
    return follow(run);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref]);

  function follow(run: Run) {
    const listener = (next: TranscriptionJob | null, error?: string) => {
      setJob(next);
      if (next?.status === "running") return;
      setBusy(false);
      setCanceling(false);
      if (error) feedback.error(error);
      else if (next?.status === "error") feedback.error(next.error || "Transcription impossible.");
      else if (next?.status === "canceled") feedback.info("Transcription annulée.");
      else if (next?.status === "done") {
        if (!next.wordCount && !next.words?.length) feedback.info("Aucune parole reconnue dans cette vidéo.");
        else if (!run.added) feedback.info("Aucune parole dans le passage gardé de cette vidéo.");
        else feedback.success("Sous-titres ajoutés sur la piste « Sous-titres ».");
      }
    };
    run.listeners.add(listener);
    return () => {
      run.listeners.delete(listener);
    };
  }

  if (item.source.hasAudio === false) {
    return (
      <Group>
        <Note>Cette vidéo n’a pas de son : rien à sous-titrer.</Note>
      </Group>
    );
  }

  const spoken = spokenItem(project, item);
  const captionIds = new Set([item.id, ...(item.audioLinkId ? [item.audioLinkId] : [])]);
  const captioned = project.tracks.some((track) => track.items.some((other) => other.type === "text" && other.karaoke?.voiceId && captionIds.has(other.karaoke.voiceId)));
  const transcribed = Boolean(item.source.transcript);

  const caption = (words: TimedWord[], transcript: TranscriptInfo) => {
    if (!onTranscribed) return;
    const added = onTranscribed(item.id, ref, words, transcript);
    if (added) feedback.success("Sous-titres ajoutés sur la piste « Sous-titres ».");
    else feedback.info(words.length ? "Aucune parole dans le passage gardé de cette vidéo." : "Aucune parole reconnue dans cette vidéo.");
  };

  const start = () => {
    feedback.clear();
    if (transcribed && item.source.words) {
      caption(item.source.words, item.source.transcript!);
      return;
    }
    setBusy(true);
    setJob(null);
    const itemId = item.id;
    const handler = onTranscribed;
    const run = launch(ref, (done) => {
      return done.words && done.transcript && handler ? handler(itemId, ref, done.words, done.transcript) : false;
    });
    follow(run);
  };

  const cancel = async () => {
    if (!job?.id) return;
    setCanceling(true);
    try {
      await cancelTranscription(job.id);
    } catch (error) {
      setCanceling(false);
      feedback.error(errorMessage(error, "Annulation impossible."));
    }
  };

  return (
    <Group>
      {!spoken ? (
        <Note>Le son de cette vidéo est coupé : rétablissez-le pour la sous-titrer.</Note>
      ) : captioned && !busy ? (
        <Note>Les sous-titres de cette vidéo sont posés sur la piste « Sous-titres ».</Note>
      ) : (
        <>
          <Note>
            {transcribed
              ? "La parole de cette vidéo est déjà transcrite : les sous-titres suivent son placement et son rognage."
              : "La parole est envoyée une fois à OpenAI (Whisper), puis les sous-titres suivent le placement et le rognage de la vidéo."}
          </Note>
          <Button variant="outline" size="sm" className="w-full gap-2" loading={busy} disabled={!onTranscribed} onClick={start}>
            <Captions className="h-4 w-4" />
            {transcribed ? "Sous-titrer" : "Transcrire et sous-titrer"}
          </Button>
          {busy && (
            <div className="flex min-w-0 items-center justify-between gap-2">
              <ShimmerText className="min-w-0 truncate text-xs text-muted-foreground" title={stageLabel(job)}>
                {stageLabel(job)}
              </ShimmerText>
              {job?.id && job.status === "running" && (
                <Button variant="ghost" size="sm" className="h-7 shrink-0 px-2 text-xs" loading={canceling} onClick={cancel}>
                  Annuler
                </Button>
              )}
            </div>
          )}
        </>
      )}
      <FormStatus state={feedback.state} />
    </Group>
  );
}

function Group({ children }: { children: React.ReactNode }) {
  return (
    <section className="space-y-2.5">
      <h3 className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Sous-titres</h3>
      {children}
    </section>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] leading-4 text-muted-foreground">{children}</p>;
}
