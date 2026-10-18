/**
 * Galerie des animations intégrées (page « Animations » de Clip Studio) :
 * tout le catalogue du moteur, rangé en onglets, en sections par catégorie,
 * avec recherche, filtre de catégorie, favoris, fiche détaillée et chemin
 * pour retrouver chaque animation dans l'éditeur.
 *
 * Tout est pur : la page, ses tests et le sélecteur de l'éditeur lisent les
 * mêmes listes (`motion-catalog.ts`, `scene-catalog.ts`) et les mêmes
 * favoris (mêmes clés de stockage).
 */

import { parseAsStringLiteral } from "nuqs";
import { listPresets } from "../engine/motion/registry";
import { listCameraMoves } from "../engine/motion/scenes";
import { MOTION_CATEGORY_LABELS } from "../engine/motion/types";
import type { EaseMode, EaseSpec, MotionCategory, MotionPhase, MotionPreset, MotionSplit } from "../engine/motion/types";
import {
  CATEGORY_ORDER,
  FAVORITES_STORAGE_KEY,
  PICKER_PHASE_LABELS,
  fitsItemType,
  isSplitPreset,
  normalizeSearch,
  type PickerItemType,
  type PickerPhase,
} from "./motion-catalog";
import { sceneEntries, sceneFavoritesKey, secondsText, type SceneEntry, type SceneKind } from "./scene-catalog";

/** Guillemets français, avec leurs espaces insécables. */
const quote = (text: string) => `« ${text} »`;

// ─── Onglets ─────────────────────────────────────────────────────

export const GALLERY_TABS = [
  { id: "elements", label: "Éléments" },
  { id: "text", label: "Texte" },
  { id: "effects", label: "Effets" },
  { id: "highlights", label: "Mises en avant" },
  { id: "transitions", label: "Transitions" },
  { id: "camera", label: "Caméra" },
  { id: "shotfx", label: "Effets de plan" },
] as const;

export type GalleryTab = (typeof GALLERY_TABS)[number]["id"];

export const GALLERY_TAB_IDS = GALLERY_TABS.map((tab) => tab.id) as readonly GalleryTab[];

export const DEFAULT_GALLERY_TAB: GalleryTab = "elements";

/** Onglet lu dans l'adresse (`?tab=`) : une valeur inconnue ou absente donne le premier onglet. */
export function parseGalleryTab(value: string | null | undefined): GalleryTab {
  return GALLERY_TAB_IDS.includes(value as GalleryTab) ? (value as GalleryTab) : DEFAULT_GALLERY_TAB;
}

/**
 * Lecteur de `?tab=` pour `useQueryState` : l'onglet par défaut n'écrit rien
 * dans l'adresse, un autre s'y inscrit sans ajouter d'entrée d'historique.
 */
export const galleryTabParser = parseAsStringLiteral(GALLERY_TAB_IDS)
  .withDefault(DEFAULT_GALLERY_TAB)
  .withOptions({ history: "replace", scroll: false, clearOnDefault: true });

/** Famille de plans d'un onglet, ou `null` pour un onglet d'animations d'élément. */
export function sceneKindOf(tab: GalleryTab): SceneKind | null {
  if (tab === "transitions") return "transition";
  if (tab === "camera") return "camera";
  if (tab === "shotfx") return "shotfx";
  return null;
}

/** Clé des favoris d'un onglet : celles du sélecteur de l'éditeur, pour que les deux partagent les mêmes étoiles. */
export function galleryFavoritesKey(tab: GalleryTab): string {
  const kind = sceneKindOf(tab);
  return kind ? sceneFavoritesKey(kind) : FAVORITES_STORAGE_KEY;
}

// ─── Entrées ─────────────────────────────────────────────────────

interface GalleryEntryBase {
  /** Unique dans la galerie : un même identifiant peut avoir une entrée et une sortie. */
  key: string;
  id: string;
  label: string;
  /** Section de l'onglet : la catégorie, ou « grid » pour les grilles. */
  section: string;
  sectionLabel: string;
  durationMs: number;
}

export interface MotionGalleryEntry extends GalleryEntryBase {
  source: "motion";
  preset: MotionPreset;
  /** Phase du sélecteur où l'on choisit cette animation. */
  pickerPhase: PickerPhase;
  /** Témoin de la vignette : un mot pour le texte, une forme pour le reste. */
  itemType: PickerItemType;
  /** Texte du témoin quand le mot habituel ne montrerait rien (compteurs). */
  sampleText?: string;
}

export interface SceneGalleryEntry extends GalleryEntryBase {
  source: "scene";
  kind: SceneKind;
  entry: SceneEntry;
}

export type GalleryEntry = MotionGalleryEntry | SceneGalleryEntry;

/** Section des grilles, rangées avec les mises en avant. */
export const GRID_SECTION = { key: "grid", label: "Grilles" } as const;

/** Catégories rangées sous « Effets » quand elles entrent ou sortent : décodage, compteur, frappe, glitch, lueur, masques. */
const EFFECT_CATEGORIES: ReadonlySet<MotionCategory> = new Set(["typing", "counter", "glitch", "blur-light", "mask"]);

/** Onglet d'un préréglage d'animation d'élément. */
export function galleryTabOfPreset(preset: MotionPreset): Exclude<GalleryTab, "transitions" | "camera" | "shotfx"> {
  if (preset.phase === "emphasis" || preset.phase === "loop" || preset.grid) return "highlights";
  if (EFFECT_CATEGORIES.has(preset.category)) return "effects";
  if (preset.target === "text" || isSplitPreset(preset)) return "text";
  return "elements";
}

/** Phase du sélecteur où se choisit un préréglage : une boucle se choisit avec les mises en avant. */
export function pickerPhaseOf(preset: MotionPreset): PickerPhase {
  return preset.phase === "emphasis" || preset.phase === "loop" ? "emphasis" : preset.phase;
}

/** Témoin d'une vignette : un mot pour un préréglage de texte, une forme sinon (comme le sélecteur). */
export function previewItemType(preset: MotionPreset): PickerItemType {
  if (preset.target === "text" || isSplitPreset(preset)) return "text";
  if (preset.target === "image") return "image";
  return "shape";
}

/** Nombre témoin d'un compteur : « 1 250 » s'écrit au format français, avec une espace fine insécable. */
export const COUNTER_SAMPLE = "1 250";

function motionEntry(preset: MotionPreset): MotionGalleryEntry {
  const grid = Boolean(preset.grid);
  return {
    source: "motion",
    key: `${preset.phase}:${preset.id}`,
    id: preset.id,
    label: preset.label,
    section: grid ? GRID_SECTION.key : preset.category,
    sectionLabel: grid ? GRID_SECTION.label : (MOTION_CATEGORY_LABELS[preset.category] ?? preset.category),
    durationMs: preset.durationMs,
    preset,
    pickerPhase: pickerPhaseOf(preset),
    itemType: previewItemType(preset),
    ...(preset.category === "counter" ? { sampleText: COUNTER_SAMPLE } : {}),
  };
}

function sceneGalleryEntry(kind: SceneKind, entry: SceneEntry): SceneGalleryEntry {
  return {
    source: "scene",
    key: `${kind}:${entry.id}`,
    id: entry.id,
    label: entry.label,
    section: entry.category,
    sectionLabel: entry.categoryLabel,
    durationMs: entry.durationMs,
    kind,
    entry,
  };
}

const PHASE_ORDER: Record<MotionPhase, number> = { in: 0, out: 1, emphasis: 2, loop: 3 };

let motionCache: Map<GalleryTab, MotionGalleryEntry[]> | null = null;

function motionEntriesByTab(): Map<GalleryTab, MotionGalleryEntry[]> {
  if (motionCache) return motionCache;
  const byTab = new Map<GalleryTab, MotionGalleryEntry[]>();
  // Une mise en avant et une boucle du même nom : le moteur joue la mise en avant, on n'en montre qu'une.
  const highlightIds = new Set<string>();
  const presets = [...listPresets()].sort((a, b) => PHASE_ORDER[a.phase] - PHASE_ORDER[b.phase]);
  for (const preset of presets) {
    const tab = galleryTabOfPreset(preset);
    if (tab === "highlights" && pickerPhaseOf(preset) === "emphasis") {
      if (highlightIds.has(preset.id)) continue;
      highlightIds.add(preset.id);
    }
    const list = byTab.get(tab) ?? [];
    list.push(motionEntry(preset));
    byTab.set(tab, list);
  }
  motionCache = byTab;
  return byTab;
}

/** Entrées d'un onglet, dans l'ordre du catalogue (entrées, puis sorties, puis mises en avant). */
export function galleryEntries(tab: GalleryTab): GalleryEntry[] {
  const kind = sceneKindOf(tab);
  if (kind) return sceneEntries(kind).map((entry) => sceneGalleryEntry(kind, entry));
  return motionEntriesByTab().get(tab) ?? [];
}

/** Nombre d'animations par onglet. */
export function galleryCounts(): Record<GalleryTab, number> {
  return Object.fromEntries(GALLERY_TAB_IDS.map((tab) => [tab, galleryEntries(tab).length])) as Record<GalleryTab, number>;
}

/** Nombre total d'animations de la galerie. */
export function galleryTotal(): number {
  return GALLERY_TAB_IDS.reduce((sum, tab) => sum + galleryEntries(tab).length, 0);
}

// ─── Sections ────────────────────────────────────────────────────

export interface GallerySection {
  key: string;
  label: string;
  entries: GalleryEntry[];
}

/** Ordre des sections d'un onglet d'animations : celui des catégories ; mises en avant et boucles d'abord, grilles à la fin. */
function sectionRank(tab: GalleryTab, section: string): number {
  if (section === GRID_SECTION.key) return 1000;
  if (tab === "highlights") {
    if (section === "attention") return -2;
    if (section === "loop") return -1;
  }
  const index = CATEGORY_ORDER.indexOf(section as MotionCategory);
  return index === -1 ? 999 : index;
}

/**
 * Range des entrées en sections. Les sections vides sont omises ; une
 * section se trie par catégorie pour les animations d'élément, et garde
 * l'ordre du catalogue pour les transitions, la caméra et les effets.
 */
export function groupGallery(entries: readonly GalleryEntry[], tab: GalleryTab): GallerySection[] {
  const sections: GallerySection[] = [];
  const byKey = new Map<string, GallerySection>();
  for (const entry of entries) {
    let section = byKey.get(entry.section);
    if (!section) {
      section = { key: entry.section, label: entry.sectionLabel, entries: [] };
      byKey.set(entry.section, section);
      sections.push(section);
    }
    section.entries.push(entry);
  }
  if (sceneKindOf(tab)) return sections;
  return sections
    .map((section, index) => ({ section, index }))
    .sort((a, b) => sectionRank(tab, a.section.key) - sectionRank(tab, b.section.key) || a.index - b.index)
    .map((item) => item.section);
}

/** Sections disponibles d'un onglet, avec leur nombre d'animations (pour le filtre de catégorie). */
export function gallerySectionsOf(tab: GalleryTab): { key: string; label: string; count: number }[] {
  return groupGallery(galleryEntries(tab), tab).map((section) => ({ key: section.key, label: section.label, count: section.entries.length }));
}

// ─── Recherche et filtres ────────────────────────────────────────

const SPLIT_SEARCH: Record<MotionSplit, string> = {
  whole: "bloc",
  line: "ligne par ligne",
  word: "mot par mot",
  char: "lettre par lettre",
};

/** Ce que lit la recherche : nom, section, catégorie, phase, découpage et identifiant. */
function haystackOf(entry: GalleryEntry): string {
  const parts = [entry.label, entry.sectionLabel, entry.id.replace(/-/g, " ")];
  if (entry.source === "motion") {
    const { preset } = entry;
    parts.push(MOTION_CATEGORY_LABELS[preset.category] ?? "", PHASE_LABELS[preset.phase]);
    if (preset.split) parts.push(SPLIT_SEARCH[preset.split]);
    if (isSplitPreset(preset) || preset.target === "text") parts.push("texte");
  }
  return normalizeSearch(parts.join(" "));
}

/**
 * Filtre et classe par pertinence, comme le sélecteur de l'éditeur : chaque
 * mot de la recherche, sans accents ni majuscules, doit se trouver quelque
 * part ; le nom qui commence par la recherche passe devant, puis le nom qui
 * la contient, puis le reste. À pertinence égale, l'ordre d'origine reste.
 */
export function searchGallery<T extends GalleryEntry>(entries: readonly T[], query: string): T[] {
  const needle = normalizeSearch(query);
  if (!needle) return [...entries];
  const words = needle.split(" ");
  const scored: { entry: T; score: number; index: number }[] = [];
  entries.forEach((entry, index) => {
    if (!words.every((word) => haystackOf(entry).includes(word))) return;
    const label = normalizeSearch(entry.label);
    const score = label.startsWith(needle) ? 0 : label.includes(needle) ? 1 : words.every((word) => label.includes(word)) ? 2 : 3;
    scored.push({ entry, score, index });
  });
  return scored.sort((a, b) => a.score - b.score || a.index - b.index).map((item) => item.entry);
}

export interface GalleryFilter {
  query?: string;
  /** Section gardée ; absente ou « all » : toutes. */
  section?: string;
  favoritesOnly?: boolean;
  favorites?: readonly string[];
}

/**
 * Entrées montrées : section, puis favoris (par identifiant, comme dans le
 * sélecteur), puis recherche. Sans recherche, l'ordre du catalogue reste.
 */
export function filterGallery<T extends GalleryEntry>(entries: readonly T[], filter: GalleryFilter): T[] {
  let result = [...entries];
  if (filter.section && filter.section !== "all") result = result.filter((entry) => entry.section === filter.section);
  if (filter.favoritesOnly) {
    const favorites = new Set(filter.favorites ?? []);
    result = result.filter((entry) => favorites.has(entry.id));
  }
  return filter.query?.trim() ? searchGallery(result, filter.query) : result;
}

// ─── Textes des cartes et de la fiche ────────────────────────────

export const PHASE_LABELS: Record<MotionPhase, string> = {
  in: "Entrée",
  out: "Sortie",
  emphasis: "Mise en avant",
  loop: "Boucle",
};

const SPLIT_UNIT: Record<Exclude<MotionSplit, "whole">, string> = {
  char: "par lettre",
  word: "par mot",
  line: "par ligne",
};

/** Découpage d'un texte, pour la fiche. */
export const SPLIT_LABELS: Record<MotionSplit, string> = {
  whole: "Le bloc entier",
  line: "Ligne par ligne",
  word: "Mot par mot",
  char: "Lettre par lettre",
};

/** Durée d'un mouvement de caméra : tout le plan, au début du plan, ou en boucle. */
function cameraTiming(entry: SceneEntry): string {
  if (entry.durationMs <= 0) return "Tout le plan";
  const preset = listCameraMoves().find((item) => item.id === entry.id);
  const suffix = preset?.timing === "loop" ? " en boucle" : preset?.timing === "start" ? " au début du plan" : "";
  return `${secondsText(entry.durationMs)}${suffix}`;
}

/** Durée affichée d'une entrée : par unité pour un texte découpé (« 0,5 s par lettre »). */
export function durationText(entry: GalleryEntry): string {
  if (entry.source === "scene") return entry.kind === "camera" ? cameraTiming(entry.entry) : secondsText(entry.durationMs);
  const { preset } = entry;
  const unit = preset.split && preset.split !== "whole" ? ` ${SPLIT_UNIT[preset.split]}` : "";
  return `${secondsText(preset.durationMs)}${unit}`;
}

/** Ligne courte d'une carte : la phase et la durée. */
export function cardDetail(entry: GalleryEntry): string {
  if (entry.source === "scene") {
    if (entry.kind === "camera") return durationText(entry);
    return `${entry.kind === "transition" ? "Transition" : "Effet"} · ${durationText(entry)}`;
  }
  const phase = entry.preset.grid ? `${PHASE_LABELS[entry.preset.phase]} en grille` : PHASE_LABELS[entry.preset.phase];
  return `${phase} · ${durationText(entry)}`;
}

/** Phases déclarées d'un identifiant, dans l'ordre entrée, sortie, mise en avant, boucle. */
export function registeredPhases(id: string): MotionPhase[] {
  return listPresets()
    .filter((preset) => preset.id === id)
    .map((preset) => preset.phase)
    .sort((a, b) => PHASE_ORDER[a] - PHASE_ORDER[b]);
}

/**
 * Phases d'une animation, en clair. Une entrée sans sortie déclarée se joue
 * à rebours en sortie (et l'inverse) : le registre le fait, la fiche le dit.
 */
export function phasesText(preset: MotionPreset): string {
  const phases = registeredPhases(preset.id);
  const labels = phases.map((phase) => PHASE_LABELS[phase].toLowerCase());
  const listed = labels.length > 1 ? `${labels.slice(0, -1).join(", ")} et ${labels.at(-1)}` : (labels[0] ?? "");
  const text = listed.charAt(0).toUpperCase() + listed.slice(1);
  const hasIn = phases.includes("in");
  const hasOut = phases.includes("out");
  if (hasIn && !hasOut) return `${text} ; en sortie, elle se joue à rebours`;
  if (hasOut && !hasIn) return `${text} ; en entrée, elle se joue à rebours`;
  return text;
}

const ITEM_TYPES: readonly PickerItemType[] = ["text", "image", "video", "shape"];

const ITEM_TYPE_LABELS: Record<PickerItemType, string> = {
  text: "texte",
  image: "image",
  video: "vidéo",
  shape: "forme",
};

/** Types d'éléments qui acceptent l'animation, dans l'ordre texte, image, vidéo, forme. */
export function appliesTo(preset: MotionPreset): PickerItemType[] {
  return ITEM_TYPES.filter((type) => fitsItemType(preset, type));
}

/** « Texte, image, vidéo et forme ». */
export function itemTypesText(types: readonly PickerItemType[]): string {
  const labels = types.map((type) => ITEM_TYPE_LABELS[type]);
  const listed = labels.length > 1 ? `${labels.slice(0, -1).join(", ")} et ${labels.at(-1)}` : (labels[0] ?? "");
  return listed.charAt(0).toUpperCase() + listed.slice(1);
}

const EASE_FAMILIES: Record<string, string> = {
  Sine: "sinusoïdale",
  Quad: "quadratique",
  Cubic: "cubique",
  Quart: "quartique",
  Quint: "quintique",
  Expo: "exponentielle",
  Circ: "circulaire",
  Back: "avec recul",
  Elastic: "élastique",
  Bounce: "en rebond",
};

const EASE_MODES: Record<EaseMode, string> = {
  in: "qui accélère",
  out: "qui ralentit",
  inOut: "qui accélère puis ralentit",
};

const decimal = (value: number) => value.toLocaleString("fr-FR", { maximumFractionDigits: 2 });

/** Courbe d'un préréglage, en clair : « Cubique qui ralentit », « Ressort », « Bézier (0,2 ; 0,8 ; 0,2 ; 1) »… */
export function easeText(spec: EaseSpec | undefined, preset?: MotionPreset): string {
  if (!spec) {
    // Sans courbe générale, chaque image clé peut porter la sienne.
    const perKey = preset && Object.values(preset.tracks).some((track) => track?.some((keyframe) => keyframe.ease));
    return perKey ? "Propre à chaque image clé" : "Linéaire";
  }
  if (typeof spec === "string") {
    if (spec === "linear") return "Linéaire";
    const match = /^(in|out|inOut)([A-Z][a-z]+)$/.exec(spec);
    if (!match) return spec;
    const family = EASE_FAMILIES[match[2]] ?? match[2].toLowerCase();
    const text = `${family} ${EASE_MODES[match[1] as EaseMode]}`;
    return text.charAt(0).toUpperCase() + text.slice(1);
  }
  if ("bezier" in spec) return `Bézier (${spec.bezier.map(decimal).join(" ; ")})`;
  if ("spring" in spec) return "Ressort";
  if ("steps" in spec) return `${spec.steps} marches`;
  if ("power" in spec) return `Puissance ${decimal(spec.power)} ${EASE_MODES[spec.mode]}`;
  if ("back" in spec) return `Avec recul (${decimal(spec.back)}) ${EASE_MODES[spec.mode]}`;
  if ("elastic" in spec) return `Élastique ${EASE_MODES[spec.mode]}`;
  return "Personnalisée";
}

// ─── Où la trouver dans l'éditeur ────────────────────────────────

const MENU_LABELS: Record<PickerPhase, string> = {
  in: "Animation d’entrée",
  out: "Animation de sortie",
  emphasis: "Mise en avant",
};

/** Ce que l'on sélectionne pour une animation d'élément : « un texte », « une image, une vidéo ou une forme »… */
function selectionText(types: readonly PickerItemType[]): string {
  const articles: Record<PickerItemType, string> = { text: "un texte", image: "une image", video: "une vidéo", shape: "une forme" };
  const labels = types.map((type) => articles[type]);
  return labels.length > 1 ? `${labels.slice(0, -1).join(", ")} ou ${labels.at(-1)}` : (labels[0] ?? "un élément");
}

export interface EditorPath {
  /** Chemin principal, étape par étape. */
  steps: string[];
  /** Autre chemin, plus court (clic droit de la timeline). */
  shortcut: string;
}

/** Chemin exact pour poser cette animation dans l'éditeur. */
export function editorPath(entry: GalleryEntry): EditorPath {
  const open = "Ouvrir un projet dans l’éditeur.";
  if (entry.source === "motion") {
    const { preset, pickerPhase } = entry;
    const category = quote(MOTION_CATEGORY_LABELS[preset.category] ?? preset.category);
    return {
      steps: [
        open,
        `Sélectionner ${selectionText(appliesTo(preset))} sur la timeline.`,
        `Dans l’inspecteur, section ${quote("Animations")}, onglet ${quote(PICKER_PHASE_LABELS[pickerPhase])}.`,
        `Cliquer sur le champ de l’animation pour ouvrir le catalogue, puis la catégorie ${category}.`,
      ],
      shortcut: `Clic droit sur l’élément dans la timeline, ${quote(MENU_LABELS[pickerPhase])}, puis ${category}.`,
    };
  }
  const category = quote(entry.sectionLabel);
  if (entry.kind === "transition") {
    return {
      steps: [
        open,
        "Sélectionner le plan d’arrivée sur la timeline (texte, image, vidéo ou forme).",
        `Dans l’inspecteur, section ${quote("Transition")}, champ ${quote("Depuis le plan précédent")}.`,
        `Ouvrir le catalogue, puis la catégorie ${category}.`,
      ],
      shortcut: `Clic droit sur le plan dans la timeline, ${quote("Transition d’entrée")}, puis ${category}.`,
    };
  }
  if (entry.kind === "camera") {
    return {
      steps: [
        open,
        "Sélectionner une image ou une vidéo sur la timeline.",
        `Dans l’inspecteur, section ${quote("Image")} ou ${quote("Vidéo")}, champ ${quote("Mouvement de caméra")}.`,
        `Ouvrir le catalogue, puis la catégorie ${category}.`,
      ],
      shortcut: `Clic droit sur l’image ou la vidéo dans la timeline, ${quote("Mouvement de caméra")}, puis ${category}.`,
    };
  }
  return {
    steps: [
      open,
      "Clic droit sur une piste visuelle de la timeline, à l’instant voulu.",
      `Choisir ${quote("Ajouter un effet de plan ici")}, puis la catégorie ${category}.`,
    ],
    shortcut: `Clic droit sur un plan dans la timeline, ${quote("Effet de plan ici")}, puis ${category}.`,
  };
}
