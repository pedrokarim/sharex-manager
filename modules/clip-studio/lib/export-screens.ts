/**
 * Logique pure des écrans Exporter, Export et Publier (dossier 01 ter,
 * § 3) : plage à rendre, vérifications avant rendu, édition des textes de
 * publication par service, dates de publication.
 *
 * Rien ici ne touche au navigateur ni au serveur : les écrans s'en servent,
 * les tests aussi.
 */

import { checkMediaLimits, describeMediaLimits } from "@/lib/connections/limits";
import type { MediaLimits, ShortFormNote } from "@/lib/connections/types";
import type { ClipItem, ClipProject } from "../engine/types";
import { POST_TEXT_FIELDS, emptyPostTexts, type ExportPost, type PostTextField, type PostTexts } from "./post-types";

// ─── Plage à exporter ────────────────────────────────────────────

/** Plage en images du projet : `from` compris, `to` exclu. */
export interface FrameRange {
  from: number;
  to: number;
}

/** Une plage d'une image au moins, bornée par la durée du projet. */
export function clampRange(range: FrameRange, totalFrames: number): FrameRange {
  const total = Math.max(1, Math.round(totalFrames));
  const from = Math.min(Math.max(0, Math.round(range.from)), total - 1);
  const to = Math.min(Math.max(from + 1, Math.round(range.to)), total);
  return { from, to };
}

/** La plage couvre-t-elle tout le projet ? */
export const isWholeRange = (range: FrameRange, totalFrames: number) => range.from <= 0 && range.to >= totalFrames;

/**
 * Le projet ramené à une plage, pour un rendu par `exportProject` : la
 * première image de la plage devient l'image 0, la dernière la fin du clip.
 *
 * - Un élément hors de la plage disparaît.
 * - Un élément visuel commencé avant la plage garde son départ (négatif) :
 *   ses animations sont au même point que dans le projet entier.
 * - Une vidéo ou un son commencé avant la plage démarre à 0, avancé d'autant
 *   dans sa source (le décodage et le mixage partent du début de l'élément) ;
 *   son entrée animée, sa transition et son fondu d'entrée ne se rejouent pas.
 * - Un élément qui dépasse la fin est coupé ; un élément visuel coupé perd sa
 *   sortie animée si elle n'avait pas commencé dans la plage, pour que ses
 *   dernières images restent celles du projet.
 */
export function sliceProject(project: ClipProject, range: FrameRange): ClipProject {
  const { from, to } = range;
  const cutItem = (item: ClipItem): ClipItem | null => {
    const end = item.start + item.duration;
    if (end <= from || item.start >= to) return null;
    const next = structuredClone(item) as ClipItem;
    const lead = Math.max(0, from - item.start);
    if ((next.type === "video" || next.type === "audio") && lead > 0) {
      const rate = next.type === "video" ? speedOfItem(next) : 1;
      next.trimStart += lead * rate;
      next.start = 0;
      next.duration -= lead;
      if (next.type === "audio") next.fadeIn = 0;
      else {
        // Le départ de la vidéo est passé : son entrée et sa transition ne se rejouent pas.
        next.animIn = { kind: "none", frames: 0 };
        delete next.transition;
        if (next.animEmphasis) {
          const at = next.animEmphasis.at - lead;
          if (at >= 0) next.animEmphasis = { ...next.animEmphasis, at };
          else delete next.animEmphasis;
        }
      }
    } else {
      next.start -= from;
    }
    const newEnd = next.start + next.duration;
    const limit = to - from;
    if (newEnd > limit) {
      next.duration = limit - next.start;
      if (next.type !== "audio") {
        const outStart = end - from - (item.type !== "audio" ? item.animOut.frames : 0);
        if (outStart >= limit && next.animOut.kind !== "none") next.animOut = { kind: "none", frames: 0 };
      }
    }
    return next.duration > 0 ? next : null;
  };
  return {
    ...project,
    tracks: project.tracks.map((track) => ({
      ...track,
      items: track.items.map(cutItem).filter((item): item is ClipItem => item !== null),
    })),
  };
}

/** Vitesse d'une vidéo, bornée comme le moteur la borne. */
function speedOfItem(item: { speed?: number }): number {
  const speed = Number(item.speed);
  return Number.isFinite(speed) && speed > 0 ? Math.min(4, Math.max(0.25, speed)) : 1;
}

// ─── Vérifications avant rendu ───────────────────────────────────

/** « pending » : vérification en cours ; « blocked » : le rendu échouerait. */
export type CheckTone = "ok" | "pending" | "info" | "warning" | "blocked";

export interface PreRenderCheck {
  id: string;
  tone: CheckTone;
  title: string;
  detail?: string;
  /** Ce qu'il faut faire, en une phrase. */
  fix?: string;
  /** La correction se fait dans l'éditeur. */
  inEditor?: boolean;
  /** Logo du service concerné (entrée de `BrandLogo`). */
  logo?: string;
}

/** Un compte lié à la marque du projet, avec les limites qui valent pour lui. */
export interface LimitTarget {
  accountId: string;
  accountName: string;
  connectorLabel: string;
  logo?: string;
  limits?: MediaLimits;
  shortForm?: ShortFormNote;
}

export interface MissingMedia {
  name: string;
  kind: "image" | "video" | "audio";
}

export interface PreRenderInput {
  /** `null` : vérification en cours. */
  missingFonts: string[] | null;
  missingMedia: MissingMedia[] | null;
  unverifiedImages: string[];
  frame: { width: number; height: number; durationMs: number };
  targets: LimitTarget[];
  /** Nom de la marque, pour dire d'où viennent les comptes. */
  brandName?: string;
}

const list = (names: string[], max = 3) =>
  names.length <= max ? names.join(", ") : `${names.slice(0, max).join(", ")} et ${names.length - max} autre${names.length - max > 1 ? "s" : ""}`;

function formatSeconds(seconds: number): string {
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${minutes} min ${String(rest).padStart(2, "0")}` : `${minutes} min`;
}

/**
 * Ce qu'il faut savoir avant de lancer le rendu, ligne par ligne : polices,
 * médias, droits des images, puis durée et format comparés aux limites de
 * chaque compte lié à la marque. Les lignes bloquantes viennent d'abord.
 */
export function preRenderChecks(input: PreRenderInput): PreRenderCheck[] {
  const checks: PreRenderCheck[] = [];

  if (input.missingFonts === null) {
    checks.push({ id: "fonts", tone: "pending", title: "Vérification des polices…" });
  } else if (input.missingFonts.length > 0) {
    const count = input.missingFonts.length;
    checks.push({
      id: "fonts",
      tone: "warning",
      title: count > 1 ? `${count} polices n’ont pas pu être chargées` : "Une police n’a pas pu être chargée",
      detail: list(input.missingFonts),
      fix: "Le texte sortira avec une police de repli : choisissez une autre police dans l’éditeur ou vérifiez celles de la marque.",
      inEditor: true,
    });
  } else {
    checks.push({ id: "fonts", tone: "ok", title: "Polices chargées" });
  }

  if (input.missingMedia === null) {
    checks.push({ id: "media", tone: "pending", title: "Vérification des médias…" });
  } else if (input.missingMedia.length > 0) {
    const visual = input.missingMedia.filter((media) => media.kind !== "audio");
    const names = [...new Set(input.missingMedia.map((media) => media.name))];
    checks.push({
      id: "media",
      // Une image manquante fait échouer le rendu ; un son manquant est seulement ignoré.
      tone: visual.length > 0 ? "blocked" : "warning",
      title: names.length > 1 ? `${names.length} médias introuvables` : "Un média introuvable",
      detail: list(names),
      fix: visual.length > 0 ? "Remplacez-les ou retirez-les dans l’éditeur : le rendu échouerait." : "Le son manquant sera muet : remplacez-le dans l’éditeur.",
      inEditor: true,
    });
  } else {
    checks.push({ id: "media", tone: "ok", title: "Tous les médias sont accessibles" });
  }

  if (input.unverifiedImages.length > 0) {
    const count = input.unverifiedImages.length;
    checks.push({
      id: "rights",
      tone: "warning",
      title: count > 1 ? `${count} images aux droits à vérifier` : "Une image aux droits à vérifier",
      detail: list(input.unverifiedImages),
      fix: "Trouvées sur le web : vérifiez leur licence avant de publier, ou remplacez-les dans l’éditeur.",
      inEditor: true,
    });
  }

  const { width, height, durationMs } = input.frame;
  const vertical = width > 0 && height > 0 && width <= height;
  for (const target of input.targets) {
    const problems = checkMediaLimits(target.limits, { kind: "video", bytes: 0, mimeType: "video/mp4", width, height, durationMs });
    const name = `${target.connectorLabel} · ${target.accountName}`;
    if (problems.length > 0) {
      const tooLong = Boolean(target.limits?.maxDurationMs && durationMs > target.limits.maxDurationMs);
      checks.push({
        id: `limits-${target.accountId}`,
        tone: "warning",
        title: tooLong ? `Trop long pour ${target.connectorLabel}` : `Ne convient pas à ${target.connectorLabel}`,
        detail: `${name} : ${problems.join(" ")}`,
        fix: tooLong ? "Exportez une plage plus courte, ou raccourcissez le clip dans l’éditeur." : "Changez le format du projet dans l’éditeur.",
        inEditor: !tooLong,
        logo: target.logo,
      });
      continue;
    }
    const shortForm = target.shortForm;
    if (shortForm && vertical && durationMs > shortForm.maxSeconds * 1000) {
      checks.push({
        id: `short-${target.accountId}`,
        tone: "info",
        title: `Trop long pour une vidéo courte : ${formatSeconds(shortForm.maxSeconds)} au plus`,
        detail: `${name} : publié comme une vidéo classique.`,
        fix: "Exportez une plage plus courte pour qu’il soit classé en vidéo courte.",
        logo: target.logo,
      });
      continue;
    }
    checks.push({
      id: `limits-${target.accountId}`,
      tone: "ok",
      title: `Convient à ${target.connectorLabel}`,
      detail: target.limits ? `${name} : ${describeMediaLimits(target.limits)}` : `${name} : aucune limite déclarée.`,
      logo: target.logo,
    });
  }

  const order: Record<CheckTone, number> = { blocked: 0, warning: 1, info: 2, pending: 3, ok: 4 };
  return checks.map((check, index) => ({ check, index })).sort((a, b) => order[a.check.tone] - order[b.check.tone] || a.index - b.index).map(({ check }) => check);
}

/** Le rendu peut-il partir ? Seules les lignes bloquantes l'empêchent. */
export const canRender = (checks: PreRenderCheck[]) => !checks.some((check) => check.tone === "blocked");

// ─── Temps restant ───────────────────────────────────────────────

/**
 * Secondes restantes d'après l'avancement, ou `null` tant que l'estimation
 * serait fantaisiste (moins de 3 % fait ou moins de deux secondes écoulées).
 */
export function remainingSeconds(ratio: number, elapsedMs: number): number | null {
  if (!(ratio > 0.03) || elapsedMs < 2000 || ratio >= 1) return null;
  return Math.max(1, Math.round(((elapsedMs / ratio) * (1 - ratio)) / 1000));
}

/** « environ 2 min 05 », « environ 12 s ». */
export function formatRemaining(seconds: number): string {
  return `environ ${formatSeconds(seconds)}`;
}

// ─── Textes de publication : édition par service ─────────────────

/** Champ d'un jeu, désigné comme dans `ExportPost.unreviewed` : `base.title`, `instagram.caption`. */
export const reviewKey = (connectorId: string | null, field: PostTextField) => `${connectorId ?? "base"}.${field}`;

const sameValue = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function copyValue<T>(value: T): T {
  return (Array.isArray(value) ? [...value] : value) as T;
}

/** Jeu vide, pour un export d'avant les textes de publication. */
export function emptyPost(now = Date.now()): ExportPost {
  return { base: emptyPostTexts(), variants: {}, updatedAt: now };
}

/** Textes du texte commun (`null`) ou d'un service : sa variante, sinon le texte commun. */
export function textsOf(post: ExportPost, connectorId: string | null): PostTexts {
  const base = { ...emptyPostTexts(), ...post.base };
  if (!connectorId) return { ...base, hashtags: [...base.hashtags], tags: [...base.tags] };
  const variant = post.variants[connectorId] ?? {};
  const out = { ...base } as PostTexts;
  for (const field of POST_TEXT_FIELDS) {
    const value = variant[field];
    (out as unknown as Record<string, unknown>)[field] = copyValue(value !== undefined ? value : base[field]);
  }
  return out;
}

/** Le service a-t-il sa propre valeur pour ce champ ? */
export function isCustomized(post: ExportPost, connectorId: string, field: PostTextField): boolean {
  return post.variants[connectorId]?.[field] !== undefined;
}

function withoutReview(post: ExportPost, key: string): ExportPost["unreviewed"] {
  const rest = (post.unreviewed ?? []).filter((entry) => entry !== key);
  return rest.length > 0 ? rest : undefined;
}

function cleanVariants(variants: ExportPost["variants"]): ExportPost["variants"] {
  const out: ExportPost["variants"] = {};
  for (const [id, variant] of Object.entries(variants)) if (variant && Object.keys(variant).length > 0) out[id] = variant;
  return out;
}

/**
 * Modifie un champ du texte commun (`connectorId` nul) ou d'un service.
 *
 * Côté service, une valeur égale au texte commun retire la variante (le
 * service suit de nouveau le texte commun) ; toute autre crée ou met à jour
 * la variante de ce champ seulement. Côté texte commun, les variantes égales
 * à la nouvelle valeur disparaissent. Le champ n'est plus « à relire ».
 */
export function setPostField<K extends PostTextField>(post: ExportPost, connectorId: string | null, field: K, value: PostTexts[K]): ExportPost {
  const unreviewed = withoutReview(post, reviewKey(connectorId, field));
  if (!connectorId) {
    const base = { ...post.base, [field]: copyValue(value) };
    const variants: ExportPost["variants"] = {};
    for (const [id, variant] of Object.entries(post.variants)) {
      const copy = { ...variant };
      if (copy[field] !== undefined && sameValue(copy[field], value)) delete copy[field];
      variants[id] = copy;
    }
    return { ...post, base, variants: cleanVariants(variants), unreviewed };
  }
  const variant = { ...(post.variants[connectorId] ?? {}) };
  if (sameValue(value, post.base[field])) delete variant[field];
  else (variant as Record<string, unknown>)[field] = copyValue(value);
  return { ...post, variants: cleanVariants({ ...post.variants, [connectorId]: variant }), unreviewed };
}

/** « Revenir au texte commun » : retire la variante d'un champ pour un service. */
export function resetPostField(post: ExportPost, connectorId: string, field: PostTextField): ExportPost {
  const variant = { ...(post.variants[connectorId] ?? {}) };
  delete variant[field];
  return { ...post, variants: cleanVariants({ ...post.variants, [connectorId]: variant }), unreviewed: withoutReview(post, reviewKey(connectorId, field)) };
}

/** Marque un champ comme relu, sans le changer. */
export function markReviewed(post: ExportPost, key: string): ExportPost {
  return { ...post, unreviewed: withoutReview(post, key) };
}

/**
 * Propositions de l'assistant fusionnées dans le jeu affiché : chaque champ
 * proposé remplace la valeur et devient « à relire ». Rien n'est enregistré.
 */
export function mergeDraft(post: ExportPost, draft: Pick<ExportPost, "base" | "variants"> & { unreviewed?: string[] }, onlyKeys?: string[]): ExportPost {
  let next = post;
  const keep = onlyKeys ? new Set(onlyKeys) : null;
  const marked = new Set(post.unreviewed ?? []);
  for (const field of POST_TEXT_FIELDS) {
    const value = draft.base?.[field];
    const key = reviewKey(null, field);
    if (value === undefined || (keep && !keep.has(key))) continue;
    if (sameValue(value, next.base[field])) continue;
    next = setPostField(next, null, field, value as PostTexts[typeof field]);
    marked.add(key);
  }
  for (const [connectorId, variant] of Object.entries(draft.variants ?? {})) {
    for (const field of POST_TEXT_FIELDS) {
      const value = variant?.[field];
      const key = reviewKey(connectorId, field);
      if (value === undefined || (keep && !keep.has(key))) continue;
      if (sameValue(value, textsOf(next, connectorId)[field])) continue;
      next = setPostField(next, connectorId, field, value as PostTexts[typeof field]);
      marked.add(key);
    }
  }
  for (const key of draft.unreviewed ?? []) if (!keep || keep.has(key)) marked.add(key);
  return { ...next, ...(marked.size > 0 ? { unreviewed: [...marked] } : { unreviewed: undefined }) };
}

/** Deux jeux de textes disent-ils la même chose (horodatage mis à part) ? */
export function samePost(a: ExportPost | null | undefined, b: ExportPost | null | undefined): boolean {
  if (!a || !b) return a === b;
  return sameValue(a.base, b.base) && sameValue(cleanVariants(a.variants), cleanVariants(b.variants)) && sameValue([...(a.unreviewed ?? [])].sort(), [...(b.unreviewed ?? [])].sort());
}

/** « Crédits : » puis une mention par ligne, prêt à coller. */
export function creditsText(credits: string[]): string {
  return credits.length > 0 ? ["Crédits :", ...credits].join("\n") : "";
}

// ─── Dates de publication ────────────────────────────────────────

export type ScheduleMode = "now" | "common" | "perAccount";

/**
 * Dates décalées d'un pas, compte après compte, à partir d'une date : les
 * comptes ne partent pas tous à la même minute.
 */
export function staggerSchedule(start: string | number, accountIds: string[], stepMinutes: number): Record<string, string> {
  const first = new Date(start).getTime();
  const out: Record<string, string> = {};
  if (!Number.isFinite(first)) return out;
  accountIds.forEach((id, index) => {
    out[id] = new Date(first + index * Math.max(0, stepMinutes) * 60_000).toISOString();
  });
  return out;
}

/** Instant de publication de chaque compte, ou `undefined` pour « maintenant ». */
export function publishTimes(mode: ScheduleMode, common: string, perAccount: Record<string, string>, accountIds: string[]): Record<string, number | undefined> {
  const out: Record<string, number | undefined> = {};
  for (const id of accountIds) {
    const value = mode === "common" ? common : mode === "perAccount" ? perAccount[id] : "";
    const time = value ? new Date(value).getTime() : NaN;
    out[id] = Number.isFinite(time) ? time : undefined;
  }
  return out;
}

/**
 * Ce qui ne va pas dans les dates choisies : date absente quand il en faut
 * une, date passée (une minute de marge, le temps d'envoyer).
 */
export function scheduleProblems(mode: ScheduleMode, times: Record<string, number | undefined>, now = Date.now()): Record<string, string> {
  const problems: Record<string, string> = {};
  if (mode === "now") return problems;
  for (const [id, time] of Object.entries(times)) {
    if (time === undefined) problems[id] = "Choisissez une date de publication.";
    else if (time < now + 60_000) problems[id] = "La date de publication doit être dans le futur.";
  }
  return problems;
}
