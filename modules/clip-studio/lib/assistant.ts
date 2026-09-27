/**
 * Assistant IA : « fais-moi un short quiz sur les animaux ».
 *
 * Trois étapes, suivies par l'interface :
 * 1. script : Codex CLI écrit le contenu, en JSON, selon le modèle choisi ;
 * 2. illustrations : une image par segment, demandée à la file d'AI Image Gen
 *    (elles apparaissent aussi dans son fil) ;
 * 3. narration : chaque segment est lu par une voix de synthèse (Piper) ;
 * 4. montage : le modèle transforme le tout en projet, prêt à retoucher, en
 *    allongeant chaque segment pour laisser le temps à la voix.
 */

import fs from "fs";
import path from "path";
import { apiModuleManager } from "@/lib/modules/module-manager.api";
import {
  buildFromTemplate,
  type QuizData,
  type SlideshowData,
  type TemplateId,
  type TopData,
  type VoiceClip,
} from "../engine/templates";
import type { AspectPreset, MediaSource } from "../engine/types";
import { addItem, createMusicItems } from "../engine/edit";
import { projectDuration } from "../engine/timeline";
import { askCodex, extractJson } from "./codex";
import { MOODS, pickTrack } from "./music";
import { synthesize, VOICES } from "./tts";
import { DATA_DIR, ensureDirs, writeProject } from "./store";

/** L'assistant écrit et illustre lui-même : l'Avant / Après, fait d'images fournies, n'en fait pas partie. */
export type AssistantTemplate = Exclude<TemplateId, "before-after">;

const ASSISTANT_TEMPLATES: readonly TemplateId[] = ["quiz", "top", "slideshow"];

export interface AssistantRequest {
  brief: string;
  template: AssistantTemplate;
  aspect: AspectPreset;
  count: number;
  images: boolean;
  /** Voix de narration ; absente, le clip reste muet. */
  voice?: string;
  /** Musique de fond : une ambiance, ou « auto » pour laisser le script choisir. */
  music?: string;
}

type StepId = "script" | "images" | "narration" | "montage";
type StepState = "pending" | "running" | "done" | "error" | "skipped";

export interface AssistantJob {
  id: string;
  status: "running" | "done" | "error" | "canceled";
  request: AssistantRequest;
  steps: { id: StepId; label: string; state: StepState; detail?: string }[];
  /** Titre trouvé par le script, affiché dès qu'il est connu. */
  title?: string;
  images: { total: number; done: number; failed: number };
  projectId?: string;
  error?: string;
  createdAt: number;
  finishedAt?: number;
}

const JOBS_FILE = path.join(DATA_DIR, "assistant.json");
const IMAGE_TIMEOUT_MS = 20 * 60 * 1000;

const controllers = new Map<string, { abort: AbortController; imageJobs: string[] }>();

function readJobs(): AssistantJob[] {
  try {
    return JSON.parse(fs.readFileSync(JOBS_FILE, "utf-8"));
  } catch {
    return [];
  }
}

function writeJobs(jobs: AssistantJob[]) {
  ensureDirs();
  const temporary = `${JOBS_FILE}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(jobs.slice(0, 20), null, 2));
  fs.renameSync(temporary, JOBS_FILE);
}

function save(job: AssistantJob) {
  writeJobs([job, ...readJobs().filter((entry) => entry.id !== job.id)]);
}

export function listAssistantJobs(): AssistantJob[] {
  // Un travail « en cours » sans contrôleur a été interrompu par un redémarrage.
  return readJobs().map((job) =>
    job.status === "running" && !controllers.has(job.id)
      ? { ...job, status: "error", error: "Interrompu par un redémarrage du serveur" }
      : job
  );
}

export function getAssistantJob(id: string): AssistantJob | null {
  return listAssistantJobs().find((job) => job.id === id) ?? null;
}

export function cancelAssistantJob(id: string) {
  const controller = controllers.get(id);
  if (!controller) return;
  controller.abort.abort();
  for (const jobId of controller.imageJobs) {
    void apiModuleManager.callModuleFunction("ai-image-gen", "cancelGeneration", jobId).catch(() => undefined);
  }
}

// ─── Démarrage ───────────────────────────────────────────────────

/**
 * Travaux simultanés. Chacun lance Codex et jusqu'à dix illustrations sur
 * les moteurs payants d'AI Image Gen.
 */
const MAX_RUNNING_JOBS = 2;

export function startAssistant(request: AssistantRequest): AssistantJob {
  if (controllers.size >= MAX_RUNNING_JOBS) {
    throw new Error("Deux créations sont déjà en cours : attendez qu'une se termine.");
  }
  const clean: AssistantRequest = {
    brief: String(request.brief ?? "").trim().slice(0, 600),
    template: ASSISTANT_TEMPLATES.includes(request.template) ? request.template : "quiz",
    aspect: (["9:16", "16:9", "1:1", "4:5"] as const).includes(request.aspect) ? request.aspect : "9:16",
    count: Math.min(10, Math.max(2, Math.round(Number(request.count) || 5))),
    images: Boolean(request.images),
    voice: VOICES.some((voice) => voice.id === request.voice) ? request.voice : undefined,
    music: request.music === "auto" || (MOODS as readonly string[]).includes(String(request.music)) ? request.music : undefined,
  };
  if (clean.brief.length < 3) throw new Error("Décrivez le short à créer.");

  const job: AssistantJob = {
    id: `asst-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    status: "running",
    request: clean,
    steps: [
      { id: "script", label: "Écriture du script", state: "pending" },
      { id: "images", label: "Création des illustrations", state: clean.images ? "pending" : "skipped" },
      { id: "narration", label: "Enregistrement de la voix", state: clean.voice ? "pending" : "skipped" },
      { id: "montage", label: "Montage du clip", state: "pending" },
    ],
    images: { total: 0, done: 0, failed: 0 },
    createdAt: Date.now(),
  };
  save(job);

  const abort = new AbortController();
  controllers.set(job.id, { abort, imageJobs: [] });
  void run(job, abort.signal).finally(() => controllers.delete(job.id));
  return job;
}

async function run(job: AssistantJob, signal: AbortSignal) {
  const step = (id: StepId, state: StepState, detail?: string) => {
    job.steps = job.steps.map((entry) => (entry.id === id ? { ...entry, state, detail } : entry));
    save(job);
  };

  try {
    // 1. Script
    step("script", "running", "Codex rédige le contenu…");
    const answer = await askCodex(scriptPrompt(job.request), { signal });
    const script = sanitize(job.request, extractJson<RawScript>(answer));
    job.title = script.title;
    step("script", "done", `« ${script.title} »`);

    // 2. Illustrations
    const prompts = segmentPrompts(job.request.template, script);
    const images: (MediaSource | undefined)[] = [];
    if (job.request.images && prompts.length) {
      step("images", "running", `0 sur ${prompts.length}`);
      job.images.total = prompts.length;
      images.push(...(await generateImages(job, prompts, signal, () => {
        step("images", "running", `${job.images.done} sur ${job.images.total}${job.images.failed ? `, ${job.images.failed} échec(s)` : ""}`);
      })));
      step("images", job.images.done > 0 ? "done" : "error", `${job.images.done} sur ${job.images.total}`);
    }

    // 3. Narration
    let data = attachImages(job.request.template, script, images);
    if (job.request.voice) {
      const lines = narrationLines(job.request.template, data);
      let done = 0;
      step("narration", "running", `0 sur ${lines.length}`);
      const clips: (VoiceClip | undefined)[] = [];
      for (const line of lines) {
        if (signal.aborted) throw new DOMException("Annulé", "AbortError");
        clips.push(await speakLine(line, job.request.voice));
        done++;
        step("narration", "running", `${done} sur ${lines.length}`);
      }
      const recorded = clips.filter(Boolean).length;
      data = attachVoices(job.request.template, data, clips);
      step("narration", recorded > 0 ? "done" : "error", `${recorded} sur ${lines.length}`);
    }

    // 4. Montage
    step("montage", "running");
    let project = buildFromTemplate(job.request.template, script.title, job.request.aspect, data);
    if (job.request.music) {
      const mood = job.request.music === "auto" ? script.mood : job.request.music;
      const end = projectDuration(project);
      const track = pickTrack(mood, (end / project.fps) * 1000);
      if (track?.url) {
        // Sous une voix off, la musique se fait discrète.
        const volume = job.request.voice ? 0.14 : 0.4;
        const source: MediaSource = { url: track.url, ref: `module:clip-studio/resources/music/${track.id}.mp3`, name: `${track.title} – ${track.artist}`, kind: "audio", durationMs: track.durationMs, credit: track.credit };
        for (const item of createMusicItems(source, 0, end, project.fps, volume)) project = addItem(project, item, undefined, "Musique");
      }
    }
    writeProject(project);
    job.projectId = project.id;
    job.status = "done";
    job.finishedAt = Date.now();
    step("montage", "done");
  } catch (error) {
    const aborted = signal.aborted || (error as Error)?.name === "AbortError";
    job.status = aborted ? "canceled" : "error";
    job.error = aborted ? "Annulé" : (error as Error)?.message ?? "Échec de l'assistant";
    job.finishedAt = Date.now();
    job.steps = job.steps.map((entry) => (entry.state === "running" ? { ...entry, state: "error" } : entry));
    save(job);
  }
}

// ─── Script ──────────────────────────────────────────────────────

interface RawScript {
  title?: string;
  subtitle?: string;
  outro?: string;
  mood?: string;
  questions?: { question?: string; choices?: string[]; answer?: number; explanation?: string; imagePrompt?: string }[];
  entries?: { title?: string; detail?: string; imagePrompt?: string }[];
  slides?: { caption?: string; imagePrompt?: string }[];
}

const IMAGE_GUIDE =
  "imagePrompt : en anglais, une illustration marquante et détaillée du sujet du segment, sans aucun texte ni lettre ni logo dans l'image";

function scriptPrompt(request: AssistantRequest): string {
  const common = [
    "Tu écris le script d'un clip vidéo court pour les réseaux sociaux, en français, avec la typographie française.",
    `Demande de l'utilisateur : ${request.brief}`,
    "Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour ni bloc de code.",
    "N'utilise aucun outil, n'exécute aucune commande et n'écris aucun fichier.",
    ...(request.music === "auto"
      ? [`Ajoute au JSON une clé "mood" : l'ambiance musicale la plus adaptée, parmi ${MOODS.join(", ")}.`]
      : []),
  ];
  if (request.template === "quiz") {
    return [
      ...common,
      `Format : un quiz de ${request.count} questions.`,
      'Schéma : {"title": string, "subtitle": string, "questions": [{"question": string, "choices": [string, string, string], "answer": number, "explanation": string, "imagePrompt": string}], "outro": string}',
      "Contraintes : title accrocheur de 40 caractères au plus ; question de 80 caractères au plus ; 3 choix de 26 caractères au plus ; answer est l'index (0, 1 ou 2) de la bonne réponse, à varier d'une question à l'autre ; explanation de 70 caractères au plus, qui apprend quelque chose ; outro de 40 caractères au plus.",
      "Les questions doivent être exactes, vérifiables et de difficulté croissante.",
      IMAGE_GUIDE + ", qui ne révèle pas la réponse.",
    ].join("\n");
  }
  if (request.template === "top") {
    return [
      ...common,
      `Format : un classement de ${request.count} éléments, présenté du numéro ${request.count} au numéro 1.`,
      'Schéma : {"title": string, "entries": [{"title": string, "detail": string, "imagePrompt": string}], "outro": string}',
      `Contraintes : entries dans l'ordre d'apparition, le premier est le numéro ${request.count} et le dernier le numéro 1 ; title de 45 caractères au plus ; chaque title d'entrée de 30 caractères au plus ; detail de 50 caractères au plus, précis et vérifiable ; outro de 40 caractères au plus.`,
      IMAGE_GUIDE + ".",
    ].join("\n");
  }
  return [
    ...common,
    `Format : un diaporama narratif de ${request.count} diapositives.`,
    'Schéma : {"title": string, "slides": [{"caption": string, "imagePrompt": string}], "outro": string}',
    "Contraintes : title de 40 caractères au plus ; caption de 70 caractères au plus ; outro de 40 caractères au plus.",
    IMAGE_GUIDE + ".",
  ].join("\n");
}

const cut = (value: unknown, max: number) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

type CleanScript = (QuizData | TopData | SlideshowData) & { title: string; prompts: string[]; mood?: string };

function sanitize(request: AssistantRequest, raw: RawScript): CleanScript {
  const title = cut(raw.title, 60) || "Mon short";
  const mood = (MOODS as readonly string[]).includes(String(raw.mood)) ? String(raw.mood) : undefined;
  if (request.template === "quiz") {
    const questions = (raw.questions ?? [])
      .map((question) => {
        const choices = (question.choices ?? []).map((choice) => cut(choice, 40)).filter(Boolean).slice(0, 4);
        const answer = Math.round(Number(question.answer));
        return {
          question: cut(question.question, 120),
          choices,
          answer: answer >= 0 && answer < choices.length ? answer : 0,
          explanation: cut(question.explanation, 110) || undefined,
          imagePrompt: cut(question.imagePrompt, 500),
        };
      })
      .filter((question) => question.question && question.choices.length >= 2)
      .slice(0, request.count);
    if (questions.length === 0) throw new Error("Le script reçu ne contient aucune question exploitable.");
    return {
      title,
      mood,
      subtitle: cut(raw.subtitle, 80) || undefined,
      outro: cut(raw.outro, 60) || undefined,
      questions,
      prompts: questions.map((question) => question.imagePrompt),
    };
  }
  if (request.template === "top") {
    const entries = (raw.entries ?? [])
      .map((entry) => ({ title: cut(entry.title, 50), detail: cut(entry.detail, 80) || undefined, imagePrompt: cut(entry.imagePrompt, 500) }))
      .filter((entry) => entry.title)
      .slice(0, request.count);
    if (entries.length === 0) throw new Error("Le script reçu ne contient aucun élément exploitable.");
    return { title, mood, outro: cut(raw.outro, 60) || undefined, entries, prompts: entries.map((entry) => entry.imagePrompt) };
  }
  const slides = (raw.slides ?? [])
    .map((slide) => ({ caption: cut(slide.caption, 110) || undefined, imagePrompt: cut(slide.imagePrompt, 500) }))
    .slice(0, request.count);
  if (slides.length === 0) throw new Error("Le script reçu ne contient aucune diapositive.");
  return { title, mood, outro: cut(raw.outro, 60) || undefined, slides, prompts: slides.map((slide) => slide.imagePrompt) };
}

function segmentPrompts(_template: TemplateId, script: CleanScript): string[] {
  return script.prompts.map((prompt) => prompt || script.title);
}

function attachImages(template: TemplateId, script: CleanScript, images: (MediaSource | undefined)[]) {
  if (template === "quiz") {
    const data = script as QuizData & CleanScript;
    return { ...data, questions: data.questions.map((question, index) => ({ ...question, image: images[index] })) };
  }
  if (template === "top") {
    const data = script as TopData & CleanScript;
    return { ...data, entries: data.entries.map((entry, index) => ({ ...entry, image: images[index] })) };
  }
  const data = script as SlideshowData & CleanScript;
  return { ...data, slides: data.slides.map((slide, index) => ({ ...slide, image: images[index] })) };
}

// ─── Narration ───────────────────────────────────────────────────

/**
 * Textes lus, dans un ordre fixe que `attachVoices` relit :
 * - quiz : intro, puis question et réponse pour chaque question, puis outro ;
 * - classement : intro, un texte par élément, outro ;
 * - diaporama : intro, une légende par diapositive, outro.
 * Une chaîne vide garde sa place mais ne sera pas lue.
 */
function narrationLines(template: TemplateId, data: QuizData | TopData | SlideshowData): string[] {
  const sentence = (value: string | undefined) => {
    const text = (value ?? "").trim();
    return text && !/[.!?…]$/.test(text) ? `${text}.` : text;
  };
  if (template === "quiz") {
    const quiz = data as QuizData;
    const letters = ["A", "B", "C", "D"];
    return [
      [sentence(quiz.title), sentence(quiz.subtitle)].filter(Boolean).join(" "),
      ...quiz.questions.flatMap((question, index) => [
        `Question ${index + 1}. ${sentence(question.question)} ${question.choices
          .map((choice, choiceIndex) => `${letters[choiceIndex]}, ${sentence(choice)}`)
          .join(" ")}`,
        `Réponse ${letters[question.answer]} : ${sentence(question.choices[question.answer])} ${sentence(question.explanation)}`.trim(),
      ]),
      sentence(quiz.outro),
    ];
  }
  if (template === "top") {
    const top = data as TopData;
    const count = top.entries.length;
    return [
      sentence(top.title),
      ...top.entries.map((entry, index) => `Numéro ${count - index}. ${sentence(entry.title)} ${sentence(entry.detail)}`.trim()),
      sentence(top.outro),
    ];
  }
  const slideshow = data as SlideshowData;
  return [sentence(slideshow.title), ...slideshow.slides.map((slide) => sentence(slide.caption)), sentence(slideshow.outro)];
}

/** Une ligne ratée ne bloque pas le clip : le segment reste simplement muet. */
async function speakLine(text: string, voice: string): Promise<VoiceClip | undefined> {
  if (!text) return undefined;
  try {
    const { asset, durationMs, words } = await synthesize({ text, voice });
    if (!durationMs) return undefined;
    return {
      durationMs,
      source: {
        url: `/api/modules/clip-studio/data/assets/${asset.file}`,
        ref: `module:clip-studio/assets/${asset.file}`,
        name: asset.originalName,
        kind: "audio",
        durationMs,
        credit: asset.credit,
        words,
      },
    };
  } catch {
    return undefined;
  }
}

function attachVoices<T extends QuizData | TopData | SlideshowData>(template: TemplateId, data: T, clips: (VoiceClip | undefined)[]): T {
  const last = clips.length - 1;
  const voice = { intro: clips[0], outro: clips[last] };
  if (template === "quiz") {
    const quiz = data as QuizData;
    return {
      ...quiz,
      voice,
      questions: quiz.questions.map((question, index) => ({
        ...question,
        voice: { question: clips[1 + index * 2], reveal: clips[2 + index * 2] },
      })),
    } as T;
  }
  if (template === "top") {
    const top = data as TopData;
    return { ...top, voice, entries: top.entries.map((entry, index) => ({ ...entry, voice: clips[1 + index] })) } as T;
  }
  const slideshow = data as SlideshowData;
  return { ...slideshow, voice, slides: slideshow.slides.map((slide, index) => ({ ...slide, voice: clips[1 + index] })) } as T;
}

// ─── Illustrations via AI Image Gen ──────────────────────────────

interface ImageGenJob {
  id: string;
  status: "queued" | "running" | "done" | "error" | "canceled";
  historyIds: string[];
}

function imageSize(aspect: AspectPreset) {
  if (aspect === "16:9") return "1536x1024";
  if (aspect === "1:1") return "1024x1024";
  return "1024x1536";
}

async function chooseModel(): Promise<string> {
  const settings = apiModuleManager.getLoadedModule("ai-image-gen")?.config.settings as { default_model?: string } | undefined;
  const catalogue = (await apiModuleManager.callModuleFunction("ai-image-gen", "getCatalogue")) as
    | { models: { id: string; available: boolean }[] }
    | null;
  if (!catalogue) throw new Error("AI Image Gen n'est pas disponible pour créer les illustrations.");
  const preferred = catalogue.models.find((model) => model.id === settings?.default_model && model.available);
  const fallback = catalogue.models.find((model) => model.available);
  const chosen = preferred ?? fallback;
  if (!chosen) throw new Error("Aucun moteur d'image n'est disponible dans AI Image Gen.");
  return chosen.id;
}

async function generateImages(
  job: AssistantJob,
  prompts: string[],
  signal: AbortSignal,
  onProgress: () => void
): Promise<(MediaSource | undefined)[]> {
  const model = await chooseModel();
  const controller = controllers.get(job.id);
  const size = imageSize(job.request.aspect);

  const queued: (string | null)[] = [];
  for (const prompt of prompts) {
    try {
      const enqueued = (await apiModuleManager.callModuleFunction("ai-image-gen", "enqueueGeneration", {
        prompt: `${prompt}. Cinematic lighting, rich detail, no text, no letters, no watermark.`,
        model,
        size,
        quality: "medium",
        n: 1,
      })) as ImageGenJob;
      queued.push(enqueued.id);
      controller?.imageJobs.push(enqueued.id);
    } catch {
      queued.push(null);
      job.images.failed++;
    }
  }
  onProgress();

  const results: (MediaSource | undefined)[] = prompts.map(() => undefined);
  const pending = new Set(queued.map((id, index) => (id ? index : -1)).filter((index) => index >= 0));
  const deadline = Date.now() + IMAGE_TIMEOUT_MS;

  while (pending.size && Date.now() < deadline) {
    if (signal.aborted) throw new DOMException("Annulé", "AbortError");
    await new Promise((resolve) => setTimeout(resolve, 3000));
    for (const index of [...pending]) {
      const state = (await apiModuleManager.callModuleFunction("ai-image-gen", "getJobById", queued[index])) as ImageGenJob | null;
      if (!state || state.status === "queued" || state.status === "running") continue;
      pending.delete(index);
      if (state.status === "done" && state.historyIds[0]) {
        const history = (await apiModuleManager.callModuleFunction("ai-image-gen", "getHistory", 100)) as
          | { id: string; imageFiles: string[]; size: string }[]
          | null;
        const item = history?.find((entry) => entry.id === state.historyIds[0]);
        const file = item?.imageFiles[0];
        if (file) {
          const [width, height] = (item?.size ?? size).split("x").map(Number);
          results[index] = {
            url: `/api/modules/ai-image-gen/data/images/${file}`,
            ref: `module:ai-image-gen/images/${file}`,
            name: file,
            kind: "image",
            width,
            height,
          };
          job.images.done++;
        } else {
          job.images.failed++;
        }
      } else {
        job.images.failed++;
      }
      onProgress();
    }
  }
  // Délai dépassé : les images manquantes laissent place à un fond coloré.
  job.images.failed += pending.size;
  return results;
}
