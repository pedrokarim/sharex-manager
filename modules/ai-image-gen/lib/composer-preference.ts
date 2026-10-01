/**
 * Réglages du compositeur retenus par le compte.
 *
 * Le prompt, les images jointes et la graine changent à chaque génération :
 * ils ne sont pas retenus. Le reste (moteur, format, qualité, nombre
 * d'images, notes de style, consignes négatives) est ce qu'on règle une fois
 * et qu'on ne veut pas refaire à chaque visite.
 */

export const COMPOSER_PREFERENCE_SCOPE = "ai-image-gen.composer";

export interface ComposerPreference {
  model?: string;
  size?: string;
  quality?: string;
  count?: number;
  notes?: string;
  negativePrompt?: string;
  [key: string]: unknown;
}

export const COMPOSER_PREFERENCE_KEYS = ["model", "size", "quality", "count", "notes", "negativePrompt"] as const;

type Key = (typeof COMPOSER_PREFERENCE_KEYS)[number];

/** Ne garde que les champs retenus, ramenés à des valeurs plausibles. */
export function pickComposerPreference(source: Record<string, unknown>): ComposerPreference {
  const text = (value: unknown, max: number) => (typeof value === "string" && value.length <= max ? value : undefined);
  const count = Math.round(Number(source.count));
  const picked: ComposerPreference = {
    model: text(source.model, 200) || undefined,
    size: text(source.size, 40) || undefined,
    quality: text(source.quality, 40) || undefined,
    count: Number.isFinite(count) && count >= 1 && count <= 8 ? count : undefined,
    notes: text(source.notes, 4000),
    negativePrompt: text(source.negativePrompt, 4000),
  };
  for (const key of COMPOSER_PREFERENCE_KEYS) if (picked[key] === undefined) delete picked[key];
  return picked;
}

/** Vrai si le changement touche au moins un champ retenu. */
export function touchesComposerPreference(patch: Record<string, unknown>): boolean {
  return COMPOSER_PREFERENCE_KEYS.some((key: Key) => key in patch);
}
