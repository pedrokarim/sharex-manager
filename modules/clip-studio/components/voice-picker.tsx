"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Loader2, Mars, Venus } from "lucide-react";
import { cn } from "@/lib/utils";
import { callModule } from "../lib/client";
import type { VoiceStatus } from "../lib/tts";
import type { ResourceState } from "../lib/resources";

export interface VoicesInfo {
  engine: ResourceState;
  voices: VoiceStatus[];
}

/** Voix et état de leur téléchargement, relus tant qu'un téléchargement avance. */
export function useVoices() {
  const [info, setInfo] = useState<VoicesInfo | null>(null);

  const refresh = useCallback(async () => {
    const next = await callModule<VoicesInfo>("getVoices").catch(() => null);
    if (next) setInfo(next);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const downloading =
    info?.engine.status === "downloading" || info?.voices.some((voice) => voice.state.status === "downloading");
  useEffect(() => {
    if (!downloading) return;
    const timer = setInterval(refresh, 1200);
    return () => clearInterval(timer);
  }, [downloading, refresh]);

  const prepare = useCallback(
    async (id: string) => {
      await callModule("prepareVoice", id).catch(() => undefined);
      setTimeout(refresh, 300);
    },
    [refresh]
  );

  return { info, refresh, prepare };
}

function progress(state: ResourceState) {
  return state.total ? Math.min(100, Math.round((state.received / state.total) * 100)) : 0;
}

/**
 * Grille de voix. Choisir une voix pas encore téléchargée lance son
 * téléchargement ; la synthèse l'attendrait de toute façon.
 */
export function VoicePicker({
  value,
  onChange,
  voices,
  onPrepare,
  compact,
}: {
  value: string;
  onChange: (id: string) => void;
  voices: VoicesInfo | null;
  onPrepare: (id: string) => void;
  compact?: boolean;
}) {
  if (!voices) {
    return <div className={cn("grid gap-2", compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4")}>{[0, 1, 2, 3].map((index) => <div key={index} className="h-[58px] animate-pulse rounded-lg bg-muted" />)}</div>;
  }
  return (
    <div className={cn("grid gap-2", compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4")}>
      {voices.voices.map((voice) => {
        const selected = voice.id === value;
        const state = voice.state;
        const Gender = voice.gender === "female" ? Venus : Mars;
        return (
          <button
            key={voice.id}
            type="button"
            title={`${voice.description}. ${voice.credit}, ${voice.license}.`}
            onClick={() => {
              onChange(voice.id);
              if (state.status === "missing" || state.status === "error") onPrepare(voice.id);
            }}
            className={cn(
              "relative flex flex-col items-start gap-0.5 overflow-hidden rounded-lg border px-3 py-2 text-left transition-colors",
              selected ? "border-primary bg-primary/10" : "hover:bg-muted"
            )}
          >
            <span className="flex w-full items-center gap-1.5 text-sm font-medium">
              <Gender className={cn("h-3.5 w-3.5", selected ? "text-primary" : "text-muted-foreground")} />
              {voice.label}
              <span className="ml-auto">
                {state.status === "downloading" && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                {(state.status === "missing" || state.status === "error") && <Download className="h-3.5 w-3.5 text-muted-foreground" />}
              </span>
            </span>
            <span className="line-clamp-1 text-[11px] text-muted-foreground">
              {state.status === "downloading"
                ? `Téléchargement ${progress(state)} %`
                : state.status === "error"
                  ? "Échec, cliquer pour réessayer"
                  : voice.description}
            </span>
            {state.status === "downloading" && (
              <span className="absolute inset-x-0 bottom-0 h-0.5 bg-primary/20">
                <span className="block h-full bg-primary transition-[width]" style={{ width: `${progress(state)}%` }} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Mention des licences des voix, obligatoire pour les voix CC BY. */
export function VoiceCredit({ voice }: { voice?: VoiceStatus }) {
  if (!voice) return null;
  return (
    <p className="text-[11px] leading-4 text-muted-foreground">
      Voix {voice.label} : {voice.credit}, licence {voice.license}. Synthèse locale avec Piper.
    </p>
  );
}
