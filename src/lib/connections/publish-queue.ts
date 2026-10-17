/**
 * File de publication persistante, commune à tous les services (dossier 07,
 * § 8.5 et § 8.9).
 *
 * - **Un envoi à la fois** sur la machine, pour ne pas saturer le lien du
 *   serveur. Ce verrou ne couvre que l'envoi des octets : un connecteur dont
 *   le service traite encore le fichier rend `PublishPending`, le travail
 *   passe en `processing` sans résultat et la file passe au suivant ; à
 *   l'heure demandée (`checkAt`), le connecteur est rappelé à côté
 *   (`continuePublish`, sinon `publish`) pour finir la publication. Le suivi
 *   d'une publication faite (`checkProcessing`) se fait aussi à côté.
 * - Une source est un fichier, plusieurs (carrousel) ou un texte seul ; elle
 *   est vérifiée contre les limites du connecteur avant d'entrer dans la file.
 * - Le connecteur publie et rend son état de reprise au fil de l'envoi ; la
 *   file l'enregistre dans `resume` (jamais envoyé au client).
 * - Au redémarrage (`startPublishQueue`, appelé par `instrumentation.ts`), un
 *   travail `uploading` reprend avec son état de reprise ; sans état, il
 *   repart du début. Un travail déjà tenté consulte d'abord `findExisting`.
 *   Un travail `processing` reprend à son heure, attente ou suivi.
 * - Une réponse « quota dépassé » passe le travail en `waiting-quota` :
 *   quota de l'application, tous les travaux du service attendent la remise à
 *   zéro ; quota du compte (fenêtre glissante), seuls ceux du compte.
 * - « Crédits épuisés » ou budget mensuel atteint : `waiting-credits`, sans
 *   reprise automatique.
 * - Un travail peut porter une date de publication (`publishAt`) : il reste
 *   en file jusque-là, même après un redémarrage.
 * - Un compte « à reconnecter » garde ses travaux en file, suspendus jusqu'à
 *   la reconnexion.
 */

import path from "path";
import {
  FOLLOW_UP_CAPABILITY,
  isFollowUpPending,
  isFollowUpSkipped,
  isPublishPending,
  type AccountSummary,
  type Connector,
  type FollowUpContext,
  type FollowUpOutcome,
  type PublishContext,
  type PublishFollowUp,
  type PublishFollowUpKind,
  type PublishFollowUpsInput,
  type PublishJob,
  type PublishJobSummary,
  type PublishOutcome,
  type PublishSource,
} from "./types";
import { CreditsExhaustedError, QuotaExceededError, ReconnectRequiredError, errorMessage, isTransientError } from "./errors";
import { newId, readStore, updateStore } from "./store";
import { accountContext, getAccountSummary, noteReconnectRequired, requireCapability } from "./accounts";
import { getConnector } from "./registry";
import { accountQuotaPausedUntil, clearAccountQuotaPause, clearQuotaPause, markAccountQuotaExhausted, markQuotaExhausted, quotaPausedUntil } from "./quota";
import { checkPublishLimits, countText, estimatePublishCost, mimeTypeOfName, TEXT_HARD_LIMIT } from "./limits";
import { assertBudget, clearCreditsExhausted, creditsExhausted, markCreditsExhausted, recordSpend } from "./billing";
import { createPublicLink, isInTempDir, linkAccesses, newTempFilePath, removeTempFiles, revokeLinksForJob } from "./public-media";

interface JobsFile {
  jobs: PublishJob[];
}

/** Fichier à résoudre : le module propriétaire et son identifiant (export, couverture, élément de carrousel). */
export interface PublishFileRef {
  module: string;
  id: string;
  file?: string;
  /**
   * Fichier d'une suite de publication : sous-titres, ou couverture posée
   * après coup. Le module reçoit alors `resolveExportFile(id, { file,
   * purpose })` et doit rendre ce fichier-là (vérifié par son nom).
   */
  purpose?: "subtitles" | "cover";
}

/** Rend le chemin absolu d'un fichier à publier ; le module propriétaire contrôle le nom. */
export type SourceResolver = (ref: PublishFileRef) => Promise<string>;

/** Suivi du traitement : abandon après deux heures, ou après dix erreurs de suite. */
const PROCESSING_GIVE_UP_MS = 2 * 60 * 60 * 1000;
const PROCESSING_MAX_ERRORS = 10;
/** Travaux terminés gardés dans l'historique. */
const KEEP_FINISHED = 200;
/** Une publication différée se programme à un an au plus. */
const MAX_DELAY_MS = 366 * 24 * 60 * 60 * 1000;
const MAX_CAROUSEL_ITEMS = 35;
/** Une attente chez le service est reprise au plus tôt après une seconde, au plus tard après une heure. */
const MIN_PENDING_MS = 1000;
const MAX_PENDING_MS = 60 * 60 * 1000;

interface QueueState {
  started: boolean;
  running: { jobId: string; controller: AbortController } | null;
  pumpPromise: Promise<void> | null;
  pumpAgain: boolean;
  wakeTimer: ReturnType<typeof setTimeout> | null;
  processingTimer: ReturnType<typeof setTimeout> | null;
  /** Heure à laquelle le minuteur du suivi se déclenchera. */
  processingTimerAt: number;
  /** Reprises en cours après une attente chez le service, par travail (pour les annuler). */
  continuing: Map<string, AbortController>;
  processingPromise: Promise<void> | null;
  processingErrors: Map<string, number>;
  resolveSource: SourceResolver;
  sleep: (ms: number) => Promise<void>;
  processingIntervalMs: number;
  /** Faux dans les tests : la file ne démarre que sur appel explicite. */
  autoRun: boolean;
  /** Passage en cours sur les suites de publication. */
  followUpPromise: Promise<void> | null;
}

/**
 * Par défaut, le fichier est demandé au module propriétaire
 * (`resolveExportFile`, déclarée `public` : jamais appelable par le navigateur).
 */
const defaultResolver: SourceResolver = async (ref) => {
  const { apiModuleManager } = await import("@/lib/modules/module-manager.api");
  if (ref.purpose) {
    const resolved = (await apiModuleManager.callModuleFunction(ref.module, "resolveExportFile", ref.id, { file: ref.file, purpose: ref.purpose })) as { path?: string; file?: string } | null;
    if (!resolved?.path) throw new Error("Fichier introuvable : l’export a peut-être été supprimé.");
    // Un module qui ne sait pas encore résoudre ce fichier rendrait la vidéo : on ne l'envoie jamais à sa place.
    if (ref.file && resolved.file !== ref.file && path.basename(resolved.path) !== ref.file) {
      throw new Error("Le module n’a pas rendu le fichier demandé (sous-titres ou couverture).");
    }
    return resolved.path;
  }
  const resolved = (await apiModuleManager.callModuleFunction(ref.module, "resolveExportFile", ref.id)) as { path?: string } | null;
  if (!resolved?.path) throw new Error("Fichier à publier introuvable : l’export a peut-être été supprimé.");
  return resolved.path;
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Rangé sur `globalThis` : une seule file par processus, même si ce fichier
// est chargé par plusieurs couches de Next (routes, actions, modules).
const holder = globalThis as typeof globalThis & { __sxmPublishQueue?: QueueState };
const state: QueueState = (holder.__sxmPublishQueue ??= {
  started: false,
  running: null,
  pumpPromise: null,
  pumpAgain: false,
  wakeTimer: null,
  processingTimer: null,
  processingTimerAt: 0,
  continuing: new Map(),
  processingPromise: null,
  processingErrors: new Map(),
  resolveSource: defaultResolver,
  sleep: defaultSleep,
  processingIntervalMs: 30_000,
  autoRun: true,
  followUpPromise: null,
});
// File créée par une version précédente de ce fichier (rechargement à chaud).
state.continuing ??= new Map();
state.processingTimerAt ??= 0;
state.followUpPromise ??= null;

/** Réglages des tests : résolution des fichiers, attentes, démarrage automatique. */
export function configurePublishQueue(options: {
  resolveSource?: SourceResolver | null;
  sleep?: ((ms: number) => Promise<void>) | null;
  processingIntervalMs?: number;
  autoRun?: boolean;
}) {
  if (options.resolveSource !== undefined) state.resolveSource = options.resolveSource ?? defaultResolver;
  if (options.sleep !== undefined) state.sleep = options.sleep ?? defaultSleep;
  if (options.processingIntervalMs !== undefined) state.processingIntervalMs = options.processingIntervalMs;
  if (options.autoRun !== undefined) state.autoRun = options.autoRun;
}

// ─── Stockage ─────────────────────────────────────────────────────

function readJobs(): PublishJob[] {
  const file = readStore<JobsFile>("publish-jobs", { jobs: [] });
  return Array.isArray(file.jobs) ? file.jobs : [];
}

function changeJobs(change: (jobs: PublishJob[]) => PublishJob[] | void) {
  updateStore<JobsFile>("publish-jobs", { jobs: [] }, (file) => {
    const jobs = Array.isArray(file.jobs) ? file.jobs : [];
    return { jobs: change(jobs) ?? jobs };
  });
}

const FINISHED = new Set<PublishJob["state"]>(["done", "failed", "cancelled"]);

function patchJob(id: string, patch: Partial<PublishJob>): PublishJob | null {
  let updated: PublishJob | null = null;
  changeJobs((jobs) => {
    const job = jobs.find((entry) => entry.id === id);
    if (!job) return;
    // `updatedAt` peut venir du patch : une échéance (`checkAt`) et sa date de départ partent alors du même instant.
    Object.assign(job, patch, { updatedAt: patch.updatedAt ?? Date.now() });
    for (const key of Object.keys(patch) as (keyof PublishJob)[]) if (patch[key] === undefined) delete job[key];
    updated = { ...job };
  });
  // Travail terminé : ses liens publics se ferment et ses fichiers dérivés s'effacent.
  if (patch.state && FINISHED.has(patch.state)) {
    revokeLinksForJob(id);
    removeTempFiles(id);
  }
  return updated;
}

/** Libellé d'une suite en échec, en tête de l'avertissement du travail. */
const FOLLOW_UP_FAILURES: Record<PublishFollowUpKind, string> = {
  comment: "Premier commentaire non posé",
  subtitles: "Sous-titres non ajoutés",
  cover: "Couverture non changée",
};

function summarize(job: PublishJob): PublishJobSummary {
  const { resume: _resume, followUps, ...rest } = job;
  void _resume;
  const fallback = job.source.kind === "text" ? job.source.text.replace(/\s+/g, " ").trim().slice(0, 80) : undefined;
  const summary: PublishJobSummary = { ...rest, title: typeof job.options.title === "string" ? job.options.title : (job.source.name ?? fallback) };
  if (followUps && followUps.length > 0) {
    summary.followUps = followUps.map(({ resume: _followUpResume, ...entry }) => {
      void _followUpResume;
      return { ...entry, ...(entry.result ? { result: { ...entry.result } } : {}) };
    });
    // Une suite en échec ne fait pas échouer la publication : elle s'ajoute à l'avertissement.
    const failures = followUps.filter((entry) => entry.state === "failed").map((entry) => `${FOLLOW_UP_FAILURES[entry.kind]} : ${entry.error ?? "erreur inconnue"}`);
    if (failures.length > 0) summary.warning = [job.warning, ...failures].filter(Boolean).join(" ");
  }
  return summary;
}

/** Le travail a-t-il encore des suites à exécuter ? */
const hasWaitingFollowUps = (job: PublishJob) => Boolean(job.followUps?.some((entry) => entry.state === "waiting"));

/** Garde l'historique borné : les plus anciens travaux terminés partent en premier. */
function prune(jobs: PublishJob[]): PublishJob[] {
  // Un travail publié dont une suite attend encore n'est jamais effacé.
  const finished = jobs.filter((job) => FINISHED.has(job.state) && !hasWaitingFollowUps(job)).sort((a, b) => b.updatedAt - a.updatedAt);
  const drop = new Set(finished.slice(KEEP_FINISHED).map((job) => job.id));
  return jobs.filter((job) => !drop.has(job.id));
}

// ─── Sources ──────────────────────────────────────────────────────

/** Capacité qu'exige une source. */
export function requiredCapabilities(source: PublishSource) {
  if (source.kind === "text") return ["publish.text"] as const;
  if (source.kind === "image") return ["publish.image"] as const;
  if (source.kind === "video") return ["publish.video"] as const;
  return (source.items ?? []).some((item) => item.kind === "video") ? (["publish.image", "publish.video"] as const) : (["publish.image"] as const);
}

const isMediaKind = (value: unknown): value is "video" | "image" => value === "video" || value === "image";

/** Vérifie la forme d'une source venue d'un module (jamais d'un chemin). */
function assertSource(source: PublishSource) {
  if (!source || typeof source !== "object" || typeof source.module !== "string" || typeof source.id !== "string") throw new Error("Source de publication invalide.");
  if (source.kind === "text") {
    if (typeof source.text !== "string") throw new Error("Message manquant.");
    if (source.text.length > TEXT_HARD_LIMIT * 4) throw new Error("Message trop long.");
    return;
  }
  if (source.kind === "carousel") {
    if (!Array.isArray(source.items) || source.items.length === 0 || source.items.length > MAX_CAROUSEL_ITEMS) throw new Error("Carrousel invalide.");
    for (const item of source.items) if (!item || typeof item.id !== "string" || !isMediaKind(item.kind) || typeof item.file !== "string") throw new Error("Élément de carrousel invalide.");
    return;
  }
  if (!isMediaKind(source.kind) || typeof source.file !== "string") throw new Error("Source de publication invalide.");
  if (source.cover && (typeof source.cover.id !== "string" || source.cover.kind !== "image")) throw new Error("Couverture invalide.");
}

/** Texte publié avec la source (message, ou chaînes des options), pour le surcoût d'une adresse. */
function publishedText(source: PublishSource, options: Record<string, unknown>): string {
  if (source.kind === "text") return source.text;
  return Object.values(options)
    .filter((value): value is string => typeof value === "string")
    .join("\n");
}

// ─── API ──────────────────────────────────────────────────────────

/**
 * Met une publication en file. La source est vérifiée contre les limites du
 * connecteur (ou du compte), les options validées par le connecteur ; un
 * compte sans la capacité voulue, ou à reconnecter, est refusé, de même
 * qu'un envoi qui dépasserait le budget mensuel du service.
 */
export function enqueuePublish(input: {
  accountId: string;
  source: PublishSource;
  options: unknown;
  publishAt?: number | null;
  /** Suites à exécuter une fois la publication faite (premier commentaire, sous-titres, couverture). */
  followUps?: PublishFollowUpsInput | null;
}): PublishJobSummary {
  assertSource(input.source);
  const [first, ...others] = requiredCapabilities(input.source);
  const { connector, account, context } = requireCapability(input.accountId, first);
  for (const capability of others) requireCapability(input.accountId, capability);
  if (!connector.publish) throw new Error(`${connector.label} ne sait pas encore publier.`);
  const requested = readFollowUpsInput(input.followUps);
  // Couverture prise par le service à la publication : elle devient celle de la source.
  const prepared = applyPublishCover(connector, input.source, input.options, requested.cover);
  const source = prepared.source;
  const problems = checkPublishLimits(account.limits ?? connector.limits, source, {
    measure: connector.measureText ? (text) => connector.measureText!(text) : undefined,
  });
  if (problems.length > 0) throw new Error(`${connector.label} n’accepte pas cette publication : ${problems.join(" ")}`);
  const options = connector.normalizeOptions
    ? connector.normalizeOptions(prepared.options, source, { appSettings: context.appSettings, scopes: account.scopes })
    : ((prepared.options && typeof prepared.options === "object" ? prepared.options : {}) as Record<string, unknown>);
  const followUps = buildFollowUps(connector, account, source, requested, prepared.coverAtPublish);
  const now = Date.now();
  let publishAt: number | undefined;
  if (input.publishAt !== undefined && input.publishAt !== null) {
    if (!Number.isFinite(input.publishAt) || input.publishAt > now + MAX_DELAY_MS) throw new Error("Date de publication invalide.");
    if (input.publishAt > now + 60_000) publishAt = Math.round(input.publishAt);
  }
  const estimate = estimatePublishCost(connector.pricing, source.kind, publishedText(source, options));
  if (estimate) assertBudget(connector, estimate.amount, now);
  const job: PublishJob = {
    id: newId("pub"),
    accountId: input.accountId,
    connector: connector.id,
    source: { ...source },
    options,
    state: "queued",
    bytesSent: 0,
    ...(followUps.length > 0 ? { followUps } : {}),
    ...(publishAt ? { publishAt } : {}),
    ...(estimate ? { cost: { amount: estimate.amount, currency: estimate.currency } } : {}),
    createdAt: now,
    updatedAt: now,
  };
  changeJobs((jobs) => prune([...jobs, job]));
  schedulePump();
  return summarize(job);
}

/**
 * Travaux, du plus récent au plus ancien ; filtrés par compte, par
 * identifiants, ou par source (`sourceModule`, `sourceId` : les publications
 * d'un export).
 */
export function listJobs(filter: { accountId?: string; ids?: string[]; sourceModule?: string; sourceId?: string } = {}): PublishJobSummary[] {
  const ids = filter.ids ? new Set(filter.ids) : null;
  return readJobs()
    .filter((job) => !filter.accountId || job.accountId === filter.accountId)
    .filter((job) => !ids || ids.has(job.id))
    .filter((job) => !filter.sourceModule || job.source.module === filter.sourceModule)
    .filter((job) => !filter.sourceId || job.source.id === filter.sourceId)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(summarize);
}

export function getJob(id: string): PublishJobSummary | null {
  const job = readJobs().find((entry) => entry.id === id);
  return job ? summarize(job) : null;
}

/**
 * Annule un travail en attente, en cours d'envoi, en erreur, ou envoyé mais
 * pas encore publié (attente chez le service : rien n'est publié, ce que le
 * service a reçu expire de lui-même). Une publication déjà faite reste chez
 * le service.
 */
export function cancelJob(id: string): PublishJobSummary {
  const job = readJobs().find((entry) => entry.id === id);
  if (!job) throw new Error("Travail introuvable.");
  if (job.state === "done" || job.state === "cancelled") return summarize(job);
  if (job.state === "processing" && job.result) throw new Error("La vidéo est déjà envoyée : supprimez-la depuis l’onglet « Publications ».");
  if (state.running?.jobId === id) state.running.controller.abort();
  state.continuing.get(id)?.abort();
  const followUps = job.followUps?.map((entry) => (entry.state === "waiting" ? skippedFollowUp(entry, "cancelled", "Publication annulée.") : entry));
  return summarize(patchJob(id, { state: "cancelled", retryAt: undefined, checkAt: undefined, note: undefined, ...(followUps ? { followUps } : {}) })!);
}

/**
 * « Reprendre » : un travail en erreur, annulé, en attente du quota ou des
 * crédits repart, avec son état de reprise.
 */
export function retryJob(id: string): PublishJobSummary {
  const job = readJobs().find((entry) => entry.id === id);
  if (!job) throw new Error("Travail introuvable.");
  if (!["failed", "cancelled", "waiting-quota", "waiting-credits"].includes(job.state)) return summarize(job);
  if (job.result) throw new Error("Cette publication a déjà été envoyée.");
  // Reprendre à la main lève la suspension : si le service refuse encore, le travail y retourne.
  if (job.state === "waiting-quota") {
    clearQuotaPause(job.connector);
    clearAccountQuotaPause(job.accountId);
  }
  if (job.state === "waiting-credits") clearCreditsExhausted(job.connector);
  const updated = patchJob(id, { state: "queued", error: undefined, retryAt: undefined })!;
  schedulePump();
  return summarize(updated);
}

/** Annule les travaux d'un compte qu'on déconnecte. */
export function cancelJobsForAccount(accountId: string) {
  for (const job of readJobs()) {
    if (job.accountId === accountId && !FINISHED.has(job.state) && !(job.state === "processing" && job.result)) cancelJob(job.id);
  }
}

/** Démarrage du serveur : reprise des envois interrompus et du suivi des traitements. */
export function startPublishQueue() {
  if (state.started) return;
  state.started = true;
  state.autoRun = true;
  schedulePump();
  scheduleProcessing(1000);
}

/** Réveille la file (un compte reconnecté, une tâche planifiée). */
export function wakePublishQueue() {
  // Suites suspendues jusqu'à la reconnexion du compte : elles repartent au prochain passage.
  changeJobs((jobs) => {
    for (const job of jobs) for (const entry of job.followUps ?? []) if (entry.state === "waiting" && entry.note === RECONNECT_NOTE) delete entry.checkAt;
  });
  schedulePump();
  // Des suites attendaient peut-être la reconnexion du compte.
  scheduleProcessing();
}

/** Attend la fin de la file (tests). */
export async function drainPublishQueue() {
  while (state.pumpPromise) await state.pumpPromise;
}

// ─── Exécution ────────────────────────────────────────────────────

function schedulePump() {
  if (!state.autoRun) return;
  setTimeout(() => void runPublishQueue(), 0);
}

/** Traite la file jusqu'à ce qu'aucun travail ne soit prêt. Un seul passage à la fois. */
export function runPublishQueue(): Promise<void> {
  if (state.pumpPromise) {
    state.pumpAgain = true;
    return state.pumpPromise;
  }
  // Démarré au tour suivant : sans travail prêt, le bloc se terminerait avant
  // d'être rangé dans `pumpPromise`, qui resterait alors bloqué.
  const promise: Promise<void> = Promise.resolve()
    .then(async () => {
      do {
        state.pumpAgain = false;
        for (let job = nextRunnable(); job; job = nextRunnable()) await runJob(job);
      } while (state.pumpAgain);
    })
    .finally(() => {
      if (state.pumpPromise === promise) state.pumpPromise = null;
      scheduleWake();
      scheduleProcessing();
    });
  state.pumpPromise = promise;
  return promise;
}

/**
 * Prochain travail prêt : d'abord ceux interrompus en plein envoi, puis par
 * ordre d'arrivée ; ni programmé pour plus tard, ni d'un compte à reconnecter.
 */
function nextRunnable(): PublishJob | null {
  const now = Date.now();
  const jobs = readJobs();
  // Les travaux en attente du quota dont l'heure est venue redeviennent prêts.
  for (const job of jobs) {
    if (job.state === "waiting-quota" && (job.retryAt ?? 0) <= now) patchJob(job.id, { state: "queued", retryAt: undefined, error: undefined });
  }
  const candidates = readJobs()
    .filter((job) => job.state === "uploading" || job.state === "queued")
    .filter((job) => !job.publishAt || job.publishAt <= now)
    .sort((a, b) => (a.state === b.state ? a.createdAt - b.createdAt : a.state === "uploading" ? -1 : 1));
  for (const job of candidates) {
    const connector = getConnector(job.connector);
    const account = getAccountSummary(job.accountId);
    // Compte à reconnecter : le travail attend en file, sans échouer.
    if (account?.status === "needs-reconnect") continue;
    const credits = connector ? creditsExhausted(connector.id) : undefined;
    if (credits) {
      patchJob(job.id, { state: "waiting-credits", error: credits.message });
      continue;
    }
    const pausedUntil = connector ? quotaPausedUntil(connector, now) : undefined;
    if (pausedUntil) {
      patchJob(job.id, { state: "waiting-quota", retryAt: pausedUntil, error: "Quota du jour épuisé : l’envoi reprendra après la remise à zéro." });
      continue;
    }
    const accountPause = accountQuotaPausedUntil(job.accountId, now);
    if (accountPause) {
      patchJob(job.id, { state: "waiting-quota", retryAt: accountPause, error: "Limite de publication du compte atteinte : l’envoi reprendra de lui-même." });
      continue;
    }
    return job;
  }
  return null;
}

/** Chemins des fichiers d'une source, résolus par le module propriétaire. */
async function resolveFiles(source: PublishSource): Promise<{ files: string[]; cover?: string }> {
  if (source.kind === "text") return { files: [] };
  if (source.kind === "carousel") {
    const files: string[] = [];
    for (const item of source.items) files.push(await state.resolveSource({ module: source.module, id: item.id, file: item.file }));
    return { files };
  }
  const file = await state.resolveSource({ module: source.module, id: source.id, file: source.file });
  const cover = source.cover ? await state.resolveSource({ module: source.module, id: source.cover.id, file: source.cover.file }) : undefined;
  return { files: [file], cover };
}

/** Type MIME déclaré par la source pour un fichier du travail. */
function sourceMimeType(source: PublishSource, item: number | "cover"): string | undefined {
  if (source.kind === "text") return undefined;
  if (item === "cover") return source.kind !== "carousel" ? (source.cover?.mimeType ?? (source.cover ? mimeTypeOfName(source.cover.file) : undefined)) : undefined;
  const media = source.kind === "carousel" ? source.items[item] : source;
  return media ? (media.mimeType ?? mimeTypeOfName(media.file)) : undefined;
}

/**
 * Contexte de publication d'un travail : fichiers résolus par le module
 * propriétaire, liens publics et fichiers temporaires rattachés au travail.
 * Le même sert à l'envoi et à la reprise après une attente chez le service.
 */
async function publishContext(
  job: PublishJob,
  resolved: ReturnType<typeof accountContext>,
  controller: AbortController,
  attempt: number
): Promise<PublishContext> {
  const { files, cover } = await resolveFiles(job.source);
  const linkDefaults = resolved.connector.publicMedia ?? {};
  const publicLink: PublishContext["publicLink"] = (ttlMs, options = {}) => {
    const item = options.item ?? 0;
    let filePath: string | undefined;
    let owns = false;
    if (options.derivedFile) {
      if (!isInTempDir(options.derivedFile)) throw new Error("Le fichier dérivé doit venir de `context.tempFile()`.");
      filePath = options.derivedFile;
      owns = true;
    } else {
      filePath = item === "cover" ? cover : files[item];
    }
    if (!filePath) throw new Error(job.source.kind === "text" ? "Rien à servir : cette publication n’a pas de fichier." : "Fichier introuvable dans ce travail.");
    return createPublicLink({
      filePath,
      contentType: options.contentType ?? (owns ? undefined : sourceMimeType(job.source, item)),
      ttlMs: ttlMs ?? linkDefaults.ttlMs,
      maxDownloads: options.maxDownloads ?? linkDefaults.maxDownloads,
      jobId: job.id,
      ownsFile: owns,
    });
  };
  return {
    ...resolved.context,
    filePath: files[0] ?? "",
    filePaths: files,
    ...(cover ? { coverPath: cover } : {}),
    source: job.source,
    options: job.options,
    resume: job.resume,
    attempt,
    saveProgress: (resume, bytesSent) => {
      if (controller.signal.aborted) return;
      patchJob(job.id, { resume, bytesSent });
    },
    signal: controller.signal,
    sleep: state.sleep,
    publicLink,
    publicUrl: (ttlMs, options) => publicLink(ttlMs, options).url,
    publicLinkAccesses: (linkId) => linkAccesses(job.id, linkId),
    revokePublicUrls: (linkId) => revokeLinksForJob(job.id, linkId),
    tempFile: (extension) => newTempFilePath(job.id, extension),
  };
}

async function runJob(job: PublishJob) {
  const controller = new AbortController();
  state.running = { jobId: job.id, controller };
  let connector: Connector | null = getConnector(job.connector);
  try {
    const resolved = accountContext(job.accountId);
    connector = resolved.connector;
    const current = resolved.connector;
    if (!current.publish) throw new Error(`${current.label} ne sait pas encore publier.`);
    if (resolved.account.status !== "connected") throw new ReconnectRequiredError(`Le compte « ${resolved.account.displayName} » doit être reconnecté.`);
    const attempt = (job.attempts ?? 0) + 1;
    patchJob(job.id, { state: "uploading", error: undefined, note: undefined, checkAt: undefined, attempts: attempt });
    const context = await publishContext(job, resolved, controller, attempt);
    // Déjà tenté : la publication a pu aboutir sans que la réponse arrive.
    const found = attempt > 1 && current.findExisting ? await current.findExisting(context) : null;
    const outcome = found ?? (await current.publish(context));
    if (controller.signal.aborted) return;
    settle(job, current, outcome, Boolean(found));
  } catch (error) {
    if (controller.signal.aborted) return; // annulé : l’état est déjà « cancelled ».
    handleFailure(job, connector, error);
  } finally {
    state.running = null;
  }
}

/**
 * Range ce qu'a rendu le connecteur : une attente chez le service (le travail
 * passe en « processing » sans résultat et libère l'envoi pour le suivant),
 * ou la publication obtenue.
 */
function settle(job: PublishJob, connector: Connector, outcome: PublishOutcome, found = false) {
  const now = Date.now();
  if (isPublishPending(outcome)) {
    const delay = Math.min(Math.max(Number(outcome.retryAfterMs) || 0, MIN_PENDING_MS), MAX_PENDING_MS);
    patchJob(job.id, {
      state: "processing",
      checkAt: now + delay,
      updatedAt: now,
      // Une suite d'attentes compte depuis la première : l'abandon du suivi la borne.
      processingSince: job.state === "processing" ? (job.processingSince ?? now) : now,
      note: typeof outcome.note === "string" && outcome.note ? outcome.note.slice(0, 200) : undefined,
      error: undefined,
    });
    scheduleProcessing();
    return;
  }
  if (job.cost) recordSpend(connector, job.cost.amount);
  patchJob(job.id, {
    state: connector.checkProcessing ? "processing" : "done",
    result: { externalId: outcome.externalId, url: typeof outcome.url === "string" ? outcome.url : "" },
    resume: undefined,
    bytesSent: job.source.bytes,
    error: undefined,
    // Remarque du connecteur gardée avec le travail fini (brouillon à finir chez le service…).
    note: typeof outcome.note === "string" && outcome.note ? outcome.note.slice(0, 300) : undefined,
    checkAt: undefined,
    processingSince: connector.checkProcessing ? now : undefined,
    ...(found ? { warning: "Publication retrouvée chez le service après une coupure : elle n’a pas été republiée." } : {}),
  });
}

/** Erreur d'un passage (envoi ou reprise) : attente du quota, des crédits, d'une reconnexion, ou échec. */
function handleFailure(job: PublishJob, connector: Connector | null, error: unknown) {
  const idle = { checkAt: undefined, note: undefined };
  if (error instanceof QuotaExceededError && connector) {
    if (error.scope === "account") {
      const retryAt = error.retryAt > Date.now() ? error.retryAt : Date.now() + 60 * 60 * 1000;
      markAccountQuotaExhausted(job.accountId, retryAt);
      patchJob(job.id, { state: "waiting-quota", retryAt, error: error.message, ...idle });
      return;
    }
    const retryAt = markQuotaExhausted(connector, error.bucket);
    patchJob(job.id, { state: "waiting-quota", retryAt, error: error.message, ...idle });
    return;
  }
  if (error instanceof CreditsExhaustedError && connector) {
    markCreditsExhausted(connector, error.message);
    patchJob(job.id, { state: "waiting-credits", error: error.message, ...idle });
    return;
  }
  if (error instanceof ReconnectRequiredError) {
    // Le compte passe « à reconnecter » ; le travail attend la reconnexion au lieu d'échouer.
    noteReconnectRequired(job.accountId, error);
    patchJob(job.id, { state: "queued", error: error.message, ...idle });
    return;
  }
  patchJob(job.id, { state: "failed", error: errorMessage(error, "Publication impossible."), ...idle });
}

/** Un minuteur de la file ne retient pas le processus à l'arrêt (Node seulement). */
function unref(timer: ReturnType<typeof setTimeout>) {
  (timer as unknown as { unref?: () => void }).unref?.();
}

/**
 * Réveil à l'heure de la remise à zéro pour les travaux en attente du quota,
 * ou à l'heure d'une publication différée (au plus une heure plus tard).
 */
function scheduleWake() {
  if (state.wakeTimer) clearTimeout(state.wakeTimer);
  state.wakeTimer = null;
  if (!state.autoRun) return;
  const next = readJobs().reduce((min, job) => {
    if (job.state === "waiting-quota" && job.retryAt) return Math.min(min, job.retryAt);
    if (job.state === "queued" && job.publishAt) return Math.min(min, job.publishAt);
    return min;
  }, Number.POSITIVE_INFINITY);
  if (!Number.isFinite(next)) return;
  const delay = Math.min(Math.max(next - Date.now(), 1000), 60 * 60 * 1000);
  state.wakeTimer = setTimeout(() => void runPublishQueue(), delay);
  unref(state.wakeTimer);
}

// ─── Attente et suivi chez le service ─────────────────────────────

/** Heure du prochain passage dû parmi les travaux « processing ». */
function nextProcessingAt(): number | undefined {
  let next = Number.POSITIVE_INFINITY;
  for (const job of readJobs()) {
    if (job.state === "done") {
      // Suites d'une publication faite : à leur heure, sinon tout de suite.
      for (const entry of job.followUps ?? []) if (entry.state === "waiting") next = Math.min(next, entry.checkAt ?? 0);
      continue;
    }
    if (job.state !== "processing") continue;
    // Suivi sans heure fixée : un intervalle après l'entrée en traitement.
    next = Math.min(next, job.checkAt ?? (job.processingSince ?? job.updatedAt) + state.processingIntervalMs);
  }
  return Number.isFinite(next) ? next : undefined;
}

/**
 * Minuteur du prochain passage, à l'heure demandée par le connecteur (une
 * seconde au plus tôt, une heure au plus tard) ; avancé si un travail devient
 * dû plus tôt.
 */
function scheduleProcessing(minDelay = 0) {
  if (!state.autoRun) return;
  const next = nextProcessingAt();
  if (next === undefined) return;
  const now = Date.now();
  const at = Math.min(Math.max(next, now + Math.max(minDelay, 1000)), now + MAX_PENDING_MS);
  if (state.processingTimer) {
    if (state.processingTimerAt <= at) return;
    clearTimeout(state.processingTimer);
  }
  state.processingTimerAt = at;
  state.processingTimer = setTimeout(() => {
    state.processingTimer = null;
    void checkProcessingJobs().finally(() => scheduleProcessing());
  }, at - now);
  unref(state.processingTimer);
}

const PRIVACY_LABELS: Record<string, string> = { private: "privée", unlisted: "non répertoriée", public: "publique" };

/**
 * Passe sur chaque travail « processing » dont l'heure est venue (tous avec
 * `all`) : une publication rendue « à reprendre » est reprise par son
 * connecteur, une publication faite est suivie jusqu'à la fin de son
 * traitement. Rien de cela n'occupe l'envoi : la file continue à côté.
 */
export function checkProcessingJobs(options: { all?: boolean } = {}): Promise<void> {
  if (state.processingPromise) return state.processingPromise;
  const promise: Promise<void> = Promise.resolve()
    .then(async () => {
      for (const { id } of readJobs().filter((entry) => entry.state === "processing")) {
        // Relu à chaque tour : le travail a pu être annulé entre-temps.
        const job = readJobs().find((entry) => entry.id === id);
        if (!job || job.state !== "processing") continue;
        if (!options.all && job.checkAt && job.checkAt > Date.now()) continue;
        if (job.result) await trackProcessing(job);
        else await continueJob(job);
      }
      // Les suites des publications faites (celles qui viennent de finir comprises).
      await runFollowUps(options);
    })
    .finally(() => {
      if (state.processingPromise === promise) state.processingPromise = null;
    });
  state.processingPromise = promise;
  return promise;
}

/**
 * Reprend une publication rendue « à reprendre » (`PublishPending`) : le
 * connecteur relit l'état chez le service et publie quand il est prêt, avec
 * l'état de reprise enregistré. Hors du verrou d'envoi.
 */
async function continueJob(job: PublishJob) {
  const connector = getConnector(job.connector);
  const run = connector?.continuePublish ?? connector?.publish;
  if (!connector || !run) {
    patchJob(job.id, { state: "failed", error: "Ce service ne sait plus publier : la publication n’a pas pu être finie.", checkAt: undefined, note: undefined });
    return;
  }
  if (Date.now() - (job.processingSince ?? job.updatedAt) > PROCESSING_GIVE_UP_MS) {
    patchJob(job.id, {
      state: "failed",
      error: `${connector.label} traite encore la publication après deux heures : « Reprendre » reprendra l’attente sans republier.`,
      checkAt: undefined,
      note: undefined,
    });
    return;
  }
  const controller = new AbortController();
  state.continuing.set(job.id, controller);
  try {
    const resolved = accountContext(job.accountId);
    if (resolved.account.status !== "connected") throw new ReconnectRequiredError(`Le compte « ${resolved.account.displayName} » doit être reconnecté.`);
    const context = await publishContext(job, resolved, controller, job.attempts ?? 1);
    const outcome = await run.call(connector, context);
    if (controller.signal.aborted) return;
    settle(job, connector, outcome);
  } catch (error) {
    if (controller.signal.aborted) return;
    handleFailure(job, connector, error);
  } finally {
    state.continuing.delete(job.id);
  }
}

/** Suit le traitement d'une publication faite : fin, échec, adresse définitive. */
async function trackProcessing(job: PublishJob) {
  const connector = getConnector(job.connector);
  if (!connector?.checkProcessing || !job.result) {
    patchJob(job.id, { state: "done", checkAt: undefined });
    return;
  }
  try {
    const { context } = accountContext(job.accountId);
    const status = await connector.checkProcessing(context, job.result.externalId);
    state.processingErrors.delete(job.id);
    // Adresse définitive, quand le service ne la donne qu'après le traitement.
    const final =
      status.result && typeof status.result.externalId === "string" && typeof status.result.url === "string"
        ? { result: { externalId: status.result.externalId, url: status.result.url } }
        : {};
    if (status.failed) {
      patchJob(job.id, { state: "failed", error: status.failed, checkAt: undefined, ...final });
    } else if (status.done) {
      const requested = typeof job.options.privacy === "string" ? job.options.privacy : undefined;
      const warning =
        requested && status.privacy && status.privacy !== requested
          ? `${connector.label} a mis la publication en « ${PRIVACY_LABELS[status.privacy] ?? status.privacy} » au lieu de « ${PRIVACY_LABELS[requested] ?? requested} ».`
          : undefined;
      patchJob(job.id, { state: "done", warning, checkAt: undefined, ...final });
    } else if (Date.now() - (job.processingSince ?? job.updatedAt) > PROCESSING_GIVE_UP_MS) {
      patchJob(job.id, { state: "done", warning: "Traitement toujours en cours chez le service : vérifiez la publication plus tard.", checkAt: undefined, ...final });
    } else {
      patchJob(job.id, { checkAt: Date.now() + state.processingIntervalMs, processingSince: job.processingSince ?? job.updatedAt, ...final });
    }
  } catch (error) {
    const later = Date.now() + state.processingIntervalMs;
    if (error instanceof QuotaExceededError) {
      // Quota épuisé : le suivi reprend après la remise à zéro annoncée.
      patchJob(job.id, { checkAt: Math.max(error.retryAt, later), processingSince: job.processingSince ?? job.updatedAt });
      return;
    }
    if (error instanceof ReconnectRequiredError) noteReconnectRequired(job.accountId, error);
    const count = (state.processingErrors.get(job.id) ?? 0) + 1;
    state.processingErrors.set(job.id, count);
    if (count >= PROCESSING_MAX_ERRORS || error instanceof ReconnectRequiredError) {
      state.processingErrors.delete(job.id);
      patchJob(job.id, { state: "done", warning: `Suivi du traitement interrompu : ${errorMessage(error)}`, checkAt: undefined });
    } else {
      patchJob(job.id, { checkAt: later, processingSince: job.processingSince ?? job.updatedAt });
    }
  }
}

// ─── Suites de publication ────────────────────────────────────────

/** Attentes avant un nouvel essai après une erreur passagère d'une suite. */
const FOLLOW_UP_BACKOFF_MS = [60_000, 2 * 60_000, 5 * 60_000, 15 * 60_000, 30 * 60_000, 60 * 60_000, 3 * 60 * 60_000];
/** Erreurs passagères de suite tolérées avant l'échec. */
const FOLLOW_UP_MAX_ERRORS = 8;
/** Attente d'une condition sans date connue (vidéo privée) : abandon après trente jours. */
const FOLLOW_UP_MAX_WAIT_MS = 30 * 24 * 60 * 60 * 1000;
/** Une attente demandée par le connecteur est reprise au plus tôt après une seconde, au plus tard après un jour. */
const FOLLOW_UP_MIN_DELAY_MS = 1000;
const FOLLOW_UP_MAX_DELAY_MS = 24 * 60 * 60 * 1000;
const RECONNECT_NOTE = "En attente de la reconnexion du compte.";
const COMMENT_HARD_LIMIT = 20_000;

const FOLLOW_UP_LABELS: Record<PublishFollowUpKind, string> = {
  comment: "un premier commentaire",
  subtitles: "des sous-titres",
  cover: "une couverture après la publication",
};

/** Autorisation à ajouter, telle que l'interface la propose. */
const AUTHORIZE_LABELS: Record<PublishFollowUpKind, string> = {
  comment: "Autoriser les commentaires",
  subtitles: "Autoriser les sous-titres",
  cover: "Autoriser la couverture",
};

/** Nom de fichier venu d'un module : un nom seul, jamais un chemin. */
function assertFileName(value: unknown, what: string): string {
  if (typeof value !== "string" || !value || value.length > 255 || /[\\/\u0000-\u001f]/.test(value) || value === "." || value === "..") {
    throw new Error(`${what} invalide.`);
  }
  return value;
}

const optionalId = (value: unknown) => (typeof value === "string" && /^[A-Za-z0-9_.:-]{1,200}$/.test(value) ? value : undefined);

/** Lit et vérifie la forme des suites demandées. */
function readFollowUpsInput(input: unknown): PublishFollowUpsInput {
  if (input === undefined || input === null) return {};
  if (typeof input !== "object") throw new Error("Suites de publication invalides.");
  const raw = input as Record<string, unknown>;
  const result: PublishFollowUpsInput = {};
  if (raw.comment !== undefined && raw.comment !== null) {
    if (typeof raw.comment !== "string") throw new Error("Premier commentaire invalide.");
    const text = raw.comment
      .replace(/\r\n?/g, "\n")
      .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "")
      .trim();
    if (text.length > COMMENT_HARD_LIMIT) throw new Error("Premier commentaire trop long.");
    if (text) result.comment = text;
  }
  if (raw.subtitles !== undefined && raw.subtitles !== null) {
    const subtitles = raw.subtitles as Record<string, unknown>;
    const file = assertFileName(subtitles?.file, "Fichier de sous-titres");
    const language = typeof subtitles.language === "string" ? subtitles.language.trim() : "";
    if (!/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(language)) throw new Error("Langue des sous-titres invalide (code BCP 47 attendu, « fr », « en-US »…).");
    const id = optionalId(subtitles.id);
    result.subtitles = { file, language, ...(id ? { id } : {}) };
  }
  if (raw.cover !== undefined && raw.cover !== null) {
    const cover = raw.cover as Record<string, unknown>;
    const file = assertFileName(cover?.file, "Fichier de couverture");
    const positive = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value) : undefined);
    const id = optionalId(cover.id);
    const width = positive(cover.width);
    const height = positive(cover.height);
    const bytes = positive(cover.bytes);
    result.cover = {
      file,
      ...(id ? { id } : {}),
      ...(typeof cover.mimeType === "string" && /^image\/[a-z0-9.+-]+$/.test(cover.mimeType) ? { mimeType: cover.mimeType } : {}),
      ...(width ? { width } : {}),
      ...(height ? { height } : {}),
      ...(bytes ? { bytes } : {}),
    };
  }
  return result;
}

/**
 * Couverture qu'un service ne prend qu'à la publication (Instagram) : elle
 * devient la couverture de la source, et l'option du connecteur qui la fait
 * servir est fixée. Une source qui a déjà sa couverture la garde.
 */
function applyPublishCover(
  connector: Connector,
  source: PublishSource,
  options: unknown,
  cover: PublishFollowUpsInput["cover"]
): { source: PublishSource; options: unknown; coverAtPublish: boolean } {
  const support = connector.followUps?.cover;
  if (!cover || support?.mode !== "publish" || (source.kind !== "video" && source.kind !== "image")) return { source, options, coverAtPublish: false };
  if (support.sourceKinds && !support.sourceKinds.includes(source.kind)) return { source, options, coverAtPublish: false };
  const base = options && typeof options === "object" ? { ...(options as Record<string, unknown>) } : {};
  if (support.option) base[support.option.key] = support.option.value;
  if (source.cover) return { source, options: base, coverAtPublish: true };
  const withCover: PublishSource = {
    ...source,
    cover: {
      id: cover.id ?? source.id,
      kind: "image" as const,
      file: cover.file,
      bytes: cover.bytes ?? 0,
      ...(cover.mimeType ? { mimeType: cover.mimeType } : {}),
      ...(cover.width ? { width: cover.width } : {}),
      ...(cover.height ? { height: cover.height } : {}),
    },
  };
  return { source: withCover, options: base, coverAtPublish: true };
}

function skippedFollowUp(entry: PublishFollowUp, code: NonNullable<PublishFollowUp["skipCode"]>, note: string): PublishFollowUp {
  const { checkAt: _checkAt, ...rest } = entry;
  void _checkAt;
  return { ...rest, state: "skipped", skipCode: code, note, updatedAt: Date.now() };
}

/** Le service accepte-t-il cette suite pour ce type de source ? */
function followUpSupported(connector: Connector, kind: PublishFollowUpKind, source: PublishSource): boolean {
  const support = connector.followUps?.[kind];
  if (!support) return false;
  if (support.sourceKinds && !support.sourceKinds.includes(source.kind)) return false;
  if (kind === "comment") return Boolean(connector.postComment);
  if (kind === "subtitles") return Boolean(connector.uploadSubtitles);
  return connector.followUps?.cover?.mode === "publish" || Boolean(connector.setCover);
}

/**
 * Suites d'un nouveau travail. Ce que le service ne permet pas, ou ce que le
 * compte n'a pas autorisé, est rangé « skipped » avec la raison (jamais une
 * erreur : la publication part quand même). Un commentaire trop long, ou des
 * sous-titres dans un format refusé, sont refusés avant d'entrer dans la file.
 */
function buildFollowUps(
  connector: Connector,
  account: AccountSummary,
  source: PublishSource,
  input: PublishFollowUpsInput,
  coverAtPublish: boolean
): PublishFollowUp[] {
  const now = Date.now();
  const entries: PublishFollowUp[] = [];
  const add = (entry: Omit<PublishFollowUp, "state" | "attempts" | "updatedAt">) => {
    let followUp: PublishFollowUp = { ...entry, state: "waiting", attempts: 0, updatedAt: now };
    const capability = FOLLOW_UP_CAPABILITY[entry.kind];
    if (!followUpSupported(connector, entry.kind, source)) {
      followUp = skippedFollowUp(followUp, "unsupported", `${connector.label} ne permet pas d’ajouter ${FOLLOW_UP_LABELS[entry.kind]} à cette publication.`);
    } else if (!entry.atPublish && !account.capabilities.includes(capability)) {
      followUp = skippedFollowUp(
        followUp,
        "unauthorized",
        `Autorisation manquante chez ${connector.label} : « ${AUTHORIZE_LABELS[entry.kind]} » relance la connexion du compte avec cette permission en plus.`
      );
    }
    entries.push(followUp);
  };
  if (input.comment) {
    const limit = connector.followUps?.comment;
    if (limit && followUpSupported(connector, "comment", source)) {
      const used = countText(input.comment, limit.count);
      if (used > limit.maxLength) throw new Error(`Premier commentaire trop long pour ${connector.label} : ${used} caractères, ${limit.maxLength} au plus.`);
    }
    add({ kind: "comment", text: input.comment });
  }
  if (input.subtitles) {
    const formats = connector.followUps?.subtitles?.formats;
    const extension = path.extname(input.subtitles.file).slice(1).toLowerCase();
    if (formats && followUpSupported(connector, "subtitles", source) && !formats.includes(extension)) {
      throw new Error(`${connector.label} n’accepte que des sous-titres au format ${formats.map((format) => `.${format}`).join(", ")}.`);
    }
    add({ kind: "subtitles", file: input.subtitles.file, language: input.subtitles.language, ...(input.subtitles.id ? { fileId: input.subtitles.id } : {}) });
  }
  if (input.cover) {
    add({ kind: "cover", file: input.cover.file, ...(input.cover.id ? { fileId: input.cover.id } : {}), ...(coverAtPublish ? { atPublish: true } : {}) });
  }
  return entries;
}

/** Modifie une suite d'un travail ; une clé à `undefined` est retirée. */
function patchFollowUp(jobId: string, kind: PublishFollowUpKind, patch: Partial<PublishFollowUp>): PublishFollowUp | null {
  let updated: PublishFollowUp | null = null;
  changeJobs((jobs) => {
    const job = jobs.find((entry) => entry.id === jobId);
    const followUp = job?.followUps?.find((entry) => entry.kind === kind);
    if (!job || !followUp) return;
    Object.assign(followUp, patch, { updatedAt: Date.now() });
    for (const key of Object.keys(patch) as (keyof PublishFollowUp)[]) if (patch[key] === undefined) delete followUp[key];
    job.updatedAt = Date.now();
    updated = { ...followUp };
  });
  return updated;
}

/**
 * Passe sur les suites dues des publications faites (toutes avec `all`).
 * Hors du verrou d'envoi ; un seul passage à la fois. Appelé par la boucle de
 * suivi, au démarrage et après chaque publication.
 */
export function runFollowUps(options: { all?: boolean } = {}): Promise<void> {
  if (state.followUpPromise) return state.followUpPromise;
  const promise: Promise<void> = Promise.resolve()
    .then(async () => {
      const due: { jobId: string; kind: PublishFollowUpKind }[] = [];
      const now = Date.now();
      for (const job of readJobs()) {
        if (job.state !== "done" || !job.result) continue;
        for (const entry of job.followUps ?? []) {
          if (entry.state === "waiting" && (options.all || !entry.checkAt || entry.checkAt <= now)) due.push({ jobId: job.id, kind: entry.kind });
        }
      }
      // Le commentaire en dernier : couverture et sous-titres ne dépendent pas de la visibilité.
      const order: Record<PublishFollowUpKind, number> = { cover: 0, subtitles: 1, comment: 2 };
      due.sort((a, b) => order[a.kind] - order[b.kind]);
      for (const { jobId, kind } of due) await runFollowUp(jobId, kind);
    })
    .finally(() => {
      if (state.followUpPromise === promise) state.followUpPromise = null;
    });
  state.followUpPromise = promise;
  return promise;
}

/** Chemin du fichier d'une suite, résolu par le module propriétaire. */
function resolveFollowUpFile(job: PublishJob, entry: PublishFollowUp): Promise<string> {
  return state.resolveSource({ module: job.source.module, id: entry.fileId ?? job.source.id, file: entry.file, purpose: entry.kind === "subtitles" ? "subtitles" : "cover" });
}

/** Une suite : vérifications, appel au connecteur, puis rangement de ce qu'il rend. */
async function runFollowUp(jobId: string, kind: PublishFollowUpKind) {
  const job = readJobs().find((entry) => entry.id === jobId);
  const entry = job?.followUps?.find((candidate) => candidate.kind === kind);
  if (!job || !entry || job.state !== "done" || !job.result || entry.state !== "waiting") return;
  const now = Date.now();
  // Couverture envoyée avec la publication : rien à faire de plus.
  if (entry.atPublish) {
    patchFollowUp(jobId, kind, { state: "done", result: { ...job.result }, note: "Couverture envoyée avec la publication.", checkAt: undefined, error: undefined });
    return;
  }
  const connector = getConnector(job.connector);
  if (!connector || !followUpSupported(connector, kind, job.source)) {
    patchFollowUp(jobId, kind, skippedFollowUp(entry, "unsupported", `${connector?.label ?? "Ce service"} ne permet pas d’ajouter ${FOLLOW_UP_LABELS[kind]}.`));
    return;
  }
  const account = getAccountSummary(job.accountId);
  if (!account) {
    patchFollowUp(jobId, kind, skippedFollowUp(entry, "cancelled", "Le compte a été déconnecté."));
    return;
  }
  if (account.status !== "connected") {
    patchFollowUp(jobId, kind, { checkAt: now + 60 * 60 * 1000, note: RECONNECT_NOTE });
    return;
  }
  if (!account.capabilities.includes(FOLLOW_UP_CAPABILITY[kind])) {
    patchFollowUp(
      jobId,
      kind,
      skippedFollowUp(entry, "unauthorized", `Autorisation manquante chez ${connector.label} : « ${AUTHORIZE_LABELS[kind]} » relance la connexion du compte avec cette permission en plus.`)
    );
    return;
  }
  const paused = quotaPausedUntil(connector, now) ?? accountQuotaPausedUntil(job.accountId, now);
  if (paused) {
    patchFollowUp(jobId, kind, { checkAt: paused, note: "Quota du service épuisé : la suite reprendra après la remise à zéro." });
    return;
  }

  const attempt = entry.attempts + 1;
  patchFollowUp(jobId, kind, { attempts: attempt });
  try {
    const { context } = accountContext(job.accountId);
    const followUpContext: FollowUpContext = {
      ...context,
      result: { ...job.result },
      source: job.source,
      options: job.options,
      attempt,
      resume: entry.resume,
      saveProgress: (resume) => void patchFollowUp(jobId, kind, { resume }),
    };
    let outcome: FollowUpOutcome;
    if (kind === "comment") {
      outcome = await connector.postComment!(followUpContext, entry.text ?? "");
    } else if (kind === "subtitles") {
      const filePath = await resolveFollowUpFile(job, entry);
      outcome = await connector.uploadSubtitles!(followUpContext, { path: filePath, language: entry.language ?? "fr" });
    } else {
      const filePath = await resolveFollowUpFile(job, entry);
      outcome = await connector.setCover!(followUpContext, { path: filePath, mimeType: mimeTypeOfName(entry.file ?? filePath) });
    }
    settleFollowUp(jobId, entry, outcome);
  } catch (error) {
    failFollowUp(jobId, entry, connector, job.accountId, error);
  }
}

/** Range ce qu'a rendu le connecteur : faite, à reprendre, ou abandonnée sans erreur. */
function settleFollowUp(jobId: string, entry: PublishFollowUp, outcome: FollowUpOutcome) {
  const now = Date.now();
  if (isFollowUpSkipped(outcome)) {
    patchFollowUp(jobId, entry.kind, { ...skippedFollowUp(entry, "service", String(outcome.note || "Suite non faite.").slice(0, 300)), resume: undefined, error: undefined });
    return;
  }
  if (isFollowUpPending(outcome)) {
    const note = String(outcome.note || "En attente chez le service.").slice(0, 300);
    const waitingSince = entry.waitingSince ?? now;
    const explicit = typeof outcome.retryAt === "number" && Number.isFinite(outcome.retryAt) ? outcome.retryAt : undefined;
    if (explicit !== undefined && explicit > now + MAX_DELAY_MS) {
      patchFollowUp(jobId, entry.kind, { ...skippedFollowUp(entry, "expired", `${note} La date annoncée est trop lointaine : la suite est abandonnée.`), resume: undefined });
      return;
    }
    // Sans date annoncée (vidéo restée privée), l'attente est bornée.
    if (explicit === undefined && now - waitingSince > FOLLOW_UP_MAX_WAIT_MS) {
      patchFollowUp(jobId, entry.kind, { ...skippedFollowUp(entry, "expired", `${note} Toujours impossible après trente jours : la suite est abandonnée.`), resume: undefined });
      return;
    }
    const delay = Math.min(Math.max(Number(outcome.retryAfterMs) || 0, FOLLOW_UP_MIN_DELAY_MS), FOLLOW_UP_MAX_DELAY_MS);
    patchFollowUp(jobId, entry.kind, { checkAt: Math.max(explicit ?? now + delay, now + FOLLOW_UP_MIN_DELAY_MS), waitingSince, note, error: undefined });
    return;
  }
  const result = {
    ...(typeof outcome.externalId === "string" && outcome.externalId ? { externalId: outcome.externalId } : {}),
    ...(typeof outcome.url === "string" && /^https:\/\//.test(outcome.url) ? { url: outcome.url } : {}),
  };
  patchFollowUp(jobId, entry.kind, {
    state: "done",
    result: Object.keys(result).length > 0 ? result : undefined,
    note: typeof outcome.note === "string" && outcome.note ? outcome.note.slice(0, 300) : undefined,
    error: undefined,
    checkAt: undefined,
    resume: undefined,
    skipCode: undefined,
  });
}

/** Erreur d'une suite : quota, reconnexion, erreur passagère (nouvel essai) ou échec. Jamais l'échec du travail. */
function failFollowUp(jobId: string, entry: PublishFollowUp, connector: Connector, accountId: string, error: unknown) {
  const now = Date.now();
  const message = errorMessage(error, "Suite de publication impossible.").slice(0, 300);
  if (error instanceof QuotaExceededError) {
    let retryAt: number;
    if (error.scope === "account") {
      retryAt = error.retryAt > now ? error.retryAt : now + 60 * 60 * 1000;
      markAccountQuotaExhausted(accountId, retryAt);
    } else {
      retryAt = markQuotaExhausted(connector, error.bucket);
    }
    patchFollowUp(jobId, entry.kind, { checkAt: retryAt, note: message });
    return;
  }
  if (error instanceof ReconnectRequiredError) {
    noteReconnectRequired(accountId, error);
    patchFollowUp(jobId, entry.kind, { checkAt: now + 60 * 60 * 1000, note: RECONNECT_NOTE, error: message });
    return;
  }
  if (isTransientError(error)) {
    const errorCount = (entry.errorCount ?? 0) + 1;
    if (errorCount < FOLLOW_UP_MAX_ERRORS) {
      const delay = FOLLOW_UP_BACKOFF_MS[Math.min(errorCount - 1, FOLLOW_UP_BACKOFF_MS.length - 1)];
      patchFollowUp(jobId, entry.kind, { errorCount, checkAt: now + delay, error: message, note: "Nouvel essai prévu après une erreur passagère." });
      return;
    }
    patchFollowUp(jobId, entry.kind, { state: "failed", errorCount, error: message, checkAt: undefined, note: undefined });
    return;
  }
  patchFollowUp(jobId, entry.kind, { state: "failed", error: message, checkAt: undefined, note: undefined });
}

/** « Réessayer » une suite en échec ou non faite (après avoir ajouté l'autorisation…). */
export function retryFollowUp(jobId: string, kind: PublishFollowUpKind): PublishJobSummary {
  const job = readJobs().find((entry) => entry.id === jobId);
  if (!job) throw new Error("Travail introuvable.");
  const entry = job.followUps?.find((candidate) => candidate.kind === kind);
  if (!entry) throw new Error("Cette publication n’a pas cette suite.");
  if (entry.state === "failed" || entry.state === "skipped") {
    patchFollowUp(jobId, kind, { state: "waiting", error: undefined, note: undefined, skipCode: undefined, checkAt: undefined, errorCount: undefined, waitingSince: undefined });
    scheduleProcessing();
  }
  return summarize(readJobs().find((candidate) => candidate.id === jobId)!);
}

/** Annule une suite qui attend encore (le premier commentaire d'une vidéo restée privée…). */
export function cancelFollowUp(jobId: string, kind: PublishFollowUpKind): PublishJobSummary {
  const job = readJobs().find((entry) => entry.id === jobId);
  if (!job) throw new Error("Travail introuvable.");
  const entry = job.followUps?.find((candidate) => candidate.kind === kind);
  if (!entry) throw new Error("Cette publication n’a pas cette suite.");
  if (entry.state === "waiting") patchFollowUp(jobId, kind, { ...skippedFollowUp(entry, "cancelled", "Suite annulée."), resume: undefined });
  return summarize(readJobs().find((candidate) => candidate.id === jobId)!);
}
