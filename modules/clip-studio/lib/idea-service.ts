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
import { channelStat, measureChannel, recentHits, SHORT_MAX_SECONDS, SHORTS_PER_CHANNEL, SIGNAL_SCORE } from "./idea-scoring";
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
  type NicheStudy,
} from "./idea-types";
import { IDEA_ID, KIT_ID, bankKey, changeIdea, newId, readBank, readIdeas, writeBank, writeIdeas } from "./idea-store";
import { cleanScriptText } from "./script-rules";

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
  now(): Date;
}

// ─── Travaux en cours ────────────────────────────────────────────

const holder = globalThis as typeof globalThis & { __clipIdeaTasks?: Map<string, IdeaTask> };
const tasks = (holder.__clipIdeaTasks ??= new Map<string, IdeaTask>());

function startTask(kind: IdeaTaskKind, step: string, extra: Partial<IdeaTask>, work: (task: IdeaTask) => Promise<string[] | void>): IdeaTask {
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
  void work(task).then(
    (notes) => {
      task.status = "done";
      task.step = "Terminé";
      if (notes?.length) task.notes = notes;
      task.finishedAt = Date.now();
    },
    (error) => {
      task.status = "error";
      task.error = error instanceof Error ? error.message : "Travail impossible";
      task.finishedAt = Date.now();
    }
  );
  return { ...task };
}

export function getTask(id: unknown): IdeaTask | null {
  const task = typeof id === "string" ? tasks.get(id) : undefined;
  return task ? { ...task } : null;
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

export interface IdeasBoard {
  kitId: string | null;
  ideas: Idea[];
  bank: ConceptBank;
  accounts: { id: string; name: string; handle?: string; avatarUrl?: string; logo: string; linked: boolean }[];
  accountId?: string;
  estimate: StudyEstimate | null;
  /** Dernière étude il y a plus d'un mois (ou jamais). */
  studyDue: boolean;
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
  return { ideas, notes: [summary, ...mix.notes, ...parsed.notes] };
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

export async function studyNiche(kitId: string | null, accountId: string, deps: IdeaDeps, onStep: (step: string) => void = () => undefined): Promise<NicheStudy> {
  const key = bankKey(kitId);
  const loaded = kitId ? await deps.loadBrand(kitId) : null;
  const bank = readBank(key);
  const channels = bank.channels.filter((channel) => channel.state === "active").slice(0, BANK_LIMITS.studied);
  const now = deps.now().getTime();
  const stats: ChannelStat[] = [];
  const hits: MeasuredShort[] = [];
  const flops: MeasuredShort[] = [];
  const notes: string[] = [];
  let unitsUsed = 0;
  let stopped = false;

  const collect = (label: string, measure: ReturnType<typeof measureChannel>, own: boolean) => {
    for (const video of measure.shorts) {
      if (video.score === null) continue;
      const entry: MeasuredShort = { videoId: video.id, channel: label, title: video.title, url: video.url, score: video.score, views: video.views, ...(video.publishedAt ? { publishedAt: video.publishedAt } : {}), ...(own ? { own: true } : {}) };
      if (video.score >= SIGNAL_SCORE) hits.push(entry);
      else if (video.score <= FLOP_SCORE && !video.young) flops.push(entry);
    }
  };

  for (const [index, channel] of channels.entries()) {
    if (stopped) {
      stats.push({ handle: channel.handle, title: channel.title ?? channel.handle, shorts: 0, median: null, small: true, top: [], error: "Non lue\u00a0: quota du jour épuisé." });
      continue;
    }
    onStep(`Lecture de ${channel.handle} (${index + 1} sur ${channels.length})…`);
    try {
      const result = await deps.readChannel(accountId, { handle: channel.handle }, STUDY_READ);
      unitsUsed += result.calls.length;
      const measure = measureChannel(result.videos);
      channel.title = result.channel.title;
      stats.push(channelStat(channel.handle, result.channel.title, measure));
      collect(channel.handle, measure, false);
    } catch (error) {
      stats.push({ handle: channel.handle, title: channel.title ?? channel.handle, shorts: 0, median: null, small: true, top: [], error: errorText(error) });
      if (isQuotaError(error)) {
        stopped = true;
        notes.push("Quota du jour de l'API épuisé\u00a0: la suite de l'étude attendra la remise à zéro.");
      }
    }
  }

  let own: NicheStudy["own"];
  const linked = loaded?.accountIds ?? [];
  if (!stopped && (!kitId || linked.includes(accountId))) {
    onStep("Lecture de votre chaîne…");
    try {
      const result = await deps.readChannel(accountId, { mine: true }, STUDY_READ);
      unitsUsed += result.calls.length;
      const measure = measureChannel(result.videos);
      const label = result.channel.handle ?? result.channel.title;
      own = { ...channelStat(label, result.channel.title, measure), recentHits: recentHits(measure, now) };
      collect(label, measure, true);
    } catch (error) {
      notes.push(`Votre chaîne n'a pas pu être lue\u00a0: ${errorText(error)}`);
    }
  } else if (kitId && !linked.includes(accountId)) {
    notes.push("Chaîne de la marque non mesurée\u00a0: le compte choisi n'est pas rattaché à cette marque.");
  }

  let concepts = bank.concepts;
  if (hits.length > 0) {
    onStep(`Codex range ${hits.length} succès en concepts…`);
    const strongest = hits.sort((a, b) => b.score - a.score).slice(0, 60);
    const answer = await deps.ask(conceptsPrompt(bank.concepts, strongest, flops.slice(0, 30), loaded?.brand ?? null), { timeoutMs: PLAIN_TIMEOUT_MS });
    const merged = mergeConcepts(bank.concepts, answer, strongest, flops.slice(0, 30), Date.now(), () => newId("cpt"));
    concepts = merged.concepts;
    notes.push(`${merged.created} concept(s) nouveau(x), ${merged.updated} confirmé(s).`);
  } else {
    notes.push("Aucune vidéo à 3 fois la médiane de sa chaîne\u00a0: la banque ne change pas.");
  }
  if (stats.some((stat) => stat.small && !stat.error)) notes.push("Certaines chaînes ont moins de 15 vidéos courtes\u00a0: leur médiane est fragile.");

  const study: NicheStudy = { at: Date.now(), accountId, channels: stats, ...(own ? { own } : {}), hits: hits.length, unitsUsed, notes };
  // Relue juste avant d'écrire : une chaîne ajoutée pendant l'étude n'est pas perdue.
  const fresh = readBank(key);
  const titles = new Map(channels.map((channel) => [channel.handle.toLowerCase(), channel.title]));
  writeBank({
    ...fresh,
    channels: fresh.channels.map((channel) => (titles.get(channel.handle.toLowerCase()) ? { ...channel, title: titles.get(channel.handle.toLowerCase()) } : channel)),
    concepts,
    study,
  });
  return study;
}

export function startStudy(kitId: unknown, accountId: unknown, deps: IdeaDeps): IdeaTask {
  const kit = typeof kitId === "string" && KIT_ID.test(kitId) ? kitId : null;
  const accounts = deps.researchAccounts().filter((account) => account.status === "connected");
  const account = accounts.find((entry) => entry.id === accountId);
  if (!account) {
    throw new Error(accounts.length ? "Choisissez un compte YouTube connecté." : "Aucun compte YouTube connecté\u00a0: l'étude par l'API est indisponible.");
  }
  const bank = readBank(kit);
  if (!bank.channels.some((channel) => channel.state === "active")) throw new Error("Ajoutez d'abord des chaînes de référence.");
  return startTask("study", "Préparation…", { ...(kit ? { kitId: kit } : {}) }, async (task) => {
    const study = await studyNiche(kit, account.id, deps, (step) => (task.step = step));
    return [`${study.channels.filter((stat) => !stat.error).length} chaîne(s) mesurée(s), ${study.hits} succès, ${study.unitsUsed} unité(s) de quota.`, ...study.notes];
  });
}
