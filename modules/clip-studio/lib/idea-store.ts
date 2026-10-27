/**
 * Rangement des idées (`data/ideas.json`) et des banques de concepts
 * (`data/concepts/<marque>.json`). Tout est relu et borné à la lecture comme
 * à l'écriture : un fichier modifié à la main ne peut ni grossir sans fin ni
 * faire afficher une adresse autre que https.
 */

import fs from "fs";
import path from "path";
import { sourceUrl } from "./fact-check";
import { cleanScriptText } from "./script-rules";
import { cleanTargetSeconds } from "./voice-settings";
import { DATA_DIR, ensureDirs } from "./store";
import {
  BANK_LIMITS,
  IDEA_ASPECTS,
  IDEA_KINDS,
  IDEA_LIMITS,
  IDEA_STATUSES,
  IDEA_TEMPLATES,
  NICHE_SERVICES,
  NO_KIT,
  cleanChannelHandle,
  type ChannelStat,
  type NicheOutlier,
  type NicheService,
  type Concept,
  type ConceptBank,
  type Idea,
  type IdeaChecks,
  type NicheStudy,
  type ReferenceChannel,
} from "./idea-types";

const IDEAS_FILE = () => path.join(DATA_DIR, "ideas.json");
const CONCEPTS_DIR = () => path.join(DATA_DIR, "concepts");

export const IDEA_ID = /^idea-[a-z0-9]{6,40}$/;
export const KIT_ID = /^kit-[a-z0-9]{6,32}$/;
const CONCEPT_ID = /^cpt-[a-z0-9]{6,40}$/;
const JOB_ID = /^asst-[a-z0-9]{4,40}$/;
const PROJECT_ID = /^[a-z0-9][a-z0-9-]{2,80}$/i;
const VIDEO_ID = /^[A-Za-z0-9_-]{6,20}$/;

export function newId(prefix: "idea" | "cpt" | "batch" | "task"): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** Marque d'une banque : un identifiant de marque, ou « none ». */
export function bankKey(kitId: unknown): string {
  return typeof kitId === "string" && KIT_ID.test(kitId) ? kitId : NO_KIT;
}

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(file: string, value: unknown) {
  ensureDirs();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2));
  fs.renameSync(temporary, file);
}

const text = (value: unknown, max: number) => cleanScriptText(value, max);
const finite = (value: unknown, fallback = 0) => (typeof value === "number" && Number.isFinite(value) ? value : fallback);
const httpsUrl = (value: unknown) => {
  const url = sourceUrl(value);
  return url && url.length <= IDEA_LIMITS.url ? url : undefined;
};

// ─── Idées ───────────────────────────────────────────────────────

/** Une idée relue : champs connus, bornés ; `null` si elle est inutilisable. */
export function cleanIdea(raw: unknown): Idea | null {
  if (!raw || typeof raw !== "object") return null;
  const entry = raw as Record<string, unknown>;
  if (typeof entry.id !== "string" || !IDEA_ID.test(entry.id)) return null;
  const title = text(entry.title, IDEA_LIMITS.title);
  const hook = text(entry.hook, IDEA_LIMITS.hook);
  const prompt = text(entry.prompt, IDEA_LIMITS.brief);
  if (!title || !hook || !prompt) return null;
  const template = IDEA_TEMPLATES.includes(entry.template as Idea["template"]) ? (entry.template as Idea["template"]) : "free";
  const aspect = IDEA_ASPECTS.includes(entry.aspect as Idea["aspect"]) ? (entry.aspect as Idea["aspect"]) : "9:16";
  const concept = (entry.concept && typeof entry.concept === "object" ? entry.concept : {}) as Record<string, unknown>;
  const why = (entry.why && typeof entry.why === "object" ? entry.why : null) as Record<string, unknown> | null;
  const source = (why?.source && typeof why.source === "object" ? why.source : null) as Record<string, unknown> | null;
  const sourceLink = source ? httpsUrl(source.url) : undefined;
  const sourceDate = typeof source?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(source.date) ? source.date : undefined;
  const checks = (entry.checks && typeof entry.checks === "object" ? entry.checks : {}) as Record<string, unknown>;
  const altHooks = (Array.isArray(entry.altHooks) ? entry.altHooks : []).map((hook) => text(hook, IDEA_LIMITS.hook)).filter(Boolean).slice(0, IDEA_LIMITS.altHooks * 2);
  const now = Date.now();
  return {
    id: entry.id,
    ...(typeof entry.kitId === "string" && KIT_ID.test(entry.kitId) ? { kitId: entry.kitId } : {}),
    status: IDEA_STATUSES.includes(entry.status as Idea["status"]) ? (entry.status as Idea["status"]) : "new",
    kind: IDEA_KINDS.includes(entry.kind as Idea["kind"]) ? (entry.kind as Idea["kind"]) : "fresh",
    title,
    hook,
    ...(altHooks.length ? { altHooks } : {}),
    angle: text(entry.angle, IDEA_LIMITS.angle),
    concept: {
      name: text(concept.name, IDEA_LIMITS.conceptName) || "Sujet libre",
      ...(typeof concept.conceptId === "string" && CONCEPT_ID.test(concept.conceptId) ? { conceptId: concept.conceptId } : {}),
      ...(text(concept.proof, IDEA_LIMITS.proof) ? { proof: text(concept.proof, IDEA_LIMITS.proof) } : {}),
    },
    ...(why
      ? {
          why: {
            text: text(why.text, IDEA_LIMITS.why),
            ...(sourceLink && sourceDate ? { source: { url: sourceLink, title: text(source?.title, IDEA_LIMITS.sourceTitle) || sourceLink, date: sourceDate } } : {}),
          },
        }
      : {}),
    template,
    // Absent ou « auto » : le script choisira le nombre d'éléments.
    ...(entry.count === undefined || entry.count === null || entry.count === "auto" ? {} : { count: Math.min(IDEA_LIMITS.perSearch.max, Math.max(2, Math.round(finite(entry.count, 5)))) }),
    targetSeconds: cleanTargetSeconds(entry.targetSeconds, template, aspect),
    aspect,
    ...(text(entry.sourceVideoHint, IDEA_LIMITS.sourceVideoHint) ? { sourceVideoHint: text(entry.sourceVideoHint, IDEA_LIMITS.sourceVideoHint) } : {}),
    ...(typeof entry.language === "string" && /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(entry.language) ? { language: entry.language } : {}),
    prompt,
    checks: {
      concreteOpening: checks.concreteOpening === true,
      visualFirstSecond: checks.visualFirstSecond === true,
      singlePromise: checks.singlePromise === true,
      currentFacts: checks.currentFacts === true,
    } satisfies IdeaChecks,
    batchId: typeof entry.batchId === "string" && /^batch-[a-z0-9]{6,40}$/.test(entry.batchId) ? entry.batchId : "batch-legacy",
    ...(typeof entry.jobId === "string" && JOB_ID.test(entry.jobId) ? { jobId: entry.jobId } : {}),
    ...(typeof entry.projectId === "string" && PROJECT_ID.test(entry.projectId) ? { projectId: entry.projectId } : {}),
    createdAt: finite(entry.createdAt, now),
    updatedAt: finite(entry.updatedAt, now),
  };
}

/**
 * Bornes de la liste : 120 écartées au plus (les plus récentes, gardées
 * comme exemples négatifs), puis 300 idées en tout, en retirant d'abord les
 * nouvelles les plus anciennes, jamais une gardée ou une faite.
 */
export function boundIdeas(ideas: Idea[]): Idea[] {
  const sorted = [...ideas].sort((a, b) => b.createdAt - a.createdAt);
  let dismissed = 0;
  const kept = sorted.filter((idea) => idea.status !== "dismissed" || ++dismissed <= IDEA_LIMITS.dismissed);
  let excess = kept.length - IDEA_LIMITS.ideas;
  if (excess <= 0) return kept;
  const out: Idea[] = [];
  for (let index = kept.length - 1; index >= 0; index--) {
    const idea = kept[index];
    if (excess > 0 && (idea.status === "new" || idea.status === "dismissed")) {
      excess--;
      continue;
    }
    out.unshift(idea);
  }
  return out.slice(0, IDEA_LIMITS.ideas);
}

export function readIdeas(): Idea[] {
  const raw = readJson<unknown>(IDEAS_FILE(), []);
  return (Array.isArray(raw) ? raw : []).map(cleanIdea).filter((idea): idea is Idea => idea !== null);
}

export function writeIdeas(ideas: Idea[]) {
  writeJsonAtomic(IDEAS_FILE(), boundIdeas(ideas.map(cleanIdea).filter((idea): idea is Idea => idea !== null)));
}

/** Modifie une idée et l'enregistre ; lève une erreur si elle n'existe pas. */
export function changeIdea(id: unknown, change: (idea: Idea) => Idea): Idea {
  if (typeof id !== "string" || !IDEA_ID.test(id)) throw new Error("Idée invalide");
  const ideas = readIdeas();
  const index = ideas.findIndex((idea) => idea.id === id);
  if (index < 0) throw new Error("Idée introuvable");
  const next = cleanIdea({ ...change(ideas[index]), id, updatedAt: Date.now() });
  if (!next) throw new Error("Idée invalide");
  ideas[index] = next;
  writeIdeas(ideas);
  return next;
}

// ─── Banques de concepts ─────────────────────────────────────────

function cleanChannel(raw: unknown): ReferenceChannel | null {
  if (!raw || typeof raw !== "object") return null;
  const entry = raw as Record<string, unknown>;
  const handle = cleanChannelHandle(entry.handle);
  if (!handle) return null;
  return {
    handle,
    ...(entry.service !== undefined && NICHE_SERVICES.includes(entry.service as NicheService) ? { service: entry.service as NicheService } : {}),
    ...(text(entry.title, 100) ? { title: text(entry.title, 100) } : {}),
    origin: entry.origin === "suggested" ? "suggested" : "user",
    state: entry.state === "pending" ? "pending" : "active",
    ...(entry.relation === "direct" || entry.relation === "neighbor" || entry.relation === "bigger" ? { relation: entry.relation } : {}),
    ...(text(entry.note, BANK_LIMITS.note) ? { note: text(entry.note, BANK_LIMITS.note) } : {}),
    addedAt: finite(entry.addedAt, Date.now()),
  };
}

function cleanConcept(raw: unknown): Concept | null {
  if (!raw || typeof raw !== "object") return null;
  const entry = raw as Record<string, unknown>;
  if (typeof entry.id !== "string" || !CONCEPT_ID.test(entry.id)) return null;
  const name = text(entry.name, BANK_LIMITS.name);
  if (!name) return null;
  const mold = (entry.mold && typeof entry.mold === "object" ? entry.mold : {}) as Record<string, unknown>;
  const proofs = (Array.isArray(entry.proofs) ? entry.proofs : []).flatMap((proof) => {
    if (!proof || typeof proof !== "object") return [];
    const item = proof as Record<string, unknown>;
    const url = httpsUrl(item.url);
    if (typeof item.videoId !== "string" || !VIDEO_ID.test(item.videoId) || !url) return [];
    return [
      {
        videoId: item.videoId,
        title: text(item.title, 200),
        url,
        channel: text(item.channel, 100),
        score: Math.round(finite(item.score) * 100) / 100,
        views: Math.max(0, Math.round(finite(item.views))),
        ...(typeof item.publishedAt === "string" && item.publishedAt.length <= 40 ? { publishedAt: item.publishedAt } : {}),
        ...(item.own === true ? { own: true } : {}),
      },
    ];
  });
  const flops = (Array.isArray(entry.flops) ? entry.flops : []).flatMap((flop) => {
    if (!flop || typeof flop !== "object") return [];
    const item = flop as Record<string, unknown>;
    return [{ title: text(item.title, 200), channel: text(item.channel, 100), score: Math.round(finite(item.score) * 100) / 100 }];
  });
  return {
    id: entry.id,
    name,
    mold: {
      hook: text(mold.hook, BANK_LIMITS.moldHook),
      beats: (Array.isArray(mold.beats) ? mold.beats : []).map((beat) => text(beat, BANK_LIMITS.beat)).filter(Boolean).slice(0, BANK_LIMITS.beats),
    },
    rhythm: entry.rhythm === "news" ? "news" : "evergreen",
    proofs: proofs.slice(0, BANK_LIMITS.proofs),
    flops: flops.slice(0, BANK_LIMITS.flops),
    createdAt: finite(entry.createdAt, Date.now()),
    updatedAt: finite(entry.updatedAt, Date.now()),
  };
}

function cleanStat(raw: unknown): ChannelStat | null {
  if (!raw || typeof raw !== "object") return null;
  const entry = raw as Record<string, unknown>;
  const handle = text(entry.handle, 40);
  if (!handle) return null;
  const median = typeof entry.median === "number" && Number.isFinite(entry.median) ? entry.median : null;
  return {
    handle,
    title: text(entry.title, 200),
    shorts: Math.max(0, Math.round(finite(entry.shorts))),
    median,
    small: entry.small === true,
    top: (Array.isArray(entry.top) ? entry.top : []).slice(0, 5).flatMap((video) => {
      if (!video || typeof video !== "object") return [];
      const item = video as Record<string, unknown>;
      const url = httpsUrl(item.url);
      return url ? [{ title: text(item.title, 200), url, score: finite(item.score), views: Math.max(0, finite(item.views)), young: item.young === true }] : [];
    }),
    ...(text(entry.error, 300) ? { error: text(entry.error, 300) } : {}),
  };
}

/** Une vidéo au-dessus de sa médiane relue : identifiant et adresse https contrôlés, nombres finis, textes bornés. */
function cleanOutlier(raw: unknown): NicheOutlier | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  const url = httpsUrl(item.url);
  if (typeof item.videoId !== "string" || !VIDEO_ID.test(item.videoId) || !url) return null;
  const channel = text(item.channel, 100);
  const score = Math.round(finite(item.score) * 100) / 100;
  if (!channel || score <= 0) return null;
  const duration = Math.round(finite(item.durationSeconds));
  return {
    videoId: item.videoId,
    service: NICHE_SERVICES.includes(item.service as NicheService) ? (item.service as NicheService) : "youtube",
    channel,
    title: text(item.title, 200),
    url,
    views: Math.max(0, Math.round(finite(item.views))),
    score,
    median: Math.max(0, Math.round(finite(item.median))),
    ...(typeof item.publishedAt === "string" && item.publishedAt.length <= 40 && Number.isFinite(Date.parse(item.publishedAt)) ? { publishedAt: item.publishedAt } : {}),
    ...(duration > 0 ? { durationSeconds: duration } : {}),
    young: item.young === true,
    ...(text(item.spoken, BANK_LIMITS.spoken) ? { spoken: text(item.spoken, BANK_LIMITS.spoken) } : {}),
    ...(typeof item.spokenLanguage === "string" && /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(item.spokenLanguage) ? { spokenLanguage: item.spokenLanguage } : {}),
    ...(typeof item.conceptId === "string" && CONCEPT_ID.test(item.conceptId) ? { conceptId: item.conceptId } : {}),
    ...(item.own === true ? { own: true } : {}),
  };
}

function cleanStudy(raw: unknown): NicheStudy | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const entry = raw as Record<string, unknown>;
  const own = cleanStat(entry.own);
  const ownRaw = (entry.own && typeof entry.own === "object" ? entry.own : {}) as Record<string, unknown>;
  const outliers = (Array.isArray(entry.outliers) ? entry.outliers : []).map(cleanOutlier).filter((outlier): outlier is NicheOutlier => outlier !== null).slice(0, BANK_LIMITS.outliers);
  return {
    at: finite(entry.at),
    ...(typeof entry.accountId === "string" && entry.accountId.length <= 80 ? { accountId: entry.accountId } : {}),
    ...(entry.source === "public" || entry.source === "account" ? { source: entry.source } : {}),
    ...(entry.spoken === true ? { spoken: true } : {}),
    ...(Array.isArray(entry.outliers) ? { outliers } : {}),
    ...(finite(entry.reads) > 0 ? { reads: Math.round(finite(entry.reads)) } : {}),
    channels: (Array.isArray(entry.channels) ? entry.channels : []).map(cleanStat).filter((stat): stat is ChannelStat => stat !== null).slice(0, BANK_LIMITS.studied),
    ...(own
      ? {
          own: {
            ...own,
            recentHits: (Array.isArray(ownRaw.recentHits) ? ownRaw.recentHits : []).slice(0, 10).flatMap((hit) => {
              if (!hit || typeof hit !== "object") return [];
              const item = hit as Record<string, unknown>;
              const url = httpsUrl(item.url);
              return url ? [{ title: text(item.title, 200), url, score: finite(item.score), ...(typeof item.publishedAt === "string" ? { publishedAt: item.publishedAt.slice(0, 40) } : {}) }] : [];
            }),
          },
        }
      : {}),
    hits: Math.max(0, Math.round(finite(entry.hits))),
    unitsUsed: Math.max(0, Math.round(finite(entry.unitsUsed))),
    notes: (Array.isArray(entry.notes) ? entry.notes : []).map((note) => text(note, 300)).filter(Boolean).slice(0, 20),
  };
}

export function emptyBank(kitId: string): ConceptBank {
  return { version: 1, kitId, channels: [], concepts: [], updatedAt: 0 };
}

export function cleanBank(raw: unknown, kitId: string): ConceptBank {
  if (!raw || typeof raw !== "object") return emptyBank(kitId);
  const entry = raw as Record<string, unknown>;
  const seen = new Set<string>();
  const channels = (Array.isArray(entry.channels) ? entry.channels : [])
    .map(cleanChannel)
    .filter((channel): channel is ReferenceChannel => {
      if (!channel || seen.has(channel.handle.toLowerCase())) return false;
      seen.add(channel.handle.toLowerCase());
      return true;
    })
    .slice(0, BANK_LIMITS.channels);
  const study = cleanStudy(entry.study);
  return {
    version: 1,
    kitId,
    channels,
    concepts: (Array.isArray(entry.concepts) ? entry.concepts : []).map(cleanConcept).filter((concept): concept is Concept => concept !== null).slice(0, BANK_LIMITS.concepts),
    ...(study ? { study } : {}),
    updatedAt: finite(entry.updatedAt),
  };
}

const bankFile = (kitId: string) => path.join(CONCEPTS_DIR(), `${bankKey(kitId)}.json`);

export function readBank(kitId: unknown): ConceptBank {
  const key = bankKey(kitId);
  return cleanBank(readJson<unknown>(bankFile(key), null), key);
}

export function writeBank(bank: ConceptBank): ConceptBank {
  const key = bankKey(bank.kitId);
  const clean = cleanBank({ ...bank, updatedAt: Date.now() }, key);
  writeJsonAtomic(bankFile(key), clean);
  return clean;
}
