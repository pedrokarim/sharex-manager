/**
 * Bibliothèque de Clip Studio : recherche, filtres, tri et pagination des
 * projets et des exports, lecture et écriture de ces réglages dans l'adresse,
 * et agrégation des publications d'un export (une ligne par compte).
 *
 * Pur : aucun disque, aucun réseau. Le serveur s'en sert pour paginer, les
 * écrans pour garder l'adresse en phase, les tests pour tout vérifier.
 */

import type { AspectPreset } from "../engine/types";

// ─── Commun ──────────────────────────────────────────────────────

/** Éléments par page des listes de projets et d'exports. */
export const PAGE_SIZE = 24;

export const ASPECT_PRESETS: readonly AspectPreset[] = ["9:16", "16:9", "1:1", "4:5"];

export const ASPECT_LABELS: Record<AspectPreset, string> = {
  "9:16": "Vertical 9:16",
  "16:9": "Paysage 16:9",
  "1:1": "Carré 1:1",
  "4:5": "Portrait 4:5",
};

export type Period = "7d" | "30d" | "90d" | "365d";
export const PERIODS: readonly Period[] = ["7d", "30d", "90d", "365d"];
export const PERIOD_LABELS: Record<Period, string> = {
  "7d": "7 derniers jours",
  "30d": "30 derniers jours",
  "90d": "3 derniers mois",
  "365d": "12 derniers mois",
};
const PERIOD_DAYS: Record<Period, number> = { "7d": 7, "30d": 30, "90d": 90, "365d": 365 };
const DAY_MS = 86_400_000;

export type SortDirection = "asc" | "desc";

export interface Page<T> {
  items: T[];
  total: number;
  /** Page rendue (à partir de 1), ramenée dans les bornes. */
  page: number;
  pageCount: number;
  pageSize: number;
}

/** Découpe une liste en pages ; une page hors bornes est ramenée à la dernière. */
export function paginate<T>(items: T[], page: number, pageSize = PAGE_SIZE): Page<T> {
  const size = Math.max(1, Math.floor(pageSize) || PAGE_SIZE);
  const pageCount = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(pageCount, Math.max(1, Math.floor(page) || 1));
  return { items: items.slice((current - 1) * size, current * size), total: items.length, page: current, pageCount, pageSize: size };
}

/** Texte comparable : minuscules, sans accents, espaces resserrés. */
export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Tous les mots de la recherche se retrouvent dans l'un des textes. */
export function matchesSearch(query: string, texts: (string | undefined)[]): boolean {
  const words = normalizeText(query).split(" ").filter(Boolean);
  if (words.length === 0) return true;
  const haystack = normalizeText(texts.filter(Boolean).join(" "));
  return words.every((word) => haystack.includes(word));
}

export function withinPeriod(at: number, period: Period | "", now: number): boolean {
  if (!period) return true;
  return at >= now - PERIOD_DAYS[period] * DAY_MS;
}

/** Format le plus proche d'un cadre (largeur, hauteur) ; `null` s'il n'en est proche d'aucun. */
export function aspectOf(width: number, height: number): AspectPreset | null {
  if (!(width > 0 && height > 0)) return null;
  const ratio = width / height;
  let best: AspectPreset | null = null;
  let gap = Infinity;
  for (const preset of ASPECT_PRESETS) {
    const [w, h] = preset.split(":").map(Number);
    const distance = Math.abs(Math.log(ratio / (w / h)));
    if (distance < gap) {
      gap = distance;
      best = preset;
    }
  }
  return gap < 0.08 ? best : null;
}

const isAspect = (value: unknown): value is AspectPreset => typeof value === "string" && (ASPECT_PRESETS as readonly string[]).includes(value);
const isPeriod = (value: unknown): value is Period => typeof value === "string" && (PERIODS as readonly string[]).includes(value);
const KIT_ID = /^kit-[a-z0-9]{6,32}$/;
const PROJECT_ID = /^[a-z0-9][a-z0-9-]{2,80}$/i;

function pageOf(value: string | null): number {
  const page = Number(value);
  return Number.isInteger(page) && page >= 1 && page <= 100_000 ? page : 1;
}

/** Recherche lue dans l'adresse : bornée, sans retour à la ligne. */
function searchOf(value: string | null): string {
  return (value ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
}

/** Chaîne de requête sans les valeurs par défaut ; vide quand tout est par défaut. */
function queryString(entries: [string, string | number | undefined | null][]): string {
  const params = new URLSearchParams();
  for (const [key, value] of entries) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : "";
}

// ─── Étiquettes ──────────────────────────────────────────────────

export const MAX_TAGS = 12;
export const MAX_TAG_LENGTH = 32;

/**
 * Étiquettes d'un projet : texte court, sans retour à la ligne ni virgule,
 * dédoublonnées sans tenir compte de la casse, douze au plus.
 */
export function cleanTags(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const tag = raw.replace(/[\s,]+/g, " ").trim().slice(0, MAX_TAG_LENGTH).trim();
    const key = normalizeText(tag);
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

// ─── Projets ─────────────────────────────────────────────────────

/** D'où vient un projet : la fenêtre « Nouveau clip », une création à partir d'une vidéo, un import. */
export type ProjectOrigin = "assistant" | "template" | "blank" | "gallery" | "subtitle" | "clipping" | "import";

export const PROJECT_ORIGINS: readonly ProjectOrigin[] = ["assistant", "template", "blank", "gallery", "subtitle", "clipping", "import"];

export const ORIGIN_LABELS: Record<ProjectOrigin, string> = {
  assistant: "Assistant",
  template: "Modèle",
  blank: "Vide",
  gallery: "Galerie",
  subtitle: "Sous-titré",
  clipping: "Découpé",
  import: "Importé",
};

export const isProjectOrigin = (value: unknown): value is ProjectOrigin => typeof value === "string" && (PROJECT_ORIGINS as readonly string[]).includes(value);

/** Résumé d'un projet pour les listes. */
export interface ProjectSummary {
  id: string;
  name: string;
  aspect: AspectPreset;
  width: number;
  height: number;
  durationFrames: number;
  fps: number;
  itemCount: number;
  /** Première image du projet, à défaut d'une vignette rendue. */
  cover?: string;
  /** Vignette rendue d'une image du clip (adresse servie par le module). */
  thumbnail?: string;
  /** La vignette date d'avant la dernière modification : à refaire. */
  thumbnailStale?: boolean;
  brandKitId?: string;
  tags: string[];
  /** Origine connue ; absente pour un projet d'avant son relevé. */
  origin?: ProjectOrigin;
  exportCount: number;
  lastExportAt?: number;
  createdAt: number;
  updatedAt: number;
}

export type ProjectSort = "updated" | "created" | "name" | "duration";
export const PROJECT_SORTS: readonly ProjectSort[] = ["updated", "created", "name", "duration"];
export const PROJECT_SORT_LABELS: Record<ProjectSort, string> = {
  updated: "Dernière modification",
  created: "Date de création",
  name: "Nom",
  duration: "Durée",
};
/** Sens naturel de chaque tri : le plus récent, le plus long d'abord ; les noms de A à Z. */
const PROJECT_SORT_DIR: Record<ProjectSort, SortDirection> = { updated: "desc", created: "desc", name: "asc", duration: "desc" };

export type LibraryView = "grid" | "list";

export interface ProjectQuery {
  page: number;
  q: string;
  sort: ProjectSort;
  dir: SortDirection;
  aspect: AspectPreset | "";
  /** « none » : sans marque ; sinon l'identifiant d'une marque. */
  brand: string;
  /** « other » : origine inconnue. */
  origin: ProjectOrigin | "other" | "";
  tag: string;
  exported: "" | "yes" | "no";
  period: Period | "";
}

export const DEFAULT_PROJECT_QUERY: ProjectQuery = {
  page: 1,
  q: "",
  sort: "updated",
  dir: "desc",
  aspect: "",
  brand: "",
  origin: "",
  tag: "",
  exported: "",
  period: "",
};

/** Lit la requête des projets dans l'adresse ; toute valeur inconnue retombe sur la valeur par défaut. */
export function parseProjectQuery(params: URLSearchParams): ProjectQuery {
  const sortParam = params.get("sort");
  const sort: ProjectSort = (PROJECT_SORTS as readonly string[]).includes(sortParam ?? "") ? (sortParam as ProjectSort) : "updated";
  const dirParam = params.get("dir");
  const origin = params.get("origin");
  const brand = params.get("brand") ?? "";
  const exported = params.get("exported");
  return {
    page: pageOf(params.get("page")),
    q: searchOf(params.get("q")),
    sort,
    dir: dirParam === "asc" || dirParam === "desc" ? dirParam : PROJECT_SORT_DIR[sort],
    aspect: isAspect(params.get("aspect")) ? (params.get("aspect") as AspectPreset) : "",
    brand: brand === "none" || KIT_ID.test(brand) ? brand : "",
    origin: isProjectOrigin(origin) || origin === "other" ? (origin as ProjectOrigin | "other") : "",
    tag: (params.get("tag") ?? "").trim().slice(0, MAX_TAG_LENGTH),
    exported: exported === "yes" || exported === "no" ? exported : "",
    period: isPeriod(params.get("period")) ? (params.get("period") as Period) : "",
  };
}

/** Adresse (partie `?…`) d'une requête de projets ; les valeurs par défaut n'y figurent pas. */
export function projectQueryString(query: ProjectQuery, view: LibraryView = "grid"): string {
  return queryString([
    ["q", query.q.trim()],
    ["sort", query.sort === DEFAULT_PROJECT_QUERY.sort ? "" : query.sort],
    ["dir", query.dir === PROJECT_SORT_DIR[query.sort] ? "" : query.dir],
    ["aspect", query.aspect],
    ["brand", query.brand],
    ["origin", query.origin],
    ["tag", query.tag],
    ["exported", query.exported],
    ["period", query.period],
    ["view", view === "grid" ? "" : view],
    ["page", query.page > 1 ? query.page : ""],
  ]);
}

/** Des filtres sont posés (la recherche comprise) : « Retirer les filtres » a un sens. */
export function hasProjectFilters(query: ProjectQuery): boolean {
  return Boolean(query.q || query.aspect || query.brand || query.origin || query.tag || query.exported || query.period);
}

/** Change une partie de la requête ; tout changement autre que la page revient à la première page. */
export function updateProjectQuery(query: ProjectQuery, patch: Partial<ProjectQuery>): ProjectQuery {
  const next = { ...query, ...patch };
  if (patch.sort && !patch.dir) next.dir = PROJECT_SORT_DIR[patch.sort];
  if (!("page" in patch)) next.page = 1;
  return next;
}

export function filterProjects(items: ProjectSummary[], query: ProjectQuery, now = Date.now()): ProjectSummary[] {
  const tag = normalizeText(query.tag);
  return items.filter((project) => {
    if (query.aspect && project.aspect !== query.aspect) return false;
    if (query.brand === "none" ? Boolean(project.brandKitId) : query.brand && project.brandKitId !== query.brand) return false;
    if (query.origin === "other" ? Boolean(project.origin) : query.origin && project.origin !== query.origin) return false;
    if (tag && !project.tags.some((entry) => normalizeText(entry) === tag)) return false;
    if (query.exported === "yes" && project.exportCount === 0) return false;
    if (query.exported === "no" && project.exportCount > 0) return false;
    if (!withinPeriod(project.updatedAt, query.period, now)) return false;
    return matchesSearch(query.q, [project.name, ...project.tags]);
  });
}

const collator = new Intl.Collator("fr", { sensitivity: "base", numeric: true });

export function sortProjects(items: ProjectSummary[], sort: ProjectSort, dir: SortDirection): ProjectSummary[] {
  const sign = dir === "asc" ? 1 : -1;
  const seconds = (project: ProjectSummary) => project.durationFrames / Math.max(1, project.fps);
  return [...items].sort((a, b) => {
    let order = 0;
    if (sort === "name") order = collator.compare(a.name, b.name);
    else if (sort === "created") order = a.createdAt - b.createdAt;
    else if (sort === "duration") order = seconds(a) - seconds(b);
    else order = a.updatedAt - b.updatedAt;
    // À égalité, le plus récemment modifié d'abord : l'ordre reste stable d'une page à l'autre.
    return order * sign || b.updatedAt - a.updatedAt || a.id.localeCompare(b.id);
  });
}

/** Valeurs proposées par les filtres, comptées sur toute la bibliothèque. */
export interface ProjectFacets {
  aspects: { value: AspectPreset; count: number }[];
  brands: { id: string; count: number }[];
  withoutBrand: number;
  origins: { value: ProjectOrigin | "other"; count: number }[];
  tags: { tag: string; count: number }[];
  exported: number;
}

export function projectFacets(items: ProjectSummary[]): ProjectFacets {
  const aspects = new Map<AspectPreset, number>();
  const brands = new Map<string, number>();
  const origins = new Map<ProjectOrigin | "other", number>();
  const tags = new Map<string, { tag: string; count: number }>();
  let withoutBrand = 0;
  let exported = 0;
  for (const project of items) {
    aspects.set(project.aspect, (aspects.get(project.aspect) ?? 0) + 1);
    if (project.brandKitId) brands.set(project.brandKitId, (brands.get(project.brandKitId) ?? 0) + 1);
    else withoutBrand++;
    const origin = project.origin ?? "other";
    origins.set(origin, (origins.get(origin) ?? 0) + 1);
    for (const tag of project.tags) {
      const key = normalizeText(tag);
      const entry = tags.get(key) ?? { tag, count: 0 };
      entry.count++;
      tags.set(key, entry);
    }
    if (project.exportCount > 0) exported++;
  }
  return {
    aspects: ASPECT_PRESETS.filter((value) => aspects.has(value)).map((value) => ({ value, count: aspects.get(value)! })),
    brands: [...brands].map(([id, count]) => ({ id, count })).sort((a, b) => b.count - a.count),
    withoutBrand,
    origins: [...PROJECT_ORIGINS, "other" as const].filter((value) => origins.has(value)).map((value) => ({ value, count: origins.get(value)! })),
    tags: [...tags.values()].sort((a, b) => b.count - a.count || collator.compare(a.tag, b.tag)),
    exported,
  };
}

export interface ProjectPage extends Page<ProjectSummary> {
  facets: ProjectFacets;
  /** Projets de toute la bibliothèque, sans filtre. */
  libraryTotal: number;
}

/** Requête complète : filtres, tri, page, et valeurs des filtres. */
export function queryProjects(items: ProjectSummary[], query: ProjectQuery, now = Date.now(), pageSize = PAGE_SIZE): ProjectPage {
  const shown = sortProjects(filterProjects(items, query, now), query.sort, query.dir);
  return { ...paginate(shown, query.page, pageSize), facets: projectFacets(items), libraryTotal: items.length };
}

/** Relit une requête reçue par le serveur (objet venu du navigateur). */
export function cleanProjectQuery(input: unknown): ProjectQuery {
  const record = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(record)) {
    if (typeof value === "string" || typeof value === "number") params.set(key, String(value));
  }
  return parseProjectQuery(params);
}

// ─── Publications d'un export ────────────────────────────────────

/** Ce que les écrans lisent d'un travail de la file (`PublishJobSummary`). */
export interface JobLike {
  id: string;
  accountId: string;
  connector: string;
  state: "queued" | "uploading" | "processing" | "done" | "failed" | "cancelled" | "waiting-quota" | "waiting-credits";
  source: { id: string };
  result?: { externalId: string; url: string };
  publishAt?: number;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

export type ChannelState = "published" | "scheduled" | "pending" | "failed" | "cancelled";

export const CHANNEL_STATE_LABELS: Record<ChannelState, string> = {
  published: "Publié",
  scheduled: "Programmé",
  pending: "En cours",
  failed: "Échec",
  cancelled: "Annulé",
};

/** Une ligne par compte : où en est l'export sur ce compte. */
export interface PublicationRow {
  accountId: string;
  connector: string;
  state: ChannelState;
  /** Travail retenu pour la ligne : la publication réussie, sinon le dernier envoi. */
  jobId: string;
  url?: string;
  /** Identifiant chez le service, pour retrouver les statistiques. */
  externalId?: string;
  /** Publication faite, envoi programmé ou dernier changement. */
  at: number;
  publishAt?: number;
  error?: string;
  /** Envois de cet export vers ce compte, tous états confondus. */
  attempts: number;
  /** Le dernier envoi peut repartir (« Reprendre »). */
  retryable: boolean;
}

function jobState(job: JobLike): ChannelState {
  if (job.result || job.state === "done") return "published";
  if (job.state === "failed") return "failed";
  if (job.state === "cancelled") return "cancelled";
  if (job.state === "queued" && job.publishAt) return "scheduled";
  return "pending";
}

const STATE_ORDER: Record<ChannelState, number> = { failed: 0, pending: 1, scheduled: 2, published: 3, cancelled: 4 };

/**
 * Publications d'un export, une ligne par compte. Une publication réussie
 * l'emporte sur les envois ratés ou annulés vers le même compte ; sans elle,
 * le dernier envoi dit l'état. Les échecs viennent en tête, puis ce qui
 * avance, ce qui est programmé, ce qui est publié (le plus récent d'abord).
 */
export function publicationRows(jobs: JobLike[]): PublicationRow[] {
  const byAccount = new Map<string, JobLike[]>();
  for (const job of jobs) {
    const list = byAccount.get(job.accountId) ?? [];
    list.push(job);
    byAccount.set(job.accountId, list);
  }
  const rows: PublicationRow[] = [];
  for (const [accountId, list] of byAccount) {
    const sorted = [...list].sort((a, b) => b.createdAt - a.createdAt);
    const published = sorted.find((job) => jobState(job) === "published");
    const chosen = published ?? sorted[0];
    const state = jobState(chosen);
    rows.push({
      accountId,
      connector: chosen.connector,
      state,
      jobId: chosen.id,
      ...(chosen.result?.url ? { url: chosen.result.url } : {}),
      ...(chosen.result?.externalId ? { externalId: chosen.result.externalId } : {}),
      at: state === "scheduled" && chosen.publishAt ? chosen.publishAt : chosen.updatedAt,
      ...(chosen.publishAt ? { publishAt: chosen.publishAt } : {}),
      ...(chosen.error && state !== "published" ? { error: chosen.error } : {}),
      attempts: list.length,
      retryable: !chosen.result && ["failed", "cancelled", "waiting-quota", "waiting-credits"].includes(chosen.state),
    });
  }
  return rows.sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state] || b.at - a.at);
}

/** État d'ensemble d'un export : « none » quand rien n'a été envoyé (ou tout annulé). */
export type ExportStatus = "published" | "scheduled" | "pending" | "failed" | "none";

export const EXPORT_STATUS_LABELS: Record<ExportStatus, string> = {
  published: "Publié",
  scheduled: "Programmé",
  pending: "En cours d’envoi",
  failed: "Échec",
  none: "Non publié",
};

export interface ExportPublications {
  status: ExportStatus;
  rows: PublicationRow[];
}

export function exportPublications(jobs: JobLike[]): ExportPublications {
  const rows = publicationRows(jobs).filter((row) => row.state !== "cancelled");
  const has = (state: ChannelState) => rows.some((row) => row.state === state);
  const status: ExportStatus = has("published") ? "published" : has("failed") ? "failed" : has("pending") ? "pending" : has("scheduled") ? "scheduled" : "none";
  return { status, rows };
}

/** L'export correspond-il au filtre d'état ? Un export publié ici et en échec là répond aux deux. */
export function matchesStatus(publications: ExportPublications, status: ExportStatus | ""): boolean {
  if (!status) return true;
  if (status === "none") return publications.rows.length === 0;
  return publications.rows.some((row) => row.state === status);
}

// ─── Exports ─────────────────────────────────────────────────────

/** Ce que la liste lit d'un export (`ClipExport`). */
export interface ExportLike {
  id: string;
  projectId: string;
  projectName: string;
  width: number;
  height: number;
  durationMs: number;
  sizeBytes: number;
  createdAt: number;
  brandKitId?: string;
  post?: { base?: { title?: string } };
}

export type ExportSort = "date" | "name" | "duration" | "size";
export const EXPORT_SORTS: readonly ExportSort[] = ["date", "name", "duration", "size"];
export const EXPORT_SORT_LABELS: Record<ExportSort, string> = { date: "Date du rendu", name: "Nom", duration: "Durée", size: "Poids" };
const EXPORT_SORT_DIR: Record<ExportSort, SortDirection> = { date: "desc", name: "asc", duration: "desc", size: "desc" };

export const EXPORT_STATUSES: readonly ExportStatus[] = ["published", "scheduled", "pending", "failed", "none"];

export interface ExportQuery {
  page: number;
  q: string;
  sort: ExportSort;
  dir: SortDirection;
  aspect: AspectPreset | "";
  brand: string;
  project: string;
  /** Service où l'export a été publié (identifiant du connecteur). */
  channel: string;
  status: ExportStatus | "";
  period: Period | "";
}

export const DEFAULT_EXPORT_QUERY: ExportQuery = { page: 1, q: "", sort: "date", dir: "desc", aspect: "", brand: "", project: "", channel: "", status: "", period: "" };

export function parseExportQuery(params: URLSearchParams): ExportQuery {
  const sortParam = params.get("sort");
  const sort: ExportSort = (EXPORT_SORTS as readonly string[]).includes(sortParam ?? "") ? (sortParam as ExportSort) : "date";
  const dirParam = params.get("dir");
  const brand = params.get("brand") ?? "";
  const project = params.get("project") ?? "";
  const channel = params.get("channel") ?? "";
  const status = params.get("status");
  return {
    page: pageOf(params.get("page")),
    q: searchOf(params.get("q")),
    sort,
    dir: dirParam === "asc" || dirParam === "desc" ? dirParam : EXPORT_SORT_DIR[sort],
    aspect: isAspect(params.get("aspect")) ? (params.get("aspect") as AspectPreset) : "",
    brand: brand === "none" || KIT_ID.test(brand) ? brand : "",
    project: PROJECT_ID.test(project) ? project : "",
    channel: /^[a-z][a-z0-9-]{1,40}$/.test(channel) ? channel : "",
    status: (EXPORT_STATUSES as readonly string[]).includes(status ?? "") ? (status as ExportStatus) : "",
    period: isPeriod(params.get("period")) ? (params.get("period") as Period) : "",
  };
}

export function exportQueryString(query: ExportQuery, view: LibraryView = "list"): string {
  return queryString([
    ["q", query.q.trim()],
    ["sort", query.sort === DEFAULT_EXPORT_QUERY.sort ? "" : query.sort],
    ["dir", query.dir === EXPORT_SORT_DIR[query.sort] ? "" : query.dir],
    ["aspect", query.aspect],
    ["brand", query.brand],
    ["project", query.project],
    ["channel", query.channel],
    ["status", query.status],
    ["period", query.period],
    ["view", view === "list" ? "" : view],
    ["page", query.page > 1 ? query.page : ""],
  ]);
}

export function hasExportFilters(query: ExportQuery): boolean {
  return Boolean(query.q || query.aspect || query.brand || query.project || query.channel || query.status || query.period);
}

export function updateExportQuery(query: ExportQuery, patch: Partial<ExportQuery>): ExportQuery {
  const next = { ...query, ...patch };
  if (patch.sort && !patch.dir) next.dir = EXPORT_SORT_DIR[patch.sort];
  if (!("page" in patch)) next.page = 1;
  return next;
}

export function cleanExportQuery(input: unknown): ExportQuery {
  const record = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(record)) {
    if (typeof value === "string" || typeof value === "number") params.set(key, String(value));
  }
  return parseExportQuery(params);
}

/** Titre affiché d'un export : celui de ses textes de publication, sinon le nom du projet. */
export function exportTitle(entry: ExportLike): string {
  return entry.post?.base?.title?.trim() || entry.projectName;
}

/**
 * Filtre et trie les exports. `publications` (administrateurs) permet les
 * filtres par service et par état ; sans lui, ces filtres sont ignorés.
 */
export function filterExports<T extends ExportLike>(items: T[], query: ExportQuery, publications?: Map<string, ExportPublications>, now = Date.now()): T[] {
  return items.filter((entry) => {
    if (query.aspect && aspectOf(entry.width, entry.height) !== query.aspect) return false;
    if (query.brand === "none" ? Boolean(entry.brandKitId) : query.brand && entry.brandKitId !== query.brand) return false;
    if (query.project && entry.projectId !== query.project) return false;
    if (!withinPeriod(entry.createdAt, query.period, now)) return false;
    if (publications) {
      const state = publications.get(entry.id) ?? { status: "none", rows: [] };
      if (query.channel && !state.rows.some((row) => row.connector === query.channel && row.state !== "cancelled")) return false;
      if (!matchesStatus(state, query.status)) return false;
    }
    return matchesSearch(query.q, [entry.projectName, exportTitle(entry)]);
  });
}

export function sortExports<T extends ExportLike>(items: T[], sort: ExportSort, dir: SortDirection): T[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...items].sort((a, b) => {
    let order = 0;
    if (sort === "name") order = collator.compare(exportTitle(a), exportTitle(b));
    else if (sort === "duration") order = a.durationMs - b.durationMs;
    else if (sort === "size") order = a.sizeBytes - b.sizeBytes;
    else order = a.createdAt - b.createdAt;
    return order * sign || b.createdAt - a.createdAt || a.id.localeCompare(b.id);
  });
}

// ─── Tableau de bord ─────────────────────────────────────────────

/** Jour local au format AAAA-MM-JJ. */
export function dayKey(at: number): string {
  const date = new Date(at);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export interface ActivityDay {
  day: string;
  exports: number;
  publications: number;
}

export interface Activity {
  days: ActivityDay[];
  exportsWeek: number;
  exportsMonth: number;
  publicationsWeek: number;
  publicationsMonth: number;
}

/**
 * Activité des `days` derniers jours (aujourd'hui compris) : exports rendus
 * et publications faites, jour par jour, et les totaux sur 7 et 30 jours.
 */
export function activity(exportDates: number[], publicationDates: number[], now = Date.now(), days = 30): Activity {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const list: ActivityDay[] = [];
  const index = new Map<string, ActivityDay>();
  for (let offset = days - 1; offset >= 0; offset--) {
    const date = new Date(start);
    date.setDate(start.getDate() - offset);
    const entry = { day: dayKey(date.getTime()), exports: 0, publications: 0 };
    list.push(entry);
    index.set(entry.day, entry);
  }
  for (const at of exportDates) {
    const entry = index.get(dayKey(at));
    if (entry) entry.exports++;
  }
  for (const at of publicationDates) {
    const entry = index.get(dayKey(at));
    if (entry) entry.publications++;
  }
  const since = (span: number) => now - span * DAY_MS;
  return {
    days: list,
    exportsWeek: exportDates.filter((at) => at >= since(7) && at <= now).length,
    exportsMonth: exportDates.filter((at) => at >= since(30) && at <= now).length,
    publicationsWeek: publicationDates.filter((at) => at >= since(7) && at <= now).length,
    publicationsMonth: publicationDates.filter((at) => at >= since(30) && at <= now).length,
  };
}

export interface ChannelTotals {
  connector: string;
  published: number;
  scheduled: number;
  pending: number;
  failed: number;
}

/** Publications par service, comptées une fois par export et par compte. */
export function channelTotals(perExport: ExportPublications[]): ChannelTotals[] {
  const totals = new Map<string, ChannelTotals>();
  for (const entry of perExport) {
    for (const row of entry.rows) {
      if (row.state === "cancelled") continue;
      const total = totals.get(row.connector) ?? { connector: row.connector, published: 0, scheduled: 0, pending: 0, failed: 0 };
      total[row.state]++;
      totals.set(row.connector, total);
    }
  }
  return [...totals.values()].sort((a, b) => b.published - a.published || a.connector.localeCompare(b.connector));
}

/** Statistiques lues chez le service pour une publication. */
export interface PostStats {
  views?: number;
  likes?: number;
  comments?: number;
}

/** Ajoute aux lignes les statistiques connues (par compte, puis par identifiant chez le service). */
export function withStats<R extends { accountId: string; externalId?: string }>(rows: R[], stats: Map<string, Map<string, PostStats>>): (R & { stats?: PostStats })[] {
  return rows.map((row) => {
    const found = row.externalId ? stats.get(row.accountId)?.get(row.externalId) : undefined;
    return found ? { ...row, stats: found } : row;
  });
}
