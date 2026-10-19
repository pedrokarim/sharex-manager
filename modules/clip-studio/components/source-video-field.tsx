"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Captions, Check, HardDrive, Lightbulb, Link2, Plus, X } from "lucide-react";
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

/** Vidéos de l'utilisateur qu'un même clip peut utiliser. */
export const MAX_SOURCE_VIDEOS = 3;

/**
 * « Vidéos à utiliser » de l'assistant (dossier 01 vidéo, V5) : jusqu'à trois
 * vidéos des médias du module, ou récupérées par leur adresse. Le script
 * s'appuie d'abord sur ce qui s'y dit et en cite ou en montre des extraits,
 * puis complète avec ce qu'il trouve. Facultatif : sans vidéo choisie,
 * l'assistant monte seul.
 */
export function SourceVideosField({
  value,
  onChange,
  hint,
  defaultOpen = false,
}: {
  value: MediaSource[];
  onChange: (sources: MediaSource[]) => void;
  /** Vidéo que l'idée suggère de fournir : une suggestion, jamais une condition. */
  hint?: string;
  /** Ouvre le choix tout de suite (ancien lien « Monter sur une vidéo »). */
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen && value.length === 0);
  const [tab, setTab] = useState<Tab>("mine");
  const [videos, setVideos] = useState<ClipAsset[] | null>(null);
  const feedback = useFeedback();
  const full = value.length >= MAX_SOURCE_VIDEOS;

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

  const add = (source: MediaSource) => {
    if (value.some((entry) => entry.ref === source.ref)) {
      setOpen(false);
      return;
    }
    const next = [...value, source].slice(0, MAX_SOURCE_VIDEOS);
    onChange(next);
    setOpen(false);
  };
  const remove = (ref: string) => onChange(value.filter((entry) => entry.ref !== ref));

  return (
    <div className="flex min-w-0 flex-col gap-2">
      {hint && value.length === 0 ? (
        <p className="flex min-w-0 items-start gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs">
          <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-primary" />
          <span className="min-w-0 [overflow-wrap:anywhere]">
            <span className="text-muted-foreground">L’idée suggère une vidéo&nbsp;: </span>
            {/[.!?…]$/.test(hint) ? hint : `${hint}.`}
            <span className="text-muted-foreground"> Facultatif&nbsp;: sans elle, l’assistant cherche lui-même.</span>
          </span>
        </p>
      ) : null}

      {value.length ? (
        <ul className="flex min-w-0 flex-col gap-1.5" aria-label="Vidéos à utiliser">
          {value.map((source, index) => (
            <li key={source.ref} className="min-w-0">
              <ChosenVideo source={source} index={value.length > 1 ? index + 1 : undefined} onRemove={() => remove(source.ref)} />
            </li>
          ))}
        </ul>
      ) : null}

      {!full ? (
        <Button type="button" variant="outline" size="sm" className="w-fit max-w-full gap-1.5" onClick={() => setOpen((current) => !current)} aria-expanded={open}>
          {open ? <X className="size-4" /> : <Plus className="size-4" />}
          <span className="truncate">{open ? "Fermer" : value.length ? "Ajouter une autre vidéo" : "Ajouter une vidéo"}</span>
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground">{MAX_SOURCE_VIDEOS}&nbsp;vidéos au plus.</p>
      )}

      <AnimatePresence initial={false}>
        {open && !full && (
          <motion.div
            key="picker"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="min-w-0 overflow-hidden"
          >
            <div className="min-w-0 space-y-2 border-t pt-2">
              <div className="inline-flex max-w-full rounded-md bg-muted p-0.5" role="tablist" aria-label="D’où vient la vidéo">
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
                        tab === entry.id ? "bg-background text-foreground shadow-sm" : "text-foreground/70 hover:text-foreground"
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
                    <div className="grid max-h-72 grid-cols-[repeat(2,minmax(0,1fr))] gap-2 overflow-x-hidden overflow-y-auto pr-1 sm:grid-cols-[repeat(3,minmax(0,1fr))]">
                      {videos.map((asset) => {
                        const source = assetToSource(asset);
                        const selected = value.some((entry) => entry.ref === source.ref);
                        return (
                          <button
                            key={asset.file}
                            type="button"
                            onClick={() => add(source)}
                            title={asset.originalName}
                            aria-pressed={selected}
                            disabled={selected}
                            className={cn(
                              "group relative aspect-video min-w-0 overflow-hidden rounded-md border bg-muted text-left disabled:opacity-60",
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
                <RemoteImportPanel onAdd={add} onImported={() => setVideos(null)} addLabel="Utiliser dans ce clip" />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ChosenVideo({ source, index, onRemove }: { source: MediaSource; index?: number; onRemove: () => void }) {
  const transcribed = Boolean(source.transcript);
  const silent = source.hasAudio === false;
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-md bg-muted/40 p-2">
      <video src={`${source.url}#t=0.5`} muted preload="metadata" className="aspect-video w-20 max-w-full shrink-0 rounded object-cover" />
      <div className="min-w-0 flex-1">
        <p className="min-w-0 truncate text-sm font-medium" title={source.name}>
          {index ? <span className="mr-1 text-muted-foreground tabular-nums">{index}.</span> : null}
          {source.name}
        </p>
        <p className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
          {source.durationMs ? <span className="shrink-0 tabular-nums">{formatClock(source.durationMs / 1000)}</span> : null}
          <span className="min-w-0 truncate" title={silent ? "Sans son : ses extraits illustrent, muets" : transcribed ? "Déjà transcrite" : "Transcrite au lancement"}>
            {silent ? "· sans son : extraits muets" : transcribed ? "· déjà transcrite" : "· transcrite au lancement"}
          </span>
          {transcribed && <Check className="h-3 w-3 shrink-0 text-emerald-500" />}
        </p>
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button type="button" variant="ghost" size="icon-xs" className="shrink-0" onClick={onRemove} aria-label={`Retirer ${source.name}`}>
            <X />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">Retirer</TooltipContent>
      </Tooltip>
    </div>
  );
}
