"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { lastPickedVoice, SpeedControl, ToneControl, useVoices, VoiceCredit, VoicePicker } from "@/modules/clip-studio/components/voice-picker";
import { brandVoicePrefill, voiceSourceOf } from "@/modules/clip-studio/lib/voice-settings";
import { KIT_LIMITS, type BrandVoice } from "../../lib/types";
import { CountedTextarea, Field, FieldGroup, SectionHeading } from "../fields";
import type { SectionProps } from "./types";

/**
 * Voix off de la marque : source et voix (avec écoute), débit et, pour une
 * voix locale, intonation. La fenêtre « Créer » de Clip Studio la préremplit
 * quand la marque est choisie ; l'assistant la prend d'office quand une
 * demande n'en précise aucune.
 */
function BrandVoiceGroup({ kit, update }: SectionProps) {
  const { info, failed, prepare } = useVoices();
  const voice = kit.voice;
  const setVoice = (patch: Partial<BrandVoice>) =>
    update((draft) => (draft.voice ? { ...draft, voice: { ...draft.voice, ...patch } } : draft));
  const enable = (on: boolean) =>
    update((draft) => {
      if (!on) return { ...draft, voice: undefined };
      return { ...draft, voice: draft.voice ?? { voice: lastPickedVoice() ?? "siwis", speed: 1, tone: "balanced" } };
    });
  const local = voice ? voiceSourceOf(voice.voice) === "piper" : false;
  const selected = voice ? info?.voices.find((entry) => entry.id === voice.voice) : undefined;
  const missing = voice && info ? brandVoicePrefill(voice, info.voices.map((entry) => entry.id)).unavailable : undefined;

  return (
    <FieldGroup
      title="Voix off"
      text={"Préremplie dans la fenêtre «\u00a0Créer\u00a0» de Clip Studio quand cette marque est choisie, et modifiable pour chaque clip. L’assistant la prend aussi quand une demande ne précise aucune voix."}
    >
      <label className="flex items-center gap-2.5 text-sm">
        <Switch checked={Boolean(voice)} onCheckedChange={enable} />
        Donner une voix à la marque
      </label>
      {voice && failed && !info && <p className="text-xs text-muted-foreground">Les voix de Clip Studio ne sont pas disponibles pour l’instant.</p>}
      {voice && !(failed && !info) && (
        <div className="flex min-w-0 flex-col gap-3">
          <VoicePicker
            value={voice.voice}
            onChange={(id) => setVoice({ voice: id, ...(voiceSourceOf(id) === "piper" ? { tone: voice.tone ?? "balanced" } : { tone: undefined }) })}
            voices={info}
            onPrepare={prepare}
            speed={voice.speed}
            tone={voice.tone}
            remember={false}
          />
          {missing && <p className="text-xs break-words text-amber-700 dark:text-amber-400">{missing}</p>}
          <div className="grid min-w-0 gap-3 @md/form:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-1.5">
              <span className="text-xs font-medium">Débit</span>
              <SpeedControl value={voice.speed} onChange={(speed) => setVoice({ speed })} />
            </div>
            {local && (
              <div className="flex min-w-0 flex-col gap-1.5">
                <span className="text-xs font-medium">Intonation</span>
                <ToneControl value={voice.tone ?? "balanced"} onChange={(tone) => setVoice({ tone: tone as BrandVoice["tone"] })} />
              </div>
            )}
          </div>
          <VoiceCredit voice={selected} />
        </div>
      )}
    </FieldGroup>
  );
}

export function AiSection({ kit, update }: SectionProps) {
  return (
    <div className="flex flex-col gap-6">
      <SectionHeading title="Assistant IA" text="Ce que l’assistant de Clip Studio reprend quand il écrit, illustre et lit une vidéo de la marque." />
      <FieldGroup>
        <Field label="Notes de style des illustrations" htmlFor="kit-style-notes" hint="Ajoutées à chaque image générée pour la marque.">
          <CountedTextarea
            id="kit-style-notes"
            value={kit.ai.styleNotes}
            maxLength={KIT_LIMITS.styleNotes}
            rows={5}
            placeholder="Impression risographie, deux encres rose et bleu, grain visible, aplats…"
            onChange={(event) => update((draft) => ({ ...draft, ai: { ...draft.ai, styleNotes: event.target.value } }))}
          />
        </Field>
        <Field label="Ton du script" htmlFor="kit-script-tone" hint="En plus du ton de la marque : rythme, accroche, chute.">
          <CountedTextarea
            id="kit-script-tone"
            value={kit.ai.scriptTone}
            maxLength={KIT_LIMITS.scriptTone}
            rows={3}
            placeholder="Accroche en moins de deux secondes, une info par plan, chute en question."
            onChange={(event) => update((draft) => ({ ...draft, ai: { ...draft.ai, scriptTone: event.target.value } }))}
          />
        </Field>
      </FieldGroup>
      <BrandVoiceGroup kit={kit} update={update} />
      <FieldGroup title="Collection AI Image Gen" text="Ses ancres (mascotte, références) partent avec chaque image de la marque.">
        {kit.ai.collectionId ? (
          <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
            <code className="max-w-full rounded bg-muted px-1.5 py-0.5 text-xs break-all">{kit.ai.collectionId}</code>
            <Link href="/m/ai-image-gen/collections" className="inline-flex items-center gap-1 text-primary hover:underline">
              Voir les collections
              <ExternalLink aria-hidden className="size-3.5" />
            </Link>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Aucune collection liée : l’assistant de création en crée une quand il fabrique la marque.</p>
        )}
      </FieldGroup>
    </div>
  );
}
