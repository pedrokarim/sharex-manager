"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { KIT_LIMITS } from "../../lib/types";
import { CountedTextarea, Field, FieldGroup, SectionHeading } from "../fields";
import type { SectionProps } from "./types";

export function AiSection({ kit, update }: SectionProps) {
  return (
    <div className="flex flex-col gap-6">
      <SectionHeading title="Assistant IA" text="Ce que l’assistant de Clip Studio reprend quand il écrit et illustre une vidéo de la marque." />
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
