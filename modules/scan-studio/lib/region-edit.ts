/**
 * Opérations sur les zones d'une page : création, copie, ordre, style.
 *
 * Fonctions pures : elles rendent une nouvelle liste ou une nouvelle zone, sans
 * rien modifier, ce qui laisse l'historique d'annulation comparer par identité.
 */

import { translatePoints } from "./geometry";
import { DEFAULT_MASK, boundsOf, type AiTrace, type Point, type RegionKind, type ScanRegion, type TextStyle } from "./types";

/** Zone tracée à la main : contour dessiné, masque par défaut, boîte de texte sur le contour. */
export function createRegion(id: string, outline: Point[], maskColor: string, kind: RegionKind = "dialogue"): ScanRegion {
  return {
    id,
    kind,
    outline,
    direction: "horizontal",
    reading: { raw: "", clean: "", confidence: 1, engine: "manual", edited: true },
    translation: { text: "", status: "todo", history: [] },
    mask: { ...DEFAULT_MASK, color: maskColor, strokes: [] },
    text: { box: { ...boundsOf(outline), rotation: 0 }, style: null, autoFit: true },
  };
}

/**
 * Onomatopée posée à la main : le texte se place sur le dessin, il ne remplace
 * pas une bulle. Rien n'est donc masqué au départ ; le masque se règle ensuite,
 * en aplat ou en reconstruction du fond, s'il y a un bruit d'origine à effacer.
 */
export function createSfxRegion(id: string, outline: Point[], maskColor: string): ScanRegion {
  const region = createRegion(id, outline, maskColor, "sfx");
  return { ...region, mask: { ...region.mask, kind: "none" } };
}

/**
 * Change la couleur du masque. Les retouches au pinceau peintes dans
 * l'ancienne couleur la suivent : sinon elles resteraient en tache sur le
 * nouvel aplat. Un trait d'une autre couleur garde la sienne.
 */
export function setMaskColor(region: ScanRegion, color: string): ScanRegion {
  const previous = region.mask.color;
  const next = color.toLowerCase();
  if (previous.toLowerCase() === next) return region;
  return {
    ...region,
    mask: {
      ...region.mask,
      color: next,
      strokes: region.mask.strokes.map((stroke) => (stroke.color.toLowerCase() === previous.toLowerCase() ? { ...stroke, color: next } : stroke)),
    },
  };
}

/** Ajoute la trace d'un appel à une IA à une zone : on garde les vingt dernières. */
export function addAiTrace(region: ScanRegion, trace: AiTrace): ScanRegion {
  return { ...region, ai: [...(region.ai ?? []), trace].slice(-20) };
}

/** Nom gardé comme « moteur » d'un texte venu d'une IA : on sait toujours d'où il vient. */
export function aiEngineLabel(trace: Pick<AiTrace, "provider" | "model">): string {
  return `ia:${trace.provider}/${trace.model}`.slice(0, 100);
}

/**
 * Lecture proposée par une IA et acceptée. Elle vaut une lecture relue : une
 * relance de l'analyse ne l'écrasera pas.
 */
export function acceptAiReading(region: ScanRegion, text: string, trace: AiTrace): ScanRegion {
  return { ...region, reading: { raw: text, clean: text, confidence: 1, engine: aiEngineLabel(trace), edited: true } };
}

/**
 * Traduction proposée par une IA et acceptée. C'est un geste explicite : elle
 * remplace le texte en place, qui part dans l'historique, et reste une
 * proposition à relire.
 */
export function acceptAiTranslation(region: ScanRegion, text: string, trace: AiTrace, now: number): ScanRegion {
  const previous = region.translation;
  const history =
    previous.text && previous.text !== text ? [...previous.history, { text: previous.text, engine: previous.engine ?? "manual", at: now }] : previous.history;
  return { ...region, translation: { text, status: "proposed", engine: aiEngineLabel(trace), history } };
}

export function findRegion(regions: ScanRegion[], id: string | null): ScanRegion | null {
  return id ? regions.find((region) => region.id === id) ?? null : null;
}

/** Remplace une zone par le résultat de `update` ; la liste est rendue telle quelle si rien ne change. */
export function updateRegion(regions: ScanRegion[], id: string, update: (region: ScanRegion) => ScanRegion): ScanRegion[] {
  let changed = false;
  const next = regions.map((region) => {
    if (region.id !== id) return region;
    const updated = update(region);
    if (updated !== region) changed = true;
    return updated;
  });
  return changed ? next : regions;
}

export function removeRegion(regions: ScanRegion[], id: string): ScanRegion[] {
  return regions.some((region) => region.id === id) ? regions.filter((region) => region.id !== id) : regions;
}

/** Copie d'une zone, décalée de `offset` pixels et rangée juste après l'originale. */
export function duplicateRegion(regions: ScanRegion[], id: string, newRegionId: string, offset: number, page: { width: number; height: number }): ScanRegion[] {
  const index = regions.findIndex((region) => region.id === id);
  if (index < 0) return regions;
  const source = regions[index];
  const bounds = boundsOf(source.outline);
  // Le décalage s'inverse près du bord : la copie reste dans la page.
  const dx = bounds.x + bounds.width + offset <= page.width ? offset : -offset;
  const dy = bounds.y + bounds.height + offset <= page.height ? offset : -offset;
  const copy: ScanRegion = {
    ...structuredClone(source),
    id: newRegionId,
    outline: translatePoints(source.outline, dx, dy),
    mask: {
      ...source.mask,
      strokes: source.mask.strokes.map((stroke) => ({ ...stroke, points: translatePoints(stroke.points, dx, dy) })),
    },
    text: { ...source.text, style: source.text.style ? { ...source.text.style } : null, box: { ...source.text.box, x: source.text.box.x + dx, y: source.text.box.y + dy } },
  };
  return [...regions.slice(0, index + 1), copy, ...regions.slice(index + 1)];
}

/** Avance (`-1`) ou recule (`+1`) une zone d'un rang dans l'ordre de lecture. */
export function shiftRegion(regions: ScanRegion[], id: string, delta: -1 | 1): ScanRegion[] {
  const index = regions.findIndex((region) => region.id === id);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= regions.length) return regions;
  const next = [...regions];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/** Zone voisine dans l'ordre de lecture, en bouclant ; la première (ou la dernière) si rien n'est sélectionné. */
export function neighbourId(regions: ScanRegion[], id: string | null, delta: -1 | 1): string | null {
  if (regions.length === 0) return null;
  const index = regions.findIndex((region) => region.id === id);
  if (index < 0) return regions[delta === 1 ? 0 : regions.length - 1].id;
  return regions[(index + delta + regions.length) % regions.length].id;
}

/** Saisie de la traduction : elle devient une correction à la main. */
export function setTranslationText(region: ScanRegion, text: string): ScanRegion {
  return {
    ...region,
    translation: { ...region.translation, text, status: text.trim() ? "edited" : "todo", engine: "manual" },
  };
}

/**
 * Saisie du texte d'origine : une relance de lecture ne l'écrasera pas.
 *
 * Sur une zone lue par un moteur, la correction porte sur le texte nettoyé :
 * ce que le moteur a lu (`raw`) et son nom restent, pour qu'on sache toujours
 * d'où vient le texte (§ 3 et § 6.3 du dossier).
 */
export function setReadingText(region: ScanRegion, text: string): ScanRegion {
  const automatic = region.reading.engine !== "manual";
  return {
    ...region,
    reading: {
      raw: automatic ? region.reading.raw : text,
      clean: text,
      confidence: 1,
      engine: automatic ? region.reading.engine : "manual",
      edited: true,
    },
  };
}

/**
 * Surcharge le style de la zone. Une clé à `undefined` retire la surcharge de
 * ce réglage (le contour du texte, par exemple) ; sans surcharge restante, la
 * zone revient à `null`, c'est-à-dire au style de son type.
 */
export function patchStyle(region: ScanRegion, patch: Partial<TextStyle>): ScanRegion {
  const style: Partial<TextStyle> = { ...(region.text.style ?? {}), ...patch };
  for (const key of Object.keys(style) as (keyof TextStyle)[]) {
    if (style[key] === undefined) delete style[key];
  }
  return { ...region, text: { ...region.text, style: Object.keys(style).length > 0 ? style : null } };
}
