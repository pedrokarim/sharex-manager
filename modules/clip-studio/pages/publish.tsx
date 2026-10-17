"use client";

/**
 * Écran Publier (dossier 01 ter, § 3.3) : `/m/clip-studio/publish?export=<id>`.
 *
 * Il remplace l'ancien tiroir et en garde tout : comptes capables de publier
 * une vidéo, réglages de chaque service, liste de contrôle des limites,
 * connexion d'un compte en cours de route, programmation, suivi.
 *
 * - Comptes à gauche, groupés par service, cochés d'avance ceux de la marque.
 * - Textes au centre, par onglet de service : chaque champ hérite du jeu de
 *   l'export ; le modifier crée une variante pour ce service, enregistrée
 *   dans le jeu de l'export (la publication suivante repart des textes relus).
 * - Aperçu à droite à la manière du service, puis « Quand » et l'envoi.
 *
 * Sous 1 280 px, les trois colonnes deviennent trois étapes (Comptes,
 * Textes, Envoi), l'aperçu passe dans un tiroir.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, CircleAlert, CircleCheck, CloudOff, Eye, FileVideo, Plus, RotateCcw, Send, Timer } from "lucide-react";
import { FormStatus, errorMessage, useFeedback } from "@/components/feedback";
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
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ConnectAccountSheet, useConnectionReturn, type ConnectFlowStart } from "@/components/connections/connect-account-sheet";
import { DateTimePicker } from "@/components/connections/date-time-picker";
import { PublishFieldInput, conditionHolds, fieldProblem, isFieldVisible, ruleProblems, visibleValues } from "@/components/connections/publish-field-input";
import { AccountAvatar, AccountStatus, ServiceLogo } from "@/components/connections/shared";
import useMediaQuery from "@/hooks/use-media-query";
import { accountActivityAction, measureTextAction, publishFormAction } from "@/app/(app)/admin/connections/actions";
import { useSession } from "@/lib/auth-client";
import { estimatePublishCost, formatCost } from "@/lib/connections/limits";
import type { AccountSummary, ConnectorInfo, LivePublishForm, PublishField, PublishJobSummary } from "@/lib/connections/types";
import { cn } from "@/lib/utils";
import type { BrandKit } from "@/modules/brand-kit/lib/types";
import type { ClipProject } from "../engine/types";
import { callAnyModule, callModule, defaultPostTexts, exportUrl, getExport, publishExport, updateExportPost } from "../lib/client";
import { unverifiedSources, usesGeneratedImages } from "../lib/credits";
import { emptyPost, publishTimes, samePost, scheduleProblems, staggerSchedule, textsOf, type ScheduleMode } from "../lib/export-screens";
import { fieldValuesFor, firstCommentFor } from "../lib/post-texts";
import type { ExportDetails, ExportPost, PublishTarget } from "../lib/post-types";
import { exportHref } from "../components/export-card";
import { PostPreview, previewLayout } from "../components/post-preview";
import { PostTextsEditor, serviceProblems, type ServiceTarget } from "../components/post-texts-editor";
import {
  CheckList,
  JobTimeline,
  MOVING,
  jobsPending,
  limitChecks,
  prefillSettings,
  scheduleFieldOf,
  serviceTargets,
  settingFields,
  settingOptions,
  type CheckLine,
  type PublishTargets,
  type Values,
} from "../components/publish-shared";
import { ScreenHeader } from "../components/screen-header";

const SAVE_DELAY_MS = 1200;
const STAGGER_MINUTES = 5;

export default function PublishPage() {
  const params = useSearchParams();
  const id = params.get("export");
  const { data: session, isPending } = useSession();
  const isAdmin = session?.user?.role === "admin";

  return (
    <MotionConfig reducedMotion="user">
      {!id ? (
        <Missing title="Aucun export choisi" description="Ouvrez la fiche d’un export, puis « Publier »." />
      ) : isPending ? (
        <PublishSkeleton />
      ) : !isAdmin ? (
        <Missing title="Réservé aux administrateurs" description="La publication passe par les comptes connectés de l’instance." exportId={id} />
      ) : (
        <PublishLoader key={id} id={id} />
      )}
    </MotionConfig>
  );
}

function Missing({ title, description, exportId }: { title: string; description: string; exportId?: string }) {
  return (
    <Empty className="border border-dashed">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Send />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button asChild variant="outline">
          <Link href={exportId ? exportHref(exportId) : "/m/clip-studio/exports"}>{exportId ? "Fiche de l’export" : "Tous les exports"}</Link>
        </Button>
      </EmptyContent>
    </Empty>
  );
}

function PublishSkeleton() {
  return (
    <div className="flex min-h-full shrink-0 flex-col gap-6" aria-busy>
      <div className="flex items-center gap-3">
        <Skeleton className="size-10 rounded-xl" />
        <div className="grid gap-2">
          <Skeleton className="h-6 w-72 max-w-full" />
          <Skeleton className="h-4 w-56" />
        </div>
      </div>
      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,17rem)_minmax(0,1fr)_minmax(0,22rem)]">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-96 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    </div>
  );
}

// ─── Chargement ──────────────────────────────────────────────────

interface Loaded {
  details: ExportDetails;
  targets: PublishTargets;
  kit: BrandKit | null;
  project: ClipProject | null;
  /** Textes de départ : ceux de l'export, sinon ceux de la marque (export d'avant les textes de publication). */
  post: ExportPost;
}

function PublishLoader({ id }: { id: string }) {
  const [loaded, setLoaded] = useState<Loaded | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [details, targets] = await Promise.all([getExport(id), callModule<PublishTargets>("listPublishTargets")]);
        const kitId = details.export.brandKitId ?? details.project.brandKitId;
        const [kit, project, post] = await Promise.all([
          kitId
            ? callAnyModule<{ kit: BrandKit } | null>("brand-kit", "getKit", kitId)
                .then((result) => result?.kit ?? null)
                .catch(() => null)
            : Promise.resolve(null),
          details.project.exists ? callModule<ClipProject | null>("getProject", details.export.projectId).catch(() => null) : Promise.resolve(null),
          details.export.post ? Promise.resolve(details.export.post) : defaultPostTexts(details.export.id).catch(() => emptyPost(0)),
        ]);
        if (alive) setLoaded({ details, targets, kit, project, post });
      } catch (reason) {
        if (!alive) return;
        setError(reason instanceof Error ? reason.message : "Export introuvable");
        setLoaded(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  if (loaded === undefined) return <PublishSkeleton />;
  if (!loaded) return <Missing title="Export introuvable" description={error ?? "Il a peut-être été supprimé."} />;
  return <PublishScreen {...loaded} />;
}

// ─── Ce que l'on sait de chaque compte coché ─────────────────────

/** Formulaire lu chez le service pour un compte (`livePublishForm`) : en cours, prêt ou en échec. */
type LiveForm = { state: "loading" } | { state: "ready"; form: LivePublishForm } | { state: "error"; error: string };

interface AccountReview {
  account: AccountSummary;
  connector: ConnectorInfo;
  /** Réglages du compte : ceux lus chez le service, sinon ceux du connecteur. */
  fields: PublishField[];
  live?: LiveForm;
  checks: CheckLine[];
  blockers: string[];
  cost: ReturnType<typeof estimatePublishCost>;
  publicNow: boolean;
  note: string | null;
  canComment: boolean;
}

type QuotaInfo = { label: string; used: number; limit: number } | null;

/** Le seau le plus entamé d'un compte : ce qui limitera d'abord ses envois. */
function tightestBucket(buckets: { label: string; used: number; limit: number }[] | undefined): QuotaInfo {
  const usable = (buckets ?? []).filter((bucket) => bucket.limit > 0);
  if (usable.length === 0) return null;
  return usable.reduce((tightest, bucket) => (bucket.used / bucket.limit > tightest.used / tightest.limit ? bucket : tightest));
}

function PublishScreen({ details, targets: initialTargets, kit, project, post: initialPost }: Loaded) {
  const entry = details.export;
  const returnTo = `/m/clip-studio/publish?export=${encodeURIComponent(entry.id)}`;
  const [targets, setTargets] = useState(initialTargets);
  const accounts = targets.accounts;
  const connectorOf = useCallback((account: AccountSummary) => targets.connectors.find((item) => item.id === account.connector) ?? null, [targets.connectors]);
  const synthetic = useMemo(() => usesGeneratedImages(project), [project]);
  const rightsNames = useMemo(() => unverifiedSources(project), [project]);

  // ─── Comptes cochés et réglages ────────────────────────────────
  const [checked, setChecked] = useState<Set<string>>(() => {
    const usable = accounts.filter((account) => account.status === "connected");
    const preferred = usable.filter((account) => kit?.publishing?.accountIds?.includes(account.id));
    return new Set((preferred.length > 0 ? preferred : usable.length === 1 ? usable : []).map((account) => account.id));
  });
  const [settings, setSettings] = useState<Record<string, Values>>(() =>
    Object.fromEntries(accounts.map((account) => [account.id, prefillSettings(settingFields(connectorOf(account)), kit, synthetic)]))
  );
  const toggle = (account: AccountSummary, on: boolean) => {
    setChecked((current) => {
      const next = new Set(current);
      if (on) next.add(account.id);
      else next.delete(account.id);
      return next;
    });
    if (on && !settings[account.id]) setSettings((current) => ({ ...current, [account.id]: prefillSettings(settingFields(connectorOf(account)), kit, synthetic) }));
  };
  const checkedAccounts = useMemo(() => accounts.filter((account) => checked.has(account.id)), [accounts, checked]);

  // Réglages lus chez le service à l'affichage, pour un compte coché dont le service l'exige (identité, visibilités permises…).
  const [liveForms, setLiveForms] = useState<Record<string, LiveForm>>({});
  const requestedForms = useRef<Set<string>>(new Set());
  const loadLiveForm = useCallback(
    async (account: AccountSummary) => {
      requestedForms.current.add(account.id);
      setLiveForms((current) => ({ ...current, [account.id]: { state: "loading" } }));
      const result = await publishFormAction(account.id, { kind: "video", durationMs: entry.durationMs });
      if (!result.ok || !result.data) {
        setLiveForms((current) => ({ ...current, [account.id]: { state: "error", error: result.ok ? "Réglages indisponibles." : result.error } }));
        return;
      }
      const form = result.data;
      setLiveForms((current) => ({ ...current, [account.id]: { state: "ready", form } }));
      setSettings((current) => ({ ...current, [account.id]: prefillSettings(form.fields, kit, synthetic) }));
    },
    [entry.durationMs, kit, synthetic]
  );
  useEffect(() => {
    for (const account of checkedAccounts) {
      if (requestedForms.current.has(account.id) || account.status !== "connected") continue;
      if (connectorOf(account)?.livePublishForm) void loadLiveForm(account);
    }
  }, [checkedAccounts, connectorOf, loadLiveForm]);
  const fieldsOf = useCallback(
    (account: AccountSummary, connector: ConnectorInfo | null): PublishField[] => {
      const live = liveForms[account.id];
      return live?.state === "ready" ? live.form.fields : connector?.livePublishForm ? [] : settingFields(connector);
    },
    [liveForms]
  );

  const groups = useMemo(() => {
    const map = new Map<string, { connector: ConnectorInfo | null; label: string; logo: string; accounts: AccountSummary[] }>();
    for (const account of accounts) {
      const connector = connectorOf(account);
      const group = map.get(account.connector) ?? { connector, label: connector?.label ?? account.connectorLabel, logo: connector?.logo ?? account.logo, accounts: [] };
      group.accounts.push(account);
      map.set(account.connector, group);
    }
    return [...map.values()];
  }, [accounts, connectorOf]);

  // Quota restant de chaque compte, lu une fois.
  const [quotas, setQuotas] = useState<Record<string, QuotaInfo>>({});
  useEffect(() => {
    let alive = true;
    for (const account of accounts) {
      void accountActivityAction(account.id).then((result) => {
        if (!alive || !result.ok) return;
        const bucket = tightestBucket([...(result.data.accountQuota?.buckets ?? []), ...(result.data.quota?.buckets ?? [])]);
        setQuotas((current) => ({ ...current, [account.id]: bucket }));
      });
    }
    return () => {
      alive = false;
    };
  }, [accounts]);

  // ─── Textes de l'export ────────────────────────────────────────
  const [post, setPost] = useState<ExportPost>(initialPost);
  const [savedPost, setSavedPost] = useState<ExportPost>(initialPost);
  const [saveState, setSaveState] = useState<"saved" | "pending" | "saving" | "error">("saved");
  const savedRef = useRef(savedPost);
  savedRef.current = savedPost;
  const postRef = useRef(post);
  postRef.current = post;

  const inflight = useRef<Promise<boolean> | null>(null);
  // Raison du dernier échec d'enregistrement, lue sous l'en-tête « Textes » (état local : `saveTexts` garde son identité).
  const [saveError, setSaveError] = useState<string | null>(null);
  const saveTexts = useCallback(async (): Promise<boolean> => {
    // Un enregistrement en cours d'abord : deux envois croisés se refuseraient l'un l'autre.
    if (inflight.current) await inflight.current;
    const current = postRef.current;
    if (samePost(current, savedRef.current)) return true;
    const run = (async () => {
      setSaveState("saving");
      try {
        const next = await updateExportPost(entry.id, current, savedRef.current.updatedAt || undefined);
        savedRef.current = next;
        setSavedPost(next);
        // Une saisie arrivée pendant l'enregistrement est gardée : seul l'horodatage suit.
        setPost((latest) => (samePost(latest, current) ? next : { ...latest, updatedAt: next.updatedAt }));
        setSaveState(samePost(postRef.current, current) ? "saved" : "pending");
        setSaveError(null);
        return true;
      } catch (reason) {
        setSaveState("error");
        setSaveError(errorMessage(reason, "Les textes n’ont pas pu être enregistrés. Réessayez."));
        return false;
      }
    })();
    inflight.current = run;
    try {
      return await run;
    } finally {
      if (inflight.current === run) inflight.current = null;
    }
  }, [entry.id]);

  // Les variantes modifiées ici rejoignent le jeu de l'export, peu après la dernière frappe.
  useEffect(() => {
    if (samePost(post, savedPost)) return;
    setSaveState("pending");
    const timer = setTimeout(() => void saveTexts(), SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [post, savedPost, saveTexts]);

  useEffect(() => {
    if (saveState === "saved") return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [saveState]);

  const checkedConnectors = useMemo(() => {
    const ids = [...new Set(checkedAccounts.map((account) => account.connector))];
    return ids.map((id) => targets.connectors.find((connector) => connector.id === id)).filter((connector): connector is ConnectorInfo => Boolean(connector));
  }, [checkedAccounts, targets.connectors]);
  const services = useMemo(
    () => serviceTargets(checkedConnectors, entry, details.hashtagRules, { accounts: checkedAccounts, returnTo }),
    [checkedConnectors, entry, details.hashtagRules, checkedAccounts, returnTo]
  );
  const [tab, setTab] = useState<string>("");
  const activeService = services.find((service) => service.connector.id === tab) ?? services[0] ?? null;

  // Mesure du service côté serveur (texte pondéré…), en différé ; un service qui n'en a pas n'est plus interrogé.
  const [measures, setMeasures] = useState<Record<string, { used: number; max: number } | null>>({});
  const noServerMeasure = useRef<Set<string>>(new Set());
  const measuredText = useMemo(() => {
    const out: Record<string, string> = {};
    for (const service of services) {
      const values = fieldValuesFor(service.fields, textsOf(post, service.connector.id), service.rules);
      const field = service.fields.find((item) => item.role === "caption") ?? service.fields.find((item) => item.role === "description") ?? service.fields.find((item) => item.role === "title");
      const text = field ? values[field.key] : "";
      if (typeof text === "string" && text) out[service.connector.id] = text;
    }
    return out;
  }, [services, post]);
  const measureKey = JSON.stringify(measuredText);
  useEffect(() => {
    const pending = Object.entries(measuredText).filter(([connectorId]) => !noServerMeasure.current.has(connectorId));
    if (pending.length === 0) return;
    const timer = setTimeout(async () => {
      for (const [connectorId, text] of pending) {
        const result = await measureTextAction(connectorId, text);
        if (!result.ok) continue;
        if (result.data === null) noServerMeasure.current.add(connectorId);
        setMeasures((current) => ({ ...current, [connectorId]: result.data }));
      }
    }, 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `measureKey` résume `measuredText`
  }, [measureKey]);

  // ─── Quand ─────────────────────────────────────────────────────
  const [mode, setMode] = useState<ScheduleMode>("now");
  const [common, setCommon] = useState("");
  const [perAccount, setPerAccount] = useState<Record<string, string>>({});
  const checkedIds = checkedAccounts.map((account) => account.id);
  const times = publishTimes(mode, common, perAccount, checkedIds);
  const timeProblems = scheduleProblems(mode, times);
  const stagger = () => {
    const start = common || new Date(Date.now() + 15 * 60_000).toISOString();
    setPerAccount(staggerSchedule(start, checkedIds, STAGGER_MINUTES));
    setMode("perAccount");
  };

  // ─── Vérifications ─────────────────────────────────────────────
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const problemsByService = useMemo(() => Object.fromEntries(services.map((service) => [service.connector.id, serviceProblems(service, post)])), [services, post]);
  const isVertical = entry.width <= entry.height;

  const reviews: AccountReview[] = checkedAccounts.flatMap((account) => {
    const connector = connectorOf(account);
    if (!connector) return [];
    const fields = fieldsOf(account, connector);
    const live: LiveForm | undefined = connector.livePublishForm ? (liveForms[account.id] ?? { state: "loading" }) : undefined;
    const values = settings[account.id] ?? {};
    const shown = visibleValues(fields, values);
    const count = connector.limits?.text?.count;
    const fieldErrors = fields
      .filter((field) => field.key in shown)
      .map((field) => fieldProblem(field, values[field.key], count))
      .filter((problem): problem is string => Boolean(problem));
    if (live?.state === "ready") fieldErrors.push(...ruleProblems(live.form.rules, shown));
    const measure = measures[connector.id];
    if (measure && measure.used > measure.max) fieldErrors.push(`Texte trop long pour ${connector.label} : ${measure.used.toLocaleString("fr-FR")}/${measure.max.toLocaleString("fr-FR")}.`);
    const baseLimits = account.limits?.video ?? connector.limits?.video;
    const checks = limitChecks(live?.state === "ready" && live.form.limits?.video ? { ...baseLimits, ...live.form.limits.video } : baseLimits, entry);
    const blockers = [
      ...(account.status !== "connected" ? ["Compte à reconnecter."] : []),
      ...(live?.state === "loading" ? [`Lecture du compte chez ${connector.label}…`] : []),
      ...(live?.state === "error" ? [live.error] : []),
      ...(live?.state === "ready" ? (live.form.blockers ?? []) : []),
      ...(problemsByService[connector.id] ?? []).map((problem) => problem.message),
      ...fieldErrors,
      ...(timeProblems[account.id] ? [timeProblems[account.id]] : []),
      ...checks.filter((line) => line.state === "blocked").map((line) => `${line.label} : ${line.detail}`),
    ];
    const privacyField = fields.find((field) => field.role === "privacy");
    const note = connector.shortForm
      ? isVertical && entry.durationMs <= connector.shortForm.maxSeconds * 1000
        ? connector.shortForm.verticalNote
        : !isVertical
          ? connector.shortForm.horizontalNote
          : null
      : null;
    const service = services.find((item) => item.connector.id === connector.id);
    const texts = textsOf(post, connector.id);
    const text = service ? Object.values(fieldValuesFor(service.fields, texts, service.rules)).filter((value) => typeof value === "string").join("\n") : "";
    return [
      {
        account,
        connector,
        fields,
        live,
        checks,
        blockers,
        cost: estimatePublishCost(connector.pricing, "video", text),
        publicNow: Boolean(privacyField && values[privacyField.key] === "public" && times[account.id] === undefined),
        note,
        canComment: account.capabilities.includes("comment.create"),
      },
    ];
  });

  // Phrases que le service veut voir avant l'envoi (consentement), une fois chacune.
  const declarations = [
    ...new Set(
      reviews.flatMap((review) =>
        review.live?.state === "ready"
          ? (review.live.form.declarations ?? [])
              .filter((item) => (item.when ?? []).every((condition) => conditionHolds(condition, visibleValues(review.fields, settings[review.account.id] ?? {}))))
              .map((item) => item.text)
          : []
      )
    ),
  ];
  const rightsBlocking = rightsNames.length > 0 && !rightsConfirmed;
  const blockerCount = reviews.reduce((sum, review) => sum + review.blockers.length, 0) + (rightsBlocking ? 1 : 0);
  const firstBlocker = reviews.flatMap((review) => review.blockers.map((blocker) => `${review.account.displayName} – ${blocker}`))[0] ?? (rightsBlocking ? "Vérifiez les droits des images." : undefined);
  const totalCost = reviews.reduce<{ amount: number; currency: string } | null>((sum, review) => {
    if (!review.cost) return sum;
    if (sum && sum.currency !== review.cost.currency) return sum;
    return { amount: (sum?.amount ?? 0) + review.cost.amount, currency: review.cost.currency };
  }, null);

  // ─── Envoi et suivi ────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false);
  const [confirmPublic, setConfirmPublic] = useState(false);
  const [jobs, setJobs] = useState<PublishJobSummary[] | null>(null);
  // Échecs de l'envoi : au-dessus du bouton Publier, ou en tête du suivi si d'autres comptes sont partis.
  const submitFeedback = useFeedback();

  const pollJobs = useCallback(async (ids: string[]) => {
    const next = await callModule<PublishJobSummary[]>("getPublishJobs", ids).catch(() => null);
    if (next) setJobs(next);
  }, []);
  useEffect(() => {
    if (!jobs || !jobsPending(jobs)) return;
    const timer = setTimeout(() => void pollJobs(jobs.map((job) => job.id)), jobs.some((job) => MOVING.has(job.state)) ? 2000 : 15000);
    return () => clearTimeout(timer);
  }, [jobs, pollJobs]);

  const submit = async () => {
    setConfirmPublic(false);
    setSubmitting(true);
    submitFeedback.clear();
    try {
      // Les textes relus ici partent avec la publication : on les range d'abord dans l'export.
      if (!(await saveTexts())) {
        submitFeedback.error("Les textes n’ont pas pu être enregistrés : rien n’a été publié. Réessayez.");
        return;
      }
      const list: PublishTarget[] = reviews.map((review) => {
        const time = times[review.account.id];
        const scheduleField = scheduleFieldOf(review.connector);
        const options = settingOptions(review.fields, settings[review.account.id] ?? {}, kit);
        if (time !== undefined && scheduleField) options[scheduleField.key] = new Date(time).toISOString();
        return {
          accountId: review.account.id,
          options,
          ...(time !== undefined && !scheduleField && targets.queueScheduling ? { publishAt: time } : {}),
          ...(review.connector.followUps?.comment && !review.canComment ? { followUps: { comment: false as const } } : {}),
        };
      });
      const result = await publishExport({ exportId: entry.id, targets: list });
      if (result.failed.length > 0) {
        const lines = result.failed.map((failure) => {
          const account = accounts.find((item) => item.id === failure.accountId);
          const text = `${account?.displayName ?? "Compte"} : ${failure.error}`;
          return /[.!?…]$/.test(text) ? text : `${text}.`;
        });
        submitFeedback.error(lines.join(" "));
      }
      // Le suivi des envois remplace le formulaire : il tient lieu de confirmation.
      if (result.jobs.length > 0) setJobs(result.jobs);
    } catch (reason) {
      submitFeedback.error(errorMessage(reason, "La publication n’a pas pu partir. Réessayez dans un instant."));
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

  // ─── Connexion d'un compte en cours de route ───────────────────
  const { start: connectReturn, clear: clearConnectReturn } = useConnectionReturn();
  const [connectOpen, setConnectOpen] = useState(false);
  const [connectEntry, setConnectEntry] = useState<ConnectFlowStart | null>(null);
  const refreshTargets = useCallback(async () => {
    const next = await callModule<PublishTargets>("listPublishTargets").catch(() => null);
    if (next) setTargets(next);
    return next;
  }, []);
  useEffect(() => {
    if (!connectReturn) return;
    setConnectEntry(connectReturn);
    setConnectOpen(true);
    // Retour d'une autorisation en plus : les capacités des comptes ont changé.
    void refreshTargets();
    clearConnectReturn();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- une fois par retour
  }, [connectReturn]);
  const onConnected = async (fresh: AccountSummary[]) => {
    const next = await refreshTargets();
    if (!next) return;
    const usable = next.accounts.filter((account) => account.status === "connected" && fresh.some((item) => item.id === account.id));
    if (usable.length === 0) return;
    setChecked((current) => new Set([...current, ...usable.map((account) => account.id)]));
    setSettings((current) => {
      const copy = { ...current };
      for (const account of usable) {
        if (copy[account.id]) continue;
        copy[account.id] = prefillSettings(settingFields(next.connectors.find((item) => item.id === account.connector)), kit, synthetic);
      }
      return copy;
    });
  };
  const openConnect = () => {
    setConnectEntry(null);
    setConnectOpen(true);
  };

  // ─── Aperçu ────────────────────────────────────────────────────
  const [previewAccountId, setPreviewAccountId] = useState<string | null>(null);
  const previewAccounts = activeService ? checkedAccounts.filter((account) => account.connector === activeService.connector.id) : [];
  const previewAccount = previewAccounts.find((account) => account.id === previewAccountId) ?? previewAccounts[0] ?? null;
  const preview = activeService ? (
    <ServicePreview
      service={activeService}
      post={post}
      account={previewAccount}
      accounts={previewAccounts}
      onAccount={setPreviewAccountId}
      videoUrl={exportUrl(entry.file)}
      coverUrl={entry.cover ? exportUrl(entry.cover.file) : null}
      ratio={entry.width && entry.height ? entry.width / entry.height : 16 / 9}
      schedule={previewAccount ? times[previewAccount.id] : undefined}
      privacy={previewAccount ? privacyLabel(settings[previewAccount.id] ?? {}, fieldsOf(previewAccount, connectorOf(previewAccount))) : undefined}
      canComment={previewAccount ? previewAccount.capabilities.includes("comment.create") : false}
    />
  ) : (
    <p className="text-sm text-muted-foreground">Cochez un compte pour voir sa publication.</p>
  );

  const wide = useMediaQuery("(min-width: 1280px)") !== false;
  const [step, setStep] = useState<"accounts" | "texts" | "send">("accounts");
  const [previewOpen, setPreviewOpen] = useState(false);
  const usableCount = accounts.filter((account) => account.status === "connected").length;

  // ─── Colonnes ──────────────────────────────────────────────────
  const accountsColumn = (
    <AccountsColumn groups={groups} checked={checked} onToggle={toggle} quotas={quotas} onConnect={openConnect} usableCount={usableCount} />
  );

  const settingsForService = activeService ? reviews.filter((review) => review.connector.id === activeService.connector.id) : [];
  const textsColumn = (
    <div className="grid min-w-0 content-start gap-6">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Textes</h2>
        <SaveIndicator state={saveState} onRetry={() => void saveTexts()} />
      </div>
      <FormStatus state={saveState === "error" && saveError ? { tone: "error", message: saveError, id: 0 } : null} />
      <PostTextsEditor
        post={post}
        onChange={setPost}
        services={services}
        showBase={false}
        tab={activeService?.connector.id}
        onTabChange={setTab}
        disabled={submitting}
        idPrefix={`publish-${entry.id}`}
      />
      {settingsForService.length > 0 ? (
        <section className="grid min-w-0 gap-3" aria-label="Réglages par compte">
          <Separator />
          <h3 className="text-sm font-semibold">Réglages par compte</h3>
          <Accordion type="multiple" defaultValue={settingsForService.map((review) => review.account.id)} className="grid min-w-0 gap-2">
            {settingsForService.map((review) => (
              <AccountSettings
                key={review.account.id}
                review={review}
                values={settings[review.account.id] ?? {}}
                onValue={(key, value) => setSettings((current) => ({ ...current, [review.account.id]: { ...(current[review.account.id] ?? {}), [key]: value } }))}
                onReload={() => void loadLiveForm(review.account)}
              />
            ))}
          </Accordion>
        </section>
      ) : null}
    </div>
  );

  const sendColumn = (
    <div className="grid min-w-0 content-start gap-6">
      <section className="grid min-w-0 gap-3" aria-labelledby="publish-when">
        <h2 id="publish-when" className="text-sm font-semibold">
          Quand
        </h2>
        <ToggleGroup type="single" variant="outline" aria-labelledby="publish-when" value={mode} onValueChange={(value) => value && setMode(value as ScheduleMode)} className="flex w-full flex-wrap">
          <ToggleGroupItem value="now" className="h-auto min-h-9 min-w-min flex-auto px-2 leading-tight whitespace-normal">
            Maintenant
          </ToggleGroupItem>
          <ToggleGroupItem value="common" className="h-auto min-h-9 min-w-min flex-auto px-2 leading-tight whitespace-normal">
            Même date
          </ToggleGroupItem>
          <ToggleGroupItem value="perAccount" className="h-auto min-h-9 min-w-min flex-auto px-2 leading-tight whitespace-normal" disabled={checkedIds.length === 0}>
            Par compte
          </ToggleGroupItem>
        </ToggleGroup>
        <AnimatePresence initial={false} mode="wait">
          {mode === "common" ? (
            <motion.div key="common" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="grid min-w-0 gap-2">
              <DateTimePicker value={common} onChange={setCommon} placeholder="Choisir la date de publication" aria-label="Date de publication" className="w-full min-w-0" />
              {checkedIds.length > 1 ? (
                <Button type="button" variant="link" size="sm" className="h-auto justify-self-start gap-1.5 p-0 text-xs" onClick={stagger}>
                  <Timer className="size-3.5" />
                  Décaler les comptes de {STAGGER_MINUTES} minutes
                </Button>
              ) : null}
            </motion.div>
          ) : mode === "perAccount" ? (
            <motion.ul key="per" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="grid min-w-0 gap-3">
              {checkedAccounts.map((account) => (
                <li key={account.id} className="grid min-w-0 gap-1.5">
                  <span className="flex min-w-0 items-center gap-2 text-sm">
                    <AccountAvatar account={account} withService className="size-8 text-xs" />
                    <span className="min-w-0 truncate" title={account.displayName}>
                      {account.displayName}
                    </span>
                  </span>
                  <DateTimePicker value={perAccount[account.id] ?? ""} onChange={(value) => setPerAccount((current) => ({ ...current, [account.id]: value }))} aria-label={`Date de publication pour ${account.displayName}`} className="w-full min-w-0" />
                  {timeProblems[account.id] ? <p className="text-xs text-destructive">{timeProblems[account.id]}</p> : null}
                </li>
              ))}
              {checkedIds.length > 1 ? (
                <li>
                  <Button type="button" variant="link" size="sm" className="h-auto gap-1.5 p-0 text-xs" onClick={stagger}>
                    <Timer className="size-3.5" />
                    Décaler de {STAGGER_MINUTES} minutes à partir du premier
                  </Button>
                </li>
              ) : null}
            </motion.ul>
          ) : null}
        </AnimatePresence>
        {mode !== "now" ? <p className="text-xs text-pretty text-muted-foreground">Un service qui ne programme pas lui-même attend dans la file jusqu’à l’heure dite.</p> : null}
      </section>

      <Separator />

      <section className="grid min-w-0 gap-3" aria-label="Envoi">
        {rightsNames.length > 0 && reviews.length > 0 ? (
          <label className="flex min-w-0 cursor-pointer items-start gap-2 text-sm">
            <Checkbox checked={rightsConfirmed} onCheckedChange={(value) => setRightsConfirmed(value === true)} className="mt-0.5" />
            <span className="min-w-0 text-pretty">J’ai vérifié les droits des images trouvées sur le web ({rightsNames.length}).</span>
          </label>
        ) : null}
        {declarations.length > 0 ? (
          <ul className="grid min-w-0 gap-1 text-xs text-pretty text-muted-foreground" aria-label="Déclarations">
            {declarations.map((text) => (
              <li key={text} className="min-w-0 [overflow-wrap:anywhere]">
                {text}
              </li>
            ))}
          </ul>
        ) : null}
        <div className="grid min-w-0 gap-1 text-xs text-muted-foreground">
          <span>
            {reviews.length > 1 ? `${reviews.length} comptes` : reviews.length === 1 ? "1 compte" : "Aucun compte coché"}
            {totalCost ? ` · coût estimé ${formatCost(totalCost.amount, totalCost.currency)}` : ""}
          </span>
          {blockerCount > 0 ? (
            <span className="line-clamp-3 text-destructive [overflow-wrap:anywhere]" title={firstBlocker}>
              {blockerCount > 1 ? `${blockerCount} points à régler` : "1 point à régler"}
              {firstBlocker ? ` : ${firstBlocker}` : ""}
            </span>
          ) : reviews.length > 0 ? (
            <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
              <CircleCheck className="size-3.5" />
              Prêt à publier
            </span>
          ) : null}
        </div>
        <FormStatus state={submitFeedback.state} />
        <Button onClick={startSubmit} loading={submitting} disabled={reviews.length === 0 || blockerCount > 0} title={firstBlocker} className="w-full gap-2">
          <Send className="size-4" />
          {mode !== "now" ? "Programmer" : reviews.length > 1 ? `Publier sur ${reviews.length} comptes` : "Publier"}
        </Button>
      </section>
    </div>
  );

  return (
    <div className="flex min-h-full shrink-0 flex-col gap-6">
      <ScreenHeader
        back={{ href: exportHref(entry.id), label: "Fiche de l’export" }}
        icon={Send}
        title={`Publier « ${entry.projectName} »`}
        fullTitle={entry.projectName}
        description={kit ? `Comptes et réglages préremplis par la marque « ${kit.name} ». Chaque compte reçoit son propre envoi, repris automatiquement en cas de coupure.` : "Chaque compte reçoit son propre envoi, repris automatiquement en cas de coupure."}
        actions={
          !wide && !jobs ? (
            <Button variant="outline" className="gap-2" onClick={() => setPreviewOpen(true)} disabled={!activeService}>
              <Eye className="size-4" />
              Aperçu
            </Button>
          ) : undefined
        }
      />

      {jobs ? (
        <section className="grid min-w-0 gap-4 lg:max-w-3xl" aria-label="Suivi des envois">
          <h2 className="text-sm font-semibold">Envois</h2>
          <FormStatus state={submitFeedback.state} />
          <JobTimeline jobs={jobs} accounts={accounts} connectors={targets.connectors} onChanged={() => void pollJobs(jobs.map((job) => job.id))} authorizeReturn={exportHref(entry.id)} />
          <div className="flex min-w-0 flex-wrap gap-2">
            <Button asChild className="gap-2">
              <Link href={exportHref(entry.id)}>
                <FileVideo className="size-4" />
                Fiche de l’export
              </Link>
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                submitFeedback.clear();
                setJobs(null);
              }}
            >
              Publier ailleurs
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Le suivi continue dans la fiche de l’export et dans celle de chaque compte.</p>
        </section>
      ) : usableCount === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Send />
            </EmptyMedia>
            <EmptyTitle>{accounts.length === 0 ? "Aucun compte ne sait publier une vidéo" : "Aucun compte utilisable"}</EmptyTitle>
            <EmptyDescription>
              {accounts.length === 0 ? "Reliez une chaîne ou un compte : il sera coché ici dès qu’il est prêt." : "Les comptes capables doivent être reconnectés avant de publier."}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={openConnect} className="gap-2">
              <Plus className="size-4" />
              Connecter un compte
            </Button>
          </EmptyContent>
        </Empty>
      ) : wide ? (
        <div className="grid min-w-0 gap-8 xl:grid-cols-[minmax(0,17rem)_minmax(0,1fr)_minmax(0,22rem)] 2xl:grid-cols-[minmax(0,19rem)_minmax(0,1fr)_minmax(0,26rem)]">
          <aside className="min-w-0 xl:sticky xl:top-0 xl:self-start">{accountsColumn}</aside>
          <section className="min-w-0" aria-label="Textes">
            {textsColumn}
          </section>
          <aside className="grid min-w-0 content-start gap-6 xl:sticky xl:top-0 xl:self-start">
            <section className="grid min-w-0 gap-3" aria-label="Aperçu">
              <h2 className="text-sm font-semibold">Aperçu</h2>
              {preview}
            </section>
            <Separator />
            {sendColumn}
          </aside>
        </div>
      ) : (
        <Tabs value={step} onValueChange={(value) => setStep(value as typeof step)} className="min-w-0 gap-5">
          <TabsList className="w-full min-w-0">
            <TabsTrigger value="accounts" className="min-w-0">
              <span className="truncate">1. Comptes</span>
            </TabsTrigger>
            <TabsTrigger value="texts" className="min-w-0" disabled={checkedIds.length === 0}>
              <span className="truncate">2. Textes</span>
            </TabsTrigger>
            <TabsTrigger value="send" className="min-w-0" disabled={checkedIds.length === 0}>
              <span className="truncate">3. Envoi</span>
            </TabsTrigger>
          </TabsList>
          <TabsContent value="accounts" className="grid min-w-0 gap-5">
            {accountsColumn}
            <StepNav next={checkedIds.length > 0 ? () => setStep("texts") : undefined} nextLabel="Textes" />
          </TabsContent>
          <TabsContent value="texts" className="grid min-w-0 gap-5">
            {textsColumn}
            <StepNav previous={() => setStep("accounts")} previousLabel="Comptes" next={() => setStep("send")} nextLabel="Envoi" />
          </TabsContent>
          <TabsContent value="send" className="grid min-w-0 gap-5">
            {sendColumn}
            <StepNav previous={() => setStep("texts")} previousLabel="Textes" />
          </TabsContent>
        </Tabs>
      )}

      <Drawer open={previewOpen && !wide} onOpenChange={setPreviewOpen}>
        <DrawerContent className="max-h-[90svh]">
          <DrawerHeader>
            <DrawerTitle>Aperçu</DrawerTitle>
            <DrawerDescription>La publication telle qu’on la lira chez le service.</DrawerDescription>
          </DrawerHeader>
          <div className="min-h-0 overflow-y-auto px-4 pb-6">
            {/* À la largeur d'un fil sur téléphone, comme chez le service. */}
            <div className="mx-auto w-full max-w-md">{preview}</div>
          </div>
        </DrawerContent>
      </Drawer>

      <AlertDialog open={confirmPublic} onOpenChange={setConfirmPublic}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Publier en public tout de suite ?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="grid gap-2">
                <p>La vidéo sera visible de tous dès la fin du traitement sur :</p>
                <ul className="grid gap-1">
                  {publicReviews.map((review) => (
                    <li key={review.account.id} className="flex min-w-0 items-center gap-2 text-foreground">
                      <ServiceLogo logo={review.connector.logo} />
                      <span className="min-w-0 truncate" title={review.account.displayName}>
                        {review.account.displayName}
                      </span>
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
        returnTo={returnTo}
        returnLabel="Revenir à la publication"
        onConnected={(fresh) => void onConnected(fresh)}
      />
    </div>
  );
}

function privacyLabel(values: Values, fields: PublishField[]): string | undefined {
  const field = fields.find((item) => item.role === "privacy");
  if (field?.kind !== "select") return undefined;
  return field.choices.find((choice) => choice.value === values[field.key])?.label;
}

function StepNav({ previous, previousLabel, next, nextLabel }: { previous?: () => void; previousLabel?: string; next?: () => void; nextLabel?: string }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-2">
      {previous ? (
        <Button variant="ghost" className="gap-1.5" onClick={previous}>
          <ArrowLeft className="size-4" />
          {previousLabel}
        </Button>
      ) : (
        <span />
      )}
      {next ? (
        <Button variant="outline" className="gap-1.5" onClick={next}>
          {nextLabel}
          <ArrowRight className="size-4" />
        </Button>
      ) : null}
    </div>
  );
}

function SaveIndicator({ state, onRetry }: { state: "saved" | "pending" | "saving" | "error"; onRetry: () => void }) {
  if (state === "error") {
    return (
      <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs text-destructive" onClick={onRetry}>
        <CloudOff className="size-3.5" />
        Non enregistrés, réessayer
      </Button>
    );
  }
  return (
    <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
      {state === "saved" ? <Check className="size-3.5 text-emerald-500" /> : <Spinner className="size-3.5" aria-hidden />}
      {state === "saved" ? "Rangés avec l’export" : "Enregistrement…"}
    </span>
  );
}

// ─── Comptes ─────────────────────────────────────────────────────

function AccountsColumn({
  groups,
  checked,
  onToggle,
  quotas,
  onConnect,
  usableCount,
}: {
  groups: { connector: ConnectorInfo | null; label: string; logo: string; accounts: AccountSummary[] }[];
  checked: Set<string>;
  onToggle: (account: AccountSummary, on: boolean) => void;
  quotas: Record<string, QuotaInfo>;
  onConnect: () => void;
  usableCount: number;
}) {
  return (
    <section className="grid min-w-0 gap-4" aria-labelledby="publish-accounts">
      <div className="flex min-w-0 items-baseline justify-between gap-2">
        <h2 id="publish-accounts" className="text-sm font-semibold">
          Comptes
        </h2>
        <span className="text-xs text-muted-foreground tabular-nums">
          {checked.size}/{usableCount}
        </span>
      </div>
      {groups.map((group) => (
        <div key={group.label} className="grid min-w-0 gap-1.5">
          <p className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <ServiceLogo logo={group.logo} className="size-3.5" />
            <span className="min-w-0 truncate" title={group.label}>
              {group.label}
            </span>
          </p>
          <ul className="grid min-w-0 gap-1">
            {group.accounts.map((account) => {
              const disabled = account.status !== "connected";
              const isChecked = checked.has(account.id);
              const quota = quotas[account.id];
              return (
                <li key={account.id} className="min-w-0">
                  <label
                    className={cn(
                      "flex min-w-0 cursor-pointer items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/50",
                      disabled && "cursor-not-allowed hover:bg-transparent",
                      isChecked && "bg-muted/60"
                    )}
                  >
                    <Checkbox checked={isChecked} disabled={disabled} onCheckedChange={(value) => onToggle(account, value === true)} />
                    <AccountAvatar account={account} className={cn("size-8", disabled && "opacity-60")} />
                    <span className="grid min-w-0 flex-1">
                      <span className={cn("truncate text-sm font-medium", disabled && "text-muted-foreground")} title={account.displayName}>
                        {account.displayName}
                      </span>
                      <span className="flex min-w-0 items-center gap-2">
                        <AccountStatus account={account} className="min-w-0 text-muted-foreground" />
                        {quota ? (
                          <span className="min-w-0 truncate text-xs text-muted-foreground tabular-nums" title={`${quota.label} : ${quota.used.toLocaleString("fr-FR")} sur ${quota.limit.toLocaleString("fr-FR")}`}>
                            · {Math.max(0, quota.limit - quota.used).toLocaleString("fr-FR")} restants
                          </span>
                        ) : null}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      <Button variant="ghost" size="sm" className="justify-start gap-2 text-muted-foreground" onClick={onConnect}>
        <Plus className="size-4" />
        Connecter un autre compte
      </Button>
    </section>
  );
}

// ─── Réglages d'un compte ────────────────────────────────────────

function AccountSettings({
  review,
  values,
  onValue,
  onReload,
}: {
  review: AccountReview;
  values: Values;
  onValue: (key: string, value: Values[string]) => void;
  /** Relit chez le service les réglages d'un compte à formulaire lu à l'affichage. */
  onReload: () => void;
}) {
  const { account, connector, checks, blockers, cost, note, live } = review;
  const shown = visibleValues(review.fields, values);
  const fields = review.fields.filter((field) => isFieldVisible(field, shown));
  return (
    <AccordionItem value={account.id} className="min-w-0 rounded-lg border last:border-b">
      <AccordionTrigger className="min-w-0 items-center px-3 py-3 hover:no-underline">
        <span className="flex min-w-0 flex-1 items-center gap-3">
          <AccountAvatar account={account} withService className="size-7 text-xs" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium" title={account.displayName}>
            {account.displayName}
          </span>
          {blockers.length > 0 ? (
            <span className="inline-flex shrink-0 items-center gap-1 text-xs font-normal text-destructive">
              <CircleAlert className="size-3.5" />
              {blockers.length > 1 ? `${blockers.length} points` : "1 point"}
            </span>
          ) : (
            <span className="inline-flex shrink-0 items-center gap-1 text-xs font-normal text-emerald-700 dark:text-emerald-400">
              <CircleCheck className="size-3.5" />
              Prêt
            </span>
          )}
        </span>
      </AccordionTrigger>
      <AccordionContent className="grid min-w-0 gap-4 px-3">
        <CheckList lines={checks} note={note} />
        {live ? <LiveFormHeader live={live} connector={connector} onReload={onReload} /> : null}
        {fields.length > 0 ? (
          <div className="grid min-w-0 gap-4">
            {fields.map((field) => (
              <PublishFieldInput
                key={field.key}
                field={field}
                idPrefix={`publish-${account.id}`}
                value={values[field.key]}
                onChange={(value) => onValue(field.key, value)}
                textCount={connector.limits?.text?.count}
              />
            ))}
          </div>
        ) : null}
        {blockers.length > 0 ? (
          <ul className="grid min-w-0 gap-1" aria-label="Points à régler">
            {blockers.map((blocker) => (
              <li key={blocker} className="flex min-w-0 items-start gap-1.5 text-xs text-destructive">
                <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
                <span className="min-w-0 [overflow-wrap:anywhere]">{blocker}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {cost ? (
          <p className="text-xs text-muted-foreground">
            Coût estimé : {formatCost(cost.amount, cost.currency)}
            {cost.withLink ? ", surcoût d’une adresse compris" : ""} (tarif relevé le {new Date(cost.asOf).toLocaleDateString("fr-FR")}).
          </p>
        ) : null}
      </AccordionContent>
    </AccordionItem>
  );
}

/**
 * En-tête des réglages d'un compte dont le service se lit à l'affichage :
 * compte qui publiera (pseudo), remarques du service, ou lecture en cours.
 */
function LiveFormHeader({ live, connector, onReload }: { live: LiveForm; connector: ConnectorInfo; onReload: () => void }) {
  if (live.state === "loading") {
    return (
      <div className="grid min-w-0 gap-2" aria-busy>
        <Skeleton className="h-4 w-48 max-w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
    );
  }
  if (live.state === "error") {
    return (
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 text-xs text-destructive">
        <span className="min-w-0 [overflow-wrap:anywhere]">{live.error}</span>
        <Button type="button" variant="outline" size="sm" className="h-7 gap-1.5 px-2.5 text-xs" onClick={onReload}>
          <RotateCcw className="size-3.5" />
          Relire
        </Button>
      </div>
    );
  }
  const { identity, notices } = live.form;
  return (
    <div className="grid min-w-0 gap-2">
      {identity ? (
        <div className="flex min-w-0 items-center gap-2 text-sm">
          {identity.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- avatar d'un service tiers, adresse temporaire
            <img src={identity.avatarUrl} alt="" className="size-6 shrink-0 rounded-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <ServiceLogo logo={connector.logo} />
          )}
          <span className="min-w-0 truncate" title={identity.handle ? `${identity.name} (${identity.handle})` : identity.name}>
            Publié par <span className="font-medium">{identity.handle ?? identity.name}</span>
            {identity.handle && identity.name !== identity.handle ? <span className="text-muted-foreground"> · {identity.name}</span> : null}
          </span>
          <Button type="button" variant="ghost" size="sm" className="ml-auto h-7 shrink-0 gap-1.5 px-2 text-xs" onClick={onReload} title={`Relire le compte chez ${connector.label}`}>
            <RotateCcw className="size-3.5" />
            Relire
          </Button>
        </div>
      ) : null}
      {(notices ?? []).map((notice) => (
        <p key={notice} className="text-xs text-pretty text-muted-foreground [overflow-wrap:anywhere]">
          {notice}
        </p>
      ))}
    </div>
  );
}

// ─── Aperçu ──────────────────────────────────────────────────────

function ServicePreview({
  service,
  post,
  account,
  accounts,
  onAccount,
  videoUrl,
  coverUrl,
  ratio,
  schedule,
  privacy,
  canComment,
}: {
  service: ServiceTarget;
  post: ExportPost;
  account: AccountSummary | null;
  accounts: AccountSummary[];
  onAccount: (id: string) => void;
  videoUrl: string;
  coverUrl: string | null;
  ratio: number;
  schedule?: number;
  privacy?: string;
  canComment: boolean;
}) {
  const texts = textsOf(post, service.connector.id);
  const values = fieldValuesFor(service.fields, texts, service.rules);
  const valueOf = (role: string) => {
    const field = service.fields.find((item) => item.role === role);
    const value = field ? values[field.key] : undefined;
    return typeof value === "string" ? value : "";
  };
  const layout = previewLayout(service.connector, service.fields);
  const text = layout === "video" ? valueOf("description") || valueOf("caption") : valueOf("caption") || valueOf("description");
  const comment = service.connector.followUps?.comment || service.fields.some((field) => field.role === "firstComment") ? firstCommentFor(texts, service.rules) : "";
  return (
    <div className="grid min-w-0 gap-3">
      {accounts.length > 1 ? (
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor="preview-account" className="text-xs text-muted-foreground">
            Compte
          </Label>
          <Select value={account?.id} onValueChange={onAccount}>
            <SelectTrigger id="preview-account" size="sm" className="w-full min-w-0" title={account?.displayName}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-w-[min(32rem,calc(100vw-2rem))]">
              {accounts.map((item) => (
                <SelectItem key={item.id} value={item.id} className="*:[span]:last:min-w-0">
                  <span className="truncate" title={item.displayName}>
                    {item.displayName}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      <PostPreview
        connector={service.connector}
        account={account}
        layout={layout}
        title={valueOf("title")}
        text={text}
        firstComment={comment && canComment ? comment : undefined}
        videoUrl={videoUrl}
        coverUrl={coverUrl}
        ratio={ratio}
        schedule={schedule}
        privacy={privacy}
      />
      {comment && !canComment ? <p className="text-xs text-pretty text-muted-foreground">Le premier commentaire ne sera pas posé : ce compte n’a pas autorisé les commentaires.</p> : null}
    </div>
  );
}
