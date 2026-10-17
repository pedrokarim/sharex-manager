/**
 * Modèles de projet : des données structurées deviennent un clip monté.
 *
 * Fonctions pures, utilisables dans le navigateur (modèle rempli à la main)
 * comme sur le serveur (assistant IA). Les positions sont relatives au
 * canevas : un même modèle fonctionne en 9:16, 16:9, 1:1 ou 4:5.
 */

import { accentOf, applyBrandTheme, paintFill, shade, themedTextStyle, type BrandTheme } from "./brand";
import {
  appendSequence,
  createCaptionItem,
  createImageItem,
  createProject,
  createVideoItem,
  createTextItem,
  uid,
} from "./edit";
import type { PoseEmotion, PoseGesture } from "./poses";
import { addBeats, cutShots, fillStills, type EditPace } from "./rhythm";
import type {
  AspectPreset,
  AudioItem,
  ClipItem,
  ClipProject,
  ImageItem,
  MediaSource,
  ShapeItem,
  TextItem,
  TextRole,
  TextStyle,
  ThemeHint,
  SegmentCue,
  TimedWord,
  Track,
  VideoItem,
} from "./types";

export type TemplateId = "free" | "quiz" | "top" | "slideshow" | "before-after";

/** Narration d'un segment : un son déjà synthétisé et sa durée. */
export interface VoiceClip {
  source: MediaSource;
  durationMs: number;
}

/**
 * Direction d'un segment, écrite par le script de l'assistant : l'émotion
 * que la mascotte d'une marque y montre (et un geste, s'il s'impose), et le
 * nom du sujet de son icône, pour la faire apparaître quand la voix le
 * prononce. Tout est facultatif : absent, le segment est neutre.
 */
export interface SegmentDirection {
  emotion?: PoseEmotion;
  gesture?: PoseGesture;
  /** Nom du sujet de l'icône (« Minecraft », « le guépard ») ; absent : le titre du segment. */
  iconName?: string;
}

export interface QuizQuestion {
  question: string;
  choices: string[];
  /** Index de la bonne réponse dans `choices`. */
  answer: number;
  explanation?: string;
  image?: MediaSource;
  /** Icône ou logo officiel de la bonne réponse, montré à la révélation seulement ; absent, rien ne change. */
  icon?: MediaSource;
  voice?: { question?: VoiceClip; reveal?: VoiceClip };
  emotion?: PoseEmotion;
  gesture?: PoseGesture;
  iconName?: string;
}

export interface QuizData {
  title: string;
  subtitle?: string;
  questions: QuizQuestion[];
  outro?: string;
  voice?: { intro?: VoiceClip; outro?: VoiceClip };
  /** Émotion de la conclusion ; absente : la joie. */
  outroEmotion?: PoseEmotion;
}

export interface TopEntry {
  title: string;
  detail?: string;
  image?: MediaSource;
  /** Icône ou logo officiel du sujet, posé à côté de son nom ; absent, rien ne change. */
  icon?: MediaSource;
  voice?: VoiceClip;
  emotion?: PoseEmotion;
  gesture?: PoseGesture;
  iconName?: string;
}

export interface TopData {
  title: string;
  /** Du premier affiché au dernier : le numéro 1 arrive en dernier. */
  entries: TopEntry[];
  outro?: string;
  voice?: { intro?: VoiceClip; outro?: VoiceClip };
  outroEmotion?: PoseEmotion;
}

export interface SlideshowData {
  title?: string;
  slides: {
    caption?: string;
    image?: MediaSource;
    /** Icône ou logo officiel du sujet, posé à côté de son nom ; absent, rien ne change. */
    icon?: MediaSource;
    voice?: VoiceClip;
    emotion?: PoseEmotion;
    gesture?: PoseGesture;
    iconName?: string;
  }[];
  outro?: string;
  voice?: { intro?: VoiceClip; outro?: VoiceClip };
  outroEmotion?: PoseEmotion;
}

/** Une séquence du modèle libre : un titre, un texte, ou les deux. */
export interface FreeScene {
  heading?: string;
  text?: string;
  image?: MediaSource;
  /** Icône ou logo officiel du sujet, posé à côté de son nom ; absent, rien ne change. */
  icon?: MediaSource;
  voice?: VoiceClip;
  emotion?: PoseEmotion;
  gesture?: PoseGesture;
  iconName?: string;
}

/** Modèle libre : aucune forme imposée, une suite de séquences. */
export interface FreeData {
  title?: string;
  subtitle?: string;
  scenes: FreeScene[];
  outro?: string;
  voice?: { intro?: VoiceClip; outro?: VoiceClip };
  outroEmotion?: PoseEmotion;
}

export interface BeforeAfterPair {
  before?: MediaSource;
  after?: MediaSource;
  caption?: string;
}

export interface BeforeAfterData {
  title?: string;
  pairs: BeforeAfterPair[];
  outro?: string;
}


// ─── Pistes nommées ──────────────────────────────────────────────

/**
 * Un modèle range ses éléments par couche, de la plus haute à la plus
 * basse : textes au-dessus des icônes, puis des surlignages, eux-mêmes
 * au-dessus des cadres, eux-mêmes au-dessus du fond. Une couche vide ne
 * crée aucune piste.
 */
const LAYERS = ["Sous-titres", "Textes", "Icônes", "Surlignage", "Cadres", "Voile", "Après", "Principale"] as const;
type Layer = (typeof LAYERS)[number];

/**
 * Mise en page d'un clip monté par une marque ou par l'assistant (dossier
 * 07 sexies, D2 et D3). Vide pour un modèle rempli à la main : le rendu
 * d'avant, au pixel près.
 */
export interface TemplateLayout {
  /** Sous-titres mot à mot sur la voix off, à la place du texte qu'elle lit (libre, diaporama). */
  captions?: boolean;
  /** L'icône d'un sujet apparaît quand la voix prononce son nom. */
  onWord?: boolean;
  /** Une place est gardée à la mascotte de la marque (ouverture, conclusion, choix du quiz). */
  mascot?: boolean;
}

class Builder {
  private tracks = new Map<Layer | "Voix" | "Musique", Track>();

  constructor(
    readonly project: ClipProject,
    readonly layout: TemplateLayout = {}
  ) {
    for (const layer of LAYERS) {
      this.tracks.set(layer, { id: uid("t-"), kind: "visual", name: layer, items: [] });
    }
    this.tracks.set("Voix", { id: uid("t-"), kind: "audio", name: "Voix", items: [] });
    this.tracks.set("Musique", { id: uid("t-"), kind: "audio", name: "Musique", items: [] });
  }

  get fps() {
    return this.project.fps;
  }

  get vertical() {
    return this.project.height > this.project.width;
  }

  seconds(value: number) {
    return Math.round(value * this.fps);
  }

  /** Durée d'un segment : au moins `base`, et assez pour la narration plus une marge. */
  fit(base: number, voice: VoiceClip | undefined, margin: number) {
    return Math.max(this.seconds(base), voice ? this.seconds(voice.durationMs / 1000 + margin) : 0);
  }

  /** Pose la narration d'un segment sur la piste Voix. */
  narrate(voice: VoiceClip | undefined, start: number): AudioItem | undefined {
    if (!voice) return undefined;
    return this.add("Voix", {
      id: uid("a-"),
      type: "audio",
      start,
      duration: Math.max(1, this.seconds(voice.durationMs / 1000)),
      source: voice.source,
      trimStart: 0,
      // Un peu de marge : voix et musique additionnées ne saturent pas.
      volume: 0.9,
      fadeIn: 0,
      fadeOut: 0,
    }) as AudioItem;
  }

  add<T extends ClipItem>(layer: Layer | "Voix" | "Musique", item: T): T {
    this.tracks.get(layer)!.items.push(item);
    return item;
  }

  /**
   * Une piste de l'éditeur ne porte qu'un élément à la fois. Chaque couche
   * est donc répartie sur autant de pistes que nécessaire : chaque élément va
   * sur la première piste de sa couche où il ne chevauche rien.
   */
  build(): ClipProject {
    const tracks: Track[] = [];
    for (const [name, layer] of this.tracks) {
      const lanes: Track[] = [];
      for (const item of [...layer.items].sort((a, b) => a.start - b.start)) {
        let lane = lanes.find((candidate) => {
          const last = candidate.items[candidate.items.length - 1];
          return !last || last.start + last.duration <= item.start;
        });
        if (!lane) {
          lane = {
            id: uid("t-"),
            kind: layer.kind,
            name: lanes.length === 0 ? name : `${name} ${lanes.length + 1}`,
            items: [],
          };
          lanes.push(lane);
        }
        lane.items.push(item);
      }
      if (lanes.length === 0 && (name === "Principale" || name === "Musique")) {
        lanes.push({ ...layer, items: [] });
      }
      tracks.push(...lanes);
    }
    return { ...this.project, tracks, updatedAt: Date.now() };
  }
}

// ─── Éléments de base ────────────────────────────────────────────

/**
 * Texte d'un modèle. Il porte son rôle (titre, légende, étiquette…) : le
 * style vient du thème par défaut ici, et d'une image de marque quand on en
 * applique une (`applyBrandTheme`).
 */
function text(
  b: Builder,
  content: string,
  start: number,
  duration: number,
  options: {
    role: TextRole;
    size: number;
    align?: TextStyle["align"];
    paint?: ThemeHint["paint"];
    /** Rang du segment : teinte d'une étiquette. */
    accent?: number;
    y?: number;
    height?: number;
    width?: number;
    animIn?: TextItem["animIn"]["kind"];
    animOut?: TextItem["animOut"]["kind"];
  }
): TextItem {
  const hint: ThemeHint = { role: options.role };
  if (options.paint) hint.paint = options.paint;
  if (options.accent !== undefined) hint.accent = options.accent;
  const item = createTextItem("impact", start, b.fps, content);
  item.duration = duration;
  item.theme = hint;
  item.style = themedTextStyle(null, hint, { size: options.size, align: options.align ?? "center" });
  item.transform = {
    x: 0.5,
    y: options.y ?? 0.5,
    width: options.width ?? 0.88,
    height: options.height ?? 0.14,
    rotation: 0,
    opacity: 1,
  };
  item.animIn = { kind: options.animIn ?? "pop", frames: 10 };
  item.animOut = { kind: options.animOut ?? "fade", frames: 6 };
  return item;
}

/**
 * Rectangle. Avec une peinture (`hint`), sa couleur vient du thème et suit
 * une image de marque ; sans, elle reste celle donnée.
 */
function box(
  b: Builder,
  start: number,
  duration: number,
  geometry: { y: number; height: number; width?: number },
  fill: string | ThemeHint,
  options: { opacity?: number; radius?: number; animIn?: ShapeItem["animIn"]["kind"] } = {}
): ShapeItem {
  const hint = typeof fill === "string" ? undefined : fill;
  return {
    id: uid("s-"),
    type: "shape",
    shape: "rect",
    start,
    duration,
    fill: hint ? paintFill(null, hint) ?? "#000000" : (fill as string),
    ...(hint ? { theme: hint } : {}),
    radius: options.radius ?? 0.3,
    transform: {
      x: 0.5,
      y: geometry.y,
      width: geometry.width ?? 0.86,
      height: geometry.height,
      rotation: 0,
      opacity: options.opacity ?? 1,
    },
    animIn: { kind: options.animIn ?? "slide-left", frames: 8 },
    animOut: { kind: "fade", frames: 6 },
  };
}

/** Fond d'un segment : l'image fournie sous un voile (retiré par une marque), sinon un aplat de la teinte du segment. */
function background(b: Builder, start: number, duration: number, image: MediaSource | undefined, accent: number, motionIndex: number, cue?: SegmentCue) {
  const cued = cue && (b.layout.captions || b.layout.mascot || b.layout.onWord) ? { cue } : {};
  if (image) {
    const item: ImageItem = {
      ...cued,
      id: uid("i-"),
      type: "image",
      start,
      duration,
      source: image,
      fit: "cover",
      motion: (["zoom-in", "pan-right", "zoom-out", "pan-left"] as const)[motionIndex % 4],
      radius: 0,
      transform: { x: 0.5, y: 0.5, width: 1, height: 1, rotation: 0, opacity: 1 },
      animIn: { kind: "fade", frames: 8 },
      animOut: { kind: "none", frames: 10 },
    };
    b.add("Principale", item);
    // Voile sombre du thème par défaut. Une marque le rend transparent : l'image
    // reste éclatante et chaque texte reçoit sa propre étiquette ou son contour.
    b.add("Voile", box(b, start, duration, { y: 0.5, height: 1, width: 1 }, { paint: "veil" }, { opacity: 0.42, radius: 0, animIn: "none" }));
  } else {
    b.add("Principale", { ...box(b, start, duration, { y: 0.5, height: 1, width: 1 }, { paint: "plate", accent }, { radius: 0, animIn: "fade" }), ...cued });
  }
}

/** Indication de montage d'un segment, sans champ vide. */
function cueOf(index: number, direction: { emotion?: PoseEmotion; gesture?: PoseGesture } = {}, beat?: SegmentCue["beat"], beatOffset?: number): SegmentCue {
  return {
    index,
    ...(direction.emotion ? { emotion: direction.emotion } : {}),
    ...(direction.gesture ? { gesture: direction.gesture } : {}),
    ...(beat ? { beat } : {}),
    ...(beatOffset !== undefined ? { beatOffset } : {}),
  };
}

/**
 * Sous-titres mot à mot d'une voix off (D3) : posés sur la voix, gros, sans
 * fondu, le mot prononcé mis en valeur. `null` sans mots horodatés : le texte
 * lu reste alors affiché comme avant.
 */
function spokenCaption(b: Builder, voice: AudioItem | undefined, y: number): TextItem | null {
  const words = voice?.source.words;
  if (!b.layout.captions || !voice || !words?.length) return null;
  const caption = createCaptionItem(words, voice.start, b.fps, b.vertical);
  caption.duration = voice.duration;
  caption.karaoke = { ...caption.karaoke!, voiceId: voice.id };
  caption.transform = { ...caption.transform, y };
  return b.add("Sous-titres", caption);
}

/** Hauteur des sous-titres mot à mot : en bas du tiers central d'un short, au bas d'un cadre large. */
const captionY = (b: Builder) => (b.vertical ? 0.67 : 0.8);

const STOP_WORDS = new Set(["les", "des", "une", "aux", "the", "and", "logo", "app", "icon", "key", "art", "official", "officiel", "officielle", "game", "jeu"]);

/** Mot sans accents, sans casse ni ponctuation. */
const plainWord = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

/**
 * Image où la voix prononce le nom d'un sujet (« guépard » dans « Numéro 1,
 * le guépard ») : le premier mot de la voix qui est l'un des mots du nom.
 * `null` si la voix ne le dit pas, ou sans mots horodatés.
 */
export function spokenAt(voice: Pick<AudioItem, "start" | "source"> | undefined, name: string | undefined, fps: number): number | null {
  const words: TimedWord[] | undefined = voice?.source.words;
  if (!voice || !words?.length || !name) return null;
  const keys = name
    .split(/[\s'’\-–:,.!?«»"()]+/)
    .map(plainWord)
    .filter((word) => (word.length >= 3 || /^\d+$/.test(word)) && !STOP_WORDS.has(word));
  if (keys.length === 0) return null;
  for (const word of words) {
    const plain = plainWord(word.text);
    if (!plain) continue;
    // Un pluriel ou un accord (« guépards ») compte : même début, au moins cinq lettres en commun.
    const hit = keys.some((key) => plain === key || (key.length >= 5 && plain.length >= 5 && (plain.startsWith(key) || key.startsWith(plain))));
    if (hit) return voice.start + Math.round((word.startMs / 1000) * fps);
  }
  return null;
}

/**
 * Début d'une icône : quand la voix nomme son sujet (D3), sinon `fallback`.
 * Elle reste au moins 0,8 s : prononcé trop tard, le nom ne la retarde pas.
 */
function iconStart(b: Builder, voice: AudioItem | undefined, name: string | undefined, fallback: number, end: number): number {
  if (!b.layout.onWord) return fallback;
  const at = spokenAt(voice, name, b.fps);
  return at !== null && at > fallback && end - at >= b.seconds(0.8) ? at : fallback;
}

/** Où poser une icône : centre ou bord gauche, centre ou bord bas, en fractions du canevas. */
interface IconPlace {
  x?: number;
  left?: number;
  y?: number;
  bottom?: number;
  /** Côté de l'icône, en fraction du petit côté du canevas. */
  side: number;
  /** Largeur au plus, en fraction de la largeur du canevas (un logo large est réduit). */
  maxWidth?: number;
}

/** Préréglage d'apparition des icônes (registre `engine/motion/registry.ts`) et sa durée. */
const ICON_ANIM_IN = { kind: "pop-in", seconds: 0.52 } as const;
/** Arrondi des coins d'une icône, en fraction de son côté. */
const ICON_RADIUS = 0.22;

/**
 * Icône ou logo officiel d'un sujet, posé à côté de son nom : coins
 * arrondis, petite ombre, apparition en éclosion. Une icône carrée (icône
 * d'appli) remplit sa carte ; un logo plus large ou plus haut est posé dans
 * une carte claire à sa mesure. La carte suit le thème (surface), l'ombre reste
 * noire et légère. Sans icône, rien n'est posé : le rendu
 * reste celui d'avant.
 */
function iconSlot(b: Builder, icon: MediaSource | undefined, start: number, duration: number, place: IconPlace) {
  if (!icon || icon.kind !== "image" || duration <= 0) return;
  const { width: W, height: H } = b.project;
  const ratio = icon.width && icon.height ? icon.width / icon.height : 1;
  const logo = ratio > 1.25 || ratio < 0.8;
  let side = place.side * Math.min(W, H);
  let boxWidth = logo ? side * Math.min(Math.max(ratio, 1), 2.2) : side;
  const maxWidth = (place.maxWidth ?? 0.8) * W;
  if (boxWidth > maxWidth) {
    side *= maxWidth / boxWidth;
    boxWidth = maxWidth;
  }
  const width = boxWidth / W;
  const height = side / H;
  const x = place.left !== undefined ? place.left + width / 2 : place.x ?? 0.5;
  const y = place.bottom !== undefined ? place.bottom - height / 2 : place.y ?? 0.5;
  const animIn = { kind: ICON_ANIM_IN.kind, frames: Math.max(1, Math.round(ICON_ANIM_IN.seconds * b.fps)) };
  const animOut = { kind: "fade", frames: 6 };
  const card = (paint: "shadow" | "surface", dy: number, opacity: number): ShapeItem => ({
    id: uid("s-"),
    type: "shape",
    shape: "rect",
    start,
    duration,
    fill: paintFill(null, { paint }) ?? "#000000",
    theme: { paint },
    radius: ICON_RADIUS,
    transform: { x, y: y + dy, width, height, rotation: 0, opacity },
    animIn,
    animOut,
  });

  // L'icône d'abord, sa carte ensuite : sur la même couche, la première piste est dessinée par-dessus.
  const inset = logo ? 0.8 : 1;
  b.add("Icônes", {
    id: uid("i-"),
    type: "image",
    start,
    duration,
    source: icon,
    fit: logo ? "contain" : "cover",
    motion: "none",
    radius: logo ? 0 : Math.round(ICON_RADIUS * side),
    transform: { x, y, width: width * inset, height: height * inset, rotation: 0, opacity: 1 },
    animIn,
    animOut,
  } satisfies ImageItem);
  if (logo) b.add("Icônes", card("surface", 0, 1));
  // Ombre portée : la même carte, sombre et décalée vers le bas, sous les autres cadres.
  b.add("Cadres", card("shadow", (side * 0.06) / H, 0.35));
}

// ─── Quiz ────────────────────────────────────────────────────────

export interface QuizTiming {
  intro: number;
  think: number;
  reveal: number;
  outro: number;
}

export const DEFAULT_QUIZ_TIMING: QuizTiming = { intro: 2.5, think: 5, reveal: 2.5, outro: 3 };

export function buildQuiz(
  name: string,
  aspect: AspectPreset,
  data: QuizData,
  timing: QuizTiming = DEFAULT_QUIZ_TIMING,
  layout: TemplateLayout = {}
): ClipProject {
  const b = new Builder(createProject(name, aspect), layout);
  const vertical = aspect === "9:16" || aspect === "4:5";
  // Place de la mascotte dans un short (D2) : titres remontés, choix décalés à droite, la pose dessous à gauche.
  const reserve = Boolean(layout.mascot) && aspect === "9:16";
  let cursor = 0;

  // Intro
  const intro = b.fit(timing.intro, data.voice?.intro, 0.5);
  background(b, cursor, intro, data.questions[0]?.image, 0, 0, cueOf(0, { emotion: "excitement" }, "hook"));
  b.narrate(data.voice?.intro, cursor + 4);
  b.add("Textes", text(b, data.title, cursor, intro, { role: "title", y: reserve ? 0.28 : vertical ? 0.42 : 0.4, height: 0.24, size: vertical ? 0.07 : 0.1 }));
  b.add("Textes", text(b, data.subtitle ?? "Réponds avant la fin du compte à rebours !", cursor + 6, intro - 6, {
    role: "caption",
    y: reserve ? 0.43 : vertical ? 0.58 : 0.62,
    // Une ligne : son cadre serré laisse la place à la mascotte dessous.
    height: reserve ? 0.06 : 0.14,
    size: vertical ? 0.032 : 0.045,
    animIn: "slide-up",
  }));
  cursor += intro;

  data.questions.forEach((question, index) => {
    const accent = index;
    // Avec une narration, on laisse le temps de l'écouter puis de réfléchir.
    const think = b.fit(timing.think, question.voice?.question, 3);
    const reveal = b.fit(timing.reveal, question.voice?.reveal, 0.5);
    const total = think + reveal;
    // La révélation de la dernière question est le temps fort du quiz.
    const last = index === data.questions.length - 1;
    background(b, cursor, total, question.image, accent, index + 1, cueOf(index + 1, question, last ? "reveal" : undefined, last ? think : undefined));
    b.narrate(question.voice?.question, cursor + 4);
    const revealVoice = b.narrate(question.voice?.reveal, cursor + think + 2);

    // Numéro de la question
    b.add("Textes", text(b, `Question ${index + 1}/${data.questions.length}`, cursor, total, {
      role: "label",
      y: vertical ? 0.1 : 0.1,
      width: 0.6,
      height: 0.07,
      size: vertical ? 0.028 : 0.042,
      accent,
      animIn: "slide-down",
    }));
    // Icône de la bonne réponse, à droite de l'étiquette : à la révélation seulement, pour ne rien dévoiler,
    // et quand la voix nomme la réponse si elle la nomme.
    const iconAt = iconStart(b, revealVoice, question.iconName ?? question.choices[question.answer], cursor + think, cursor + total);
    iconSlot(b, question.icon, iconAt, cursor + total - iconAt, { left: 0.82, y: 0.1, side: 0.11, maxWidth: 0.15 });

    // Question
    b.add("Textes", text(b, question.question, cursor + 4, total - 4, {
      role: "caption",
      y: vertical ? 0.27 : 0.27,
      height: vertical ? 0.2 : 0.22,
      size: vertical ? 0.042 : 0.06,
    }));

    // Choix
    const choices = question.choices.slice(0, 4);
    const rowHeight = vertical ? 0.075 : 0.1;
    const gap = vertical ? 0.022 : 0.03;
    const firstY = vertical ? 0.5 : 0.48;
    const rowWidth = reserve ? 0.58 : vertical ? 0.86 : 0.7;
    const rowX = reserve ? 0.36 + rowWidth / 2 : 0.5;
    choices.forEach((choice, choiceIndex) => {
      const y = firstY + choiceIndex * (rowHeight + gap);
      const delay = 10 + choiceIndex * 4;
      const frame = box(b, cursor + delay, total - delay, { y, height: rowHeight, width: rowWidth }, { paint: "surface" }, { opacity: 0.94 });
      frame.transform.x = rowX;
      b.add("Cadres", frame);
      const label = text(b, `${String.fromCharCode(65 + choiceIndex)}. ${choice}`, cursor + delay, total - delay, {
        role: "body",
        y,
        width: reserve ? rowWidth - 0.06 : vertical ? 0.8 : 0.64,
        height: rowHeight,
        size: reserve ? 0.027 : vertical ? 0.03 : 0.042,
        align: "left",
        animIn: "slide-left",
      });
      label.transform.x = rowX;
      b.add("Textes", label);
      // Révélation : la bonne réponse passe au vert.
      if (choiceIndex === question.answer) {
        const right = box(b, cursor + think, reveal, { y, height: rowHeight, width: rowWidth }, "#22c55e", { animIn: "pop" });
        right.transform.x = rowX;
        b.add("Surlignage", right);
      }
    });

    // Compte à rebours : avec une narration, il part quand la question a été lue.
    const countdownDelay = question.voice?.question
      ? Math.min(think - b.seconds(2), 4 + b.seconds(question.voice.question.durationMs / 1000))
      : 10;
    const bar: ShapeItem = {
      id: uid("s-"),
      type: "shape",
      shape: "progress",
      start: cursor + countdownDelay,
      duration: think - countdownDelay,
      fill: accentOf(null, accent),
      theme: { paint: "accent", accent },
      radius: 0.5,
      progress: { track: "rgba(255,255,255,0.25)", reverse: true },
      transform: { x: 0.5, y: vertical ? 0.93 : 0.92, width: 0.8, height: vertical ? 0.014 : 0.02, rotation: 0, opacity: 1 },
      animIn: { kind: "fade", frames: 6 },
      animOut: { kind: "none", frames: 10 },
    };
    b.add("Cadres", bar);

    // Explication, pendant la révélation
    const answerText = choices[question.answer] ?? "";
    b.add("Textes", text(b, question.explanation || `Réponse : ${answerText}`, cursor + think, reveal, {
      role: "caption",
      y: vertical ? 0.88 : 0.9,
      height: 0.12,
      size: vertical ? 0.028 : 0.04,
      paint: "success",
      animIn: "slide-up",
    }));

    cursor += total;
  });

  // Conclusion
  const outro = b.fit(timing.outro, data.voice?.outro, 0.8);
  background(b, cursor, outro, undefined, data.questions.length, 0, cueOf(data.questions.length + 1, { emotion: data.outroEmotion ?? "joy" }, "end"));
  b.narrate(data.voice?.outro, cursor + 4);
  b.add("Textes", text(b, data.outro ?? "Combien de bonnes réponses ?", cursor, outro, { role: "title", y: reserve ? 0.3 : 0.44, height: 0.24, size: vertical ? 0.06 : 0.09 }));
  b.add("Textes", text(b, "Dis-le en commentaire", cursor + 8, outro - 8, { role: "subtitle", y: reserve ? 0.43 : 0.58, height: reserve ? 0.06 : 0.14, size: vertical ? 0.032 : 0.045, animIn: "slide-up" }));

  return b.build();
}

// ─── Top N ───────────────────────────────────────────────────────

export function buildTop(name: string, aspect: AspectPreset, data: TopData, layout: TemplateLayout = {}): ClipProject {
  const b = new Builder(createProject(name, aspect), layout);
  const vertical = aspect === "9:16" || aspect === "4:5";
  const reserve = Boolean(layout.mascot) && aspect === "9:16";
  let cursor = 0;

  const intro = b.fit(2.5, data.voice?.intro, 0.5);
  background(b, cursor, intro, data.entries[0]?.image, 0, 0, cueOf(0, { emotion: "excitement" }, "hook"));
  b.narrate(data.voice?.intro, cursor + 4);
  b.add("Textes", text(b, data.title, cursor, intro, { role: "title", y: reserve ? 0.32 : 0.45, height: 0.26, size: vertical ? 0.07 : 0.1 }));
  cursor += intro;

  const count = data.entries.length;
  data.entries.forEach((entry, index) => {
    const rank = count - index;
    const accent = index;
    const duration = b.fit(rank === 1 ? 4.5 : 3.5, entry.voice, 0.6);
    background(b, cursor, duration, entry.image, accent, index + 1, cueOf(index + 1, entry, rank === 1 ? "reveal" : undefined));
    const voice = b.narrate(entry.voice, cursor + 4);
    b.add("Textes", text(b, `#${rank}`, cursor, duration, {
      role: "title",
      y: vertical ? 0.2 : 0.22,
      height: 0.2,
      size: vertical ? 0.12 : 0.18,
      ...(rank === 1 ? { paint: "highlight" as const } : {}),
      animIn: "zoom",
    }));
    b.add("Textes", text(b, entry.title, cursor + 6, duration - 6, { role: "title", y: vertical ? 0.72 : 0.7, height: 0.16, size: vertical ? 0.055 : 0.08, animIn: "slide-up" }));
    // L'icône arrive quand la voix dit le nom du sujet.
    const iconAt = iconStart(b, voice, entry.iconName ?? entry.title, cursor + 6, cursor + duration);
    iconSlot(b, entry.icon, iconAt, cursor + duration - iconAt, { bottom: (vertical ? 0.72 : 0.7) - 0.08 - 0.01, side: 0.16 });
    if (entry.detail) {
      b.add("Textes", text(b, entry.detail, cursor + 12, duration - 12, { role: "caption", y: vertical ? 0.82 : 0.84, height: 0.12, size: vertical ? 0.03 : 0.042, animIn: "fade" }));
    }
    cursor += duration;
  });

  if (data.outro) {
    const outro = b.fit(2.5, data.voice?.outro, 0.8);
    background(b, cursor, outro, undefined, count, 0, cueOf(count + 1, { emotion: data.outroEmotion ?? "joy" }, "end"));
    b.narrate(data.voice?.outro, cursor + 4);
    b.add("Textes", text(b, data.outro, cursor, outro, { role: "title", y: reserve ? 0.3 : 0.46, height: 0.24, size: vertical ? 0.06 : 0.09 }));
  }
  return b.build();
}

// ─── Diaporama ───────────────────────────────────────────────────

export function buildSlideshow(name: string, aspect: AspectPreset, data: SlideshowData, layout: TemplateLayout = {}): ClipProject {
  const b = new Builder(createProject(name, aspect), layout);
  const vertical = aspect === "9:16" || aspect === "4:5";
  const reserve = Boolean(layout.mascot) && aspect === "9:16";
  let cursor = 0;
  if (data.title) {
    const intro = b.fit(2.5, data.voice?.intro, 0.5);
    background(b, cursor, intro, data.slides[0]?.image, 0, 0, cueOf(0, { emotion: "excitement" }, "hook"));
    b.narrate(data.voice?.intro, cursor + 4);
    b.add("Textes", text(b, data.title, cursor, intro, { role: "title", y: reserve ? 0.32 : 0.46, height: 0.26, size: vertical ? 0.065 : 0.09 }));
    cursor += intro;
  }
  data.slides.forEach((slide, index) => {
    const duration = b.fit(3.5, slide.voice, 0.6);
    background(b, cursor, duration, slide.image, index, index + 1, cueOf(index + 1, slide));
    const voice = b.narrate(slide.voice, cursor + 4);
    // La légende lue devient des sous-titres mot à mot ; sans mots horodatés, elle reste affichée.
    const caption = slide.caption ? spokenCaption(b, voice, captionY(b)) : null;
    if (slide.caption && !caption) {
      b.add("Textes", text(b, slide.caption, cursor + 6, duration - 6, { role: "caption", y: vertical ? 0.8 : 0.84, height: 0.16, size: vertical ? 0.038 : 0.05, animIn: "slide-up" }));
    }
    const iconAt = iconStart(b, voice, slide.iconName, cursor + 6, cursor + duration);
    const place: IconPlace = caption
      ? { x: reserve ? 0.66 : 0.5, y: reserve ? 0.4 : vertical ? 0.44 : 0.42, side: vertical ? 0.26 : 0.2 }
      : slide.caption
        ? { bottom: (vertical ? 0.8 : 0.84) - 0.08 - 0.01, side: 0.15 }
        : { y: vertical ? 0.8 : 0.82, side: 0.15 };
    iconSlot(b, slide.icon, iconAt, cursor + duration - iconAt, place);
    cursor += duration;
  });
  if (data.outro) {
    const outro = b.fit(2.5, data.voice?.outro, 0.8);
    background(b, cursor, outro, undefined, data.slides.length, 0, cueOf(data.slides.length + 1, { emotion: data.outroEmotion ?? "joy" }, "end"));
    b.narrate(data.voice?.outro, cursor + 4);
    b.add("Textes", text(b, data.outro, cursor, outro, { role: "title", y: reserve ? 0.3 : 0.46, height: 0.24, size: vertical ? 0.06 : 0.09 }));
  }
  return b.build();
}

// ─── Libre ───────────────────────────────────────────────────────

/**
 * Suite de séquences sans forme imposée : chacune porte son image, un titre
 * en haut et un texte plus bas, et dure le temps de sa narration.
 */
export function buildFree(name: string, aspect: AspectPreset, data: FreeData, layout: TemplateLayout = {}): ClipProject {
  const b = new Builder(createProject(name, aspect), layout);
  const vertical = aspect === "9:16" || aspect === "4:5";
  const reserve = Boolean(layout.mascot) && aspect === "9:16";
  let cursor = 0;

  if (data.title) {
    const intro = b.fit(2.5, data.voice?.intro, 0.5);
    background(b, cursor, intro, data.scenes[0]?.image, 0, 0, cueOf(0, { emotion: "excitement" }, "hook"));
    b.narrate(data.voice?.intro, cursor + 4);
    b.add("Textes", text(b, data.title, cursor, intro, { role: "title", y: reserve ? 0.28 : vertical ? 0.44 : 0.42, height: 0.26, size: vertical ? 0.065 : 0.09 }));
    if (data.subtitle) {
      b.add("Textes", text(b, data.subtitle, cursor + 6, intro - 6, { role: "subtitle", y: reserve ? 0.43 : vertical ? 0.58 : 0.62, height: reserve ? 0.06 : 0.14, size: vertical ? 0.032 : 0.045, animIn: "slide-up" }));
    }
    cursor += intro;
  }

  data.scenes.forEach((scene, index) => {
    const accent = index;
    const duration = b.fit(scene.text ? 4 : 3, scene.voice, 0.6);
    background(b, cursor, duration, scene.image, accent, index + 1, cueOf(index + 1, scene));
    const voice = b.narrate(scene.voice, cursor + 4);
    // Le texte lu devient des sous-titres mot à mot ; sans mots horodatés, il reste affiché.
    const caption = scene.text ? spokenCaption(b, voice, captionY(b)) : null;
    const shownText = scene.text && !caption ? scene.text : undefined;
    if (scene.heading) {
      b.add("Textes", text(b, scene.heading, cursor, duration, {
        role: "title",
        y: scene.text ? (vertical ? 0.2 : 0.22) : 0.46,
        height: 0.18,
        size: vertical ? 0.055 : 0.08,
        animIn: "slide-down",
      }));
    }
    if (shownText) {
      b.add("Textes", text(b, shownText, cursor + 6, duration - 6, {
        role: "caption",
        y: scene.heading ? (vertical ? 0.74 : 0.76) : 0.5,
        height: vertical ? 0.24 : 0.2,
        size: vertical ? 0.038 : 0.05,
        animIn: "slide-up",
      }));
    }
    // Icône juste au-dessus du texte de la séquence (ou de son titre seul) ; avec les sous-titres, entre le titre et eux.
    const anchorTop = scene.text
      ? (scene.heading ? (vertical ? 0.74 : 0.76) : 0.5) - (vertical ? 0.24 : 0.2) / 2
      : 0.46 - 0.18 / 2;
    const iconAt = iconStart(b, voice, scene.iconName, cursor + 6, cursor + duration);
    const place: IconPlace = caption ? { x: reserve ? 0.66 : 0.5, y: reserve ? 0.4 : vertical ? 0.44 : 0.48, side: vertical ? 0.26 : 0.2 } : { bottom: anchorTop - 0.01, side: 0.15 };
    iconSlot(b, scene.icon, iconAt, cursor + duration - iconAt, place);
    cursor += duration;
  });

  if (data.outro) {
    const outro = b.fit(2.5, data.voice?.outro, 0.8);
    background(b, cursor, outro, undefined, data.scenes.length, 0, cueOf(data.scenes.length + 1, { emotion: data.outroEmotion ?? "joy" }, "end"));
    b.narrate(data.voice?.outro, cursor + 4);
    b.add("Textes", text(b, data.outro, cursor, outro, { role: "title", y: reserve ? 0.3 : 0.46, height: 0.24, size: vertical ? 0.06 : 0.09 }));
  }
  return b.build();
}

// ─── Avant / Après ───────────────────────────────────────────────

export interface BeforeAfterTiming {
  /** Temps passé sur l'image « avant ». */
  before: number;
  /** Durée du balayage vers l'image « après ». */
  wipe: number;
  /** Temps passé sur l'image « après », une fois le balayage fini. */
  after: number;
}

export const DEFAULT_BEFORE_AFTER_TIMING: BeforeAfterTiming = { before: 1.5, wipe: 1.2, after: 2 };

/** Image plein cadre, immobile : les deux images d'une paire doivent se superposer exactement. */
function still(start: number, duration: number, source: MediaSource, animIn: ImageItem["animIn"]): ImageItem {
  return {
    id: uid("i-"),
    type: "image",
    start,
    duration,
    source,
    fit: "cover",
    motion: "none",
    radius: 0,
    transform: { x: 0.5, y: 0.5, width: 1, height: 1, rotation: 0, opacity: 1 },
    animIn,
    animOut: { kind: "none", frames: 10 },
  };
}

/**
 * Paires d'images : l'image « après » recouvre l'image « avant » par un
 * balayage de gauche à droite, sans mouvement de caméra pour que les deux
 * restent alignées.
 */
export function buildBeforeAfter(
  name: string,
  aspect: AspectPreset,
  data: BeforeAfterData,
  timing: BeforeAfterTiming = DEFAULT_BEFORE_AFTER_TIMING
): ClipProject {
  const b = new Builder(createProject(name, aspect));
  const vertical = aspect === "9:16" || aspect === "4:5";
  let cursor = 0;

  if (data.title) {
    const intro = b.seconds(2.5);
    background(b, cursor, intro, data.pairs[0]?.before, 0, 0);
    b.add("Textes", text(b, data.title, cursor, intro, { role: "title", y: 0.46, height: 0.26, size: vertical ? 0.065 : 0.09 }));
    cursor += intro;
  }

  const hold = b.seconds(timing.before);
  const wipe = b.seconds(timing.wipe);
  const total = hold + wipe + b.seconds(timing.after);
  /** Étiquette « Avant » (neutre, sans rang) ou « Après » (teinte du segment). */
  const label = (content: string, start: number, duration: number, x: number, accent?: number) => {
    const item = text(b, content, start, duration, {
      role: "label",
      y: vertical ? 0.08 : 0.1,
      width: 0.34,
      height: vertical ? 0.06 : 0.08,
      size: vertical ? 0.028 : 0.04,
      accent,
      animIn: "pop",
    });
    item.transform.x = x;
    return item;
  };

  data.pairs.forEach((pair, index) => {
    const accent = index;
    const swap = cursor + hold;

    if (pair.before) b.add("Principale", still(cursor, total, pair.before, { kind: "fade", frames: 8 }));
    else b.add("Principale", box(b, cursor, total, { y: 0.5, height: 1, width: 1 }, "#52525b", { radius: 0, animIn: "fade" }));
    if (pair.after) {
      b.add("Après", still(swap, total - hold, pair.after, { kind: "wipe", frames: wipe }));
    } else {
      // Sans image, un aplat coloré montre tout de même le balayage.
      const plate = box(b, swap, total - hold, { y: 0.5, height: 1, width: 1 }, shade(accentOf(null, accent), -0.35), { radius: 0 });
      plate.animIn = { kind: "wipe", frames: wipe };
      b.add("Après", plate);
    }

    b.add("Textes", label("Avant", cursor, hold + wipe, 0.24));
    b.add("Textes", label("Après", swap + wipe, total - hold - wipe, 0.76, accent));
    if (pair.caption) {
      b.add("Textes", text(b, pair.caption, cursor + 6, total - 6, {
        role: "caption",
        y: vertical ? 0.86 : 0.88,
        height: 0.14,
        size: vertical ? 0.036 : 0.048,
        animIn: "slide-up",
      }));
    }
    cursor += total;
  });

  if (data.outro) {
    const outro = b.seconds(2.5);
    background(b, cursor, outro, undefined, data.pairs.length, 0);
    b.add("Textes", text(b, data.outro, cursor, outro, { role: "title", y: 0.46, height: 0.24, size: vertical ? 0.06 : 0.09 }));
  }
  return b.build();
}

// ─── Recettes d'une sélection de la galerie ──────────────────────

/**
 * - Diaporama : 3 s par image, mouvement de caméra lent alterné, fondus
 *   enchaînés de 0,6 s ;
 * - Rythmé : 1,2 s par image, coupes franches, zooms courts.
 * Une vidéo garde sa durée en diaporama et se limite à 2,4 s en rythmé.
 */
export type SequenceRecipe = "slideshow" | "rhythm";

const SLOW_MOTIONS = ["zoom-in", "pan-right", "zoom-out", "pan-left"] as const;
const PUNCHY_MOTIONS = ["zoom-in", "zoom-out"] as const;

export function buildSequence(
  name: string,
  aspect: AspectPreset,
  sources: MediaSource[],
  recipe: SequenceRecipe,
  theme: BrandTheme | null = null
): ClipProject {
  const project = createProject(name, aspect);
  const fps = project.fps;
  const rhythm = recipe === "rhythm";
  let start = 0;
  const items = sources.map((source, index) => {
    let item: ImageItem | VideoItem;
    if (source.kind === "video") {
      item = createVideoItem(source, start, fps);
      if (rhythm) item.duration = Math.min(item.duration, Math.round(2.4 * fps));
    } else {
      item = createImageItem(source, start, fps);
      item.duration = Math.round((rhythm ? 1.2 : 3) * fps);
      item.motion = rhythm ? PUNCHY_MOTIONS[index % PUNCHY_MOTIONS.length] : SLOW_MOTIONS[index % SLOW_MOTIONS.length];
    }
    if (rhythm) {
      item.animIn = { kind: "none", frames: 1 };
    } else if (index > 0) {
      // Le fondu enchaîné remplace l'apparition : le plan précédent reste dessous.
      item.animIn = { kind: "none", frames: 1 };
      item.transition = { kind: "fade", frames: Math.round(0.6 * fps) };
    }
    start += item.duration;
    return item;
  });
  const built = appendSequence(project, items);
  return theme ? applyBrandTheme(built, theme) : built;
}

// ─── Exemples, pour un modèle rempli à la main ───────────────────

export const SAMPLE_QUIZ: QuizData = {
  title: "Quiz animaux",
  questions: [
    { question: "Quel animal dort debout ?", choices: ["Le cheval", "Le chat", "Le lapin"], answer: 0, explanation: "Le cheval verrouille ses articulations pour dormir debout." },
    { question: "Combien de cœurs a une pieuvre ?", choices: ["Un", "Deux", "Trois"], answer: 2, explanation: "Deux pour les branchies, un pour le reste du corps." },
    { question: "Quel oiseau ne vole pas ?", choices: ["Le moineau", "Le manchot", "L'aigle"], answer: 1 },
  ],
};

export const SAMPLE_TOP: TopData = {
  title: "Top 3 des animaux les plus rapides",
  entries: [
    { title: "Le lévrier", detail: "72 km/h en pointe" },
    { title: "Le guépard", detail: "Jusqu'à 110 km/h" },
    { title: "Le faucon pèlerin", detail: "Plus de 300 km/h en piqué" },
  ],
  outro: "Tu les connaissais ?",
};

export const SAMPLE_SLIDESHOW: SlideshowData = {
  title: "Mes meilleurs moments",
  slides: [{ caption: "Première image" }, { caption: "Deuxième image" }, { caption: "Troisième image" }],
  outro: "À bientôt",
};

export const SAMPLE_FREE: FreeData = {
  title: "Trois astuces pour mieux dormir",
  scenes: [
    { heading: "Une heure fixe", text: "Se coucher et se lever à la même heure, même le week-end." },
    { heading: "Moins d’écrans", text: "Poser le téléphone trente minutes avant de dormir." },
    { heading: "Une chambre fraîche", text: "Entre 16 et 19 degrés, le corps s’endort plus vite." },
  ],
  outro: "Laquelle vas-tu essayer ?",
};

export const SAMPLE_BEFORE_AFTER: BeforeAfterData = {
  title: "Avant / Après",
  pairs: [{ caption: "Première transformation" }, { caption: "Deuxième transformation" }],
  outro: "Laquelle préfères-tu ?",
};

/** Réglages d'un montage par une marque ou par l'assistant. */
export interface BuildOptions {
  /**
   * Rythme du montage (D3). Absent : celui de la marque ; sans marque ni
   * rythme, le modèle est monté comme avant, au pixel près. « calm » garde le
   * montage d'avant, avec la place réservée à la mascotte.
   */
  pace?: EditPace;
}

/**
 * Construit un projet depuis un modèle. Avec une image de marque, le projet
 * est monté avec le thème par défaut puis habillé par `applyBrandTheme` :
 * une seule façon d'appliquer une marque, au montage comme après coup.
 *
 * Quand une marque ou l'assistant crée le clip (un rythme est connu), le
 * montage gagne la direction artistique des vidéos (dossier 07 sexies) :
 * place réservée à la mascotte, sous-titres mot à mot, icône sur le mot qui
 * la nomme, plans découpés toutes les 1 à 2,5 s, bruitages sur les temps
 * forts. Ce sont des éléments et des pistes ordinaires, que l'éditeur
 * retouche ; un projet existant ouvert tel quel n'en reçoit aucun.
 */
export function buildFromTemplate(
  template: TemplateId,
  name: string,
  aspect: AspectPreset,
  data: FreeData | QuizData | TopData | SlideshowData | BeforeAfterData,
  theme: BrandTheme | null = null,
  options: BuildOptions = {}
): ClipProject {
  const pace = options.pace ?? theme?.pace;
  // L'Avant / Après garde ses deux images immobiles et alignées : ni découpe ni secousse.
  const lively = pace !== undefined && pace !== "calm" && template !== "before-after";
  const layout: TemplateLayout =
    pace === undefined ? {} : { captions: lively, onWord: lively, mascot: Boolean(theme?.mascot?.library?.length) };
  let project =
    template === "free"
      ? buildFree(name, aspect, data as FreeData, layout)
      : template === "quiz"
        ? buildQuiz(name, aspect, data as QuizData, DEFAULT_QUIZ_TIMING, layout)
        : template === "top"
          ? buildTop(name, aspect, data as TopData, layout)
          : template === "before-after"
            ? buildBeforeAfter(name, aspect, data as BeforeAfterData)
            : buildSlideshow(name, aspect, data as SlideshowData, layout);
  if (lively) project = cutShots(project, pace);
  if (theme) project = applyBrandTheme(project, theme);
  if (lively) project = fillStills(addBeats(project, pace), pace);
  return project;
}
