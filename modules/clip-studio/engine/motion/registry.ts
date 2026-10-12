/**
 * Registre des préréglages d'animation.
 *
 * Un identifiant est unique par phase : une animation peut avoir une
 * variante d'entrée et une de sortie sous le même nom (c'est le cas des neuf
 * animations d'origine). Quand une seule existe, l'autre phase la rejoue à
 * rebours.
 *
 * Un identifiant inconnu (projet ouvert par une version plus ancienne,
 * préréglage retiré) n'est pas une erreur : il vaut « aucune animation ».
 */

import { LEGACY_PRESETS } from "./presets/legacy";
import { TEXT_PRESETS } from "./presets/text";
import { ELEMENT_PRESETS } from "./presets/elements";
import { TEXT_LIBRARY_PRESETS } from "./presets/text-library";
import { EFFECT_PRESETS } from "./presets/effects";
import { ATTENTION_PRESETS } from "./presets/attention";
import type { MotionCategory, MotionPhase, MotionPreset, MotionTarget } from "./types";

const presets = new Map<string, MotionPreset>();
const mirrored = new Map<string, MotionPreset>();

const keyOf = (phase: MotionPhase, id: string) => `${phase}:${id}`;

/**
 * Ajoute des préréglages. Un doublon (même identifiant, même phase) est une
 * erreur de programmation : on la signale tout de suite plutôt que d'en
 * écraser un en silence.
 */
export function registerPresets(list: readonly MotionPreset[]) {
  for (const preset of list) {
    const key = keyOf(preset.phase, preset.id);
    if (presets.has(key)) throw new Error(`Préréglage d'animation en double : ${key}`);
    presets.set(key, preset);
  }
}

registerPresets(LEGACY_PRESETS);
registerPresets(TEXT_PRESETS);
registerPresets(ELEMENT_PRESETS);
registerPresets(TEXT_LIBRARY_PRESETS);
registerPresets(EFFECT_PRESETS);
registerPresets(ATTENTION_PRESETS);

const OPPOSITE: Partial<Record<MotionPhase, MotionPhase>> = { in: "out", out: "in" };

/**
 * Préréglage d'un identifiant pour une phase. Sans phase : la variante
 * d'entrée, sinon la première trouvée. Une entrée demandée comme sortie (ou
 * l'inverse) sans variante déclarée est rendue jouée à rebours.
 */
export function getPreset(id: string, phase?: MotionPhase): MotionPreset | undefined {
  if (!id || id === "none") return undefined;
  if (!phase) {
    return presets.get(keyOf("in", id)) ?? [...presets.values()].find((preset) => preset.id === id);
  }
  const exact = presets.get(keyOf(phase, id));
  if (exact) return exact;
  const opposite = OPPOSITE[phase];
  if (!opposite) return undefined;
  const source = presets.get(keyOf(opposite, id));
  if (!source) return undefined;
  const key = keyOf(phase, id);
  let reversed = mirrored.get(key);
  if (!reversed) {
    reversed = { ...source, phase, reversed: !source.reversed };
    mirrored.set(key, reversed);
  }
  return reversed;
}

/** Vrai si l'identifiant désigne un préréglage, quelle que soit sa phase. */
export function isKnownPreset(id: string): boolean {
  return getPreset(id) !== undefined;
}

export interface PresetQuery {
  phase?: MotionPhase;
  /** Type de l'élément animé ; une vidéo se range avec les images. */
  target?: MotionTarget | "video";
  category?: MotionCategory;
}

/**
 * Préréglages déclarés, dans l'ordre d'enregistrement. Les variantes jouées
 * à rebours n'y figurent pas : le sélecteur montre ce qui a été pensé pour
 * chaque phase.
 */
export function listPresets(query: PresetQuery = {}): MotionPreset[] {
  const target = query.target === "video" ? "image" : query.target;
  return [...presets.values()].filter(
    (preset) =>
      (!query.phase || preset.phase === query.phase) &&
      (!query.category || preset.category === query.category) &&
      (!target || target === "any" || preset.target === "any" || preset.target === target)
  );
}
