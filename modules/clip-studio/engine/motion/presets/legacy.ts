/**
 * Les neuf animations d'origine, réécrites en préréglages sous leur
 * identifiant de toujours : les projets enregistrés les retrouvent telles
 * quelles, au pixel près (voir le test de rétrocompatibilité).
 *
 * L'ancien moteur adoucissait l'entrée par `outCubic` et la sortie par
 * `inCubic` lue à rebours ; en temps qui avance, cette sortie-là est un
 * `outCubic` qui va du repos vers la disparition. D'où une variante de
 * sortie déclarée pour chacune, au lieu de rejouer l'entrée à l'envers (ce
 * qui donnerait une autre accélération).
 *
 * Les longueurs sont en part du cadre (`dx`, `dy`), comme avant.
 */

import type { Keyframe, MotionCategory, MotionPreset, MotionTarget, MotionTracks } from "../types";

/** Ancienne durée par défaut : une dizaine d'images à 30 images par seconde. */
const LEGACY_DURATION_MS = 330;

/**
 * Piste qui démarre vite et ralentit : vers le repos à l'entrée, vers la
 * disparition à la sortie.
 */
const decelerate = (from: number, to: number): Keyframe[] => [
  { at: 0, value: from },
  { at: 1, value: to, ease: "outCubic" },
];

const linear = (from: number, to: number): Keyframe[] => [
  { at: 0, value: from },
  { at: 1, value: to, ease: "linear" },
];

interface LegacyDefinition {
  id: string;
  label: string;
  category: MotionCategory;
  target?: MotionTarget;
  in: MotionTracks;
  out: MotionTracks;
}

const slide = (property: "dx" | "dy", offset: number): Pick<LegacyDefinition, "in" | "out"> => ({
  in: { opacity: decelerate(0, 1), [property]: decelerate(offset, 0) },
  out: { opacity: decelerate(1, 0), [property]: decelerate(0, offset) },
});

const DEFINITIONS: LegacyDefinition[] = [
  {
    id: "fade",
    label: "Fondu",
    category: "fade",
    in: { opacity: decelerate(0, 1) },
    out: { opacity: decelerate(1, 0) },
  },
  { id: "slide-up", label: "Glisser vers le haut", category: "slide", ...slide("dy", 0.08) },
  { id: "slide-down", label: "Glisser vers le bas", category: "slide", ...slide("dy", -0.08) },
  { id: "slide-left", label: "Glisser vers la gauche", category: "slide", ...slide("dx", 0.12) },
  { id: "slide-right", label: "Glisser vers la droite", category: "slide", ...slide("dx", -0.12) },
  {
    id: "pop",
    label: "Apparition",
    category: "scale",
    in: {
      // L'opacité atteint 1 à mi-parcours, l'échelle dépasse un peu avant de se poser.
      opacity: [
        { at: 0, value: 0 },
        { at: 0.5, value: 1, ease: "linear" },
      ],
      scale: [
        { at: 0, value: 0.4 },
        { at: 1, value: 1, ease: "outBack" },
      ],
    },
    out: {
      opacity: [
        { at: 0, value: 1 },
        { at: 0.5, value: 1 },
        { at: 1, value: 0, ease: "linear" },
      ],
      scale: decelerate(1, 0.6),
    },
  },
  {
    id: "zoom",
    label: "Zoom",
    category: "scale",
    in: { opacity: decelerate(0, 1), scale: decelerate(1.25, 1) },
    out: { opacity: decelerate(1, 0), scale: decelerate(1, 1.25) },
  },
  {
    id: "typewriter",
    label: "Machine à écrire",
    category: "typing",
    target: "text",
    in: { reveal: linear(0, 1) },
    out: { reveal: linear(1, 0) },
  },
  {
    id: "wipe",
    label: "Balayage",
    category: "mask",
    in: { wipe: linear(0, 1) },
    out: { wipe: linear(1, 0) },
  },
];

export const LEGACY_PRESETS: MotionPreset[] = DEFINITIONS.flatMap((definition) =>
  (["in", "out"] as const).map(
    (phase): MotionPreset => ({
      id: definition.id,
      label: definition.label,
      category: definition.category,
      phase,
      target: definition.target ?? "any",
      durationMs: LEGACY_DURATION_MS,
      units: "frame",
      tracks: definition[phase],
    })
  )
);

/** Identifiants des animations d'origine, dans l'ordre du sélecteur. */
export const LEGACY_PRESET_IDS = DEFINITIONS.map((definition) => definition.id);
