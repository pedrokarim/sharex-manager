"use client";

/**
 * Publication d'un export (dossier 07, § 3.7 et § 4.5 ; dossier 07 bis,
 * « Publication depuis Clip Studio »).
 *
 * Un tiroir latéral large plutôt qu'une fenêtre : l'export joué à gauche, les
 * comptes à droite. Rien n'y cite un service : les comptes viennent de
 * `listPublishTargets` (ceux qui savent publier une vidéo), les champs de la
 * description de chaque connecteur (`publishFields`), les limites de
 * `limits`. Les valeurs sont préremplies par l'image de marque du projet,
 * compte par compte ; une liste de contrôle dit ce qui bloque avant l'envoi,
 * et le suivi des envois reste visible dans le tiroir.
 *
 * Quand aucun compte ne convient, le parcours « Connecter un compte » s'ouvre
 * par-dessus et revient ici avec le nouveau compte coché.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  CircleAlert,
  CircleCheck,
  CircleDashed,
  ExternalLink,
  Loader2,
  Plus,
  RotateCcw,
  Send,
  ShieldAlert,
  SquareArrowOutUpRight,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
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
import type { AccountSummary, ConnectorInfo, MediaLimits, PublishField, PublishJobSummary, PublishMediaItem } from "@/lib/connections/types";
import { appendCredits, creditsRequiringAttribution, renderTemplate } from "@/lib/connections/templates";
import { checkMediaLimits, describeMediaLimits, estimatePublishCost, formatCost, formatRatio, mimeTypeOfName } from "@/lib/connections/limits";
import { ConnectAccountSheet, type ConnectFlowStart } from "@/components/connections/connect-account-sheet";
import { DateTimePicker, formatSchedule } from "@/components/connections/date-time-picker";
import { PublishFieldInput, defaultFieldValue, fieldProblem, type FieldValue } from "@/components/connections/publish-field-input";
import { AccountAvatar, ServiceLogo, formatBytes } from "@/components/connections/shared";
import { cancelJobAction, measureTextAction, retryJobAction } from "@/app/(app)/admin/connections/actions";
import type { BrandKit } from "@/modules/brand-kit/lib/types";
import type { ClipExport, ClipProject } from "../engine/types";
import { callAnyModule, callModule, exportUrl } from "../lib/client";

export interface PublishTargets {
  accounts: AccountSummary[];
  connectors: ConnectorInfo[];
  /**
   * `publishExport` transmet `publishAt` à la file : un service qui ne
   * programme pas lui-même peut alors être publié plus tard.
   */
  queueScheduling?: boolean;
}

type Values = Record<string, FieldValue>;

const FINISHED = new Set<PublishJobSummary["state"]>(["done", "failed", "cancelled"]);
const MOVING = new Set<PublishJobSummary["state"]>(["queued", "uploading", "processing"]);

const JOB_LABELS: Record<PublishJobSummary["state"], string> = {
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

/** Champs d'un service qui valent pour une vidéo (un champ peut ne valoir que pour un texte ou une image). */
function videoFields(connector: ConnectorInfo): PublishField[] {
  return connector.publishFields.filter((field) => !field.sourceKinds || field.sourceKinds.includes("video"));
}

/** L'export tel que le décrivent les limites des services. */
function exportMedia(entry: ClipExport): PublishMediaItem {
  return { kind: "video", file: entry.file, bytes: entry.sizeBytes, width: entry.width, height: entry.height, durationMs: entry.durationMs };
}

function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function sourcesOf(project: ClipProject | null) {
  if (!project) return [];
  return project.tracks.flatMap((track) => track.items.flatMap((item) => ("source" in item ? [item.source] : [])));
}

/** Crédits des pistes audio dont la licence exige l'attribution. */
function audioCredits(project: ClipProject | null): string[] {
  if (!project) return [];
  const credits: (string | undefined)[] = [];
  for (const track of project.tracks) {
    if (track.kind !== "audio") continue;
    for (const item of track.items) if ("source" in item) credits.push(item.source.credit);
  }
  return creditsRequiringAttribution(credits);
}

/** Le clip montre des images générées (AI Image Gen) : contenu synthétique coché d'avance. */
function usesGeneratedImages(project: ClipProject | null): boolean {
  return sourcesOf(project).some((source) => /ai-image-gen/.test(`${source.ref} ${source.url}`));
}

/** Images trouvées sur le web dont les droits restent à vérifier. */
function unverifiedImages(project: ClipProject | null): string[] {
  const names = sourcesOf(project)
    .filter((source) => source.rights === "unverified")
    .map((source) => source.name);
  return [...new Set(names)];
}

/** Valeurs de départ des champs d'un service, d'après la marque du projet. */
function prefill(fields: PublishField[], entry: ClipExport, kit: BrandKit | null, project: ClipProject | null): Values {
  const publishing = kit?.publishing;
  const variables = { title: entry.projectName, hook: kit?.tagline, tags: publishing?.tags ?? [], brand: kit?.name, language: kit?.language };
  const credits = audioCredits(project);
  const values: Values = {};
  for (const field of fields) {
    let value = defaultFieldValue(field);
    switch (field.role) {
      case "title":
        value = renderTemplate(publishing?.titleTemplate || "{title}", variables) || entry.projectName;
        break;
      case "description":
        value = appendCredits(publishing?.descriptionTemplate ? renderTemplate(publishing.descriptionTemplate, variables) : "", credits);
        break;
      case "tags":
        value = publishing?.tags ?? [];
        break;
      case "topic":
        // Le sujet d'une publication : le premier tag de la marque, sinon vide.
        value = publishing?.tags?.[0] ?? "";
        break;
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
        value = publishing ? publishing.containsSyntheticMedia : usesGeneratedImages(project);
        break;
    }
    values[field.key] = value;
  }
  return values;
}

/** Options envoyées au serveur : champs remplis, plus la langue de la marque. */
function toOptions(fields: PublishField[], values: Values, kit: BrandKit | null): Record<string, unknown> {
  const options: Record<string, unknown> = {};
  for (const field of fields) {
    const value = values[field.key];
    if (value === undefined || value === "") continue;
    options[field.key] = value;
  }
  if (kit?.language) options.defaultLanguage = kit.language;
  return options;
}

const textOf = (fields: PublishField[], values: Values, role: PublishField["role"]) => {
  const field = fields.find((entry) => entry.role === role);
  const value = field ? values[field.key] : undefined;
  return typeof value === "string" ? value : "";
};

// ─── Liste de contrôle ────────────────────────────────────────────

type CheckState = "ok" | "blocked" | "unknown" | "none" | "warning";

interface CheckLine {
  id: string;
  label: string;
  state: CheckState;
  detail: string;
}

/** Une ligne par limite : vérifiée seule, pour dire précisément ce qui coince. */
function limitChecks(limits: MediaLimits | undefined, entry: ClipExport): CheckLine[] {
  const media = exportMedia(entry);
  const mime = mimeTypeOfName(entry.file);
  const line = (id: string, label: string, partial: MediaLimits | null, known: boolean, value: string): CheckLine => {
    if (!partial) return { id, label, state: "none", detail: `${value} · aucune limite déclarée` };
    if (!known) return { id, label, state: "unknown", detail: `Non vérifiable · ${describeMediaLimits(partial)}` };
    const problems = checkMediaLimits(partial, media);
    return problems.length > 0
      ? { id, label, state: "blocked", detail: problems.join(" ") }
      : { id, label, state: "ok", detail: id === "format" ? `${value} (acceptés : ${describeMediaLimits(partial)})` : `${value}, ${describeMediaLimits(partial)}` };
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

// ─── Ce que l'on sait de chaque compte coché ──────────────────────

interface AccountReview {
  account: AccountSummary;
  connector: ConnectorInfo;
  fields: PublishField[];
  checks: CheckLine[];
  fieldErrors: string[];
  blockers: string[];
  cost: ReturnType<typeof estimatePublishCost>;
  publicNow: boolean;
  note: string | null;
}

export function PublishDialog({
  entry,
  targets,
  onOpenChange,
  onTargetsChange,
  connectStart,
}: {
  entry: ClipExport | null;
  targets: PublishTargets | null;
  onOpenChange: (open: boolean) => void;
  /** Les cibles relues après la connexion d'un compte. */
  onTargetsChange?: (targets: PublishTargets) => void;
  /** Retour par redirection du parcours de connexion : il se rouvre à la bonne étape. */
  connectStart?: ConnectFlowStart | null;
}) {
  // Le dernier export reste affiché pendant la fermeture du tiroir.
  const [shown, setShown] = useState<ClipExport | null>(entry);
  useEffect(() => {
    if (entry) setShown(entry);
  }, [entry]);

  const [localTargets, setLocalTargets] = useState<PublishTargets | null>(targets);
  useEffect(() => setLocalTargets(targets), [targets]);

  const [loading, setLoading] = useState(false);
  const [kit, setKit] = useState<BrandKit | null>(null);
  const [project, setProject] = useState<ClipProject | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [values, setValues] = useState<Record<string, Values>>({});
  const [later, setLater] = useState<Record<string, string>>({});
  const [openItems, setOpenItems] = useState<string[]>([]);
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmPublic, setConfirmPublic] = useState(false);
  const [jobs, setJobs] = useState<PublishJobSummary[] | null>(null);
  const [connectOpen, setConnectOpen] = useState(false);
  const [connectEntry, setConnectEntry] = useState<ConnectFlowStart | null>(null);
  const [measures, setMeasures] = useState<Record<string, { used: number; max: number } | null>>({});

  const accounts = useMemo(() => localTargets?.accounts ?? [], [localTargets]);
  const connectors = useMemo(() => localTargets?.connectors ?? [], [localTargets]);
  const connectorOf = useCallback((account: AccountSummary) => connectors.find((item) => item.id === account.connector) ?? null, [connectors]);

  // Le parcours de connexion revenu par redirection se rouvre par-dessus.
  useEffect(() => {
    if (!entry || !connectStart) return;
    setConnectEntry(connectStart);
    setConnectOpen(true);
  }, [entry, connectStart]);

  // Ouverture : projet, marque du projet, puis préremplissage de chaque compte.
  useEffect(() => {
    if (!entry) return;
    let cancelled = false;
    setJobs(null);
    setSubmitting(false);
    setRightsConfirmed(false);
    setLater({});
    setMeasures({});
    setLoading(true);
    (async () => {
      const nextProject = await callModule<ClipProject | null>("getProject", entry.projectId).catch(() => null);
      let nextKit: BrandKit | null = null;
      if (nextProject?.brandKitId) {
        nextKit = await callAnyModule<{ kit: BrandKit }>("brand-kit", "getKit", nextProject.brandKitId)
          .then((result) => result?.kit ?? null)
          .catch(() => null);
      }
      if (cancelled) return;
      setProject(nextProject);
      setKit(nextKit);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [entry]);

  // Coches et valeurs de départ, une fois projet et comptes connus.
  const seeded = useRef<string | null>(null);
  useEffect(() => {
    if (!entry || loading) return;
    const key = `${entry.id}:${kit?.id ?? ""}`;
    if (seeded.current === key) return;
    seeded.current = key;
    const usable = accounts.filter((account) => account.status === "connected");
    const preferred = usable.filter((account) => kit?.publishing.accountIds.includes(account.id));
    const initial = (preferred.length > 0 ? preferred : usable.length === 1 ? usable : []).map((account) => account.id);
    setChecked(new Set(initial));
    setOpenItems(initial);
    setValues(
      Object.fromEntries(
        accounts.flatMap((account) => {
          const connector = connectorOf(account);
          return connector ? [[account.id, prefill(videoFields(connector), entry, kit, project)]] : [];
        })
      )
    );
  }, [entry, loading, accounts, kit, project, connectorOf]);

  useEffect(() => {
    if (!entry) seeded.current = null;
  }, [entry]);

  const toggle = (account: AccountSummary, on: boolean) => {
    setChecked((current) => {
      const next = new Set(current);
      if (on) next.add(account.id);
      else next.delete(account.id);
      return next;
    });
    setOpenItems((current) => (on ? [...new Set([...current, account.id])] : current.filter((id) => id !== account.id)));
    if (on && shown && !values[account.id]) {
      const connector = connectorOf(account);
      if (connector) setValues((current) => ({ ...current, [account.id]: prefill(videoFields(connector), shown, kit, project) }));
    }
  };

  // Mesure du service côté serveur (texte pondéré…), en différé ; un service qui n'en a pas n'est plus interrogé.
  const noServerMeasure = useRef<Set<string>>(new Set());
  const measuredText = useMemo(() => {
    const result: Record<string, { connector: string; text: string }> = {};
    for (const account of accounts) {
      if (!checked.has(account.id)) continue;
      const connector = connectorOf(account);
      if (!connector) continue;
      const fields = videoFields(connector);
      const role = fields.some((field) => field.role === "description") ? "description" : "title";
      result[account.id] = { connector: connector.id, text: textOf(fields, values[account.id] ?? {}, role) };
    }
    return result;
  }, [accounts, checked, connectorOf, values]);
  const measureKey = JSON.stringify(measuredText);
  useEffect(() => {
    const entries = Object.entries(measuredText).filter(([, item]) => item.text && !noServerMeasure.current.has(item.connector));
    if (entries.length === 0) return;
    const timer = setTimeout(async () => {
      for (const [accountId, item] of entries) {
        const result = await measureTextAction(item.connector, item.text);
        if (!result.ok) continue;
        if (result.data === null) noServerMeasure.current.add(item.connector);
        setMeasures((current) => ({ ...current, [accountId]: result.data }));
      }
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `measureKey` résume `measuredText`
  }, [measureKey]);

  const rightsNames = useMemo(() => unverifiedImages(project), [project]);
  const isVertical = shown ? shown.width <= shown.height : false;

  const reviews: AccountReview[] = useMemo(() => {
    if (!shown) return [];
    return accounts
      .filter((account) => checked.has(account.id))
      .flatMap((account) => {
        const connector = connectorOf(account);
        if (!connector) return [];
        const fields = videoFields(connector);
        const accountValues = values[account.id] ?? {};
        const count = connector.limits?.text?.count;
        const fieldErrors = fields.map((field) => fieldProblem(field, accountValues[field.key], count)).filter((problem): problem is string => Boolean(problem));
        const measure = measures[account.id];
        if (measure && measure.used > measure.max) fieldErrors.push(`Texte trop long pour ${connector.label} : ${measure.used.toLocaleString("fr-FR")}/${measure.max.toLocaleString("fr-FR")}.`);
        const checks = limitChecks(account.limits?.video ?? connector.limits?.video, shown);
        if (rightsNames.length > 0) {
          checks.push({
            id: "rights",
            label: "Droits des images",
            state: rightsConfirmed ? "ok" : "warning",
            detail: rightsConfirmed
              ? "Vérifiés avant l’envoi."
              : `À vérifier : ${rightsNames.slice(0, 3).join(", ")}${rightsNames.length > 3 ? ` et ${rightsNames.length - 3} autre${rightsNames.length > 4 ? "s" : ""}` : ""}, trouvée${rightsNames.length > 1 ? "s" : ""} sur le web.`,
          });
        }
        const laterAt = later[account.id];
        if (laterAt && new Date(laterAt).getTime() < Date.now() + 60_000) fieldErrors.push("Publier plus tard : la date doit être dans le futur.");
        const blockers = [
          ...(account.status !== "connected" ? ["Compte à reconnecter."] : []),
          ...fieldErrors,
          ...checks.filter((line) => line.state === "blocked").map((line) => `${line.label} : ${line.detail}`),
        ];
        const privacyField = fields.find((field) => field.role === "privacy");
        const scheduleField = fields.find((field) => field.kind === "datetime");
        const scheduled = Boolean(scheduleField && accountValues[scheduleField.key]) || Boolean(laterAt);
        const note = connector.shortForm
          ? isVertical && shown.durationMs <= connector.shortForm.maxSeconds * 1000
            ? connector.shortForm.verticalNote
            : !isVertical
              ? connector.shortForm.horizontalNote
              : null
          : null;
        const text = `${textOf(fields, accountValues, "title")}\n${textOf(fields, accountValues, "description")}`;
        return [
          {
            account,
            connector,
            fields,
            checks,
            fieldErrors,
            blockers,
            cost: estimatePublishCost(connector.pricing, "video", text),
            publicNow: Boolean(privacyField && accountValues[privacyField.key] === "public" && !scheduled),
            note,
          },
        ];
      });
  }, [shown, accounts, checked, connectorOf, values, measures, rightsNames, rightsConfirmed, later, isVertical]);

  const blockerCount = reviews.reduce((sum, review) => sum + review.blockers.length, 0) + (rightsNames.length > 0 && !rightsConfirmed ? 1 : 0);
  const totalCost = reviews.reduce<{ amount: number; currency: string } | null>((sum, review) => {
    if (!review.cost) return sum;
    if (sum && sum.currency !== review.cost.currency) return sum;
    return { amount: (sum?.amount ?? 0) + review.cost.amount, currency: review.cost.currency };
  }, null);
  const firstBlocker = reviews.flatMap((review) => review.blockers.map((blocker) => `${review.account.displayName} – ${blocker}`))[0] ?? (rightsNames.length > 0 && !rightsConfirmed ? "Vérifiez les droits des images." : undefined);

  // Suivi des travaux une fois la publication lancée.
  const pollJobs = useCallback(async (ids: string[]) => {
    const next = await callModule<PublishJobSummary[]>("getPublishJobs", ids).catch(() => null);
    if (next) setJobs(next);
    return next;
  }, []);

  useEffect(() => {
    if (!jobs || jobs.length === 0 || jobs.every((job) => FINISHED.has(job.state))) return;
    const moving = jobs.some((job) => MOVING.has(job.state));
    const timer = setTimeout(() => void pollJobs(jobs.map((job) => job.id)), moving ? 2000 : 15000);
    return () => clearTimeout(timer);
  }, [jobs, pollJobs]);

  const submit = async () => {
    if (!shown) return;
    setConfirmPublic(false);
    setSubmitting(true);
    try {
      const result = await callModule<{ jobs: PublishJobSummary[]; failed: { accountId: string; error: string }[] }>("publishExport", {
        exportId: shown.id,
        targets: reviews.map((review) => {
          const at = later[review.account.id];
          return {
            accountId: review.account.id,
            options: toOptions(review.fields, values[review.account.id] ?? {}, kit),
            ...(at && localTargets?.queueScheduling ? { publishAt: new Date(at).getTime() } : {}),
          };
        }),
      });
      for (const failure of result.failed) {
        const account = accounts.find((item) => item.id === failure.accountId);
        toast.error(`${account?.displayName ?? "Compte"} : ${failure.error}`);
      }
      if (result.jobs.length > 0) {
        setJobs(result.jobs);
        toast.success(result.jobs.length > 1 ? `${result.jobs.length} publications en file` : "Publication en file");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Publication impossible");
    } finally {
      setSubmitting(false);
    }
  };

  const publicReviews = reviews.filter((review) => review.publicNow);
  const startSubmit = () => {
    if (blockerCount > 0 || reviews.length === 0) return;
    if (publicReviews.length > 0) return setConfirmPublic(true);
    void submit();
  };

  const onConnected = async (fresh: AccountSummary[]) => {
    const next = await callModule<PublishTargets>("listPublishTargets").catch(() => null);
    if (!next) return;
    setLocalTargets(next);
    onTargetsChange?.(next);
    const usable = next.accounts.filter((account) => account.status === "connected" && fresh.some((item) => item.id === account.id));
    if (usable.length === 0) return;
    setChecked((current) => new Set([...current, ...usable.map((account) => account.id)]));
    setOpenItems((current) => [...new Set([...current, ...usable.map((account) => account.id)])]);
    if (shown) {
      setValues((current) => {
        const copy = { ...current };
        for (const account of usable) {
          const connector = next.connectors.find((item) => item.id === account.connector);
          if (connector && !copy[account.id]) copy[account.id] = prefill(videoFields(connector), shown, kit, project);
        }
        return copy;
      });
    }
  };

  const usableCount = accounts.filter((account) => account.status === "connected").length;
  const url = shown ? exportUrl(shown.file) : "";
  const ratio = shown && shown.width && shown.height ? shown.width / shown.height : 16 / 9;

  return (
    <>
      <Sheet open={Boolean(entry)} onOpenChange={onOpenChange}>
        <SheetContent side="right" showCloseButton={false} className="w-full gap-0 overflow-hidden p-0 sm:max-w-5xl">
          <SheetHeader className="gap-1 border-b px-5 pt-5 pb-4">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <SheetTitle className="truncate text-lg">Publier « {shown?.projectName} »</SheetTitle>
                <SheetDescription className="text-pretty">
                  {kit ? `Préremplie avec l’image de marque « ${kit.name} ». ` : ""}Chaque compte reçoit son propre envoi, repris automatiquement en cas de coupure.
                </SheetDescription>
              </div>
              <Button variant="ghost" size="icon" className="-mr-2 size-8 shrink-0" onClick={() => onOpenChange(false)} aria-label="Fermer">
                <X className="size-4" />
              </Button>
            </div>
          </SheetHeader>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {shown ? (
              <div className="grid min-w-0 gap-6 px-5 py-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
                <section className="min-w-0 lg:sticky lg:top-0 lg:self-start" aria-label="Export">
                  <video
                    key={url}
                    src={url}
                    controls
                    muted
                    loop
                    playsInline
                    preload="metadata"
                    style={{ aspectRatio: `${ratio}`, ["--ratio" as string]: ratio }}
                    className="mx-auto block w-[min(100%,calc(32vh*var(--ratio)))] rounded-lg bg-black object-contain lg:w-[min(100%,calc(62vh*var(--ratio)))]"
                  />
                  <dl className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground tabular-nums">
                    <div className="flex gap-1">
                      <dt className="sr-only">Durée</dt>
                      <dd>{formatDuration(shown.durationMs)}</dd>
                    </div>
                    <div className="flex gap-1">
                      <dt className="sr-only">Taille</dt>
                      <dd>
                        {shown.width} × {shown.height} px ({formatRatio(ratio)})
                      </dd>
                    </div>
                    <div className="flex gap-1">
                      <dt className="sr-only">Poids</dt>
                      <dd>{formatBytes(shown.sizeBytes)}</dd>
                    </div>
                  </dl>
                </section>

                <section className="grid min-w-0 content-start gap-5" aria-label={jobs ? "Suivi des envois" : "Comptes"}>
                  {jobs ? (
                    <JobTimeline jobs={jobs} accounts={accounts} connectors={connectors} onChanged={() => void pollJobs(jobs.map((job) => job.id))} />
                  ) : loading || !localTargets ? (
                    <div className="grid gap-3" aria-busy>
                      <Skeleton className="h-12 w-full" />
                      <Skeleton className="h-12 w-full" />
                      <Skeleton className="h-40 w-full" />
                    </div>
                  ) : usableCount === 0 ? (
                    <Empty className="border border-dashed">
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <Send />
                        </EmptyMedia>
                        <EmptyTitle>{accounts.length === 0 ? "Aucun compte ne sait publier une vidéo" : "Aucun compte utilisable"}</EmptyTitle>
                        <EmptyDescription>
                          {accounts.length === 0
                            ? "Reliez une chaîne ou un compte : il sera coché ici dès qu’il est prêt."
                            : "Les comptes capables doivent être reconnectés avant de publier."}
                        </EmptyDescription>
                      </EmptyHeader>
                      <EmptyContent>
                        <Button
                          onClick={() => {
                            setConnectEntry(null);
                            setConnectOpen(true);
                          }}
                          className="gap-2"
                        >
                          <Plus className="size-4" />
                          Connecter un compte
                        </Button>
                      </EmptyContent>
                    </Empty>
                  ) : (
                    <>
                      <div className="grid min-w-0 gap-2">
                        <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
                          <Label>Comptes</Label>
                          <Button
                            variant="link"
                            size="sm"
                            className="h-auto gap-1 p-0 text-xs text-muted-foreground"
                            onClick={() => {
                              setConnectEntry(null);
                              setConnectOpen(true);
                            }}
                          >
                            <Plus className="size-3.5" />
                            Connecter un autre compte
                          </Button>
                        </div>
                        <ul className="grid grid-cols-[minmax(0,1fr)] gap-1.5 sm:grid-cols-2">
                          {accounts.map((account) => {
                            const disabled = account.status !== "connected";
                            const isChecked = checked.has(account.id);
                            return (
                              <li key={account.id} className="min-w-0">
                                <label
                                  className={cn(
                                    "flex min-w-0 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 transition-colors hover:bg-muted/40",
                                    disabled && "cursor-not-allowed hover:bg-transparent",
                                    isChecked && "border-primary/60"
                                  )}
                                >
                                  <Checkbox checked={isChecked} disabled={disabled} onCheckedChange={(value) => toggle(account, value === true)} />
                                  <AccountAvatar account={account} withService className={cn("size-8", disabled && "opacity-60")} />
                                  <span className="grid min-w-0 flex-1">
                                    <span className={cn("truncate text-sm font-medium", disabled && "text-muted-foreground")} title={account.displayName}>
                                      {account.displayName}
                                    </span>
                                    <span className="truncate text-xs text-muted-foreground">
                                      {connectorOf(account)?.label ?? account.connectorLabel}
                                      {disabled ? <span className="text-amber-700 dark:text-amber-400"> · à reconnecter</span> : null}
                                    </span>
                                  </span>
                                </label>
                              </li>
                            );
                          })}
                        </ul>
                      </div>

                      {reviews.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Cochez au moins un compte.</p>
                      ) : (
                        <Accordion type="multiple" value={openItems} onValueChange={setOpenItems} className="grid min-w-0 gap-3">
                          {reviews.map((review) => (
                            <motion.div key={review.account.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="min-w-0">
                              <AccountPanel
                                review={review}
                                values={values[review.account.id] ?? {}}
                                onValue={(key, value) =>
                                  setValues((current) => ({ ...current, [review.account.id]: { ...(current[review.account.id] ?? {}), [key]: value } }))
                                }
                                serverMeasure={measures[review.account.id] ?? null}
                                exportUrl={url}
                                queueScheduling={Boolean(localTargets.queueScheduling)}
                                later={later[review.account.id] ?? ""}
                                onLater={(value) => setLater((current) => ({ ...current, [review.account.id]: value }))}
                              />
                            </motion.div>
                          ))}
                        </Accordion>
                      )}
                    </>
                  )}
                </section>
              </div>
            ) : null}
          </div>

          <SheetFooter className="gap-3 border-t px-5 py-3">
            {jobs ? (
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">Le suivi continue aussi dans la fiche de chaque compte.</p>
                <Button onClick={() => onOpenChange(false)}>Fermer</Button>
              </div>
            ) : (
              <>
                {rightsNames.length > 0 && reviews.length > 0 ? (
                  <label className="flex min-w-0 cursor-pointer items-start gap-2 text-sm">
                    <Checkbox checked={rightsConfirmed} onCheckedChange={(value) => setRightsConfirmed(value === true)} className="mt-0.5" />
                    <span className="min-w-0 text-pretty">J’ai vérifié les droits des images trouvées sur le web ({rightsNames.length}).</span>
                  </label>
                ) : null}
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2">
                  <div className="grid min-w-0 flex-1 basis-56 text-xs text-muted-foreground">
                    <span>
                      {reviews.length > 1 ? `${reviews.length} comptes` : reviews.length === 1 ? "1 compte" : "Aucun compte coché"}
                      {totalCost ? ` · coût estimé ${formatCost(totalCost.amount, totalCost.currency)}` : ""}
                    </span>
                    {blockerCount > 0 ? (
                      <span className="truncate text-destructive" title={firstBlocker}>
                        {blockerCount > 1 ? `${blockerCount} points à régler` : "1 point à régler"}
                        {firstBlocker ? ` : ${firstBlocker}` : ""}
                      </span>
                    ) : null}
                  </div>
                  <Button onClick={startSubmit} disabled={loading || submitting || reviews.length === 0 || blockerCount > 0} title={firstBlocker} className="shrink-0 gap-2">
                    {submitting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                    {reviews.length > 1 ? `Publier sur ${reviews.length} comptes` : "Publier"}
                  </Button>
                </div>
              </>
            )}
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmPublic} onOpenChange={setConfirmPublic}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Publier en public tout de suite ?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="grid gap-2">
                <p>La vidéo sera visible de tous dès la fin du traitement sur :</p>
                <ul className="grid gap-1">
                  {publicReviews.map((review) => (
                    <li key={review.account.id} className="flex min-w-0 items-center gap-2 text-foreground">
                      <ServiceLogo logo={review.connector.logo} />
                      <span className="truncate">{review.account.displayName}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Revoir</AlertDialogCancel>
            <AlertDialogAction onClick={() => void submit()}>Publier en public</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ConnectAccountSheet
        open={connectOpen}
        onOpenChange={setConnectOpen}
        start={connectEntry}
        capability="publish.video"
        returnTo={shown ? `/m/clip-studio?publish=${encodeURIComponent(shown.id)}` : undefined}
        returnLabel="Revenir à la publication"
        onConnected={(fresh) => void onConnected(fresh)}
      />
    </>
  );
}

// ─── Un compte coché ──────────────────────────────────────────────

function AccountPanel({
  review,
  values,
  onValue,
  serverMeasure,
  exportUrl: videoUrl,
  queueScheduling,
  later,
  onLater,
}: {
  review: AccountReview;
  values: Values;
  onValue: (key: string, value: FieldValue) => void;
  serverMeasure: { used: number; max: number } | null;
  exportUrl: string;
  queueScheduling: boolean;
  later: string;
  onLater: (value: string) => void;
}) {
  const { account, connector, fields, checks, blockers, cost, note } = review;
  const measuredRole = fields.some((field) => field.role === "description") ? "description" : "title";
  const hasSchedule = fields.some((field) => field.kind === "datetime");
  return (
    <AccordionItem value={account.id} className="min-w-0 rounded-lg border last:border-b">
      <AccordionTrigger className="min-w-0 items-center px-3 py-3 hover:no-underline">
        <span className="flex min-w-0 flex-1 items-center gap-3">
          <AccountAvatar account={account} withService className="size-8" />
          <span className="grid min-w-0 flex-1">
            <span className="truncate text-sm font-medium" title={account.displayName}>
              {account.displayName}
            </span>
            <span className="truncate text-xs font-normal text-muted-foreground">{connector.label}</span>
          </span>
          {blockers.length > 0 ? (
            <span className="inline-flex shrink-0 items-center gap-1 text-xs font-normal text-destructive">
              <CircleAlert className="size-3.5" />
              {blockers.length > 1 ? `${blockers.length} points à régler` : "1 point à régler"}
            </span>
          ) : (
            <span className="inline-flex shrink-0 items-center gap-1 text-xs font-normal text-emerald-700 dark:text-emerald-400">
              <CircleCheck className="size-3.5" />
              Prêt
            </span>
          )}
        </span>
      </AccordionTrigger>
      <AccordionContent className="grid min-w-0 gap-5 px-3">
        <ul className="grid min-w-0 gap-1.5" aria-label="Liste de contrôle">
          {checks.map((line) => {
            const { icon: Icon, className } = CHECK_ICON[line.state];
            return (
              <li key={line.id} className="flex min-w-0 items-start gap-2 text-xs">
                <Icon className={cn("mt-px size-3.5 shrink-0", className)} aria-hidden />
                <span className="min-w-0 text-pretty [overflow-wrap:anywhere]">
                  <span className="font-medium">{line.label}</span>
                  <span className={cn("text-muted-foreground", line.state === "blocked" && "text-destructive", line.state === "warning" && "text-amber-700 dark:text-amber-400")}>
                    {" "}: {line.detail}
                  </span>
                </span>
              </li>
            );
          })}
          {note ? <li className="pl-5.5 text-xs text-pretty text-muted-foreground">{note}</li> : null}
        </ul>

        <div className="grid min-w-0 gap-4">
          {fields.map((field) => (
            <PublishFieldInput
              key={field.key}
              field={field}
              idPrefix={`publish-${account.id}`}
              value={values[field.key]}
              onChange={(value) => onValue(field.key, value)}
              textCount={connector.limits?.text?.count}
              serverMeasure={field.role === measuredRole ? serverMeasure : null}
            />
          ))}
          {!hasSchedule && queueScheduling ? (
            <div className="grid min-w-0 gap-1.5">
              <Label htmlFor={`publish-${account.id}-later`}>Publier plus tard</Label>
              <DateTimePicker id={`publish-${account.id}-later`} value={later} onChange={onLater} placeholder="Tout de suite" />
              <p className="text-xs text-muted-foreground">{connector.label} ne programme pas lui-même : l’envoi attend dans la file jusqu’à cette heure.</p>
            </div>
          ) : null}
        </div>

        {cost ? (
          <p className="text-xs text-muted-foreground">
            Coût estimé : {formatCost(cost.amount, cost.currency)}
            {cost.withLink ? ", surcoût d’une adresse compris" : ""} (tarif relevé le {new Date(cost.asOf).toLocaleDateString("fr-FR")}).
          </p>
        ) : null}

        <PostPreview review={review} values={values} videoUrl={videoUrl} later={later} />
      </AccordionContent>
    </AccordionItem>
  );
}

/** Aperçu neutre de la publication : vignette, titre, début de la description, compte, visibilité. */
function PostPreview({ review, values, videoUrl, later }: { review: AccountReview; values: Values; videoUrl: string; later: string }) {
  const { fields, account } = review;
  const title = textOf(fields, values, "title");
  const description = textOf(fields, values, "description");
  const privacyField = fields.find((field) => field.role === "privacy");
  const privacy = privacyField?.kind === "select" ? privacyField.choices.find((choice) => choice.value === values[privacyField.key])?.label : undefined;
  const scheduleField = fields.find((field) => field.kind === "datetime");
  const scheduled = (scheduleField && typeof values[scheduleField.key] === "string" && (values[scheduleField.key] as string)) || later;
  return (
    <figure className="grid min-w-0 gap-2">
      <figcaption className="text-xs font-medium text-muted-foreground">Aperçu</figcaption>
      <div className="flex min-w-0 gap-3 rounded-lg bg-muted/40 p-3">
        <video src={`${videoUrl}#t=0.1`} muted playsInline preload="metadata" className="aspect-video w-28 shrink-0 rounded-md bg-black object-cover sm:w-36" aria-hidden />
        <div className="grid min-w-0 flex-1 content-start gap-1">
          <p className="line-clamp-2 text-sm font-medium [overflow-wrap:anywhere]">{title || <span className="text-muted-foreground">Sans titre</span>}</p>
          {description ? <p className="line-clamp-2 text-xs whitespace-pre-line text-muted-foreground [overflow-wrap:anywhere]">{description}</p> : null}
          <p className="flex min-w-0 items-center gap-1.5 pt-1 text-xs text-muted-foreground">
            <AccountAvatar account={account} className="size-4 text-[9px]" />
            <span className="truncate">{account.displayName}</span>
            {privacy || scheduled ? <span className="shrink-0">·</span> : null}
            {scheduled ? <span className="shrink-0">le {formatSchedule(scheduled)}</span> : privacy ? <span className="shrink-0">{privacy}</span> : null}
          </p>
        </div>
      </div>
    </figure>
  );
}

// ─── Suivi des envois ─────────────────────────────────────────────

function JobTimeline({
  jobs,
  accounts,
  connectors,
  onChanged,
}: {
  jobs: PublishJobSummary[];
  accounts: AccountSummary[];
  connectors: ConnectorInfo[];
  onChanged: () => void;
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
    <div className="grid min-w-0 gap-3">
      <h3 className="text-sm font-semibold">Envois</h3>
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
            const label =
              job.state === "uploading"
                ? `${JOB_LABELS.uploading} ${percent} %`
                : job.state === "processing"
                  ? job.result
                    ? "Publié, traitement en cours"
                    : "En traitement, pas encore publié"
                  : JOB_LABELS[job.state];
            return (
                <StepTimelineItem key={job.id} state={state} className="animate-in fade-in-0 slide-in-from-bottom-1">
                  <StepTimelineIndicator />
                  <StepTimelineContent>
                    <StepTimelineTitle state={state} className="flex min-w-0 items-center gap-2">
                      {connector ? <ServiceLogo logo={connector.logo} /> : null}
                      <span className="min-w-0 truncate">{account?.displayName ?? job.accountId}</span>
                      <span className="shrink-0 text-xs font-normal text-muted-foreground">
                        {job.state === "uploading" ? `${JOB_LABELS.uploading} ${percent} %` : JOB_LABELS[job.state]}
                      </span>
                    </StepTimelineTitle>
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
                      <StepTimelineDescription className="text-destructive">
                        {job.error}
                        {job.state === "failed" && job.processingSince && !/sans republier/.test(job.error) ? " « Reprendre » repart du même envoi chez le service, sans republier." : ""}
                      </StepTimelineDescription>
                    ) : null}
                    {job.warning ? <StepTimelineDescription className="text-amber-700 dark:text-amber-400">{job.warning}</StepTimelineDescription> : null}
                    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 pt-0.5">
                      {job.result ? (
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
    </div>
  );
}
