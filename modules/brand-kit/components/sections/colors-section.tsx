"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ContrastIndicator } from "@/components/ui/contrast-indicator";
import { KIT_LIMITS, type BrandPalette } from "../../lib/types";
import { ColorField, Field, FieldGroup, SectionHeading } from "../fields";
import type { SectionProps } from "./types";

type RoleKey = Exclude<keyof BrandPalette, "extras">;

const LABELS: Record<RoleKey, string> = {
  background: "Fond",
  ink: "Encre",
  surface: "Surface",
  onSurface: "Texte sur surface",
  accent: "Accent",
  accentSecondary: "Mise en avant",
  onAccent: "Texte sur accent",
};

/**
 * Les couleurs vont par paires fond / texte : on règle les deux côte à côte,
 * et la lisibilité de la paire s'affiche à l'endroit même où on la change.
 */
const PAIRS: { title: string; text: string; background: RoleKey; ink: RoleKey; sample: string }[] = [
  { title: "Fond et encre", text: "Plans sans image, voile sur les images, fond des formats ; titres et légendes posés dessus.", background: "background", ink: "ink", sample: "Titre" },
  { title: "Surface", text: "Cartes et cadres, comme les choix d’un quiz, et le texte posé dessus.", background: "surface", ink: "onSurface", sample: "Réponse B" },
  { title: "Accent", text: "Teinte de la marque : étiquettes, barres, avatar ; et le texte des étiquettes.", background: "accent", ink: "onAccent", sample: "Question 2" },
];

export function ColorsSection({ kit, update }: SectionProps) {
  const { palette } = kit;
  const setColor = (key: RoleKey, value: string | undefined) => update((draft) => ({ ...draft, palette: { ...draft.palette, [key]: value } }));
  const setExtras = (extras: string[]) => update((draft) => ({ ...draft, palette: { ...draft.palette, extras } }));

  // Le reste de la palette, proposé d'un clic dans chaque sélecteur.
  const swatches = [
    ...(Object.keys(LABELS) as RoleKey[]).flatMap((key) => (palette[key] ? [{ color: palette[key]!, label: LABELS[key] }] : [])),
    ...palette.extras.map((color, index) => ({ color, label: `Teinte ${index + 1}` })),
  ].filter((entry, index, list) => list.findIndex((other) => other.color.toLowerCase() === entry.color.toLowerCase()) === index);

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading title="Couleurs" text="Une couleur par rôle : le montage sait où poser chacune. Chaque paire montre sa lisibilité, 4,5 : 1 au moins pour un texte courant." />

      {PAIRS.map((pair) => {
        const background = palette[pair.background] ?? palette.background;
        const ink = palette[pair.ink] ?? palette.ink;
        const contrast = <ContrastIndicator foreground={ink} background={background} sample={pair.sample} />;
        return (
          <FieldGroup key={pair.title} title={pair.title} text={pair.text}>
            <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
              <Field label={LABELS[pair.background]}>
                <ColorField label={LABELS[pair.background]} value={background} swatches={swatches} onChange={(hex) => setColor(pair.background, hex)}>
                  {contrast}
                </ColorField>
              </Field>
              <Field label={LABELS[pair.ink]}>
                <ColorField label={LABELS[pair.ink]} value={ink} swatches={swatches} onChange={(hex) => setColor(pair.ink, hex)}>
                  {contrast}
                </ColorField>
              </Field>
              <div className="min-w-0 pb-0.5">{contrast}</div>
            </div>
          </FieldGroup>
        );
      })}

      <FieldGroup title="Mise en avant" text="Numéro 1 d’un classement, mot prononcé des sous-titres. Sans elle, l’accent.">
        {palette.accentSecondary ? (
          <div className="flex items-center gap-1">
            <ColorField label={LABELS.accentSecondary} value={palette.accentSecondary} swatches={swatches} onChange={(hex) => setColor("accentSecondary", hex)} />
            <Button variant="ghost" size="icon" className="size-8" aria-label="Retirer la couleur de mise en avant" onClick={() => setColor("accentSecondary", undefined)}>
              <X className="size-4" />
            </Button>
          </div>
        ) : (
          <Button variant="outline" size="sm" className="w-fit gap-1.5" onClick={() => setColor("accentSecondary", palette.accent)}>
            <Plus className="size-4" />
            Choisir une couleur
          </Button>
        )}
      </FieldGroup>

      <FieldGroup title="Teintes en plus" text={`Elles varient les segments d’une vidéo, après l’accent et la mise en avant (${KIT_LIMITS.extras} au plus).`}>
        <ul className="flex flex-wrap items-center gap-2">
          <AnimatePresence initial={false}>
            {palette.extras.map((color, index) => (
              <motion.li
                key={index}
                layout
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="group relative"
              >
                <ColorField
                  compact
                  label={`Teinte ${index + 1}`}
                  value={color}
                  swatches={swatches}
                  onChange={(hex) => setExtras(palette.extras.map((entry, position) => (position === index ? hex : entry)))}
                />
                <button
                  type="button"
                  aria-label={`Retirer la teinte ${index + 1}`}
                  onClick={() => setExtras(palette.extras.filter((_, position) => position !== index))}
                  className="absolute -top-1.5 -right-1.5 rounded-full border bg-background p-0.5 opacity-100 shadow-sm transition-opacity md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
                >
                  <X className="size-3" />
                </button>
              </motion.li>
            ))}
          </AnimatePresence>
          {palette.extras.length < KIT_LIMITS.extras && (
            <li>
              <Button variant="outline" size="icon" className="size-8" aria-label="Ajouter une teinte" onClick={() => setExtras([...palette.extras, palette.accent])}>
                <Plus className="size-4" />
              </Button>
            </li>
          )}
        </ul>
      </FieldGroup>
    </div>
  );
}
