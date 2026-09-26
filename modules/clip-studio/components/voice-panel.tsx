"use client";

import { useEffect, useState } from "react";
import { Captions, Loader2, Mic, TextCursorInput } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { ClipAsset, MediaSource } from "../engine/types";
import { assetToSource, callModule } from "../lib/client";
import { useVoices, VoiceCredit, VoicePicker } from "./voice-picker";

const SPEEDS = [
  { value: 0.85, label: "Posée" },
  { value: 1, label: "Normale" },
  { value: 1.15, label: "Rapide" },
];

/**
 * Voix off : un texte lu par une voix de synthèse, posé à la tête de lecture
 * sur une piste Voix. Le son rejoint aussi les médias du projet.
 */
export function VoicePanel({
  selectedText,
  onAdd,
  onCaptionAll,
}: {
  /** Texte de l'élément sélectionné, proposé à la lecture. */
  selectedText?: string;
  onAdd: (source: MediaSource, captions: boolean) => void;
  /** Sous-titre les voix déjà posées ; renvoie le nombre de voix traitées. */
  onCaptionAll: () => number;
}) {
  const { info, prepare } = useVoices();
  const [text, setText] = useState("");
  const [voice, setVoice] = useState("siwis");
  const [speed, setSpeed] = useState(1);
  const [busy, setBusy] = useState(false);
  const [captions, setCaptions] = useState(true);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("clip-studio:voice") ?? "null");
      if (saved?.voice) setVoice(saved.voice);
      if (saved?.speed) setSpeed(saved.speed);
      if (typeof saved?.captions === "boolean") setCaptions(saved.captions);
    } catch {
      // Préférence absente ou illisible : on garde les valeurs par défaut.
    }
  }, []);

  const remember = (next: { voice?: string; speed?: number; captions?: boolean }) => {
    try {
      localStorage.setItem("clip-studio:voice", JSON.stringify({ voice, speed, captions, ...next }));
    } catch {
      // Stockage indisponible : la préférence ne sera simplement pas retenue.
    }
  };

  const selected = info?.voices.find((entry) => entry.id === voice);
  const engineMissing = info?.engine.status === "missing" || info?.engine.status === "error";

  const generate = async () => {
    const content = text.trim();
    if (!content) return;
    setBusy(true);
    try {
      const result = await callModule<{ asset: ClipAsset; durationMs: number }>("speak", { text: content, voice, speed });
      onAdd(assetToSource(result.asset), captions);
      toast.success(`Voix ajoutée, ${(result.durationMs / 1000).toFixed(1)} s`);
    } catch (error: any) {
      toast.error(error?.message ?? "La synthèse vocale a échoué");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-3">
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 className="text-[11px] font-medium text-muted-foreground">Texte à lire</h3>
          {selectedText && (
            <button
              type="button"
              onClick={() => setText(selectedText)}
              className="flex items-center gap-1 text-[11px] text-primary hover:underline"
              title="Reprendre le texte de l'élément sélectionné"
            >
              <TextCursorInput className="h-3 w-3" />
              Texte sélectionné
            </button>
          )}
        </div>
        <Textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) void generate();
          }}
          placeholder="Écrivez ce que la voix doit dire. La ponctuation règle les pauses."
          rows={5}
          maxLength={2000}
          className="resize-none text-sm"
        />
        <span className="self-end font-mono text-[10px] tabular-nums text-muted-foreground">{text.length} / 2000</span>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-[11px] font-medium text-muted-foreground">Voix</h3>
        <VoicePicker
          compact
          value={voice}
          voices={info}
          onPrepare={prepare}
          onChange={(id) => {
            setVoice(id);
            remember({ voice: id });
          }}
        />
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-[11px] font-medium text-muted-foreground">Débit</h3>
        <div className="inline-flex rounded-lg bg-muted p-1">
          {SPEEDS.map((entry) => (
            <button
              key={entry.value}
              type="button"
              onClick={() => {
                setSpeed(entry.value);
                remember({ speed: entry.value });
              }}
              className={
                speed === entry.value
                  ? "flex-1 rounded-md bg-background px-2 py-1 text-xs font-medium shadow-sm"
                  : "flex-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
              }
            >
              {entry.label}
            </button>
          ))}
        </div>
      </section>

      <label className="flex items-center justify-between gap-3 text-sm">
        <span>
          Sous-titres animés
          <span className="block text-[11px] text-muted-foreground">Le texte s&apos;affiche mot à mot, calé sur la voix.</span>
        </span>
        <Switch
          checked={captions}
          onCheckedChange={(checked) => {
            setCaptions(checked);
            remember({ captions: checked });
          }}
        />
      </label>

      <Button onClick={generate} disabled={busy || !text.trim()} className="gap-2">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
        {busy ? "Enregistrement…" : "Générer à la tête de lecture"}
      </Button>
      {engineMissing && (
        <p className="text-[11px] text-muted-foreground">
          Le moteur de synthèse sera téléchargé à la première génération (environ 25 Mo).
        </p>
      )}

      <Button
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={() => {
          const count = onCaptionAll();
          if (count) toast.success(`${count} voix sous-titrée(s)`);
          else toast.info("Toutes les voix du projet sont déjà sous-titrées");
        }}
      >
        <Captions className="h-4 w-4" />
        Sous-titrer les voix du projet
      </Button>

      <div className="mt-auto">
        <VoiceCredit voice={selected} />
      </div>
    </div>
  );
}
