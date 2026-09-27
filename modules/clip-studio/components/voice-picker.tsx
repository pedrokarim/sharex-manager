"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AudioLines, Download, Loader2, Mars, Venus } from "lucide-react";
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
  const grid = cn("grid gap-2", compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4");
  const groups = GROUPS.map((group) => ({ ...group, voices: voices.voices.filter((voice) => voice.provider === group.provider) })).filter(
    (group) => group.voices.length > 0
  );
  const online = groups.some((group) => group.provider !== "piper");
  return (
    <div className="space-y-3">
      {groups.map((group) => (
        <div key={group.provider} className="space-y-1.5">
          {online && <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{group.label}</p>}
          <div className={grid}>
            {group.voices.map((voice) => {
              const selected = voice.id === value;
              const state = voice.state;
              const Gender = voice.gender === "female" ? Venus : voice.gender === "male" ? Mars : AudioLines;
              return (
                <button
                  key={voice.id}
                  type="button"
                  title={voice.license ? `${voice.description}. ${voice.credit}, ${voice.license}.` : `${voice.description}. Voix en ligne ${voice.credit}.`}
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
        </div>
      ))}
      {!online && (
        <Link href="/m/clip-studio/voices" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          <AudioLines className="h-3.5 w-3.5" />
          Plus de voix : voix en ligne OpenAI, Google ou ElevenLabs
        </Link>
      )}
    </div>
  );
}

const GROUPS: { provider: VoiceStatus["provider"]; label: string }[] = [
  { provider: "piper", label: "Locales, gratuites" },
  { provider: "openai", label: "OpenAI" },
  { provider: "google", label: "Google Cloud" },
  { provider: "elevenlabs", label: "ElevenLabs" },
];

/** Mention des licences des voix, obligatoire pour les voix CC BY. */
export function VoiceCredit({ voice }: { voice?: VoiceStatus }) {
  if (!voice) return null;
  if (voice.provider !== "piper") {
    return (
      <p className="text-[11px] leading-4 text-muted-foreground">
        Voix {voice.label} : synthèse en ligne {voice.credit}, voix générée par IA. Le texte lu est envoyé
        au fournisseur et facturé sur votre compte.
      </p>
    );
  }
  return (
    <p className="text-[11px] leading-4 text-muted-foreground">
      Voix {voice.label} : {voice.credit}, licence {voice.license}. Synthèse locale avec Piper.
    </p>
  );
}
