/**
 * Droits des médias et blocages des publications (dossier 01 quater) :
 * types partagés par le serveur et l'interface, sans dépendance Node.
 */

/** État des droits d'un morceau (§ 4.3). */
export type TrackRightsState = "clear" | "at-risk" | "claimed" | "withdrawn" | "unknown";

export interface TrackRightsNote {
  state: TrackRightsState;
  /** Ce qui s'est passé, affiché dans la banque. */
  reason?: string;
  /** Date de la constatation (AAAA-MM-JJ). */
  since?: string;
}

/** Preuve de licence prise à l'entrée d'un morceau dans la banque (§ 4.1). */
export interface TrackEvidence {
  capturedAt: string;
  /** Réponse complète d'Openverse, `/v1/audio/<id>/`. */
  openverse: unknown;
  audioSha256?: string;
  /** Capture de la fiche Openverse par la Wayback Machine. */
  archiveUrl?: string;
  license: string;
  licenseUrl?: string;
  attribution: string;
}

export type RightsCheckSource = "openverse" | "jamendo" | "content-id" | "history";

export interface RightsCheck {
  at: string;
  source: RightsCheckSource;
  ok: boolean;
  listed?: boolean;
  license?: string;
  note?: string;
}

/** Tout ce que le serveur sait des droits d'un morceau. */
export interface TrackRightsRecord {
  trackId: string;
  /** Note posée à la main ou par un blocage ; prime sur les contrôles. */
  note?: TrackRightsNote;
  evidence?: TrackEvidence;
  checks: RightsCheck[];
  /** Historique des changements d'état (levées à la main comprises). */
  history: Array<{ at: string; state: TrackRightsState; note: string }>;
}

export const TRACK_RIGHTS_LABELS: Record<TrackRightsState, string> = {
  clear: "Libre",
  "at-risk": "À risque",
  claimed: "Revendiqué",
  withdrawn: "Retiré",
  unknown: "Non vérifié",
};

/**
 * L'assistant ne choisit seul qu'un morceau sans souci de droits connu : un
 * morceau revendiqué, à risque ou retiré reste dans la banque, à la main.
 */
export function isAutoPickable(track: { rights?: TrackRightsNote }): boolean {
  const state = track.rights?.state ?? "clear";
  return state === "clear" || state === "unknown";
}

/** Un morceau à signaler dans l'éditeur, l'écran Exporter et l'écran Publier. */
export function needsRightsWarning(track: { rights?: TrackRightsNote }): boolean {
  return !isAutoPickable(track);
}

/** Un morceau qui bloque la publication tant qu'on n'a pas confirmé. */
export function blocksPublication(track: { rights?: TrackRightsNote }): boolean {
  const state = track.rights?.state;
  return state === "claimed" || state === "withdrawn";
}

// ─── Blocages des publications (§ 5) ─────────────────────────────

export type PublicationService = "youtube" | "instagram" | "threads";

export type PublicationIssueKind = "copyright-claim" | "blocked" | "muted" | "removed" | "rejected";

export interface PublicationIssueClaim {
  /** Titre revendiqué, tel que le service le nomme (« Memories »). */
  title?: string;
  /** Demandeur (« HAAWK for a 3rd Party »). */
  claimant?: string;
  /** Au nom de qui (« Soundrider »). */
  onBehalfOf?: string;
  startMs?: number;
  endMs?: number;
  media: "audio" | "video" | "image";
}

export type PublicationIssueResolutionState = "disputed" | "replaced" | "trimmed" | "released" | "accepted";

export interface PublicationIssue {
  id: string;
  exportId: string;
  /** Travail de publication (`PublishJob.id`). */
  jobId: string;
  service: PublicationService;
  /** Identifiant de la publication chez le service (vidéo YouTube…). */
  externalId: string;
  kind: PublicationIssueKind;
  scope?: { worldwide: boolean; countries?: string[] };
  claim?: PublicationIssueClaim;
  source: "api" | "manual";
  /** Réponse du service ou texte collé depuis Studio. */
  raw?: unknown;
  detectedAt: string;
  /** Morceau de la banque en cause, quand on l'a retrouvé dans le projet. */
  trackId?: string;
  resolution?: {
    state: PublicationIssueResolutionState;
    at: string;
    note?: string;
    newExportId?: string;
  };
}

export const PUBLICATION_ISSUE_LABELS: Record<PublicationIssueKind, string> = {
  "copyright-claim": "Revendiquée",
  blocked: "Bloquée",
  muted: "Son coupé",
  removed: "Retirée",
  rejected: "Refusée",
};

/**
 * YouTube dit un blocage mondial en listant tous les pays dans
 * `regionRestriction.blocked` (249 codes ISO 3166 relevés le 15/11/2026 sur
 * le Short TdSclzwxnYo), jamais par un drapeau : au-delà de 240 pays, c'est
 * le monde entier.
 */
export const WORLDWIDE_COUNTRY_COUNT = 240;

export function isWorldwideScope(scope: PublicationIssue["scope"]): boolean {
  return Boolean(scope?.worldwide) || (scope?.countries?.length ?? 0) >= WORLDWIDE_COUNTRY_COUNT;
}

/** Libellé de la ligne d'une publication bloquée (« Bloquée dans le monde entier »). */
export function issueStateText(issue: Pick<PublicationIssue, "kind" | "scope" | "resolution">): string {
  if (issue.resolution?.state === "disputed") return "Contestée";
  if (issue.resolution?.state === "released") return "Revendication levée";
  if (issue.kind === "blocked" || (issue.kind === "copyright-claim" && issue.scope)) {
    if (isWorldwideScope(issue.scope)) return "Bloquée dans le monde entier";
    const count = issue.scope?.countries?.length ?? 0;
    if (count > 0) return `Bloquée dans ${count} pays`;
  }
  return PUBLICATION_ISSUE_LABELS[issue.kind];
}
