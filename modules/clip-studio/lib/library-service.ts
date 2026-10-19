/**
 * Côté serveur de la bibliothèque (accueil, projets, exports) : résumés des
 * projets avec leurs vignettes et leurs exports, pages filtrées, actions
 * groupées, vignettes rendues par le navigateur, et publications des exports
 * lues dans la file du cœur, avec les statistiques que les services ont déjà
 * données.
 *
 * Les statistiques ne déclenchent jamais d'appel caché : l'accueil lit ce que
 * le cœur garde en mémoire (`peekPosts`) ; seul un geste (« Lire les
 * statistiques », ouverture de la fiche d'un export) demande la liste au
 * service, gardée dix minutes par le cœur.
 */

import fs from "fs";
import path from "path";
import sharp from "sharp";
import { getConnector, listAccounts, listJobs, listPosts, peekPosts, type PublishJobSummary } from "@/lib/connections";
import type { ClipExport, ClipProject } from "../engine/types";
import { changeAspect } from "../engine/edit";
import {
  activity,
  channelTotals,
  cleanExportQuery,
  cleanProjectQuery,
  cleanTags,
  exportPublications,
  filterExports,
  isProjectOrigin,
  paginate,
  publicationRows,
  queryProjects,
  sortExports,
  withStats,
  type Activity,
  type ChannelTotals,
  type ExportPublications,
  type Page,
  type PostStats,
  type ProjectPage,
  type ProjectSummary,
  type PublicationRow,
} from "./library";
import {
  ASSETS_DIR,
  EXPORTS_DIR,
  THUMBS_DIR,
  assertId,
  listProjectFiles,
  readExports,
  readProject,
  readThumbs,
  removeProject,
  writeProject,
  writeThumbs,
} from "./store";
import type { AspectPreset } from "../engine/types";
import { ASPECTS } from "../engine/types";

const MODULE = "clip-studio";
const thumbUrl = (file: string) => `/api/modules/${MODULE}/data/thumbs/${file}`;

// ─── Résumés des projets ─────────────────────────────────────────

interface ExportIndex {
  count: number;
  last: number;
}

function exportIndex(exports: ClipExport[]): Map<string, ExportIndex> {
  const index = new Map<string, ExportIndex>();
  for (const entry of exports) {
    const current = index.get(entry.projectId) ?? { count: 0, last: 0 };
    current.count++;
    current.last = Math.max(current.last, entry.createdAt);
    index.set(entry.projectId, current);
  }
  return index;
}

/** Exports dont le fichier existe encore, du plus récent au plus ancien. */
export function liveExports(): ClipExport[] {
  return readExports()
    .filter((entry) => fs.existsSync(path.join(EXPORTS_DIR, entry.file)))
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function summarizeProject(project: ClipProject, exports: Map<string, ExportIndex> = new Map(), thumbs = readThumbs()): ProjectSummary {
  let end = 0;
  let itemCount = 0;
  let cover: string | undefined;
  let brandCover: string | undefined;
  for (const track of project.tracks) {
    for (const item of track.items) {
      end = Math.max(end, item.start + item.duration);
      itemCount++;
      if (item.type !== "image") continue;
      // Filigrane et carton de fin de la marque : une miniature seulement à défaut d'image du clip.
      if (item.origin === "brand" || track.origin === "brand") brandCover ??= item.source.url;
      else cover ??= item.source.url;
    }
  }
  cover ??= brandCover;
  const thumb = thumbs[project.id];
  const exported = exports.get(project.id);
  return {
    id: project.id,
    name: project.name,
    aspect: project.aspect,
    width: project.width,
    height: project.height,
    durationFrames: end,
    fps: project.fps,
    itemCount,
    ...(cover ? { cover } : {}),
    ...(thumb ? { thumbnail: thumbUrl(thumb.file), thumbnailStale: thumb.at < project.updatedAt } : {}),
    ...(project.brandKitId ? { brandKitId: project.brandKitId } : {}),
    tags: cleanTags(project.tags),
    ...(isProjectOrigin(project.origin) ? { origin: project.origin } : project.brief ? { origin: "assistant" as const } : {}),
    exportCount: exported?.count ?? 0,
    ...(exported ? { lastExportAt: exported.last } : {}),
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

/** Tous les projets résumés, du plus récemment modifié au plus ancien. */
export function allProjectSummaries(): ProjectSummary[] {
  const exports = exportIndex(liveExports());
  const thumbs = readThumbs();
  // Un projet illisible est ignoré plutôt que de rendre la liste vide pour tous.
  return listProjectFiles()
    .flatMap((project) => {
      try {
        return [summarizeProject(project, exports, thumbs)];
      } catch {
        return [];
      }
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function searchProjectPage(input: unknown): ProjectPage {
  return queryProjects(allProjectSummaries(), cleanProjectQuery(input));
}

// ─── Actions sur les projets ─────────────────────────────────────

const newProjectId = () => `clip-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

function cleanIds(ids: unknown, max = 200): string[] {
  const list = Array.isArray(ids) ? ids.slice(0, max) : [];
  for (const id of list) assertId(id, "Identifiant de projet");
  return [...new Set(list as string[])];
}

/** Renomme un projet ou change ses étiquettes, sans toucher à sa date de modification (le montage n'a pas changé). */
export function updateDetails(input: { id?: unknown; name?: unknown; tags?: unknown }): ProjectSummary {
  assertId(input?.id, "Identifiant de projet");
  const project = readProject(input.id as string);
  if (!project) throw new Error("Projet introuvable");
  const next: ClipProject = { ...project };
  if (input.name !== undefined) {
    const name = typeof input.name === "string" ? input.name.replace(/\s+/g, " ").trim() : "";
    if (!name) throw new Error("Donnez un nom au projet.");
    if (name.length > 200) throw new Error("Nom trop long : 200 caractères au plus.");
    next.name = name;
  }
  if (input.tags !== undefined) next.tags = cleanTags(input.tags);
  writeProject(next);
  return summarizeProject(next, exportIndex(liveExports()));
}

/** Ajoute ou retire des étiquettes à plusieurs projets. */
export function tagMany(input: { ids?: unknown; add?: unknown; remove?: unknown }): { updated: number } {
  const ids = cleanIds(input?.ids);
  const add = cleanTags(input?.add);
  const remove = new Set(cleanTags(input?.remove).map((tag) => tag.toLocaleLowerCase("fr")));
  let updated = 0;
  for (const id of ids) {
    const project = readProject(id);
    if (!project) continue;
    const kept = cleanTags(project.tags).filter((tag) => !remove.has(tag.toLocaleLowerCase("fr")));
    const tags = cleanTags([...kept, ...add]);
    writeProject({ ...project, tags });
    updated++;
  }
  return { updated };
}

export function deleteMany(ids: unknown): { deleted: number } {
  const list = cleanIds(ids);
  for (const id of list) removeProject(id);
  return { deleted: list.length };
}

/**
 * Copie d'un projet, au même format ou à un autre. Les positions du modèle
 * sont relatives au cadre : changer de format est le même geste que dans
 * l'éditeur (`changeAspect`), fait sur la copie, l'original reste intact.
 */
export function duplicateOne(id: unknown, aspect?: unknown): ProjectSummary {
  assertId(id, "Identifiant de projet");
  const project = readProject(id as string);
  if (!project) throw new Error("Projet introuvable");
  const now = Date.now();
  const target = typeof aspect === "string" && aspect in ASPECTS && aspect !== project.aspect ? (aspect as AspectPreset) : null;
  let copy: ClipProject = {
    ...structuredClone(project),
    id: newProjectId(),
    name: `${project.name} (${target ? ASPECTS[target].label.toLowerCase() : "copie"})`.slice(0, 200),
    createdAt: now,
    updatedAt: now,
  };
  if (target) copy = { ...changeAspect(copy, target), updatedAt: now };
  writeProject(copy);
  return summarizeProject(copy);
}

export function duplicateMany(ids: unknown): { created: ProjectSummary[] } {
  return { created: cleanIds(ids, 50).flatMap((id) => (readProject(id) ? [duplicateOne(id)] : [])) };
}

/** Médias d'un projet importé qui manquent sur ce serveur (fichiers du module seulement). */
function missingMedia(project: ClipProject): number {
  const prefix = `/api/modules/${MODULE}/data/assets/`;
  const missing = new Set<string>();
  for (const track of project.tracks) {
    for (const item of track.items) {
      if (!("source" in item) || typeof item.source?.url !== "string" || !item.source.url.startsWith(prefix)) continue;
      const file = decodeURIComponent(item.source.url.slice(prefix.length).split("?")[0]);
      if (!/^[a-z0-9][a-z0-9._-]{0,120}$/i.test(file) || !fs.existsSync(path.join(ASSETS_DIR, file))) missing.add(item.source.url);
    }
  }
  return missing.size;
}

/**
 * Importe un projet exporté en JSON : nouvel identifiant, nouvelles dates,
 * contrôlé par la même validation que l'enregistrement. Les médias doivent
 * exister sur ce serveur ; ceux qui manquent sont comptés.
 */
export function importOne(input: unknown, validate: (project: ClipProject) => void): { project: ProjectSummary; missingMedia: number } {
  if (!input || typeof input !== "object") throw new Error("Fichier de projet illisible.");
  const now = Date.now();
  const source = input as ClipProject;
  const project: ClipProject = {
    ...structuredClone(source),
    id: newProjectId(),
    name: typeof source.name === "string" && source.name.trim() ? source.name.trim().slice(0, 200) : "Projet importé",
    tags: cleanTags(source.tags),
    origin: "import",
    createdAt: now,
    updatedAt: now,
  };
  validate(project);
  writeProject(project);
  return { project: summarizeProject(project), missingMedia: missingMedia(project) };
}

// ─── Vignettes ───────────────────────────────────────────────────

const THUMB_MAX_BYTES = 1024 * 1024;

/**
 * Range la vignette d'un projet, rendue par le navigateur avec `drawFrame`.
 * L'image est relue et réencodée (JPEG, 640 px au plus) : rien de ce qui
 * arrive n'est servi tel quel.
 */
export async function storeThumbnail(id: unknown, at: unknown, image: unknown): Promise<{ thumbnail: string }> {
  assertId(id, "Identifiant de projet");
  const project = readProject(id as string);
  if (!project) throw new Error("Projet introuvable");
  const buffer = Buffer.isBuffer(image) ? image : null;
  if (!buffer || buffer.length === 0 || buffer.length > THUMB_MAX_BYTES) throw new Error("Vignette invalide");
  const renderedAt = Number(at);
  const data = await sharp(buffer, { limitInputPixels: 8_000_000, failOn: "error" })
    .resize({ width: 640, height: 640, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#000000" })
    .jpeg({ quality: 78, mozjpeg: true })
    .toBuffer();
  fs.mkdirSync(THUMBS_DIR, { recursive: true });
  const file = `${project.id}-${Date.now().toString(36)}.jpg`;
  fs.writeFileSync(path.join(THUMBS_DIR, file), data);
  const thumbs = readThumbs();
  const previous = thumbs[project.id]?.file;
  thumbs[project.id] = { file, at: Number.isFinite(renderedAt) && renderedAt > 0 ? Math.min(renderedAt, project.updatedAt) : project.updatedAt };
  writeThumbs(thumbs);
  if (previous && previous !== file && /^[a-z0-9][a-z0-9._-]{0,120}$/i.test(previous)) fs.rmSync(path.join(THUMBS_DIR, previous), { force: true });
  return { thumbnail: thumbUrl(file) };
}

// ─── Accueil ─────────────────────────────────────────────────────

export interface StudioOverview {
  recentProjects: ProjectSummary[];
  recentExports: ClipExport[];
  projectCount: number;
  exportCount: number;
  /** Exports rendus jour par jour (les publications s'y ajoutent côté administrateur). */
  activity: Activity;
}

export function overview(now = Date.now()): StudioOverview {
  const exports = liveExports();
  const index = exportIndex(exports);
  const thumbs = readThumbs();
  const projects = listProjectFiles()
    .flatMap((project) => {
      try {
        return [summarizeProject(project, index, thumbs)];
      } catch {
        return [];
      }
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);
  return {
    recentProjects: projects.slice(0, 6),
    recentExports: exports.slice(0, 12),
    projectCount: projects.length,
    exportCount: exports.length,
    activity: activity(
      exports.map((entry) => entry.createdAt),
      [],
      now
    ),
  };
}

// ─── Exports ─────────────────────────────────────────────────────

export interface ExportFacets {
  projects: { id: string; name: string; count: number }[];
  brands: { id: string; count: number }[];
  withoutBrand: number;
  /** Services où au moins un export a été envoyé (administrateurs). */
  channels: string[];
}

export interface ExportPage extends Page<ClipExport> {
  facets: ExportFacets;
  libraryTotal: number;
  /** Publications de chaque export de la page (administrateurs). */
  publications?: Record<string, ExportPublications>;
}

function exportFacets(exports: ClipExport[], publications?: Map<string, ExportPublications>): ExportFacets {
  const projects = new Map<string, { id: string; name: string; count: number }>();
  const brands = new Map<string, number>();
  let withoutBrand = 0;
  for (const entry of exports) {
    const project = projects.get(entry.projectId) ?? { id: entry.projectId, name: entry.projectName, count: 0 };
    project.count++;
    projects.set(entry.projectId, project);
    if (entry.brandKitId) brands.set(entry.brandKitId, (brands.get(entry.brandKitId) ?? 0) + 1);
    else withoutBrand++;
  }
  const channels = new Set<string>();
  for (const state of publications?.values() ?? []) for (const row of state.rows) channels.add(row.connector);
  return {
    projects: [...projects.values()].sort((a, b) => a.name.localeCompare(b.name, "fr")),
    brands: [...brands].map(([id, count]) => ({ id, count })).sort((a, b) => b.count - a.count),
    withoutBrand,
    channels: [...channels].sort(),
  };
}

/** Publications de tous les exports, retrouvées dans la file par leur source. */
export function publicationsByExport(jobs: PublishJobSummary[] = listJobs({ sourceModule: MODULE })): Map<string, ExportPublications> {
  const grouped = new Map<string, PublishJobSummary[]>();
  for (const job of jobs) {
    const list = grouped.get(job.source.id) ?? [];
    list.push(job);
    grouped.set(job.source.id, list);
  }
  const out = new Map<string, ExportPublications>();
  for (const [id, list] of grouped) out.set(id, exportPublications(list));
  return out;
}

export function searchExportPage(input: unknown, withPublications: boolean): ExportPage {
  const query = cleanExportQuery(input);
  const exports = liveExports();
  const publications = withPublications ? publicationsByExport() : undefined;
  const shown = sortExports(filterExports(exports, query, publications), query.sort, query.dir);
  const page = paginate(shown, query.page);
  return {
    ...page,
    facets: exportFacets(exports, publications),
    libraryTotal: exports.length,
    ...(publications ? { publications: Object.fromEntries(page.items.map((entry) => [entry.id, publications.get(entry.id) ?? { status: "none" as const, rows: [] }])) } : {}),
  };
}

// ─── Publications (administrateurs) ──────────────────────────────

/** Compte cité par une publication, sans jeton : de quoi afficher son nom et son logo. */
export interface PublicationAccount {
  id: string;
  connector: string;
  connectorLabel: string;
  logo: string;
  displayName: string;
  url?: string;
}

function publicationAccounts(accountIds: Iterable<string>): PublicationAccount[] {
  const wanted = new Set(accountIds);
  const known = listAccounts().filter((account) => wanted.has(account.id));
  return known.map((account) => ({
    id: account.id,
    connector: account.connector,
    connectorLabel: account.connectorLabel,
    logo: account.logo,
    displayName: account.displayName,
    ...(account.url ? { url: account.url } : {}),
  }));
}

/** Services cités, avec leur nom et leur logo (un service retiré garde son identifiant). */
function connectorBadges(ids: Iterable<string>): { id: string; label: string; logo: string }[] {
  return [...new Set(ids)].map((id) => {
    const connector = getConnector(id);
    return { id, label: connector?.label ?? id, logo: connector?.logo ?? id };
  });
}

/** Statistiques gardées par le cœur pour ces comptes : `read` demande la liste au service si elle n'est plus fraîche. */
async function statsFor(accountIds: Iterable<string>, read: boolean): Promise<{ stats: Map<string, Map<string, PostStats>>; fetchedAt: number | null; errors: string[] }> {
  const stats = new Map<string, Map<string, PostStats>>();
  const errors: string[] = [];
  let fetchedAt: number | null = null;
  for (const accountId of new Set(accountIds)) {
    let entry: { posts: { id: string; views?: number; likes?: number; comments?: number }[]; fetchedAt: number } | null = null;
    try {
      entry = read ? await listPosts(accountId) : peekPosts(accountId);
    } catch (error) {
      if (read) errors.push(error instanceof Error ? error.message : "Lecture impossible");
    }
    if (!entry) continue;
    fetchedAt = fetchedAt === null ? entry.fetchedAt : Math.min(fetchedAt, entry.fetchedAt);
    const map = new Map<string, PostStats>();
    for (const post of entry.posts) {
      if (post.views === undefined && post.likes === undefined && post.comments === undefined) continue;
      map.set(post.id, { views: post.views, likes: post.likes, comments: post.comments });
    }
    stats.set(accountId, map);
  }
  return { stats, fetchedAt, errors };
}

/** Comptes qui portent au moins une publication réussie d'un export de Clip Studio et savent lister leurs publications. */
function readableAccounts(rows: PublicationRow[]): string[] {
  const capable = new Set(listAccounts({ capability: "posts.list" }).map((account) => account.id));
  return [...new Set(rows.filter((row) => row.state === "published" && row.externalId && capable.has(row.accountId)).map((row) => row.accountId))];
}

export interface TopPublication {
  exportId: string;
  title: string;
  cover?: string;
  file: string;
  accountId: string;
  connector: string;
  url?: string;
  stats: PostStats;
}

export interface PublicationsOverview {
  /** États des publications des exports demandés (les cartes de l'accueil). */
  byExport: Record<string, ExportPublications>;
  channels: ChannelTotals[];
  /** Publications faites, jour par jour, à ajouter à l'activité. */
  publicationDates: number[];
  top: TopPublication[];
  /** Comptes dont les statistiques peuvent être lues ; vide : rien à lire. */
  statsAccounts: number;
  statsFetchedAt: number | null;
  statsErrors: string[];
  accounts: PublicationAccount[];
  connectors: { id: string; label: string; logo: string }[];
}

export async function publicationsOverview(input: { exportIds?: unknown; readStats?: unknown } = {}): Promise<PublicationsOverview> {
  const jobs = listJobs({ sourceModule: MODULE });
  const byExport = publicationsByExport(jobs);
  const exports = new Map(liveExports().map((entry) => [entry.id, entry]));
  const wanted = Array.isArray(input?.exportIds) ? input.exportIds.slice(0, 50).map(String) : [];
  const allRows = [...byExport.values()].flatMap((state) => state.rows);
  const readable = readableAccounts(allRows);
  const { stats, fetchedAt, errors } = await statsFor(readable, input?.readStats === true);

  const top: TopPublication[] = [];
  for (const [exportId, state] of byExport) {
    const entry = exports.get(exportId);
    if (!entry) continue;
    for (const row of withStats(state.rows, stats)) {
      if (row.state !== "published" || !row.stats || row.stats.views === undefined) continue;
      top.push({
        exportId,
        title: entry.post?.base?.title?.trim() || entry.projectName,
        ...(entry.cover ? { cover: entry.cover.file } : {}),
        file: entry.file,
        accountId: row.accountId,
        connector: row.connector,
        ...(row.url ? { url: row.url } : {}),
        stats: row.stats,
      });
    }
  }
  top.sort((a, b) => (b.stats.views ?? 0) - (a.stats.views ?? 0) || (b.stats.likes ?? 0) - (a.stats.likes ?? 0));

  return {
    byExport: Object.fromEntries(wanted.map((id) => [id, byExport.get(id) ?? { status: "none" as const, rows: [] }])),
    channels: channelTotals([...byExport.entries()].filter(([id]) => exports.has(id)).map(([, state]) => state)),
    publicationDates: allRows.filter((row) => row.state === "published").map((row) => row.at),
    top: top.slice(0, 5),
    statsAccounts: readable.length,
    statsFetchedAt: fetchedAt,
    statsErrors: errors,
    accounts: publicationAccounts(allRows.map((row) => row.accountId)),
    connectors: connectorBadges(allRows.map((row) => row.connector)),
  };
}

export interface ExportPublicationDetails {
  rows: (PublicationRow & { stats?: PostStats })[];
  accounts: PublicationAccount[];
  connectors: { id: string; label: string; logo: string }[];
  statsFetchedAt: number | null;
  statsErrors: string[];
}

/** Publications d'un export, une ligne par compte, avec les statistiques lues chez le service (gardées dix minutes). */
export async function exportPublicationDetails(id: string, refresh = false): Promise<ExportPublicationDetails> {
  const jobs = listJobs({ sourceModule: MODULE, sourceId: id });
  // Les comptes dont le dernier envoi a été annulé restent visibles sur la fiche : l'envoi a eu lieu.
  const rows = publicationRows(jobs);
  const readable = readableAccounts(rows);
  const { stats, fetchedAt, errors } = refresh ? await refreshStats(readable) : await statsFor(readable, true);
  return {
    rows: withStats(rows, stats),
    accounts: publicationAccounts(rows.map((row) => row.accountId)),
    connectors: connectorBadges(rows.map((row) => row.connector)),
    statsFetchedAt: fetchedAt,
    statsErrors: errors,
  };
}

/** Relit les publications chez le service, même fraîches (« Actualiser »). */
async function refreshStats(accountIds: string[]) {
  const stats = new Map<string, Map<string, PostStats>>();
  const errors: string[] = [];
  let fetchedAt: number | null = null;
  for (const accountId of accountIds) {
    try {
      const entry = await listPosts(accountId, { refresh: true });
      fetchedAt = fetchedAt === null ? entry.fetchedAt : Math.min(fetchedAt, entry.fetchedAt);
      const map = new Map<string, PostStats>();
      for (const post of entry.posts) map.set(post.id, { views: post.views, likes: post.likes, comments: post.comments });
      stats.set(accountId, map);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Lecture impossible");
    }
  }
  return { stats, fetchedAt, errors };
}
