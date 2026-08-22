/**
 * File d'attente des générations.
 *
 * Une image passée par un agent CLI demande de trente secondes à plusieurs
 * minutes. Rendre ce délai dans la réponse HTTP condamnerait l'interface à
 * rester bloquée, et le moindre proxy couperait la connexion avant la fin. Le
 * studio dépose donc un travail, puis suit son avancement.
 *
 * Le tout vit en mémoire et se recopie sur le disque à chaque transition :
 * l'état survit à un redémarrage, au moins pour l'affichage de l'historique
 * des travaux.
 */

import fs from "fs";
import path from "path";
import { runGeneration, saveToGallery, upscaleImage } from "./generate";
import { buildEngineConfig } from "./generate";
import { findModel } from "./engines/registry";
import type { LogLine } from "./engines/types";
import {
  IMAGES_DIR,
  ensureDataDirs,
  getSettings,
  randomSlug,
  readHistory,
  readJobs,
  readPipelines,
  removeReferences,
  storeReference,
  writeJobs,
  type Job,
  type JobRequest,
  type Pipeline,
  type PipelineStep,
} from "./store";

/** Travaux conservés dans le journal, terminés compris. */
const JOB_LIMIT = 60;

interface QueueState {
  jobs: Map<string, Job>;
  running: Map<string, AbortController>;
  /** Empêche deux boucles d'ordonnancement de tourner en parallèle. */
  draining: boolean;
}

/**
 * Next.js recharge les modules à chaud en développement. Sans point d'ancrage
 * global, chaque rechargement repartirait avec une file vide pendant qu'une
 * génération tourne encore.
 */
const globalKey = Symbol.for("ai-image-gen.queue");

function state(): QueueState {
  const store = globalThis as Record<symbol, unknown>;
  if (!store[globalKey]) {
    const fresh: QueueState = {
      jobs: new Map(),
      running: new Map(),
      draining: false,
    };
    // Un travail « en cours » relu depuis le disque n'a plus de processus
    // derrière lui : le marquer en échec évite une file bloquée pour toujours.
    for (const job of readJobs()) {
      if (job.status === "running" || job.status === "queued") {
        job.status = "error";
        job.error = "Interrompu par un redémarrage du serveur.";
        job.finishedAt = Date.now();
      }
      fresh.jobs.set(job.id, job);
    }
    store[globalKey] = fresh;
  }
  return store[globalKey] as QueueState;
}

function sortedJobs(): Job[] {
  return [...state().jobs.values()].sort((a, b) => b.createdAt - a.createdAt);
}

function persist() {
  const jobs = sortedJobs().slice(0, JOB_LIMIT);
  const kept = new Set(jobs.map((job) => job.id));
  for (const [id, job] of state().jobs) {
    if (!kept.has(id)) {
      removeReferences(job.request.references);
      state().jobs.delete(id);
    }
  }
  writeJobs(jobs);
}

function log(job: Job, level: LogLine["level"], text: string) {
  job.log.push({ ts: Date.now(), level, text });
  if (job.log.length > 200) job.log.splice(0, job.log.length - 200);
}

// ─── Dépôt ───────────────────────────────────────────────────────

export interface EnqueueInput extends Omit<JobRequest, "references"> {
  /** Images de départ envoyées par le client, en base64 nu. */
  references?: { b64: string; mimeType: string; role?: "reference" | "edit-target" }[];
  /** Pipeline à dérouler au lieu d'une génération simple. */
  pipelineId?: string;
}

export function enqueueJob(input: EnqueueInput): Job {
  ensureDataDirs();
  const config = buildEngineConfig();
  const model = findModel(input.model, config);
  if (!model) {
    throw new Error(`Modèle inconnu : ${input.model}`);
  }

  const pipeline = input.pipelineId
    ? readPipelines().find((entry) => entry.id === input.pipelineId)
    : undefined;
  if (input.pipelineId && !pipeline) {
    throw new Error("Pipeline introuvable.");
  }

  const references = (input.references ?? []).map((reference) =>
    storeReference(reference.b64, reference.mimeType, reference.role)
  );

  const totalSteps = pipeline ? pipeline.steps.length : 1;
  const job: Job = {
    id: `job-${Date.now()}-${randomSlug(6)}`,
    status: "queued",
    request: { ...input, references },
    modelLabel: model.label,
    engineId: model.engineId,
    engineKind: model.kind,
    createdAt: Date.now(),
    progress: {
      current: 0,
      total: totalSteps,
      label: pipeline ? `Pipeline « ${pipeline.name} »` : "En attente",
    },
    log: [],
    historyIds: [],
    ...(pipeline
      ? {
          pipelineStep: {
            index: 0,
            total: pipeline.steps.length,
            label: pipeline.steps[0]?.label ?? pipeline.steps[0]?.kind ?? "",
          },
        }
      : {}),
  };

  state().jobs.set(job.id, job);
  persist();
  void drain();
  return job;
}

// ─── Ordonnancement ──────────────────────────────────────────────

/**
 * Deux garde-fous : un plafond global, et l'exclusivité des moteurs CLI. Deux
 * agents lancés ensemble se disputeraient le processeur et, sur les comptes à
 * quota serré, se feraient mutuellement limiter.
 */
function canStart(job: Job): boolean {
  const running = [...state().running.keys()]
    .map((id) => state().jobs.get(id))
    .filter(Boolean) as Job[];

  const maxParallel = Math.max(1, getSettings().max_parallel_jobs ?? 2);
  if (running.length >= maxParallel) return false;
  if (job.engineKind === "cli" && running.some((r) => r.engineKind === "cli")) {
    return false;
  }
  return true;
}

async function drain(): Promise<void> {
  const queue = state();
  if (queue.draining) return;
  queue.draining = true;

  try {
    let launched = true;
    while (launched) {
      launched = false;
      const waiting = sortedJobs()
        .filter((job) => job.status === "queued")
        .reverse(); // premier arrivé, premier servi

      for (const job of waiting) {
        if (!canStart(job)) continue;
        const controller = new AbortController();
        queue.running.set(job.id, controller);
        job.status = "running";
        job.startedAt = Date.now();
        job.progress.label = "Démarrage…";
        persist();

        void execute(job, controller)
          .catch((error) => {
            job.status = job.status === "canceled" ? "canceled" : "error";
            job.error = error?.message ?? String(error);
            log(job, "error", job.error ?? "Échec");
          })
          .finally(() => {
            job.finishedAt = Date.now();
            if (job.status === "running") job.status = "done";
            queue.running.delete(job.id);
            removeReferences(job.request.references);
            job.request.references = [];
            persist();
            void drain();
          });

        launched = true;
        break;
      }
    }
  } finally {
    queue.draining = false;
  }
}

async function execute(job: Job, controller: AbortController): Promise<void> {
  const pipeline = job.request.pipelineId
    ? readPipelines().find((entry) => entry.id === job.request.pipelineId)
    : undefined;

  if (pipeline) {
    await executePipeline(job, pipeline, controller);
  } else {
    job.progress = { current: 0, total: 1, label: "Génération…" };
    const outcome = await runGeneration(job.request, {
      signal: controller.signal,
      onProgress: (line) => {
        job.progress.label = line.text.slice(0, 120);
        log(job, line.level, line.text);
      },
    });
    job.historyIds.push(outcome.item.id);
    job.progress = { current: 1, total: 1, label: "Terminé" };
  }

  job.status = "done";
}

// ─── Pipelines ───────────────────────────────────────────────────

interface StepOutput {
  historyId: string;
  files: string[];
}

/**
 * Déroule les étapes l'une après l'autre, chacune travaillant sur le rendu de
 * la précédente. C'est ce qui permet d'enchaîner « je génère, je décline en
 * variantes, j'agrandis la meilleure et je publie » sans repasser par
 * l'interface entre chaque geste.
 */
async function executePipeline(
  job: Job,
  pipeline: Pipeline,
  controller: AbortController
): Promise<void> {
  let previous: StepOutput | null = null;

  for (let index = 0; index < pipeline.steps.length; index++) {
    if (controller.signal.aborted) throw new Error("Génération annulée.");

    const step = pipeline.steps[index];
    const label = step.label || describeStep(step);
    job.pipelineStep = { index, total: pipeline.steps.length, label };
    job.progress = { current: index, total: pipeline.steps.length, label };
    log(job, "info", `Étape ${index + 1}/${pipeline.steps.length} — ${label}`);

    previous = await executeStep(job, step, previous, index, controller);
    // Les étapes locales (agrandissement, publication) enrichissent la
    // génération précédente au lieu d'en créer une : les inscrire à nouveau
    // ferait apparaître trois fois la même image dans le résultat du travail.
    if (
      previous &&
      step.keep !== false &&
      !job.historyIds.includes(previous.historyId)
    ) {
      job.historyIds.push(previous.historyId);
    }
  }

  job.progress = {
    current: pipeline.steps.length,
    total: pipeline.steps.length,
    label: "Terminé",
  };
}

function describeStep(step: PipelineStep): string {
  switch (step.kind) {
    case "generate":
      return "Génération";
    case "variant":
      return "Variantes";
    case "edit":
      return "Retouche";
    case "upscale":
      return `Agrandissement ×${step.scale ?? 2}`;
    case "gallery":
      return "Envoi dans la galerie";
    default:
      return step.kind;
  }
}

/** `{prompt}` reprend la demande initiale, pour écrire des étapes réutilisables. */
function resolveStepPrompt(step: PipelineStep, job: Job): string {
  const base = job.request.prompt;
  if (!step.prompt?.trim()) return base;
  return step.prompt.includes("{prompt}")
    ? step.prompt.split("{prompt}").join(base)
    : step.prompt;
}

async function executeStep(
  job: Job,
  step: PipelineStep,
  previous: StepOutput | null,
  index: number,
  controller: AbortController
): Promise<StepOutput | null> {
  const onProgress = (line: LogLine) => {
    job.progress.label = line.text.slice(0, 120);
    log(job, line.level, line.text);
  };

  if (step.kind === "upscale") {
    if (!previous) throw new Error("Aucune image à agrandir à cette étape.");
    const enlarged: string[] = [];
    for (const file of previous.files) {
      const result = await upscaleImage(previous.historyId, file, step.scale ?? 2);
      if (!result.success || !result.file) {
        throw new Error(result.error ?? "Agrandissement impossible");
      }
      log(job, "info", `Agrandi : ${result.file}`);
      enlarged.push(result.file);
    }
    // Les étapes suivantes doivent travailler sur la version agrandie : c'est
    // tout l'intérêt d'un enchaînement « brouillon, agrandissement, publication ».
    return { historyId: previous.historyId, files: enlarged };
  }

  if (step.kind === "gallery") {
    if (!previous) throw new Error("Aucune image à publier à cette étape.");
    for (const file of previous.files) {
      const result = await saveToGallery(previous.historyId, file);
      if (result.success) log(job, "info", `Publié dans la galerie : ${result.fileName}`);
    }
    return previous;
  }

  // Étapes qui repassent par un moteur.
  const references =
    step.kind === "generate"
      ? index === 0
        ? job.request.references
        : undefined
      : referenceFromPrevious(previous, step.kind);

  const request: JobRequest = {
    prompt: resolveStepPrompt(step, job),
    negativePrompt: step.negativePrompt ?? job.request.negativePrompt,
    notes: job.request.notes,
    model: step.model ?? job.request.model,
    size: step.size ?? job.request.size,
    quality: step.quality ?? job.request.quality,
    n: step.n ?? (step.kind === "variant" ? 2 : job.request.n),
    seed: job.request.seed,
    collectionId: job.request.collectionId,
    parentId: previous?.historyId ?? job.request.parentId,
    pipelineId: job.request.pipelineId,
    references,
  };

  const outcome = await runGeneration(request, {
    signal: controller.signal,
    onProgress,
  });

  return { historyId: outcome.item.id, files: outcome.item.imageFiles };
}

/**
 * Les étapes `variant` et `edit` repartent du rendu précédent. On repasse par
 * le disque plutôt que de garder les octets en mémoire : un pipeline de cinq
 * étapes sur quatre images retiendrait sinon plusieurs dizaines de mégaoctets
 * pendant toute son exécution.
 */
function referenceFromPrevious(
  previous: StepOutput | null,
  kind: PipelineStep["kind"]
) {
  if (!previous?.files.length) {
    throw new Error("Aucune image de départ pour cette étape.");
  }
  const file = path.join(IMAGES_DIR, path.basename(previous.files[0]));
  if (!fs.existsSync(file)) {
    throw new Error("L'image de l'étape précédente est introuvable.");
  }
  return [
    {
      file: path.basename(previous.files[0]),
      mimeType: "image/png",
      role: kind === "edit" ? ("edit-target" as const) : ("reference" as const),
      from: "images" as const,
    },
  ];
}

// ─── Consultation ────────────────────────────────────────────────

export function listJobs(limit = 40): Job[] {
  return sortedJobs()
    .slice(0, limit)
    .map((job) => ({ ...job, request: { ...job.request, references: [] } }));
}

export function getJob(id: string): Job | undefined {
  const job = state().jobs.get(id);
  return job ? { ...job, request: { ...job.request, references: [] } } : undefined;
}

export function cancelJob(id: string): { success: boolean } {
  const job = state().jobs.get(id);
  if (!job) return { success: false };

  if (job.status === "queued") {
    job.status = "canceled";
    job.finishedAt = Date.now();
    persist();
    return { success: true };
  }

  const controller = state().running.get(id);
  if (controller) {
    job.status = "canceled";
    controller.abort();
    persist();
    return { success: true };
  }

  return { success: false };
}

export function clearFinishedJobs(): { success: boolean; removed: number } {
  let removed = 0;
  for (const [id, job] of state().jobs) {
    if (job.status === "done" || job.status === "error" || job.status === "canceled") {
      removeReferences(job.request.references);
      state().jobs.delete(id);
      removed++;
    }
  }
  persist();
  return { success: true, removed };
}

/** Les générations produites par un travail, prêtes à être affichées. */
export function jobResults(id: string) {
  const job = state().jobs.get(id);
  if (!job) return [];
  const history = readHistory();
  return job.historyIds
    .map((historyId) => history.find((item) => item.id === historyId))
    .filter(Boolean);
}
