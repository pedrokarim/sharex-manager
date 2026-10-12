/**
 * Bibliothèque des préréglages de texte (étape A3).
 *
 * Réécrite dans le modèle de Clip Studio à partir de faits relevés (durées,
 * courbes, amplitudes, décalages), avec nos noms et nos catégories ; les
 * quasi-doublons sont fusionnés et les réglages (intensité, direction)
 * remplacent les variantes d'amplitude.
 *
 * Identifiants : `-letters`, `-words`, `-lines` pour un texte découpé, et
 * `title-` pour un titre animé en bloc ; aucun ne reprend un identifiant
 * des neuf animations d'origine ni des premiers préréglages de texte.
 */

import type { MotionPreset } from "../../types";
import { EMPHASIS_PRESETS } from "./emphasis";
import { LETTER_PRESETS } from "./letters";
import { LIGHT_PRESETS } from "./lights";
import { LOOP_PRESETS } from "./loops";
import { MASK_PRESETS } from "./masks";
import { TITLE_PRESETS } from "./titles";
import { WORD_PRESETS } from "./words";

export const TEXT_LIBRARY_PRESETS: MotionPreset[] = [
  ...LETTER_PRESETS,
  ...WORD_PRESETS,
  ...MASK_PRESETS,
  ...LIGHT_PRESETS,
  ...TITLE_PRESETS,
  ...EMPHASIS_PRESETS,
  ...LOOP_PRESETS,
];
