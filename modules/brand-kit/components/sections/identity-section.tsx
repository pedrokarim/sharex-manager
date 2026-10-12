"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { KIT_LIMITS } from "../../lib/types";
import { CountedInput, CountedTextarea, Field, FieldGroup, SectionHeading, StringListEditor } from "../fields";
import type { SectionProps } from "./types";

const LANGUAGES = [
  { value: "fr", label: "Français" },
  { value: "en", label: "Anglais" },
  { value: "es", label: "Espagnol" },
  { value: "de", label: "Allemand" },
  { value: "it", label: "Italien" },
  { value: "pt", label: "Portugais" },
  { value: "ja", label: "Japonais" },
  { value: "ko", label: "Coréen" },
];

export function IdentitySection({ kit, update }: SectionProps) {
  const languages = LANGUAGES.some((entry) => entry.value === kit.language) ? LANGUAGES : [...LANGUAGES, { value: kit.language, label: kit.language }];
  return (
    <div className="flex flex-col gap-6">
      <SectionHeading title="Identité" text="Le nom, l’accroche et le ton : repris par les formats, le carton de fin et l’assistant." />
      <FieldGroup>
        <Field label="Nom" htmlFor="kit-name">
          <CountedInput id="kit-name" value={kit.name} maxLength={KIT_LIMITS.name} onChange={(event) => update((draft) => ({ ...draft, name: event.target.value }))} />
        </Field>
        <Field label="Accroche" htmlFor="kit-tagline" hint="Sous le logo de la bannière et sur le carton de fin : l’aperçu la montre à droite.">
          <CountedInput
            id="kit-tagline"
            value={kit.tagline ?? ""}
            maxLength={KIT_LIMITS.tagline}
            placeholder="Les sorties anime et jeu vidéo, en une minute"
            onChange={(event) => update((draft) => ({ ...draft, tagline: event.target.value }))}
          />
        </Field>
        <Field label="Langue" hint="Langue des textes de la marque, annoncée aux plateformes.">
          <Select value={kit.language} onValueChange={(language) => update((draft) => ({ ...draft, language }))}>
            <SelectTrigger className="w-full @md/form:w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {languages.map((entry) => (
                <SelectItem key={entry.value} value={entry.value}>
                  {entry.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Ton" htmlFor="kit-tone" hint="Comment la marque parle : l’assistant écrit ses scripts dans ce ton.">
          <CountedTextarea
            id="kit-tone"
            value={kit.tone}
            maxLength={KIT_LIMITS.tone}
            rows={4}
            placeholder="Enthousiaste, complice, phrases courtes, tutoiement…"
            onChange={(event) => update((draft) => ({ ...draft, tone: event.target.value }))}
          />
        </Field>
      </FieldGroup>
      <FieldGroup title="Règles" text="Consignes données à l’assistant pour chaque script.">
        <StringListEditor
          label="Toujours"
          items={kit.rules.always}
          max={KIT_LIMITS.rules}
          itemMax={KIT_LIMITS.rule}
          placeholder="Citer la source d’une annonce"
          onChange={(always) => update((draft) => ({ ...draft, rules: { ...draft.rules, always } }))}
        />
        <StringListEditor
          label="Jamais"
          items={kit.rules.never}
          max={KIT_LIMITS.rules}
          itemMax={KIT_LIMITS.rule}
          placeholder="Révéler la fin d’un épisode"
          onChange={(never) => update((draft) => ({ ...draft, rules: { ...draft.rules, never } }))}
        />
      </FieldGroup>
    </div>
  );
}
