/**
 * Écran « Idées » côté serveur : recherche d'idées, autres accroches,
 * chaînes de référence proposées et étude de la niche. Chaque travail long
 * (Codex, lecture des chaînes) tourne en arrière-plan ; l'écran suit son
 * état par `getTask`. Les dépendances (Codex, marque, comptes connectés) sont
 * fournies par l'appelant : les tests les remplacent.
 */

import type { AccountSummary, ChannelQuery, ChannelReadOptions, ChannelVideos, QuotaUsage } from "@/lib/connections/types";
import type { CodexOptions } from "./codex";
import {
  channelsPrompt,
  checkMix,
  conceptsPrompt,
  hooksPrompt,
  ideasPrompt,
  mergeConcepts,
  mixTargets,
  parseHooks,
  parseIdeas,
  parseSuggestedChannels,
  type HistoryEntry,
  type IdeaBrand,
  type MeasuredShort,
} from "./ideas";
import { channelStat, measureChannel, recentHits, SHORT_MAX_SECONDS, SHORTS_PER_CHANNEL } from "./idea-scoring";
import { DETAILS_PER_ACCOUNT, DETAILS_TOTAL, OUTLIER_SCORE, measureOrdered, outliersOf, pickForDetails, rankOutliers, trustedMeasure, type AccountMeasure } from "./niche-measure";
import type { PublicNicheReader } from "./niche-public";
import {
  BANK_LIMITS,
  DEFAULT_IDEA_SETTINGS,
  IDEA_ASPECTS,
  IDEA_LIMITS,
  IDEA_TEMPLATES,
  NEWS_SHARES,
  NO_KIT,
  STUDY_INTERVAL_MS,
  cleanChannelHandle,
  type ChannelStat,
  type ConceptBank,
  type Idea,
  type IdeaSettings,
  type IdeaStatus,
  type IdeaTask,
  type IdeaTaskKind,
  type IdeaTaskStep,
  type IdeaTaskStepState,
  type NicheOutlier,
  type NicheStudy,
  type ReferenceChannel,
  type StudySource,
} from "./idea-types";
import { IDEA_ID, KIT_ID, bankKey, changeIdea, newId, readBank, readIdeas, writeBank, writeIdeas } from "./idea-store";
import { cleanScriptText, frenchTypography } from "./script-rules";

/** Recherche avec le web : plus longue qu'une réponse de mémoire. */
const WEB_TIMEOUT_MS = 6 * 60 * 1000;
const PLAIN_TIMEOUT_MS = 4 * 60 * 1000;
/** Envois examinés par chaîne : deux pages de 50 au plus, pour trouver 30 vidéos courtes. */
export const STUDY_READ: ChannelReadOptions = { scan: 100, wantShorts: SHORTS_PER_CHANNEL, shortMaxSeconds: SHORT_MAX_SECONDS };
/** Un flop : moins de la moitié de la médiane de sa chaîne. */
const FLOP_SCORE = 0.5;

export interface IdeaDeps {
  ask(prompt: string, options: CodexOptions): Promise<string>;
  /** Fiche de la marque réduite aux idées, et ses comptes connectés ; `null` sans marque. */
  loadBrand(kitId: string): Promise<{ brand: IdeaBrand; accountIds: string[] } | null>;
  /** Vidéos déjà faites : projets (noms et demandes) et exports. */
  history(): HistoryEntry[];
  /** Comptes qui savent lire une chaîne publique. */
  researchAccounts(): AccountSummary[];
  readChannel(accountId: string, query: ChannelQuery, options: ChannelReadOptions): Promise<ChannelVideos>;
  channelCost(accountId: string, options: ChannelReadOptions): { min: number; max: number } | null;
  quota(accountId: string): QuotaUsage | null;
  /** État d'un travail de l'assistant, pour savoir si une idée est devenue un projet. */
  assistantJob(id: string): { status: string; projectId?: string } | null;
  /**
   * Lecteur public des comptes (yt-dlp, sans compte connecté), un neuf par
   * étude ; absent : l'étude ne passe que par un compte connecté.
   */
  publicReader?: () => PublicNicheReader;
  now(): Date;
}

// ─── Travaux en cours ────────────────────────────────────────────

const holder = globalThis as typeof globalThis & { __clipIdeaTasks?: Map<string, IdeaTask>; __clipIdeaControllers?: Map<string, AbortController> };
const tasks = (holder.__clipIdeaTasks ??= new Map<string, IdeaTask>());
/** Arrêt des travaux en cours, par identifiant ; retiré à la fin du travail. */
const controllers = (holder.__clipIdeaControllers ??= new Map<string, AbortController>());

function startTask(kind: IdeaTaskKind, step: string, extra: Partial<IdeaTask>, work: (task: IdeaTask, signal: AbortSignal) => Promise<string[] | void>): IdeaTask {
  // Un seul travail de chaque sorte par marque (ou par idée) à la fois.
  for (const task of tasks.values()) {
    if (task.status === "running" && task.kind === kind && task.kitId === extra.kitId && task.ideaId === extra.ideaId) {
      throw new Error("Ce travail est déjà en cours\u00a0: attendez qu'il se termine.");
    }
  }
  if (kind === "study" && [...tasks.values()].some((task) => task.status === "running" && task.kind === "study")) {
    throw new Error("Une étude de niche est déjà en cours.");
  }
  const task: IdeaTask = { id: newId("task"), kind, status: "running", step, startedAt: Date.now(), ...extra };
  tasks.set(task.id, task);
  // Les plus anciens travaux terminés sont oubliés : la liste reste courte.
  const finished = [...tasks.values()].filter((entry) => entry.status !== "running").sort((a, b) => a.startedAt - b.startedAt);
  for (const entry of finished.slice(0, Math.max(0, finished.length - 30))) tasks.delete(entry.id);
  const controller = new AbortController();
  controllers.set(task.id, controller);
  void work(task, controller.signal)
    .then(
      (notes) => {
        task.status = "done";
        task.step = "Terminé";
        if (notes?.length) task.notes = notes;
      },
      (error) => {
        if (controller.signal.aborted) {
          // Arrêté à la demande : l'étape en cours passe, rien n'a été enregistré.
          task.status = "canceled";
          task.step = "Annulé";
          task.steps = task.steps?.map((entry) => (entry.state === "running" || entry.state === "pending" ? { ...entry, state: "skipped", detail: entry.state === "running" ? "Annulée" : entry.detail } : entry));
          return;
        }
        task.status = "error";
        task.error = error instanceof Error ? error.message : "Travail impossible";
      }
    )
    .finally(() => {
      task.finishedAt = Date.now();
      controllers.delete(task.id);
    });
  return { ...task };
}

/** Arrête un travail en cours ; `false` s'il n'existe pas ou s'est déjà terminé. */
export function cancelTask(id: unknown): boolean {
  const controller = typeof id === "string" ? controllers.get(id) : undefined;
  if (!controller) return false;
  controller.abort();
  return true;
}

export function getTask(id: unknown): IdeaTask | null {
  const task = typeof id === "string" ? tasks.get(id) : undefined;
  return task ? { ...task, ...(task.steps ? { steps: task.steps.map((entry) => ({ ...entry })) } : {}) } : null;
}

export function runningTasks(kitId: string | undefined): IdeaTask[] {
  return [...tasks.values()].filter((task) => task.status === "running" && (task.kitId === kitId || task.kind === "study")).map((task) => ({ ...task }));
}

// ─── Réglages ────────────────────────────────────────────────────

export function cleanSettings(raw: unknown): IdeaSettings {
  const entry = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const templates = (Array.isArray(entry.templates) ? entry.templates : []).filter((template): template is IdeaSettings["templates"][number] =>
    IDEA_TEMPLATES.includes(template as IdeaSettings["templates"][number])
  );
  const share = Number(entry.newsShare);
  return {
    kitId: typeof entry.kitId === "string" && KIT_ID.test(entry.kitId) ? entry.kitId : null,
    count: Math.min(IDEA_LIMITS.perSearch.max, Math.max(IDEA_LIMITS.perSearch.min, Math.round(Number(entry.count) || DEFAULT_IDEA_SETTINGS.count))),
    newsShare: NEWS_SHARES.includes(share) ? share : DEFAULT_IDEA_SETTINGS.newsShare,
    templates: templates.length ? [...new Set(templates)] : [...IDEA_TEMPLATES],
    aspect: IDEA_ASPECTS.includes(entry.aspect as IdeaSettings["aspect"]) ? (entry.aspect as IdeaSettings["aspect"]) : "9:16",
    topic: cleanScriptText(entry.topic, IDEA_LIMITS.topic),
    web: entry.web !== false,
  };
}

// ─── Tableau de l'écran ──────────────────────────────────────────

/** Une idée lancée en création devient « faite » quand l'assistant a rendu son projet. */
export function resolveDoneIdeas(ideas: Idea[], assistantJob: IdeaDeps["assistantJob"]): { ideas: Idea[]; changed: boolean } {
  let changed = false;
  const next = ideas.map((idea) => {
    if (!idea.jobId || idea.status === "done") return idea;
    const job = assistantJob(idea.jobId);
    if (job?.status === "done" && job.projectId) {
      changed = true;
      return { ...idea, status: "done" as IdeaStatus, projectId: job.projectId, updatedAt: Date.now() };
    }
    if (!job || job.status === "error" || job.status === "canceled") {
      changed = true;
      const { jobId: _dropped, ...rest } = idea;
      return { ...rest, updatedAt: Date.now() };
    }
    return idea;
  });
  return { ideas: next, changed };
}

export interface StudyEstimate {
  channels: number;
  /** Sa propre chaîne est lue aussi. */
  own: boolean;
  min: number;
  max: number;
  /** Unités restantes aujourd'hui chez le service, si elles sont connues. */
  remaining?: number;
  limit?: number;
  resetsAt?: number;
}

export function estimateStudy(bank: ConceptBank, accountId: string | undefined, ownMeasured: boolean, deps: Pick<IdeaDeps, "channelCost" | "quota">): StudyEstimate | null {
  if (!accountId) return null;
  const cost = deps.channelCost(accountId, STUDY_READ);
  if (!cost) return null;
  const channels = Math.min(BANK_LIMITS.studied, bank.channels.filter((channel) => channel.state === "active").length);
  const reads = channels + (ownMeasured ? 1 : 0);
  const usage = deps.quota(accountId);
  const general = usage?.buckets.find((bucket) => bucket.id === "general") ?? usage?.buckets[0];
  return {
    channels,
    own: ownMeasured,
    min: reads * cost.min,
    max: reads * cost.max,
    ...(general ? { remaining: Math.max(0, general.limit - general.used), limit: general.limit } : {}),
    ...(usage ? { resetsAt: usage.resetsAt } : {}),
  };
}

/** Appels de yt-dlp d'une étude publique : un par chaîne, puis le détail des plus fortes (borné). */
export function publicReads(bank: ConceptBank): { min: number; max: number } {
  const channels = Math.min(BANK_LIMITS.studied, bank.channels.filter((channel) => channel.state === "active").length);
  return { min: channels, max: channels + Math.min(DETAILS_TOTAL, channels * DETAILS_PER_ACCOUNT) };
}

export interface IdeasBoard {
  kitId: string | null;
  ideas: Idea[];
  bank: ConceptBank;
  accounts: { id: string; name: string; handle?: string; avatarUrl?: string; logo: string; linked: boolean }[];
  accountId?: string;
  estimate: StudyEstimate | null;
  /** Dernière étude il y a plus d'un mois (ou jamais). */
  studyDue: boolean;
  /** Lecture publique possible (yt-dlp, sans compte) et son nombre d'appels, du plus petit au plus grand. */
  publicReading: { available: boolean; reads: { min: number; max: number } };
  tasks: IdeaTask[];
}

/** Compte proposé pour l'étude : celui de la marque s'il sait lire, sinon le premier. */
function pickAccount(accounts: AccountSummary[], linked: string[], wanted?: string): AccountSummary | undefined {
  return accounts.find((account) => account.id === wanted) ?? accounts.find((account) => linked.includes(account.id)) ?? accounts[0];
}

export async function getBoard(input: { kitId?: unknown; accountId?: unknown }, deps: IdeaDeps): Promise<IdeasBoard> {
  const kitId = typeof input?.kitId === "string" && KIT_ID.test(input.kitId) ? input.kitId : null;
  const stored = readIdeas();
  const resolved = resolveDoneIdeas(stored, deps.assistantJob);
  if (resolved.changed) writeIdeas(resolved.ideas);
  const ideas = resolved.ideas.filter((idea) => (idea.kitId ?? null) === kitId).sort((a, b) => b.createdAt - a.createdAt);
  const bank = readBank(kitId);
  const brand = kitId ? await deps.loadBrand(kitId) : null;
  const linked = brand?.accountIds ?? [];
  const accounts = deps.researchAccounts().filter((account) => account.status === "connected");
  const chosen = pickAccount(accounts, linked, typeof input?.accountId === "string" ? input.accountId : bank.study?.accountId);
  const ownMeasured = Boolean(chosen && (!kitId || linked.includes(chosen.id)));
  return {
    kitId,
    ideas,
    bank,
    accounts: accounts.map((account) => ({
      id: account.id,
      name: account.displayName,
      ...(account.handle ? { handle: account.handle } : {}),
      ...(account.avatarUrl ? { avatarUrl: account.avatarUrl } : {}),
      logo: account.logo,
      linked: linked.includes(account.id),
    })),
    ...(chosen ? { accountId: chosen.id } : {}),
    estimate: estimateStudy(bank, chosen?.id, ownMeasured, deps),
    studyDue: !bank.study || deps.now().getTime() - bank.study.at > STUDY_INTERVAL_MS,
    publicReading: { available: Boolean(deps.publicReader), reads: publicReads(bank) },
    tasks: runningTasks(kitId ?? undefined),
  };
}

// ─── Trouver des idées ───────────────────────────────────────────

/** Vidéos faites et idées déjà proposées, écartées comprises : aucune n'est reproposée. */
function ideaHistory(deps: IdeaDeps, ideas: Idea[]): HistoryEntry[] {
  return [...deps.history(), ...ideas.map((idea) => ({ title: idea.title }))];
}

/** Titres d'autres chaînes lus à la dernière étude : jamais recopiés. */
function foreignTitles(bank: ConceptBank): string[] {
  const titles = [
    ...(bank.study?.channels ?? []).flatMap((stat) => stat.top.map((video) => video.title)),
    ...bank.concepts.flatMap((concept) => concept.proofs.filter((proof) => !proof.own).map((proof) => proof.title)),
    ...bank.concepts.flatMap((concept) => concept.flops.map((flop) => flop.title)),
  ];
  return [...new Set(titles.filter(Boolean))];
}

export async function searchIdeas(settings: IdeaSettings, deps: IdeaDeps, onStep: (step: string) => void = () => undefined): Promise<{ ideas: Idea[]; notes: string[] }> {
  const now = deps.now();
  const loaded = settings.kitId ? await deps.loadBrand(settings.kitId) : null;
  const bank = readBank(settings.kitId);
  const stored = readIdeas();
  const ownHits = bank.study?.own?.recentHits.filter((hit) => !hit.publishedAt || now.getTime() - Date.parse(hit.publishedAt) <= 14 * 24 * 60 * 60 * 1000) ?? [];
  const context = {
    settings,
    brand: loaded?.brand ?? null,
    concepts: bank.concepts,
    history: ideaHistory(deps, stored),
    dismissed: stored
      .filter((idea) => idea.status === "dismissed")
      .slice(0, 30)
      .map((idea) => ({ title: idea.title, hook: idea.hook })),
    ownHits,
    ...(bank.study?.own
      ? { ownStats: { median: bank.study.own.median, shorts: bank.study.own.shorts, small: bank.study.own.small, top: bank.study.own.top.map((video) => ({ title: video.title, score: video.score })) } }
      : {}),
    foreignTitles: foreignTitles(bank),
    now,
  };
  const targets = mixTargets(settings.count, settings, { concepts: bank.concepts.length, recentHits: ownHits.length });
  onStep(settings.web ? "Codex cherche des sujets et vérifie l'actualité sur le web…" : "Codex cherche des sujets…");
  const answer = await deps.ask(ideasPrompt(context, targets), { search: settings.web, timeoutMs: settings.web ? WEB_TIMEOUT_MS : PLAIN_TIMEOUT_MS });
  const parsed = parseIdeas(answer, context);
  if (parsed.ideas.length === 0) throw new Error(parsed.notes[0] ?? "Codex n'a rendu aucune idée utilisable.");
  const batchId = newId("batch");
  const at = Date.now();
  const ideas: Idea[] = parsed.ideas.map((idea, index) => ({ ...idea, id: newId("idea"), status: "new", batchId, createdAt: at + index, updatedAt: at }));
  writeIdeas([...ideas, ...readIdeas()]);
  const mix = checkMix(ideas, targets, { concepts: bank.concepts.length, recentHits: ownHits.length, web: settings.web, count: settings.count });
  const summary = `${ideas.length} idée(s)\u00a0: ${mix.counts.proven} sur des concepts prouvés, ${mix.counts.news} actualité(s), ${mix.counts.remake} reprise(s), ${mix.counts.fresh} nouvelle(s).`;
  const understood = parsed.subject ? [`Sujet compris\u00a0: ${parsed.subject}`] : [];
  return { ideas, notes: [summary, ...understood, ...mix.notes, ...parsed.notes] };
}

export function startIdeaSearch(raw: unknown, deps: IdeaDeps): IdeaTask {
  const settings = cleanSettings(raw);
  return startTask("ideas", "Préparation…", { ...(settings.kitId ? { kitId: settings.kitId } : {}) }, async (task) => {
    const { notes } = await searchIdeas(settings, deps, (step) => (task.step = step));
    return notes;
  });
}

// ─── Statut et accroches d'une idée ──────────────────────────────

/** Garder, écarter ou remettre parmi les nouvelles. « Faite » ne se pose que par une création. */
export function setIdeaStatus(id: unknown, status: unknown): Idea {
  if (status !== "new" && status !== "kept" && status !== "dismissed") throw new Error("Statut invalide");
  return changeIdea(id, (idea) => {
    if (idea.status === "done") throw new Error("Cette idée a déjà donné une vidéo.");
    return { ...idea, status };
  });
}

/** Remplace l'accroche par une des variantes proposées ; l'ancienne rejoint les variantes. */
export function chooseIdeaHook(id: unknown, hook: unknown): Idea {
  return changeIdea(id, (idea) => {
    const alternatives = idea.altHooks ?? [];
    if (typeof hook !== "string" || !alternatives.includes(hook)) throw new Error("Accroche inconnue pour cette idée");
    return { ...idea, hook, altHooks: [idea.hook, ...alternatives.filter((entry) => entry !== hook)].slice(0, IDEA_LIMITS.altHooks * 2) };
  });
}

export function startHookVariants(id: unknown, deps: IdeaDeps): IdeaTask {
  if (typeof id !== "string" || !IDEA_ID.test(id)) throw new Error("Idée invalide");
  const idea = readIdeas().find((entry) => entry.id === id);
  if (!idea) throw new Error("Idée introuvable");
  return startTask("hooks", "Codex écrit d'autres accroches…", { ideaId: id, ...(idea.kitId ? { kitId: idea.kitId } : {}) }, async () => {
    const loaded = idea.kitId ? await deps.loadBrand(idea.kitId) : null;
    const bank = readBank(idea.kitId);
    const concept = bank.concepts.find((entry) => entry.id === idea.concept.conceptId);
    const answer = await deps.ask(hooksPrompt(idea, loaded?.brand ?? null, concept), { timeoutMs: PLAIN_TIMEOUT_MS });
    const hooks = parseHooks(answer, idea, foreignTitles(bank));
    if (hooks.length === 0) throw new Error("Codex n'a rendu aucune accroche nouvelle.");
    changeIdea(id, (current) => ({ ...current, altHooks: [...hooks, ...(current.altHooks ?? [])].slice(0, IDEA_LIMITS.altHooks * 2) }));
  });
}

/** Une création est lancée depuis l'idée : son travail est noté, l'idée deviendra « faite » avec le projet. */
export function linkIdeaToJob(id: unknown, jobId: string): Idea | null {
  try {
    return changeIdea(id, (idea) => ({ ...idea, jobId }));
  } catch {
    // Idée retirée entre-temps : la création continue sans elle.
    return null;
  }
}

// ─── Chaînes de référence ────────────────────────────────────────

export function addReferenceChannel(kitId: unknown, handle: unknown): ConceptBank {
  const clean = cleanChannelHandle(handle);
  if (!clean) throw new Error("Identifiant de chaîne invalide\u00a0: «\u00a0@nom\u00a0», de 3 à 30 caractères.");
  const bank = readBank(kitId);
  const existing = bank.channels.find((channel) => channel.handle.toLowerCase() === clean.toLowerCase());
  if (existing) {
    existing.state = "active";
  } else {
    if (bank.channels.length >= BANK_LIMITS.channels) throw new Error(`${BANK_LIMITS.channels} chaînes au plus\u00a0: retirez-en une d'abord.`);
    bank.channels.push({ handle: clean, origin: "user", state: "active", addedAt: Date.now() });
  }
  return writeBank(bank);
}

export function removeReferenceChannel(kitId: unknown, handle: unknown): ConceptBank {
  const bank = readBank(kitId);
  const clean = cleanChannelHandle(handle)?.toLowerCase();
  bank.channels = bank.channels.filter((channel) => channel.handle.toLowerCase() !== clean);
  return writeBank(bank);
}

/** Valide (devient active) ou refuse (retirée) une chaîne proposée par Codex. */
export function answerSuggestedChannel(kitId: unknown, handle: unknown, accept: unknown): ConceptBank {
  const bank = readBank(kitId);
  const clean = cleanChannelHandle(handle)?.toLowerCase();
  const channel = bank.channels.find((entry) => entry.handle.toLowerCase() === clean);
  if (!channel) throw new Error("Chaîne introuvable");
  if (accept === true) channel.state = "active";
  else bank.channels = bank.channels.filter((entry) => entry !== channel);
  return writeBank(bank);
}

export function removeConcept(kitId: unknown, conceptId: unknown): ConceptBank {
  const bank = readBank(kitId);
  bank.concepts = bank.concepts.filter((concept) => concept.id !== conceptId);
  return writeBank(bank);
}

export function startChannelSuggestions(kitId: unknown, topic: unknown, deps: IdeaDeps): IdeaTask {
  const key = bankKey(kitId);
  const kit = key === NO_KIT ? undefined : key;
  return startTask("channels", "Codex cherche des chaînes sur le web…", { ...(kit ? { kitId: kit } : {}) }, async () => {
    const loaded = kit ? await deps.loadBrand(kit) : null;
    const bank = readBank(key);
    const answer = await deps.ask(channelsPrompt(loaded?.brand ?? null, bank.channels.map((channel) => channel.handle), cleanScriptText(topic, IDEA_LIMITS.topic), deps.now()), {
      search: true,
      timeoutMs: WEB_TIMEOUT_MS,
    });
    const suggested = parseSuggestedChannels(answer, bank.channels.map((channel) => channel.handle));
    const fresh = readBank(key);
    const known = new Set(fresh.channels.map((channel) => channel.handle.toLowerCase()));
    const room = BANK_LIMITS.channels - fresh.channels.length;
    const added = suggested.filter((channel) => !known.has(channel.handle.toLowerCase())).slice(0, Math.max(0, room));
    fresh.channels.push(...added.map((channel) => ({ ...channel, origin: "suggested" as const, state: "pending" as const, addedAt: Date.now() })));
    writeBank(fresh);
    return [`${added.length} chaîne(s) proposée(s), à valider avant l'étude.`];
  });
}

// ─── Étude de la niche ───────────────────────────────────────────

const errorText = (error: unknown) => (error instanceof Error ? error.message : "Lecture impossible").slice(0, 300);
const isQuotaError = (error: unknown) => error instanceof Error && error.name === "QuotaExceededError";

/** Suivi des étapes d'une étude : l'écran les montre une à une. */
export interface StudyTracker {
  /** Pose la liste des étapes, dans l'ordre. */
  plan(steps: IdeaTaskStep[]): void;
  set(id: string, state: IdeaTaskStepState, detail?: string): void;
}

export interface StudyOptions {
  signal?: AbortSignal;
  /** Lire aussi les premières paroles (sous-titres) des vidéos au-dessus de leur médiane. */
  spoken?: boolean;
  onStep?: (step: string) => void;
  track?: StudyTracker;
}

/** Étapes d'une étude, dans l'ordre : une lecture par compte, la sienne, le détail des vidéos qui sortent du lot, les concepts, l'enregistrement. */
export function studySteps(channels: Pick<ReferenceChannel, "handle">[], options: { own: boolean; details: "none" | "dates" | "spoken" }): IdeaTaskStep[] {
  return [
    ...channels.map((channel, index) => ({ id: `read-${index}`, label: `Lecture de ${channel.handle}`, state: "pending" as const })),
    ...(options.own ? [{ id: "own", label: "Lecture de votre chaîne", state: "pending" as const }] : []),
    {
      id: "details",
      label: options.details === "spoken" ? "Dates et premières paroles des vidéos qui sortent du lot" : "Dates des vidéos qui sortent du lot",
      state: options.details === "none" ? ("skipped" as const) : ("pending" as const),
      ...(options.details === "none" ? { detail: "Déjà données par l'API" } : {}),
    },
    { id: "concepts", label: "Rangement en concepts (Codex)", state: "pending" as const },
    { id: "save", label: "Enregistrement", state: "pending" as const },
  ];
}

const canceled = () => Object.assign(new Error("Étude annulée."), { name: "AbortError" });

/** Résumé d'une mesure pour la ligne de son étape. */
function measureDetail(measure: AccountMeasure, outliers: number): string {
  const base = `${measure.shorts.length} vidéos courtes, médiane ${measure.median === null ? "inconnue" : `${measure.median.toLocaleString("fr-FR")} vues`}`;
  if (!trustedMeasure(measure)) return `${base} : trop peu d'historique pour juger un écart`;
  return `${base}, ${outliers} au-dessus de ${OUTLIER_SCORE} ×`;
}

/**
 * Étudie la niche d'une marque : lit les comptes de référence (par un compte
 * connecté, ou en public par yt-dlp), mesure chaque vidéo contre la médiane
 * de son propre compte, garde celles qui sortent du lot (2 × ou plus), lit
 * le détail des plus fortes, puis demande à Codex de les ranger en
 * concepts. Vues et multiples viennent de la mesure ; Codex ne fait que
 * nommer et regrouper. Rien n'est écrit avant la fin : une étude annulée
 * laisse la banque telle qu'elle était.
 *
 * `source` : un identifiant de compte connecté (forme d'avant), ou une
 * source explicite.
 */
export async function studyNiche(kitId: string | null, source: string | StudySource, deps: IdeaDeps, options: StudyOptions | ((step: string) => void) = {}): Promise<NicheStudy> {
  const settings: StudyOptions = typeof options === "function" ? { onStep: options } : options;
  const { signal } = settings;
  const spec: StudySource = typeof source === "string" ? { kind: "account", accountId: source } : source;
  const checkAborted = () => {
    if (signal?.aborted) throw canceled();
  };
  const key = bankKey(kitId);
  const loaded = kitId ? await deps.loadBrand(kitId) : null;
  const bank = readBank(key);
  const channels = bank.channels.filter((channel) => channel.state === "active").slice(0, BANK_LIMITS.studied);
  const now = deps.now().getTime();
  const linked = loaded?.accountIds ?? [];
  const accountId = spec.kind === "account" ? spec.accountId : undefined;
  const ownMeasured = Boolean(accountId && (!kitId || linked.includes(accountId)));
  const reader = spec.kind === "public" || settings.spoken ? deps.publicReader?.() : undefined;
  if (spec.kind === "public" && !reader) throw new Error("Lecture publique indisponible sur ce serveur.");
  const details = !reader ? "none" : settings.spoken ? "spoken" : spec.kind === "public" ? "dates" : "none";
  settings.track?.plan(studySteps(channels, { own: ownMeasured, details }));
  const step = (id: string, state: IdeaTaskStepState, detail?: string) => settings.track?.set(id, state, detail);

  const stats: ChannelStat[] = [];
  const outliers: NicheOutlier[] = [];
  const flops: MeasuredShort[] = [];
  const notes: string[] = [];
  let unitsUsed = 0;
  let stopped = false;

  const collect = (label: string, measure: AccountMeasure, own: boolean) => {
    const found = outliersOf(measure, { channel: label, service: "youtube", own });
    outliers.push(...found);
    if (!trustedMeasure(measure)) return found.length;
    for (const video of measure.shorts) {
      if (video.score === null || video.young || video.score > FLOP_SCORE) continue;
      flops.push({ videoId: video.id, channel: label, title: video.title, url: video.url, score: video.score, views: video.views, ...(video.publishedAt ? { publishedAt: video.publishedAt } : {}), ...(own ? { own: true } : {}) });
    }
    return found.length;
  };

  for (const [index, channel] of channels.entries()) {
    checkAborted();
    const id = `read-${index}`;
    if (stopped) {
      stats.push({ handle: channel.handle, title: channel.title ?? channel.handle, shorts: 0, median: null, small: true, top: [], error: "Non lue : quota du jour épuisé." });
      step(id, "skipped", "Quota du jour épuisé");
      continue;
    }
    settings.onStep?.(`Lecture de ${channel.handle} (${index + 1} sur ${channels.length})…`);
    step(id, "running");
    try {
      let measure: AccountMeasure;
      let title: string;
      if (accountId) {
        const result = await deps.readChannel(accountId, { handle: channel.handle }, STUDY_READ);
        unitsUsed += result.calls.length;
        measure = measureChannel(result.videos);
        title = result.channel.title;
      } else {
        const account = await (reader as PublicNicheReader).readShorts(channel.handle, signal);
        measure = measureOrdered(account.shorts);
        title = account.title;
      }
      channel.title = title;
      stats.push(channelStat(channel.handle, title, measure));
      step(id, "done", measureDetail(measure, collect(channel.handle, measure, false)));
    } catch (error) {
      if (signal?.aborted) throw canceled();
      stats.push({ handle: channel.handle, title: channel.title ?? channel.handle, shorts: 0, median: null, small: true, top: [], error: errorText(error) });
      step(id, "error", errorText(error));
      if (isQuotaError(error)) {
        stopped = true;
        notes.push("Quota du jour de l'API épuisé : la suite de l'étude attendra la remise à zéro.");
      }
    }
  }

  let own: NicheStudy["own"];
  if (accountId && ownMeasured) {
    checkAborted();
    if (stopped) {
      step("own", "skipped", "Quota du jour épuisé");
    } else {
      settings.onStep?.("Lecture de votre chaîne…");
      step("own", "running");
      try {
        const result = await deps.readChannel(accountId, { mine: true }, STUDY_READ);
        unitsUsed += result.calls.length;
        const measure = measureChannel(result.videos);
        const label = result.channel.handle ?? result.channel.title;
        own = { ...channelStat(label, result.channel.title, measure), recentHits: recentHits(measure, now) };
        step("own", "done", measureDetail(measure, collect(label, measure, true)));
      } catch (error) {
        notes.push(`Votre chaîne n'a pas pu être lue : ${errorText(error)}`);
        step("own", "error", errorText(error));
      }
    }
  } else if (accountId && kitId) {
    notes.push("Chaîne de la marque non mesurée : le compte choisi n'est pas rattaché à cette marque.");
  }

  // Le détail des plus fortes : date et durée quand la liste ne les donne pas, premières paroles sur demande.
  if (details !== "none" && reader) {
    const chosen = pickForDetails(outliers.filter((outlier) => !outlier.publishedAt || settings.spoken));
    if (chosen.length === 0) {
      step("details", "skipped", "Aucune vidéo au-dessus de sa médiane");
    } else {
      let read = 0;
      let failed = 0;
      let heard = 0;
      for (const [index, outlier] of chosen.entries()) {
        checkAborted();
        settings.onStep?.(`Détail des vidéos qui sortent du lot (${index + 1} sur ${chosen.length})…`);
        step("details", "running", `${index + 1} sur ${chosen.length}`);
        try {
          const detail = await reader.readDetail(outlier.videoId, { spoken: Boolean(settings.spoken), signal });
          read++;
          if (!outlier.publishedAt && detail.publishedAt) outlier.publishedAt = detail.publishedAt;
          if (!outlier.durationSeconds && detail.durationSeconds) outlier.durationSeconds = detail.durationSeconds;
          if (detail.spoken) {
            outlier.spoken = frenchSpacing(detail.spoken, detail.spokenLanguage);
            if (detail.spokenLanguage) outlier.spokenLanguage = detail.spokenLanguage;
            heard++;
          }
        } catch (error) {
          if (signal?.aborted) throw canceled();
          failed++;
        }
      }
      const parts = [`${read} vidéo${read > 1 ? "s" : ""} lue${read > 1 ? "s" : ""}`, ...(settings.spoken ? [`${heard} avec leurs premières paroles`] : []), ...(failed ? [`${failed} illisible${failed > 1 ? "s" : ""}`] : [])];
      step("details", read === 0 && failed > 0 ? "error" : "done", parts.join(", "));
    }
  }

  checkAborted();
  const ranked = rankOutliers(outliers);
  let concepts = bank.concepts;
  if (ranked.length > 0) {
    settings.onStep?.(`Codex range ${ranked.length} vidéo(s) qui sortent du lot en concepts…`);
    step("concepts", "running", `${ranked.length} vidéo${ranked.length > 1 ? "s" : ""} à ranger`);
    const hits: MeasuredShort[] = ranked.slice(0, 60).map((outlier) => ({
      videoId: outlier.videoId,
      channel: outlier.channel,
      title: outlier.title,
      url: outlier.url,
      score: outlier.score,
      views: outlier.views,
      ...(outlier.publishedAt ? { publishedAt: outlier.publishedAt } : {}),
      ...(outlier.own ? { own: true } : {}),
      ...(outlier.spoken ? { spoken: outlier.spoken } : {}),
    }));
    const answer = await deps.ask(conceptsPrompt(bank.concepts, hits, flops.slice(0, 30), loaded?.brand ?? null), { timeoutMs: PLAIN_TIMEOUT_MS, ...(signal ? { signal } : {}) });
    checkAborted();
    const merged = mergeConcepts(bank.concepts, answer, hits, flops.slice(0, 30), Date.now(), () => newId("cpt"));
    concepts = merged.concepts;
    notes.push(`${merged.created} concept(s) nouveau(x), ${merged.updated} confirmé(s).`);
    step("concepts", "done", `${merged.created} nouveau${merged.created > 1 ? "x" : ""}, ${merged.updated} confirmé${merged.updated > 1 ? "s" : ""}`);
  } else {
    notes.push(`Aucune vidéo à ${OUTLIER_SCORE} fois la médiane de son compte : la banque ne change pas.`);
    step("concepts", "skipped", "Aucune vidéo au-dessus de sa médiane");
  }
  if (stats.some((stat) => stat.small && !stat.error)) notes.push("Certaines chaînes ont moins de 15 vidéos courtes : leur médiane est fragile.");
  if (spec.kind === "public") notes.push("Lecture publique : les vues des listes sont arrondies par YouTube.");

  // Chaque vidéo garde le concept où Codex l'a rangée.
  const conceptOf = new Map(concepts.flatMap((concept) => concept.proofs.map((proof) => [proof.videoId, concept.id] as const)));
  const kept = ranked.map((outlier) => (conceptOf.has(outlier.videoId) ? { ...outlier, conceptId: conceptOf.get(outlier.videoId) } : outlier));

  checkAborted();
  step("save", "running");
  const study: NicheStudy = {
    at: Date.now(),
    ...(accountId ? { accountId } : {}),
    source: spec.kind,
    ...(settings.spoken ? { spoken: true } : {}),
    channels: stats,
    ...(own ? { own } : {}),
    outliers: kept,
    hits: kept.length,
    unitsUsed,
    ...(reader ? { reads: reader.calls() } : {}),
    notes,
  };
  // Relue juste avant d'écrire : une chaîne ajoutée pendant l'étude n'est pas perdue.
  const fresh = readBank(key);
  const titles = new Map(channels.map((channel) => [channel.handle.toLowerCase(), channel.title]));
  writeBank({
    ...fresh,
    channels: fresh.channels.map((channel) => (titles.get(channel.handle.toLowerCase()) ? { ...channel, title: titles.get(channel.handle.toLowerCase()) } : channel)),
    concepts,
    study,
  });
  step("save", "done");
  return study;
}

/** Espaces insécables d'une phrase française lue dans des sous-titres. */
function frenchSpacing(text: string, language?: string): string {
  return !language || /^fr\b/i.test(language) ? frenchTypography(text) : text;
}

/** Jours écoulés depuis la dernière étude réussie (une chaîne lue au moins), `null` sans étude. */
export function daysSinceStudy(bank: ConceptBank, now: number): number | null {
  const study = bank.study;
  if (!study || study.channels.every((stat) => stat.error)) return null;
  return Math.max(0, Math.floor((now - study.at) / (24 * 60 * 60 * 1000)));
}

/**
 * Lance l'étude en arrière-plan. `source` : `"public"` (yt-dlp, sans compte)
 * ou l'identifiant d'un compte connecté. Une fois par mois suffit : moins de
 * trente jours après la précédente, il faut `force` (l'écran le demande).
 */
export function startStudy(kitId: unknown, source: unknown, deps: IdeaDeps, options: { force?: unknown; spoken?: unknown } = {}): IdeaTask {
  const kit = typeof kitId === "string" && KIT_ID.test(kitId) ? kitId : null;
  let spec: StudySource;
  if (source === "public") {
    if (!deps.publicReader) throw new Error("Lecture publique indisponible sur ce serveur.");
    spec = { kind: "public" };
  } else {
    const accounts = deps.researchAccounts().filter((account) => account.status === "connected");
    const account = accounts.find((entry) => entry.id === source);
    if (!account) {
      throw new Error(accounts.length ? "Choisissez un compte YouTube connecté." : "Aucun compte YouTube connecté : l'étude par l'API est indisponible.");
    }
    spec = { kind: "account", accountId: account.id };
  }
  const bank = readBank(kit);
  if (!bank.channels.some((channel) => channel.state === "active")) throw new Error("Ajoutez d'abord des chaînes de référence.");
  const days = daysSinceStudy(bank, deps.now().getTime());
  if (days !== null && days * 24 * 60 * 60 * 1000 < STUDY_INTERVAL_MS && options.force !== true) {
    throw new Error(`Dernière étude il y a ${days === 0 ? "moins d'un jour" : `${days} jour${days > 1 ? "s" : ""}`} : une par mois suffit. Confirmez pour mesurer à nouveau.`);
  }
  const spoken = options.spoken === true && Boolean(deps.publicReader);
  return startTask("study", "Préparation…", { ...(kit ? { kitId: kit } : {}), steps: [] }, async (task, signal) => {
    const track: StudyTracker = {
      plan: (steps) => {
        task.steps = steps;
        task.progress = { done: steps.filter((entry) => entry.state !== "pending" && entry.state !== "running").length, total: steps.length };
      },
      set: (id, state, detail) => {
        task.steps = (task.steps ?? []).map((entry) => (entry.id === id ? { id: entry.id, label: entry.label, state, ...(detail ? { detail } : {}) } : entry));
        const steps = task.steps;
        task.progress = { done: steps.filter((entry) => entry.state !== "pending" && entry.state !== "running").length, total: steps.length };
        const current = steps.find((entry) => entry.id === id);
        if (state === "running" && current) task.step = `${current.label}${detail ? ` (${detail})` : ""}…`;
      },
    };
    const study = await studyNiche(kit, spec, deps, { signal, spoken, track });
    const read = study.channels.filter((stat) => !stat.error).length;
    const cost = spec.kind === "public" ? `${study.reads ?? 0} lecture(s) publique(s)` : `${study.unitsUsed} unité(s) de quota`;
    return [`${read} chaîne(s) mesurée(s), ${study.hits} vidéo(s) au-dessus de leur médiane, ${cost}.`, ...study.notes];
  });
}
