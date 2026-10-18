/**
 * Clips montés sur une vidéo source (dossier 01, V4) : « Sous-titrer un
 * clip » et chaque extrait de « Découper une vidéo ».
 *
 * La vidéo occupe le cadre avec son propre son ; ses paroles transcrites
 * deviennent des sous-titres mot à mot ; une accroche facultative ouvre le
 * clip ; la marque habille le tout (filigrane, carton de fin, styles et
 * lisibilité). Fonction pure, comme `templates.ts` : le serveur l'appelle,
 * le navigateur pourrait le faire.
 *
 * Deux cadrages quand la vidéo n'a pas les proportions du projet :
 * - « Recadrer » : la vidéo couvre tout le cadre, coupée au centre ;
 * - « Image entière sur fond flou » : la vidéo entière au centre, posée sur
 *   elle-même agrandie, floue, assombrie et muette (mouvement « Fond flou »).
 */

import { applyBrandTheme, SHORT_SAFE_ZONE, themedTextStyle, type BrandTheme } from "./brand";
import { captionForVoice, createProject, createTextItem, createVideoItem, uid } from "./edit";
import { captionCenterBounds, captionLineCount, measuredPlan } from "./measured-style";
import { wordGroups } from "./render";
import { msToFrames } from "./timeline";
import { ASPECTS, type AspectPreset, type ClipProject, type MediaSource, type TextItem, type Track, type VideoItem } from "./types";

export type ClipFraming = "crop" | "blur";

/** Mouvement de caméra du fond flou (`motion/scenes.ts`). */
export const BACKDROP_MOTION = "backdrop-blur";

/** Mots au plus par élément de sous-titres : un long clip en reçoit plusieurs, chacun sous la limite d'un texte. */
export const CAPTION_WORDS_PER_ITEM = 120;

/** Durée de l'accroche du début, en secondes. */
const HOOK_SECONDS = 3;

export interface SubtitledClipInput {
  name: string;
  aspect: AspectPreset;
  /** Vidéo transcrite : ses mots (`words`) sont en millisecondes de la source. */
  source: MediaSource;
  framing: ClipFraming;
  theme?: BrandTheme | null;
  /** Accroche posée au début ; vide : aucune. */
  hook?: string;
  /** Passage lu dans la source, en millisecondes ; absent : toute la vidéo. */
  range?: { startMs: number; endMs: number };
}

/** La vidéo n'a pas les proportions du cadre (à 3 % près) : il faut la recadrer ou la poser sur un fond. */
export function needsBackdrop(source: Pick<MediaSource, "width" | "height">, aspect: AspectPreset): boolean {
  if (!source.width || !source.height) return false;
  const frame = ASPECTS[aspect];
  const ratio = source.width / source.height / (frame.width / frame.height);
  return ratio < 0.97 || ratio > 1.03;
}

/**
 * Coupe des sous-titres trop longs en éléments successifs de 120 mots au
 * plus, de préférence après une fin de phrase. Chaque morceau garde le même
 * son (`voiceId`) et son décalage dans la source : l'affichage ne change pas.
 */
export function splitCaption(caption: TextItem, fps: number, maxWords = CAPTION_WORDS_PER_ITEM): TextItem[] {
  const karaoke = caption.karaoke;
  if (!karaoke || karaoke.words.length <= maxWords) return [caption];
  const chunks: typeof karaoke.words[] = [];
  let current: typeof karaoke.words = [];
  for (const word of karaoke.words) {
    current.push(word);
    const sentenceEnd = /[.!?…]\S*$/.test(word.text);
    if (current.length >= maxWords || (sentenceEnd && current.length >= maxWords * 0.75)) {
      chunks.push(current);
      current = [];
    }
  }
  if (current.length) chunks.push(current);

  const end = caption.start + caption.duration;
  // Image du projet où commence chaque morceau : son premier mot, ramené au début de l'élément.
  const starts = chunks.map((chunk, index) =>
    index === 0 ? caption.start : Math.min(end - 1, Math.max(caption.start + 1, caption.start + msToFrames(chunk[0].startMs, fps) - karaoke.offset))
  );
  return chunks
    .map((words, index) => {
      const start = starts[index];
      const stop = index + 1 < starts.length ? starts[index + 1] : end;
      return {
        ...structuredClone(caption),
        id: index === 0 ? caption.id : uid("x-"),
        start,
        duration: stop - start,
        text: words.map((word) => word.text).join(" "),
        karaoke: { ...karaoke, words, offset: karaoke.offset + (start - caption.start) },
      };
    })
    .filter((item) => item.duration >= 1);
}

/** Accroche du début : un titre du modèle, habillé ensuite par la marque. */
function hookItem(text: string, duration: number, fps: number, vertical: boolean): TextItem {
  const item = createTextItem("impact", 0, fps, text);
  item.duration = duration;
  item.theme = { role: "title" };
  item.style = themedTextStyle(null, item.theme, { size: vertical ? 0.06 : 0.075, align: "center" });
  // Dans le haut de la zone visible d'un short, au-dessus de la vidéo posée sur son fond.
  item.transform = { x: 0.5, y: vertical ? 0.2 : 0.15, width: 0.86, height: vertical ? 0.14 : 0.2, rotation: 0, opacity: 1 };
  item.animIn = { kind: "pop", frames: 10 };
  item.animOut = { kind: "fade", frames: 8 };
  item.label = "Accroche";
  return item;
}

/** Résumé du clip pour rédiger ses textes de publication : l'accroche et ce qui s'y dit. */
function clipBrief(title: string, source: MediaSource, range?: { startMs: number; endMs: number }): NonNullable<ClipProject["brief"]> {
  const words = (source.words ?? []).filter((word) => !range || (word.endMs > range.startMs && word.startMs < range.endMs));
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    line = line ? `${line} ${word.text}` : word.text;
    if (line.length > 400 || /[.!?…]\S*$/.test(word.text)) {
      lines.push(line);
      line = "";
    }
    if (lines.length >= 100) break;
  }
  if (line && lines.length < 100) lines.push(line);
  const origin = source.origin?.title ? ` (extrait de « ${source.origin.title} »)` : "";
  return { prompt: `Clip sous-titré : ${title}${origin}`.slice(0, 4000), title: title.slice(0, 200), script: lines.map((entry) => entry.slice(0, 2000)) };
}

/**
 * Projet d'un clip sous-titré : pistes « Accroche », « Sous-titres »,
 * « Principale » (la vidéo et son son), « Fond » (le flou, s'il y en a un),
 * puis l'habillage de la marque. Sans mots transcrits, aucun sous-titre.
 */
export function buildSubtitledClip(input: SubtitledClipInput): ClipProject {
  const base = createProject(input.name.slice(0, 200) || "Clip", input.aspect);
  const fps = base.fps;
  const vertical = base.height > base.width;
  const backdrop = input.framing === "blur" && needsBackdrop(input.source, input.aspect);

  const video: VideoItem = createVideoItem(input.source, 0, fps);
  video.label = "Vidéo";
  if (input.range) {
    video.trimStart = msToFrames(input.range.startMs, fps);
    video.duration = Math.max(1, msToFrames(input.range.endMs - input.range.startMs, fps));
  }
  video.fit = backdrop ? "contain" : "cover";

  const tracks: Track[] = [];
  const hook = input.hook?.replace(/\s+/g, " ").trim().slice(0, 120);
  if (hook) {
    tracks.push({ id: uid("t-"), kind: "visual", name: "Accroche", items: [hookItem(hook, Math.min(video.duration, Math.round(HOOK_SECONDS * fps)), fps, vertical)] });
  }
  const captionsTrack: Track = { id: uid("t-"), kind: "visual", name: "Sous-titres", items: [] };
  tracks.push(captionsTrack, { id: uid("t-"), kind: "visual", name: "Principale", items: [video] });
  if (backdrop) {
    const blur: VideoItem = { ...structuredClone(video), id: uid("v-"), label: "Fond flou", fit: "cover", muted: true, motion: BACKDROP_MOTION };
    tracks.push({ id: uid("t-"), kind: "visual", name: "Fond", items: [blur] });
  }
  tracks.push({ id: uid("t-"), kind: "audio", name: "Audio", items: [] });
  let project: ClipProject = { ...base, tracks, brief: clipBrief(hook || input.name, input.source, input.range) };

  // Sous-titres de la marque (D3, D4) : taille, place et mots à l'écran d'un style mesuré, bornés à la zone visible.
  const caption = captionForVoice(project, video);
  if (caption) {
    const plan = input.theme?.pace === "measured" ? measuredPlan(input.theme.measuredStyle, ASPECTS[input.aspect], SHORT_SAFE_ZONE) : null;
    let y = plan?.caption?.y ?? (vertical ? 0.67 : 0.8);
    if (plan?.caption) {
      const { size, groupSize } = plan.caption;
      caption.style = { ...caption.style, size };
      caption.karaoke = { ...caption.karaoke!, groupSize };
      const words = caption.karaoke.words;
      const groups = wordGroups(words, groupSize).map((group) => group.map((index) => words[index].text).join(" "));
      const bounds = captionCenterBounds(size, SHORT_SAFE_ZONE, captionLineCount(groups, size, project));
      y = Math.min(bounds.max, Math.max(bounds.min, y));
    }
    caption.transform = { ...caption.transform, y };
    captionsTrack.items = splitCaption(caption, fps);
    project = { ...project, tracks: [...tracks] };
  }

  // La mascotte n'a pas sa place sur une vidéo filmée : la marque habille sans elle.
  if (!input.theme) return project;
  const { mascot: _mascot, ...theme } = input.theme;
  return applyBrandTheme(project, theme);
}
