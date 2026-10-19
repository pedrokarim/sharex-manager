"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Captions, Check, Film, HardDrive, Link2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormStatus, errorMessage, useFeedback } from "@/components/feedback";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ClipAsset, MediaSource } from "../engine/types";
import { assetToSource, callModule } from "../lib/client";
import { formatClock } from "../lib/clock";
import { RemoteImportPanel } from "./remote-import-panel";

type Tab = "mine" | "url";

/**
 * « Vidéo source » de l'assistant (dossier 01 vidéo, V4.3) : une vidéo des
 * médias du module, ou récupérée par son adresse. Le script s'appuie sur sa
 * transcription et en cite des extraits ; sans vidéo choisie, l'assistant
 * travaille comme avant.
 */
export function SourceVideoField({
  value,
  onChange,
  embedded = false,
}: {
  value: MediaSource | null;
  onChange: (source: MediaSource | null) => void;
  /** Posé dans un panneau qui porte déjà le titre : ni cadre ni intitulé, la vidéo est demandée. */
  embedded?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("mine");
  const [videos, setVideos] = useState<ClipAsset[] | null>(null);
  const feedback = useFeedback();

  const refresh = useCallback(async () => {
    try {
      const assets = await callModule<ClipAsset[]>("listAssets");
      setVideos(assets.filter((asset) => asset.kind === "video" && (asset.durationMs ?? 0) > 0));
    } catch (error) {
      setVideos([]);
      feedback.error(errorMessage(error, "Vos vidéos n’ont pas pu être lues. Réessayez dans un instant."));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `feedback` change à chaque rendu
  }, []);

  useEffect(() => {
    if (open && videos === null) void refresh();
  }, [open, videos, refresh]);

  const choose = (source: MediaSource) => {
    onChange(source);
    setOpen(false);
  };

  return (
    <div className={cn("min-w-0 space-y-2", !embedded && "rounded-lg border p-3")}>
      <div className="flex min-w-0 items-start justify-between gap-3">
        {embedded ? (
          <span className="min-w-0 text-sm text-muted-foreground">{value ? null : "Aucune vidéo choisie : une vidéo de vos médias, ou récupérée par son adresse."}</span>
        ) : (
          <span className="min-w-0 text-sm">
            Vidéo source
            <span className="block text-xs text-muted-foreground">
              Facultatif. Montez par-dessus une vidéo&nbsp;: le script s’appuie sur ce qui s’y dit, et en cite ou en montre des extraits.
            </span>
          </span>
        )}
        {!value && (
          <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => setOpen((current) => !current)} aria-expanded={open}>
            <Film className="h-4 w-4" />
            {open ? "Fermer" : "Choisir"}
          </Button>
        )}
      </div>

      {value && <ChosenVideo source={value} onChange={() => setOpen(true)} onRemove={() => onChange(null)} />}

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="picker"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="min-w-0 overflow-hidden"
          >
            <div className="min-w-0 space-y-2 border-t pt-2">
              <div className="inline-flex rounded-md bg-muted p-0.5" role="tablist" aria-label="D’où vient la vidéo source">
                {(
                  [
                    { id: "mine", label: "Mes vidéos", icon: HardDrive },
                    { id: "url", label: "Par adresse", icon: Link2 },
                  ] as const
                ).map((entry) => {
                  const Icon = entry.icon;
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      role="tab"
                      aria-selected={tab === entry.id}
                      onClick={() => setTab(entry.id)}
                      className={cn(
                        "flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors",
                        tab === entry.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {entry.label}
                    </button>
                  );
                })}
              </div>

              {tab === "mine" ? (
                <>
                  <FormStatus state={feedback.state} />
                  {videos === null ? (
                    <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-2 sm:grid-cols-[repeat(3,minmax(0,1fr))]">
                      {Array.from({ length: 3 }, (_, index) => (
                        <Skeleton key={index} className="aspect-video w-full rounded-md" />
                      ))}
                    </div>
                  ) : videos.length === 0 ? (
                    <p className="py-4 text-center text-xs break-words text-muted-foreground">
                      Aucune vidéo dans vos médias. Récupérez-en une par son adresse, ou importez-la dans l’éditeur.
                    </p>
                  ) : (
                    <div className="grid max-h-64 grid-cols-[repeat(2,minmax(0,1fr))] gap-2 overflow-y-auto pr-1 sm:grid-cols-[repeat(3,minmax(0,1fr))]">
                      {videos.map((asset) => {
                        const source = assetToSource(asset);
                        const selected = value?.ref === source.ref;
                        return (
                          <button
                            key={asset.file}
                            type="button"
                            onClick={() => choose(source)}
                            title={asset.originalName}
                            aria-pressed={selected}
                            className={cn(
                              "group relative aspect-video min-w-0 overflow-hidden rounded-md border bg-muted text-left",
                              selected && "ring-2 ring-primary"
                            )}
                          >
                            <video src={`${source.url}#t=0.5`} muted preload="metadata" className="h-full w-full max-w-full object-cover" />
                            <span className="absolute inset-x-0 bottom-0 flex min-w-0 items-center gap-1 bg-gradient-to-t from-black/70 to-transparent px-1.5 pt-4 pb-1 text-[10px] text-white">
                              {asset.transcript && <Captions className="h-3 w-3 shrink-0" aria-label="Transcrite" />}
                              <span className="min-w-0 truncate">{asset.originalName}</span>
                              <span className="ml-auto shrink-0 tabular-nums">{formatClock((asset.durationMs ?? 0) / 1000)}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : (
                <RemoteImportPanel onAdd={choose} onImported={() => setVideos(null)} addLabel="Utiliser comme source" />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ChosenVideo({ source, onChange, onRemove }: { source: MediaSource; onChange: () => void; onRemove: () => void }) {
  const transcribed = Boolean(source.transcript);
  const silent = source.hasAudio === false;
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-md bg-muted/40 p-2">
      <video src={`${source.url}#t=0.5`} muted preload="metadata" className="aspect-video w-24 max-w-full shrink-0 rounded object-cover" />
      <div className="min-w-0 flex-1">
        <p className="min-w-0 truncate text-sm font-medium" title={source.name}>
          {source.name}
        </p>
        <p className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
          {source.durationMs ? <span className="shrink-0 tabular-nums">{formatClock(source.durationMs / 1000)}</span> : null}
          <span className="min-w-0 truncate">
            {silent
              ? "· sans son : ses extraits illustrent, muets"
              : transcribed
                ? "· déjà transcrite"
                : "· transcrite au lancement (OpenAI)"}
          </span>
          {transcribed && <Check className="h-3 w-3 shrink-0 text-emerald-500" />}
        </p>
      </div>
      <Button type="button" variant="ghost" size="sm" className="shrink-0" onClick={onChange}>
        Changer
      </Button>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button type="button" variant="ghost" size="icon-xs" className="shrink-0" onClick={onRemove} aria-label="Retirer la vidéo source">
            <X />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">Retirer</TooltipContent>
      </Tooltip>
    </div>
  );
}
