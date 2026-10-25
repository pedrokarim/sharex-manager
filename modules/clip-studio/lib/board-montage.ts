/**
 * Montage en tableaux, côté serveur : ce que partagent « Monter ma prise »
 * et les vidéos de l'assistant narrées par une voix off (dossier 01,
 * illustrations).
 *
 * - les derniers enchaînements de la marque, pour que Codex ne refasse ni la
 *   même ouverture ni la même suite ;
 * - la recherche du logo officiel de chaque outil nommé sur une planche ;
 * - pour l'assistant : le plan des tableaux écrit par Codex sur les mots de
 *   la voix enregistrée, puis le projet monté (`engine/narrated-board.ts`).
 */

import type { BrandTheme } from "../engine/brand";
import { buildNarratedProject, narrationWords } from "../engine/narrated-board";
import { beatPlanPrompt, FULL_ILLUSTRATION_MIN_MS, planSignature, readBeatPlan, type NarrationContext, type TakePlan } from "../engine/take-plan";
import { logoKey } from "../engine/take-scenes";
import { buildFromTemplate, type FreeData, type SlideshowData, type TemplateId } from "../engine/templates";
import type { AspectPreset, ClipProject, MediaSource, TimedWord } from "../engine/types";
import { projectDuration } from "../engine/timeline";
import { extractJson } from "./codex";
import { findSegmentIcon } from "./image-search";
import { listProjectFiles } from "./store";

/** Enchaînements gardés pour la consigne : les trois derniers montages en tableaux. */
const RECENT_MONTAGES = 3;

/**
 * Enchaînements des derniers montages en tableaux (prises et voix off, de la
 * même marque quand il y en a une), du plus récent au plus ancien.
 */
export function recentMontages(brandKitId: string | undefined, projects: ClipProject[] = listProjectFiles()): string[] {
  return projects
    .filter((project) => (project.origin === "take" || project.origin === "assistant") && typeof project.brief?.montage === "string" && (!brandKitId || project.brandKitId === brandKitId))
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, RECENT_MONTAGES)
    .map((project) => project.brief!.montage!);
}

/** Logo officiel d'un outil nommé (`null` : jamais un sosie). */
export type LogoFinder = (name: string, context: string, signal: AbortSignal) => Promise<MediaSource | null>;

/** Le logo officiel cherché comme une icône de segment, d'après le nom et la phrase qui l'entoure. */
export const findOfficialLogo: LogoFinder = async (name, context, signal) => {
  const found = await findSegmentIcon({ query: `${name} logo`, text: context, signal });
  if (!found) return null;
  const image = found.image;
  return { url: image.url, ref: image.ref, name: image.name, kind: "image", width: image.width, height: image.height, credit: image.credit, rights: image.rights };
};

/**
 * Un logo par outil nommé sur les planches ; un même nom n'est cherché
 * qu'une fois. Rend les logos trouvés (par `logoKey`) et, pour le bilan, ce
 * qui a été cherché.
 */
export async function findPlanLogos(
  plan: TakePlan,
  words: TimedWord[],
  find: LogoFinder,
  signal: AbortSignal,
  onSearch?: (name: string) => void
): Promise<{ logos: Map<string, MediaSource>; searched: { name: string; found: boolean }[] }> {
  const logos = new Map<string, MediaSource>();
  const known = new Map<string, MediaSource | null>();
  const searched: { name: string; found: boolean }[] = [];
  for (const [index, beat] of plan.beats.entries()) {
    for (const [itemIndex, item] of (beat.items ?? []).entries()) {
      if (item.kind !== "logo") continue;
      if (signal.aborted) throw new DOMException("Annulé", "AbortError");
      const key = item.text.toLowerCase();
      if (!known.has(key)) {
        onSearch?.(item.text);
        const around = item.word ?? beat.word;
        const context = words.slice(Math.max(0, around - 8), around + 12).map((word) => word.text).join(" ");
        const found = await find(item.text, context, signal).catch((error) => {
          if (signal.aborted) throw error;
          return null;
        });
        known.set(key, found);
        searched.push({ name: item.text, found: Boolean(found) });
      }
      const found = known.get(key);
      if (found) logos.set(logoKey(index, itemIndex), found);
    }
  }
  return { logos, searched };
}

/** Modèles de l'assistant qui se montent en tableaux : ceux qu'une voix off raconte d'un bout à l'autre. */
export const BOARD_TEMPLATES: readonly TemplateId[] = ["free", "slideshow"];

/** Une voix trop courte (ou sans mots horodatés) ne donne pas de tableaux : le montage d'avant reste. */
const MIN_NARRATION_WORDS = 8;

export interface NarratedMontageInput {
  template: TemplateId;
  title: string;
  aspect: AspectPreset;
  data: FreeData | SlideshowData;
  theme: BrandTheme | null;
  brandKitId?: string;
  language?: string;
  /** Texte de chaque segment et notes visuelles du script (`line` : index du segment). */
  segmentTexts: string[];
  visualNotes: { line: number; kind: "board" | "show"; text: string }[];
  /** Ce que montre l'illustration de chaque segment (nom de l'image trouvée), à défaut de note. */
  illustrations: (string | undefined)[];
}

export interface NarratedMontageDeps {
  ask: (prompt: string, signal: AbortSignal) => Promise<string>;
  logo: LogoFinder;
  projects?: () => ClipProject[];
}

export interface NarratedMontage {
  project: ClipProject;
  plan: TakePlan;
  /** Enchaînement du montage, gardé dans `brief.montage`. */
  montage: string;
  logos: { name: string; found: boolean }[];
}

/**
 * Voix off montée en tableaux : `null` quand le modèle ne s'y prête pas
 * (quiz, classement) ou que la voix n'a pas de mots horodatés. Une réponse
 * de Codex illisible lève une erreur : l'appelant garde alors le montage
 * d'avant, et le dit.
 */
export async function narratedMontage(input: NarratedMontageInput, deps: NarratedMontageDeps, signal: AbortSignal, onProgress?: (detail: string) => void): Promise<NarratedMontage | null> {
  if (!BOARD_TEMPLATES.includes(input.template)) return null;
  // Le modèle monté nu : les voix à leur place et une illustration par segment.
  const base = buildFromTemplate(input.template, input.title, input.aspect, input.data, null);
  const words = narrationWords(base);
  if (words.length < MIN_NARRATION_WORDS) return null;
  const durationMs = Math.round((projectDuration(base) / base.fps) * 1000);
  const narration: NarrationContext = {
    title: input.title,
    segments: input.segmentTexts.map((text, line) => ({
      text,
      shows:
        input.visualNotes
          .filter((note) => note.line === line && note.kind === "show")
          .map((note) => note.text)
          .join(" ") || input.illustrations[line],
    })),
    notes: input.visualNotes.filter((note) => note.kind === "board").map((note) => note.text),
  };
  const mascot = Boolean(input.theme?.mascot && (input.theme.mascot.library?.length || input.theme.mascot.reactions.length));
  const recent = recentMontages(input.brandKitId, deps.projects?.());
  onProgress?.("Codex compose les tableaux sur la voix…");
  const answer = await deps.ask(beatPlanPrompt({ words, durationMs, language: input.language, recent, mascot, narration }), signal);
  const plan = readBeatPlan(extractJson(answer), words, durationMs, input.title, { fullMinMs: FULL_ILLUSTRATION_MIN_MS });
  const { logos, searched } = await findPlanLogos(plan, words, deps.logo, signal, (name) => onProgress?.(`Logo officiel de « ${name} »…`));
  const project = buildNarratedProject({ base, plan, words, logos, theme: input.theme });
  return { project, plan, montage: planSignature(plan).slice(0, 400), logos: searched };
}
