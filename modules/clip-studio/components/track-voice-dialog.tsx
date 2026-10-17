"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, Mic } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { ThinkingStatus } from "@/components/loading";
import { cn } from "@/lib/utils";
import type { AudioItem, ClipAsset, ClipProject } from "../engine/types";
import { voiceItemsOf, type VoiceReplacement } from "../engine/revoice";
import { assetToSource, callModule } from "../lib/client";
import { SpeedControl, ToneControl, useVoices, VoiceCredit, VoicePicker } from "./voice-picker";

type ItemStatus = { state: "pending" | "running" | "done" } | { state: "error"; message: string };

/** Texte d'un extrait, quand sa fiche serveur ne l'a pas : mots horodatés, sinon nom. */
function fallbackText(item: AudioItem): string {
  if (item.source.speech?.text) return item.source.speech.text;
  if (item.source.words?.length) return item.source.words.map((word) => word.text).join(" ");
  return item.source.name.replace(/^Voix [^:]{1,60}:\s*/, "").trim();
}

/**
 * Changer la voix d'une piste : choix de la nouvelle voix (avec écoute),
 * puis chaque extrait est relu dans l'ordre. Le projet ne change qu'une
 * fois, à la fin : une seule étape d'annulation. Un extrait en échec garde
 * son ancienne voix ; les autres sont remplacés.
 */
export function TrackVoiceDialog({
  project,
  trackId,
  onOpenChange,
  onApply,
}: {
  project: ClipProject;
  trackId: string | null;
  onOpenChange: (open: boolean) => void;
  onApply: (trackId: string, replacements: VoiceReplacement[]) => { overlaps: number };
}) {
  const open = trackId !== null;
  const { info, prepare } = useVoices();
  const items = useMemo(() => (trackId ? voiceItemsOf(project, trackId) : []), [project, trackId]);
  const trackName = project.tracks.find((track) => track.id === trackId)?.name ?? "Voix";
  const first = items[0]?.source.speech;

  const [voice, setVoice] = useState("siwis");
  const [speed, setSpeed] = useState(1);
  const [tone, setTone] = useState("balanced");
  const [running, setRunning] = useState(false);
  const [statuses, setStatuses] = useState<Record<string, ItemStatus>>({});
  const stopRef = useRef(false);
  /** Réglages de la dernière relecture : relancer avec les mêmes ne refait que les échecs. */
  const lastRunRef = useRef("");

  // À l'ouverture : réglages de la voix actuelle de la piste, états remis à zéro.
  useEffect(() => {
    if (!open) return;
    setVoice(first?.voice ?? "siwis");
    setSpeed(first?.speed ?? 1);
    setTone(first?.tone ?? "balanced");
    setStatuses({});
    stopRef.current = false;
    lastRunRef.current = "";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, trackId]);

  const selected = info?.voices.find((entry) => entry.id === voice);
  const done = Object.values(statuses).filter((status) => status.state === "done").length;
  const failed = items.filter((item) => statuses[item.id]?.state === "error");
  const finished = Object.values(statuses).filter((status) => status.state === "done" || status.state === "error").length;

  const run = async () => {
    if (!trackId || items.length === 0) return;
    const runKey = `${voice}|${speed}|${tone}`;
    const retryOnly = lastRunRef.current === runKey && failed.length > 0;
    const targets = retryOnly ? failed : items;
    lastRunRef.current = runKey;
    setRunning(true);
    stopRef.current = false;
    setStatuses((current) => ({
      ...(retryOnly ? current : {}),
      ...Object.fromEntries(targets.map((item) => [item.id, { state: "pending" } as ItemStatus])),
    }));
    const replacements: VoiceReplacement[] = [];
    let errors = 0;
    for (const item of targets) {
      if (stopRef.current) break;
      setStatuses((current) => ({ ...current, [item.id]: { state: "running" } }));
      try {
        const result = await callModule<{ asset: ClipAsset }>("respeakVoice", {
          ref: item.source.ref,
          text: fallbackText(item),
          voice,
          speed,
          tone: selected?.provider === "piper" ? tone : undefined,
        });
        replacements.push({ itemId: item.id, source: assetToSource(result.asset) });
        setStatuses((current) => ({ ...current, [item.id]: { state: "done" } }));
      } catch (error) {
        errors++;
        const message = error instanceof Error ? error.message : "Échec de la synthèse";
        setStatuses((current) => ({ ...current, [item.id]: { state: "error", message } }));
      }
    }
    setRunning(false);
    if (replacements.length === 0) {
      if (errors) toast.error("Aucun extrait n’a pu être relu : la piste garde sa voix.");
      return;
    }
    const { overlaps } = onApply(trackId, replacements);
    const notes = [
      `${replacements.length} extrait${replacements.length > 1 ? "s" : ""} relu${replacements.length > 1 ? "s" : ""}`,
      errors ? `${errors} en échec, gardé${errors > 1 ? "s" : ""} avec l’ancienne voix` : "",
      stopRef.current ? "arrêt demandé avant la fin" : "",
      overlaps ? `${overlaps} extrait${overlaps > 1 ? "s" : ""} empiète${overlaps > 1 ? "nt" : ""} désormais sur le suivant` : "",
    ].filter(Boolean);
    if (errors || overlaps || stopRef.current) toast.warning(notes.join(", "));
    else {
      toast.success(`${notes[0]}. Ctrl Z pour revenir à l’ancienne voix.`);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !running && onOpenChange(next)}>
      {/* En-tête et boutons fixes ; seul le milieu défile quand l'écran est petit. */}
      <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mic className="h-4 w-4" />
            Changer la voix de la piste
          </DialogTitle>
          <DialogDescription>
            {items.length} extrait{items.length > 1 ? "s" : ""} de «&nbsp;{trackName}&nbsp;» relu{items.length > 1 ? "s" : ""} avec
            la voix choisie, chacun à sa place. Les sous-titres animés liés suivent la nouvelle lecture.
          </DialogDescription>
        </DialogHeader>

        <div className="-mx-1 flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto overflow-x-hidden px-1">
        <div className={cn("flex min-w-0 flex-col gap-4", running && "pointer-events-none opacity-60")}>
          <VoicePicker value={voice} onChange={setVoice} voices={info} onPrepare={prepare} speed={speed} tone={tone} />
          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-1.5">
              <span className="text-[11px] font-medium text-muted-foreground">Débit</span>
              <SpeedControl value={speed} onChange={setSpeed} />
            </div>
            {selected?.provider === "piper" && (
              <div className="flex min-w-0 flex-col gap-1.5">
                <span className="text-[11px] font-medium text-muted-foreground">Intonation</span>
                <ToneControl value={tone} onChange={setTone} />
              </div>
            )}
          </div>
          <VoiceCredit voice={selected} />
        </div>

        {Object.keys(statuses).length > 0 && (
          <div className="flex min-w-0 flex-col gap-2" aria-live="polite">
            <div className="flex items-center justify-between gap-3 text-xs">
              {running ? (
                <ThinkingStatus messages="Relecture en cours…" state="listening" className="text-xs text-muted-foreground" />
              ) : (
                <span className="text-muted-foreground">Relecture terminée</span>
              )}
              <span className="tabular-nums">
                {finished} / {items.length}
              </span>
            </div>
            <Progress value={items.length ? (finished / items.length) * 100 : 0} className="h-1.5" />
            <ol className="max-h-40 space-y-1 overflow-y-auto overflow-x-hidden text-xs">
              {items.map((item, index) => {
                const status = statuses[item.id];
                return (
                  <li key={item.id} className="flex min-w-0 items-start gap-2">
                    <span className="mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                      {status?.state === "running" ? (
                        <Spinner className="size-3.5 text-muted-foreground" aria-hidden />
                      ) : status?.state === "done" ? (
                        <Check className="h-3.5 w-3.5 text-primary" />
                      ) : status?.state === "error" ? (
                        <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                      ) : (
                        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate" title={fallbackText(item)}>
                        {index + 1}. {fallbackText(item) || "Extrait sans texte"}
                      </span>
                      {status?.state === "error" && <span className="block break-words text-destructive">{status.message}</span>}
                    </span>
                  </li>
                );
              })}
            </ol>
            {!running && failed.length > 0 && done > 0 && (
              <p className="text-xs text-muted-foreground">
                Les extraits en échec gardent leur ancienne voix. Relancez pour réessayer, ou choisissez une autre voix.
              </p>
            )}
          </div>
        )}
        </div>

        <DialogFooter className="shrink-0 gap-2 sm:gap-2">
          {running ? (
            <Button
              variant="outline"
              onClick={() => {
                stopRef.current = true;
              }}
            >
              Arrêter après cet extrait
            </Button>
          ) : (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Fermer
            </Button>
          )}
          <Button onClick={run} loading={running} disabled={items.length === 0 || !voice} className="gap-2">
            <Mic className="h-4 w-4" />
            {running ? `Relecture ${Math.min(finished + 1, items.length)} / ${items.length}…` : `Relire ${items.length} extrait${items.length > 1 ? "s" : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
