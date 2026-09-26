/**
 * Modèles de projet : des données structurées deviennent un clip monté.
 *
 * Fonctions pures, utilisables dans le navigateur (modèle rempli à la main)
 * comme sur le serveur (assistant IA). Les positions sont relatives au
 * canevas : un même modèle fonctionne en 9:16, 16:9, 1:1 ou 4:5.
 */

import {
  TEXT_PRESETS,
  createProject,
  createTextItem,
  uid,
} from "./edit";
import type {
  AspectPreset,
  ClipItem,
  ClipProject,
  ImageItem,
  MediaSource,
  ShapeItem,
  TextItem,
  TextStyle,
  Track,
} from "./types";

export type TemplateId = "quiz" | "top" | "slideshow";

export interface QuizQuestion {
  question: string;
  choices: string[];
  /** Index de la bonne réponse dans `choices`. */
  answer: number;
  explanation?: string;
  image?: MediaSource;
}

export interface QuizData {
  title: string;
  subtitle?: string;
  questions: QuizQuestion[];
  outro?: string;
}

export interface TopEntry {
  title: string;
  detail?: string;
  image?: MediaSource;
}

export interface TopData {
  title: string;
  /** Du premier affiché au dernier : le numéro 1 arrive en dernier. */
  entries: TopEntry[];
  outro?: string;
}

export interface SlideshowData {
  title?: string;
  slides: { caption?: string; image?: MediaSource }[];
  outro?: string;
}

/** Couleurs d'accent, une par segment : chaque question a sa teinte. */
const ACCENTS = ["#8b5cf6", "#0ea5e9", "#f97316", "#10b981", "#ec4899", "#eab308"];

// ─── Pistes nommées ──────────────────────────────────────────────

/**
 * Un modèle range ses éléments par couche, de la plus haute à la plus
 * basse : textes au-dessus des surlignages, eux-mêmes au-dessus des cadres,
 * eux-mêmes au-dessus du fond.
 */
const LAYERS = ["Textes", "Surlignage", "Cadres", "Voile", "Principale"] as const;
type Layer = (typeof LAYERS)[number];

class Builder {
  private tracks = new Map<Layer | "Audio", Track>();

  constructor(readonly project: ClipProject) {
    for (const layer of LAYERS) {
      this.tracks.set(layer, { id: uid("t-"), kind: "visual", name: layer, items: [] });
    }
    this.tracks.set("Audio", { id: uid("t-"), kind: "audio", name: "Audio", items: [] });
  }

  get fps() {
    return this.project.fps;
  }

  seconds(value: number) {
    return Math.round(value * this.fps);
  }

  add(layer: Layer | "Audio", item: ClipItem) {
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
      if (lanes.length === 0 && (name === "Principale" || name === "Audio")) {
        lanes.push({ ...layer, items: [] });
      }
      tracks.push(...lanes);
    }
    return { ...this.project, tracks, updatedAt: Date.now() };
  }
}

// ─── Éléments de base ────────────────────────────────────────────

function styleOf(presetId: string, patch: Partial<TextStyle> = {}): TextStyle {
  const preset = TEXT_PRESETS.find((entry) => entry.id === presetId) ?? TEXT_PRESETS[0];
  return { ...structuredClone(preset.style), ...patch };
}

function text(
  b: Builder,
  content: string,
  start: number,
  duration: number,
  options: {
    preset?: string;
    style?: Partial<TextStyle>;
    y?: number;
    height?: number;
    width?: number;
    animIn?: TextItem["animIn"]["kind"];
    animOut?: TextItem["animOut"]["kind"];
  } = {}
): TextItem {
  const item = createTextItem(options.preset ?? "impact", start, b.fps, content);
  item.duration = duration;
  item.style = styleOf(options.preset ?? "impact", options.style);
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

function box(
  b: Builder,
  start: number,
  duration: number,
  geometry: { y: number; height: number; width?: number },
  fill: string,
  options: { opacity?: number; radius?: number; animIn?: ShapeItem["animIn"]["kind"] } = {}
): ShapeItem {
  return {
    id: uid("s-"),
    type: "shape",
    shape: "rect",
    start,
    duration,
    fill,
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

/** Fond d'un segment : l'image fournie, sinon un aplat coloré. */
function background(b: Builder, start: number, duration: number, image: MediaSource | undefined, accent: string, motionIndex: number) {
  if (image) {
    const item: ImageItem = {
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
    // Voile sombre : le texte reste lisible sur n'importe quelle image.
    b.add("Voile", box(b, start, duration, { y: 0.5, height: 1, width: 1 }, "#000000", { opacity: 0.42, radius: 0, animIn: "none" }));
  } else {
    b.add("Principale", box(b, start, duration, { y: 0.5, height: 1, width: 1 }, shade(accent, -0.55), { radius: 0, animIn: "fade" }));
  }
}

/** Assombrit (valeur négative) ou éclaircit une couleur hexadécimale. */
function shade(hex: string, amount: number): string {
  const value = Number.parseInt(hex.slice(1), 16);
  const channel = (shift: number) => {
    const c = (value >> shift) & 255;
    const target = amount < 0 ? 0 : 255;
    return Math.round(c + (target - c) * Math.abs(amount));
  };
  return `#${[16, 8, 0].map((shift) => channel(shift).toString(16).padStart(2, "0")).join("")}`;
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
  timing: QuizTiming = DEFAULT_QUIZ_TIMING
): ClipProject {
  const b = new Builder(createProject(name, aspect));
  const vertical = aspect === "9:16" || aspect === "4:5";
  let cursor = 0;

  // Intro
  const intro = b.seconds(timing.intro);
  background(b, cursor, intro, data.questions[0]?.image, ACCENTS[0], 0);
  b.add("Textes", text(b, data.title, cursor, intro, { preset: "impact", y: vertical ? 0.42 : 0.4, height: 0.24, style: { size: vertical ? 0.07 : 0.1 } }));
  b.add("Textes", text(b, data.subtitle ?? "Réponds avant la fin du compte à rebours !", cursor + 6, intro - 6, {
    preset: "caption",
    y: vertical ? 0.58 : 0.62,
    style: { size: vertical ? 0.032 : 0.045 },
    animIn: "slide-up",
  }));
  cursor += intro;

  data.questions.forEach((question, index) => {
    const accent = ACCENTS[index % ACCENTS.length];
    const think = b.seconds(timing.think);
    const reveal = b.seconds(timing.reveal);
    const total = think + reveal;
    background(b, cursor, total, question.image, accent, index + 1);

    // Numéro de la question
    b.add("Textes", text(b, `Question ${index + 1}/${data.questions.length}`, cursor, total, {
      preset: "boxed",
      y: vertical ? 0.1 : 0.1,
      width: 0.6,
      height: 0.07,
      style: { size: vertical ? 0.028 : 0.042, background: { color: accent, padding: 0.4, radius: 0.35 }, color: "#ffffff" },
      animIn: "slide-down",
    }));

    // Question
    b.add("Textes", text(b, question.question, cursor + 4, total - 4, {
      preset: "caption",
      y: vertical ? 0.27 : 0.27,
      height: vertical ? 0.2 : 0.22,
      style: { size: vertical ? 0.042 : 0.06 },
    }));

    // Choix
    const choices = question.choices.slice(0, 4);
    const rowHeight = vertical ? 0.075 : 0.1;
    const gap = vertical ? 0.022 : 0.03;
    const firstY = vertical ? 0.5 : 0.48;
    choices.forEach((choice, choiceIndex) => {
      const y = firstY + choiceIndex * (rowHeight + gap);
      const delay = 10 + choiceIndex * 4;
      b.add("Cadres", box(b, cursor + delay, total - delay, { y, height: rowHeight, width: vertical ? 0.86 : 0.7 }, "#ffffff", { opacity: 0.94 }));
      b.add("Textes", text(b, `${String.fromCharCode(65 + choiceIndex)}. ${choice}`, cursor + delay, total - delay, {
        preset: "clean",
        y,
        width: vertical ? 0.8 : 0.64,
        height: rowHeight,
        style: { font: "Poppins", weight: 700, color: "#111111", size: vertical ? 0.03 : 0.042, align: "left", shadow: null },
        animIn: "slide-left",
      }));
      // Révélation : la bonne réponse passe au vert.
      if (choiceIndex === question.answer) {
        b.add("Surlignage", box(b, cursor + think, reveal, { y, height: rowHeight, width: vertical ? 0.86 : 0.7 }, "#22c55e", { animIn: "pop" }));
      }
    });

    // Compte à rebours
    const bar: ShapeItem = {
      id: uid("s-"),
      type: "shape",
      shape: "progress",
      start: cursor + 10,
      duration: think - 10,
      fill: accent,
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
      preset: "caption",
      y: vertical ? 0.88 : 0.9,
      height: 0.12,
      style: { size: vertical ? 0.028 : 0.04, color: "#bbf7d0" },
      animIn: "slide-up",
    }));

    cursor += total;
  });

  // Conclusion
  const outro = b.seconds(timing.outro);
  background(b, cursor, outro, undefined, ACCENTS[data.questions.length % ACCENTS.length], 0);
  b.add("Textes", text(b, data.outro ?? "Combien de bonnes réponses ?", cursor, outro, { preset: "impact", y: 0.44, height: 0.24, style: { size: vertical ? 0.06 : 0.09 } }));
  b.add("Textes", text(b, "Dis-le en commentaire", cursor + 8, outro - 8, { preset: "caption", y: 0.58, style: { size: vertical ? 0.032 : 0.045 }, animIn: "slide-up" }));

  return b.build();
}

// ─── Top N ───────────────────────────────────────────────────────

export function buildTop(name: string, aspect: AspectPreset, data: TopData): ClipProject {
  const b = new Builder(createProject(name, aspect));
  const vertical = aspect === "9:16" || aspect === "4:5";
  let cursor = 0;

  const intro = b.seconds(2.5);
  background(b, cursor, intro, data.entries[0]?.image, ACCENTS[0], 0);
  b.add("Textes", text(b, data.title, cursor, intro, { preset: "impact", y: 0.45, height: 0.26, style: { size: vertical ? 0.07 : 0.1 } }));
  cursor += intro;

  const count = data.entries.length;
  data.entries.forEach((entry, index) => {
    const rank = count - index;
    const accent = ACCENTS[index % ACCENTS.length];
    const duration = b.seconds(rank === 1 ? 4.5 : 3.5);
    background(b, cursor, duration, entry.image, accent, index + 1);
    b.add("Textes", text(b, `#${rank}`, cursor, duration, {
      preset: "impact",
      y: vertical ? 0.2 : 0.22,
      height: 0.2,
      style: { size: vertical ? 0.12 : 0.18, color: rank === 1 ? "#facc15" : "#ffffff" },
      animIn: "zoom",
    }));
    b.add("Textes", text(b, entry.title, cursor + 6, duration - 6, { preset: "impact", y: vertical ? 0.72 : 0.7, height: 0.16, style: { size: vertical ? 0.055 : 0.08 }, animIn: "slide-up" }));
    if (entry.detail) {
      b.add("Textes", text(b, entry.detail, cursor + 12, duration - 12, { preset: "caption", y: vertical ? 0.82 : 0.84, height: 0.12, style: { size: vertical ? 0.03 : 0.042 }, animIn: "fade" }));
    }
    cursor += duration;
  });

  if (data.outro) {
    const outro = b.seconds(2.5);
    background(b, cursor, outro, undefined, ACCENTS[count % ACCENTS.length], 0);
    b.add("Textes", text(b, data.outro, cursor, outro, { preset: "impact", y: 0.46, height: 0.24, style: { size: vertical ? 0.06 : 0.09 } }));
  }
  return b.build();
}

// ─── Diaporama ───────────────────────────────────────────────────

export function buildSlideshow(name: string, aspect: AspectPreset, data: SlideshowData): ClipProject {
  const b = new Builder(createProject(name, aspect));
  const vertical = aspect === "9:16" || aspect === "4:5";
  let cursor = 0;
  if (data.title) {
    const intro = b.seconds(2.5);
    background(b, cursor, intro, data.slides[0]?.image, ACCENTS[0], 0);
    b.add("Textes", text(b, data.title, cursor, intro, { preset: "impact", y: 0.46, height: 0.26, style: { size: vertical ? 0.065 : 0.09 } }));
    cursor += intro;
  }
  data.slides.forEach((slide, index) => {
    const duration = b.seconds(3.5);
    background(b, cursor, duration, slide.image, ACCENTS[index % ACCENTS.length], index + 1);
    if (slide.caption) {
      b.add("Textes", text(b, slide.caption, cursor + 6, duration - 6, { preset: "caption", y: vertical ? 0.8 : 0.84, height: 0.16, style: { size: vertical ? 0.038 : 0.05 }, animIn: "slide-up" }));
    }
    cursor += duration;
  });
  if (data.outro) {
    const outro = b.seconds(2.5);
    background(b, cursor, outro, undefined, ACCENTS[data.slides.length % ACCENTS.length], 0);
    b.add("Textes", text(b, data.outro, cursor, outro, { preset: "impact", y: 0.46, height: 0.24, style: { size: vertical ? 0.06 : 0.09 } }));
  }
  return b.build();
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

export function buildFromTemplate(
  template: TemplateId,
  name: string,
  aspect: AspectPreset,
  data: QuizData | TopData | SlideshowData
): ClipProject {
  if (template === "quiz") return buildQuiz(name, aspect, data as QuizData);
  if (template === "top") return buildTop(name, aspect, data as TopData);
  return buildSlideshow(name, aspect, data as SlideshowData);
}
