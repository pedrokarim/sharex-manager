"use client";

/**
 * Pièces communes à la fiche d'un export et à l'écran Publier (dossier
 * 01 ter, § 3.2 et § 3.3), reprises de l'ancien tiroir de publication :
 * champs de réglage des services, liste de contrôle des limites, suivi des
 * travaux de la file et de leurs suites (premier commentaire, sous-titres,
 * couverture).
 *
 * Rien n'y cite un service : tout vient de la description des connecteurs
 * (`listPublishTargets`).
 */

import { useState } from "react";
import Link from "next/link";
import { CircleAlert, CircleCheck, CircleDashed, ExternalLink, KeyRound, Loader2, RotateCcw, ShieldAlert, SquareArrowOutUpRight, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  StepTimeline,
  StepTimelineContent,
  StepTimelineDescription,
  StepTimelineIndicator,
  StepTimelineItem,
  StepTimelineTitle,
  type StepState,
} from "@/components/ui/step-timeline";
import { cn } from "@/lib/utils";
import {
  FOLLOW_UP_CAPABILITY,
  type AccountSummary,
  type ConnectionCapability,
  type ConnectorInfo,
  type MediaLimits,
  type PublishField,
  type PublishFollowUpSummary,
  type PublishJobSummary,
  type PublishMediaItem,
} from "@/lib/connections/types";
import { checkMediaLimits, describeMediaLimits, formatRatio, mimeTypeOfName } from "@/lib/connections/limits";
import { defaultFieldValue, visibleValues, type FieldValue } from "@/components/connections/publish-field-input";
import { formatSchedule } from "@/components/connections/date-time-picker";
import { ServiceLogo, formatBytes } from "@/components/connections/shared";
import { cancelJobAction, retryJobAction } from "@/app/(app)/admin/connections/actions";
import type { BrandKit } from "@/modules/brand-kit/lib/types";
import type { ClipExport } from "../engine/types";
import { postRulesFor } from "../lib/post-texts";
import type { HashtagRule } from "../lib/post-types";
import type { ServiceTarget } from "./post-texts-editor";

/** Ce que rend `listPublishTargets`. */
export interface PublishTargets {
  accounts: AccountSummary[];
  connectors: ConnectorInfo[];
  /** La file tient elle-même une date de publication pour les services qui ne programment pas. */
  queueScheduling?: boolean;
}

export type Values = Record<string, FieldValue>;

// ─── Champs ──────────────────────────────────────────────────────

/** Rôles remplis par les textes de l'export (et la couverture, les sous-titres) : jamais saisis compte par compte. */
const TEXT_ROLES = new Set<string>(["title", "description", "caption", "firstComment", "hashtags", "tags", "topic", "cover", "subtitles"]);

/** Champs d'un service qui valent pour une vidéo. */
export function videoFields(connector: ConnectorInfo | null | undefined): PublishField[] {
  return (connector?.publishFields ?? []).filter((field) => !field.sourceKinds || field.sourceKinds.includes("video"));
}

/** Champ de date de publication propre au service (il programme lui-même). */
export function scheduleFieldOf(connector: ConnectorInfo | null | undefined): PublishField | undefined {
  return videoFields(connector).find((field) => field.kind === "datetime");
}

/** Réglages d'un compte : visibilité, catégorie, public enfant… (ni textes ni date). */
export function settingFields(connector: ConnectorInfo | null | undefined): PublishField[] {
  return videoFields(connector).filter((field) => field.kind !== "datetime" && !(field.role && TEXT_ROLES.has(field.role)));
}

/** Réglages de départ d'un compte, d'après la marque du projet. */
export function prefillSettings(fields: PublishField[], kit: BrandKit | null, syntheticMedia: boolean): Values {
  const publishing = kit?.publishing;
  const values: Values = {};
  for (const field of fields) {
    let value = defaultFieldValue(field);
    // Un choix que le service veut voir fait à la main n'est jamais prérempli.
    if (field.kind === "select" && field.noDefault) {
      values[field.key] = value;
      continue;
    }
    switch (field.role) {
      case "category":
        if (field.kind === "select" && publishing?.categoryId && field.choices.some((choice) => choice.value === publishing.categoryId)) value = publishing.categoryId;
        break;
      case "privacy":
        if (field.kind === "select" && publishing?.defaultPrivacy && field.choices.some((choice) => choice.value === publishing.defaultPrivacy)) value = publishing.defaultPrivacy;
        break;
      case "madeForKids":
        value = publishing?.madeForKids ?? false;
        break;
      case "syntheticMedia":
        value = publishing ? publishing.containsSyntheticMedia || syntheticMedia : syntheticMedia;
        break;
    }
    values[field.key] = value;
  }
  return values;
}

/** Options envoyées au serveur pour les réglages : champs remplis et affichés, plus la langue de la marque. */
export function settingOptions(fields: PublishField[], values: Values, kit: BrandKit | null): Record<string, unknown> {
  const options: Record<string, unknown> = {};
  const shown = visibleValues(fields, values);
  for (const field of fields) {
    if (!(field.key in shown)) continue;
    const value = shown[field.key];
    if (value === undefined || value === "") continue;
    options[field.key] = value;
  }
  if (kit?.language) options.defaultLanguage = kit.language;
  return options;
}

/** Adresse de la connexion incrémentale d'un compte (« Autoriser les commentaires »). */
export function authorizeHref(account: Pick<AccountSummary, "id" | "connector">, capabilities: ConnectionCapability[], returnTo: string): string {
  const params = new URLSearchParams({ account: account.id, add: capabilities.join(","), returnTo });
  return `/api/connections/${encodeURIComponent(account.connector)}/connect?${params}`;
}

/**
 * Services visés par les textes d'un export, avec leurs règles : hashtags
 * de la marque, couverture et sous-titres de l'export, et, pour l'écran
 * Publier, l'accès des comptes cochés au premier commentaire.
 */
export function serviceTargets(
  connectors: ConnectorInfo[],
  entry: ClipExport,
  hashtagRules: Record<string, HashtagRule>,
  checked?: { accounts: AccountSummary[]; returnTo: string }
): ServiceTarget[] {
  return connectors.map((connector) => {
    const fields = videoFields(connector);
    const rules = postRulesFor(connector.id, fields, hashtagRules[connector.id], { hasCover: Boolean(entry.cover), hasSubtitles: Boolean(entry.subtitles) });
    const target: ServiceTarget = { connector, fields, rules };
    if (checked && connector.followUps?.comment) {
      const accounts = checked.accounts.filter((account) => account.connector === connector.id);
      const without = accounts.filter((account) => !account.capabilities.includes("comment.create"));
      target.commentAuthorize = without
        .filter((account) => account.requestableCapabilities?.includes("comment.create"))
        .map((account) => ({ account, href: authorizeHref(account, ["comment.create"], checked.returnTo) }));
      target.commentBlocked = accounts.length > 0 && without.length === accounts.length;
    }
    return target;
  });
}

// ─── Liste de contrôle ───────────────────────────────────────────

export type CheckState = "ok" | "blocked" | "unknown" | "none" | "warning";

export interface CheckLine {
  id: string;
  label: string;
  state: CheckState;
  detail: string;
}

/** L'export tel que le décrivent les limites des services. */
export function exportMedia(entry: ClipExport): PublishMediaItem {
  return { kind: "video", file: entry.file, bytes: entry.sizeBytes, width: entry.width, height: entry.height, durationMs: entry.durationMs };
}

export function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** Une ligne par limite : vérifiée seule, pour dire précisément ce qui coince. */
export function limitChecks(limits: MediaLimits | undefined, entry: ClipExport): CheckLine[] {
  const media = exportMedia(entry);
  const mime = mimeTypeOfName(entry.file);
  const line = (id: string, label: string, partial: MediaLimits | null, known: boolean, value: string): CheckLine => {
    if (!partial) return { id, label, state: "none", detail: `${value} · aucune limite déclarée` };
    if (!known) return { id, label, state: "unknown", detail: `Non vérifiable · ${describeMediaLimits(partial)}` };
    const problems = checkMediaLimits(partial, media);
    return problems.length > 0
      ? { id, label, state: "blocked", detail: problems.join(" ") }
      : { id, label, state: "ok", detail: id === "format" ? `${value} (acceptés : ${describeMediaLimits(partial)})` : `${value}, ${describeMediaLimits(partial)}` };
  };
  const pick = <K extends keyof MediaLimits>(keys: K[]): MediaLimits | null => {
    const partial: MediaLimits = {};
    for (const key of keys) if (limits?.[key] !== undefined) partial[key] = limits[key];
    return Object.keys(partial).length > 0 ? partial : null;
  };
  const ratio = entry.width && entry.height ? `${entry.width} × ${entry.height} (${formatRatio(entry.width / entry.height)})` : "–";
  return [
    line("format", "Format", pick(["mimeTypes"]), Boolean(mime), mime === "video/mp4" ? "MP4" : (mime ?? "inconnu")),
    line("frame", "Cadre", pick(["aspectRatio", "minWidth", "minHeight", "maxWidth", "maxHeight"]), Boolean(entry.width && entry.height), ratio),
    line("duration", "Durée", pick(["minDurationMs", "maxDurationMs"]), entry.durationMs > 0, formatDuration(entry.durationMs)),
    line("bytes", "Poids", pick(["maxBytes"]), true, formatBytes(entry.sizeBytes)),
  ];
}

const CHECK_ICON: Record<CheckState, { icon: typeof CircleCheck; className: string }> = {
  ok: { icon: CircleCheck, className: "text-emerald-600 dark:text-emerald-400" },
  none: { icon: CircleCheck, className: "text-muted-foreground" },
  unknown: { icon: CircleDashed, className: "text-muted-foreground" },
  warning: { icon: ShieldAlert, className: "text-amber-600 dark:text-amber-400" },
  blocked: { icon: CircleAlert, className: "text-destructive" },
};

export function CheckList({ lines, note, className }: { lines: CheckLine[]; note?: string | null; className?: string }) {
  return (
    <ul className={cn("grid min-w-0 gap-1.5", className)} aria-label="Liste de contrôle">
      {lines.map((line) => {
        const { icon: Icon, className: tone } = CHECK_ICON[line.state];
        return (
          <li key={line.id} className="flex min-w-0 items-start gap-2 text-xs">
            <Icon className={cn("mt-px size-3.5 shrink-0", tone)} aria-hidden />
            <span className="min-w-0 text-pretty [overflow-wrap:anywhere]">
              <span className="font-medium">{line.label}</span>
              <span className={cn("text-muted-foreground", line.state === "blocked" && "text-destructive", line.state === "warning" && "text-amber-700 dark:text-amber-400")}>
                {" "}
                : {line.detail}
              </span>
            </span>
          </li>
        );
      })}
      {note ? <li className="pl-5.5 text-xs text-pretty text-muted-foreground">{note}</li> : null}
    </ul>
  );
}

// ─── Travaux de la file ──────────────────────────────────────────

export const FINISHED = new Set<PublishJobSummary["state"]>(["done", "failed", "cancelled"]);
export const MOVING = new Set<PublishJobSummary["state"]>(["queued", "uploading", "processing"]);

export const JOB_LABELS: Record<PublishJobSummary["state"], string> = {
  queued: "En attente",
  uploading: "Envoi",
  processing: "Traitement chez le service",
  done: "Publié",
  failed: "Échec",
  cancelled: "Annulé",
  "waiting-quota": "En attente du quota",
  "waiting-credits": "En attente de crédits",
};

const JOB_STEP: Record<PublishJobSummary["state"], StepState> = {
  queued: "pending",
  "waiting-quota": "pending",
  "waiting-credits": "pending",
  uploading: "running",
  processing: "running",
  done: "done",
  failed: "error",
  cancelled: "skipped",
};

/** Un travail encore en mouvement ou en attente : le suivi continue. */
export const jobsPending = (jobs: PublishJobSummary[]) => jobs.some((job) => !FINISHED.has(job.state) || (job.followUps ?? []).some((followUp) => followUp.state === "waiting"));

/** Libellé de l'état d'un travail, progression comprise. */
export function jobStateLabel(job: PublishJobSummary): string {
  const percent = job.source.bytes > 0 ? Math.min(100, Math.round((job.bytesSent / job.source.bytes) * 100)) : 0;
  if (job.state === "uploading") return `${JOB_LABELS.uploading} ${percent} %`;
  if (job.state === "processing") return job.result ? "Publié, traitement en cours" : "En traitement, pas encore publié";
  return JOB_LABELS[job.state];
}

const FOLLOW_UP_LABELS: Record<PublishFollowUpSummary["kind"], string> = {
  comment: "Premier commentaire",
  subtitles: "Sous-titres",
  cover: "Couverture",
};

const FOLLOW_UP_STATE: Record<PublishFollowUpSummary["state"], { label: string; icon: typeof CircleCheck; className: string }> = {
  waiting: { label: "en attente", icon: CircleDashed, className: "text-muted-foreground" },
  done: { label: "fait", icon: CircleCheck, className: "text-emerald-600 dark:text-emerald-400" },
  failed: { label: "échec", icon: CircleAlert, className: "text-destructive" },
  skipped: { label: "non fait", icon: CircleDashed, className: "text-muted-foreground" },
};

/** Suites d'un travail : premier commentaire, sous-titres, couverture, chacune avec son état. */
function FollowUpList({ job, account, authorizeReturn }: { job: PublishJobSummary; account?: AccountSummary; authorizeReturn?: string }) {
  const followUps = job.followUps ?? [];
  if (followUps.length === 0) return null;
  return (
    <ul className="grid min-w-0 gap-1 pt-0.5" aria-label="Suites de la publication">
      {followUps.map((followUp) => {
        const state = FOLLOW_UP_STATE[followUp.state];
        const Icon = state.icon;
        const capability = FOLLOW_UP_CAPABILITY[followUp.kind];
        const canAuthorize = followUp.skipCode === "unauthorized" && account && authorizeReturn && account.requestableCapabilities?.includes(capability);
        const detail = followUp.error ?? followUp.note;
        return (
          <li key={followUp.kind} className="flex min-w-0 flex-wrap items-start gap-x-2 gap-y-0.5 text-xs">
            <span className="flex min-w-0 items-start gap-1.5">
              <Icon className={cn("mt-px size-3.5 shrink-0", state.className)} aria-hidden />
              <span className="min-w-0 [overflow-wrap:anywhere]">
                <span className="font-medium">{FOLLOW_UP_LABELS[followUp.kind]}</span>
                <span className={cn("text-muted-foreground", followUp.state === "failed" && "text-destructive")}>
                  {" "}
                  : {state.label}
                  {detail ? ` · ${detail}` : ""}
                </span>
              </span>
            </span>
            {followUp.result?.url ? (
              <a href={followUp.result.url} target="_blank" rel="noreferrer noopener" className="inline-flex shrink-0 items-center gap-1 underline underline-offset-2">
                Voir
                <ExternalLink className="size-3" />
              </a>
            ) : null}
            {canAuthorize ? (
              <a href={authorizeHref(account, [capability], authorizeReturn)} className="inline-flex shrink-0 items-center gap-1 underline underline-offset-2">
                <KeyRound className="size-3" />
                Autoriser…
              </a>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Suivi des travaux de publication : un pas par compte, avec son état, sa
 * progression, ses suites et les actions de la file (reprendre, annuler).
 */
export function JobTimeline({
  jobs,
  accounts,
  connectors,
  onChanged,
  authorizeReturn,
  showDate = false,
}: {
  jobs: PublishJobSummary[];
  accounts: AccountSummary[];
  connectors: ConnectorInfo[];
  onChanged: () => void;
  /** Page où revenir après une autorisation en plus ; absente : pas de bouton « Autoriser… ». */
  authorizeReturn?: string;
  /** Date de création de chaque travail (fiche d'un export : plusieurs envois). */
  showDate?: boolean;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const act = async (id: string, action: typeof retryJobAction) => {
    setBusy(id);
    const result = await action(id);
    setBusy(null);
    if (!result.ok) toast.error(result.error);
    onChanged();
  };
  return (
    <StepTimeline>
      {jobs.map((job) => {
        const account = accounts.find((item) => item.id === job.accountId);
        const connector = connectors.find((item) => item.id === job.connector);
        const percent = job.source.bytes > 0 ? Math.min(100, Math.round((job.bytesSent / job.source.bytes) * 100)) : 0;
        const state = JOB_STEP[job.state];
        const canRetry = ["failed", "cancelled", "waiting-quota", "waiting-credits"].includes(job.state) && !job.result;
        // En traitement sans résultat : pas encore publié chez le service, donc encore annulable ; avec résultat, c'est publié.
        const waitingService = job.state === "processing" && !job.result;
        const canCancel = ["queued", "uploading", "waiting-quota", "waiting-credits", "failed"].includes(job.state) || waitingService;
        return (
          <StepTimelineItem key={job.id} state={state} className="animate-in fade-in-0 slide-in-from-bottom-1">
            <StepTimelineIndicator />
            <StepTimelineContent className="min-w-0">
              <StepTimelineTitle state={state} className="flex min-w-0 items-center gap-2">
                {connector ? <ServiceLogo logo={connector.logo} /> : null}
                <span className="min-w-0 truncate" title={account?.displayName ?? job.accountId}>
                  {account?.displayName ?? connector?.label ?? job.accountId}
                </span>
                <span className="shrink-0 text-xs font-normal text-muted-foreground">{jobStateLabel(job)}</span>
              </StepTimelineTitle>
              {showDate ? <StepTimelineDescription>Envoyé le {formatSchedule(job.createdAt)}</StepTimelineDescription> : null}
              {job.state === "uploading" ? <Progress value={percent} className="h-1.5" aria-label="Progression de l’envoi" /> : null}
              {job.state === "processing" ? <Progress value={100} className="h-1.5 animate-pulse" aria-label="Traitement en cours" /> : null}
              {waitingService && (job.note || job.checkAt) ? (
                <StepTimelineDescription>
                  {job.note ? `${job.note}${job.checkAt ? " · " : ""}` : ""}
                  {job.checkAt ? `prochain passage à ${new Date(job.checkAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}` : ""}
                </StepTimelineDescription>
              ) : null}
              {job.publishAt && job.state === "queued" ? <StepTimelineDescription>Programmé le {formatSchedule(job.publishAt)}.</StepTimelineDescription> : null}
              {job.retryAt && job.state === "waiting-quota" ? <StepTimelineDescription>Reprise prévue le {formatSchedule(job.retryAt)}.</StepTimelineDescription> : null}
              {job.error && job.state !== "done" ? (
                <StepTimelineDescription className="text-destructive [overflow-wrap:anywhere]">
                  {job.error}
                  {job.state === "failed" && job.processingSince && !/sans republier/.test(job.error) ? " « Reprendre » repart du même envoi chez le service, sans republier." : ""}
                </StepTimelineDescription>
              ) : null}
              {job.state === "done" && job.note ? <StepTimelineDescription className="[overflow-wrap:anywhere]">{job.note}</StepTimelineDescription> : null}
              {job.warning ? <StepTimelineDescription className="text-amber-700 [overflow-wrap:anywhere] dark:text-amber-400">{job.warning}</StepTimelineDescription> : null}
              <FollowUpList job={job} account={account} authorizeReturn={authorizeReturn} />
              <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 pt-0.5">
                {job.result?.url ? (
                  <a href={job.result.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-xs underline underline-offset-2">
                    Voir la publication
                    <ExternalLink className="size-3" />
                  </a>
                ) : null}
                {canRetry ? (
                  <Button variant="outline" size="sm" className="h-7 gap-1.5 px-2.5 text-xs" disabled={busy === job.id} onClick={() => void act(job.id, retryJobAction)}>
                    {busy === job.id ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
                    Reprendre
                  </Button>
                ) : null}
                {canCancel ? (
                  <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2.5 text-xs" disabled={busy === job.id} onClick={() => void act(job.id, cancelJobAction)}>
                    <X className="size-3.5" />
                    Annuler
                  </Button>
                ) : null}
                <Link href={`/admin/connections/${job.accountId}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:underline">
                  Voir dans la fiche du compte
                  <SquareArrowOutUpRight className="size-3" />
                </Link>
              </div>
            </StepTimelineContent>
          </StepTimelineItem>
        );
      })}
    </StepTimeline>
  );
}
