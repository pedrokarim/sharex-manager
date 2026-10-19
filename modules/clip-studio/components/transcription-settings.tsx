"use client";

/**
 * « Transcription de la parole » (page « Voix en ligne », administrateurs) :
 * le moteur qui transcrit les vidéos (sous-titres, découpe, prises de
 * parole) et l'état du moteur local. Rien de secret ne revient du serveur.
 */

import { useCallback, useEffect, useState } from "react";
import { Cpu, Download, Sparkles } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { FormStatus, errorMessage, useFeedback } from "@/components/feedback";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { getTranscriptionSettings, saveTranscriptionSettings, type TranscriptionSettings as Settings } from "../lib/client";

type Engine = Settings["engine"];

const ENGINES: { id: Engine; label: string; description: string }[] = [
  { id: "auto", label: "Automatique", description: "OpenAI quand une clé est enregistrée, et le moteur local dès qu’OpenAI échoue (crédit épuisé, clé refusée, réseau)." },
  { id: "openai", label: "OpenAI", description: "Whisper d’OpenAI seulement : rapide, payé à la seconde de son." },
  { id: "local", label: "Local", description: "whisper.cpp sur ce serveur : gratuit, sans compte, plus lent qu’OpenAI (une minute de son en 15 à 30 s environ)." },
];

const megabytes = (bytes: number) => `${Math.round(bytes / (1024 * 1024))} Mo`;

export function TranscriptionSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState<Engine | "install" | null>(null);
  const feedback = useFeedback();

  const load = useCallback(async () => {
    try {
      setSettings(await getTranscriptionSettings());
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Téléchargement du moteur local en cours : son avancement, relu toutes les deux secondes.
  const downloading = settings?.local.downloading === true;
  useEffect(() => {
    if (!downloading) return;
    const timer = window.setInterval(() => void load(), 2000);
    return () => window.clearInterval(timer);
  }, [downloading, load]);

  const save = async (input: { engine?: Engine; install?: boolean }) => {
    setSaving(input.install ? "install" : (input.engine ?? null));
    feedback.clear();
    try {
      setSettings(await saveTranscriptionSettings(input));
      if (input.engine) feedback.success("Moteur de transcription enregistré.");
    } catch (error) {
      feedback.error(errorMessage(error, "Le réglage n’a pas pu être enregistré. Réessayez."));
    } finally {
      setSaving(null);
    }
  };

  const local = settings?.local;
  const ratio = local && local.downloadBytes > 0 ? Math.min(1, local.received / local.downloadBytes) : 0;
  return (
    <section className="flex flex-col gap-3" aria-labelledby="transcription-title">
      <div>
        <h2 id="transcription-title" className="text-base font-semibold tracking-tight">
          Transcription de la parole
        </h2>
        <p className="text-sm text-muted-foreground">Pour sous-titrer une vidéo, la découper en clips et monter une prise de parole.</p>
      </div>
      {failed ? (
        <p className="rounded-xl border p-4 text-sm text-muted-foreground">Le réglage de la transcription n’a pas pu être lu. Rechargez la page.</p>
      ) : !settings || !local ? (
        <Skeleton className="h-56 rounded-xl" />
      ) : (
        <section className="flex min-w-0 flex-col gap-3 rounded-xl border p-4">
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-[repeat(3,minmax(0,1fr))]" role="radiogroup" aria-label="Moteur de transcription">
            {ENGINES.map((entry) => {
              const selected = settings.engine === entry.id;
              return (
                <button
                  key={entry.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={saving !== null}
                  onClick={() => !selected && void save({ engine: entry.id })}
                  className={cn("group flex min-w-0 flex-col gap-1 rounded-lg border p-3 text-left transition-colors disabled:cursor-wait", selected ? "border-primary bg-primary/10" : "hover:bg-muted")}
                >
                  <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
                    {entry.id === "auto" ? <Sparkles className="size-4 shrink-0 text-muted-foreground" /> : entry.id === "openai" ? <BrandLogo brand="openai" /> : <BrandLogo brand="ggml" />}
                    <span className="min-w-0 truncate">{entry.label}</span>
                  </span>
                  <span className={cn("text-xs text-pretty", selected ? "text-foreground/70" : "text-muted-foreground group-hover:text-foreground/70")}>{entry.description}</span>
                </button>
              );
            })}
          </div>
          <FormStatus state={feedback.state} />

          <div className="flex min-w-0 flex-col gap-2 border-t pt-3">
            <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm font-medium">
              <Cpu className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0">Moteur local</span>
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-normal">
                Gratuit
              </Badge>
              {!local.supported ? (
                <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-normal">
                  Indisponible sur ce serveur
                </Badge>
              ) : local.ready ? (
                <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-normal">
                  Installé
                </Badge>
              ) : null}
            </div>
            <p className="text-xs text-pretty break-words text-muted-foreground">
              whisper.cpp {local.release} et le modèle {local.model}, téléchargés une seule fois sur le serveur et vérifiés par leur empreinte. Mots horodatés, hésitations et reprises gardées pour la
              coupe d’une prise.
              {settings.engine !== "openai" && !settings.openAiKey ? " Aucune clé OpenAI : c’est lui qui transcrit." : ""}
            </p>
            {local.supported && !local.ready ? (
              downloading ? (
                <div className="flex min-w-0 items-center gap-2" aria-live="polite">
                  <Progress value={Math.round(ratio * 100)} className="h-1 min-w-0 flex-1" />
                  <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                    {megabytes(local.received)} sur {megabytes(local.downloadBytes)}
                  </span>
                </div>
              ) : (
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <Button type="button" variant="outline" size="sm" className="gap-1.5" loading={saving === "install"} onClick={() => void save({ install: true })}>
                    <Download className="size-4" />
                    Installer maintenant ({megabytes(local.downloadBytes)})
                  </Button>
                  <span className="min-w-0 text-xs text-muted-foreground">Sinon, au premier usage.</span>
                </div>
              )
            ) : null}
            {local.lastError ? <p className="text-xs break-words text-destructive">Dernier téléchargement impossible&nbsp;: {local.lastError}</p> : null}
          </div>
        </section>
      )}
    </section>
  );
}
