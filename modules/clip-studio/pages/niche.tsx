"use client";

/**
 * Niche (dossier 01 illustrations, étape S3) : les comptes de la niche
 * d'une marque, mesurés une fois par mois, et ce qui en sort.
 *
 * - Colonne de droite, les réglages : la marque, la lecture (publique par
 *   yt-dlp, sans compte, ou par un compte YouTube connecté), les premières
 *   paroles, le lancement avec ses étapes, son avancement et « Annuler » ;
 *   puis la liste des comptes de référence.
 * - Colonne principale, le résultat : les concepts qui marchent (nommés par
 *   Codex, chiffrés par la mesure, chacun avec ses meilleurs exemples), le
 *   tableau filtrable des vidéos qui sortent du lot (compte, vues, multiple
 *   de la médiane du compte, date, premières paroles), et l'état de chaque
 *   compte mesuré.
 *
 * L'assistant lit cette banque en écrivant un script : la visée nomme le
 * concept sur lequel il repose.
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { ArrowDown, ChartNoAxesColumn, Lightbulb, Plus, Search, Sparkles, Telescope, Trash2, TrendingUp, Users, X } from "lucide-react";
import { useSession } from "@/lib/auth-client";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { ActionStatus, FormStatus, errorMessage, useFeedback } from "@/components/feedback";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { StepTimeline, StepTimelineContent, StepTimelineDescription, StepTimelineIndicator, StepTimelineItem, StepTimelineTitle } from "@/components/ui/step-timeline";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Panel, PanelBody, PanelFooter, PanelHeader, PanelRows } from "@/components/connections/panel";
import { ScreenHeader } from "../components/screen-header";
import { BrandKitMark } from "../components/inspector";
import { callModule, useBrandKits } from "../lib/client";
import { conceptStatus, formatScore } from "../lib/idea-scoring";
import { BANK_LIMITS, STUDY_INTERVAL_MS, type ConceptBank, type IdeaTask, type NicheOutlier, type StudySourceKind } from "../lib/idea-types";
import type { IdeasBoard } from "../lib/idea-service";
import { DETAILS_TOTAL, MIN_BASELINE, OUTLIER_SCORE } from "../lib/niche-measure";

const DAY_MS = 24 * 60 * 60 * 1000;
const compact = new Intl.NumberFormat("fr-FR", { notation: "compact", maximumFractionDigits: 1 });
const formatViews = (views: number) => compact.format(views);
const formatDate = (iso: string | undefined) => {
  const date = iso ? new Date(iso) : null;
  return date && Number.isFinite(date.getTime()) ? date.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "";
};
const longDate = (at: number) => new Date(at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
const plural = (count: number, one: string, many = `${one}s`) => `${count.toLocaleString("fr-FR")} ${count > 1 ? many : one}`;

// ─── Page ────────────────────────────────────────────────────────

export default function NichePage() {
  const kits = useBrandKits();
  const params = useSearchParams();
  const router = useRouter();
  const wanted = params.get("kit");
  // La marque de l'adresse, sinon la marque par défaut ; « none » : sans marque.
  const kitId = kits === undefined ? undefined : wanted === "none" ? null : (kits?.find((kit) => kit.id === wanted)?.id ?? kits?.find((kit) => kit.isDefault)?.id ?? null);
  const kit = kits?.find((entry) => entry.id === kitId);
  const [board, setBoard] = useState<IdeasBoard | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | undefined>(undefined);
  const [task, setTask] = useState<IdeaTask | null>(null);
  const [conceptFilter, setConceptFilter] = useState<string>("all");
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";

  const load = useCallback(async () => {
    if (kitId === undefined) return null;
    const next = await callModule<IdeasBoard>("getIdeasBoard", { kitId, ...(accountId ? { accountId } : {}) });
    setBoard(next);
    setLoadError(null);
    return next;
  }, [kitId, accountId]);

  useEffect(() => {
    if (kitId === undefined) return;
    let alive = true;
    void callModule<IdeasBoard>("getIdeasBoard", { kitId, ...(accountId ? { accountId } : {}) })
      .then((next) => {
        if (!alive) return;
        setBoard(next);
        setLoadError(null);
        // Une étude déjà en cours (lancée d'un autre onglet) se suit ici aussi.
        const running = next.tasks.find((entry) => entry.kind === "study" && (entry.kitId ?? null) === kitId);
        if (running) setTask(running);
      })
      .catch((error) => alive && setLoadError(errorMessage(error, "La niche n’a pas pu être chargée. Rechargez la page dans un instant.")));
    return () => {
      alive = false;
    };
  }, [kitId, accountId]);

  // Suivi de l'étude en cours : ses étapes changent toutes les secondes ou presque.
  const running = task?.status === "running" ? task.id : null;
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(async () => {
      const next = await callModule<IdeaTask | null>("getIdeaTask", running).catch(() => null);
      if (!next) return;
      setTask(next);
      if (next.status !== "running") void load().catch(() => undefined);
    }, 1500);
    return () => clearInterval(timer);
  }, [running, load]);

  const chooseKit = (value: string) => {
    setBoard(null);
    setTask(null);
    setConceptFilter("all");
    router.replace(`/m/clip-studio/niche?kit=${encodeURIComponent(value)}`);
  };
  const bank = board && board.kitId === (kitId ?? null) ? board.bank : null;
  const replaceBank = useCallback((next: ConceptBank) => setBoard((current) => (current ? { ...current, bank: next } : current)), []);

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex min-w-0 flex-col gap-6">
        <ScreenHeader
          back={{ href: "/m/clip-studio/ideas", label: "Idées" }}
          icon={Telescope}
          title="Niche"
          description="Les vidéos qui sortent du lot chez les comptes de votre niche, rangées en concepts. L’assistant écrit ses scripts sur ces concepts."
          actions={
            <Button asChild variant="ghost" className="gap-2">
              <Link href="/m/clip-studio/ideas">
                <Lightbulb className="size-4" />
                Idées
              </Link>
            </Button>
          }
        />
        <FormStatus state={loadError ? { tone: "error", message: loadError, id: 0 } : null} />

        <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
          <div className="flex min-w-0 flex-col gap-6 xl:order-1">
            <ConceptsPanel bank={bank} onChanged={replaceBank} onShowVideos={setConceptFilter} />
            <OutliersPanel bank={bank} conceptFilter={conceptFilter} onConceptFilter={setConceptFilter} />
            <AccountsResults bank={bank} />
          </div>

          {/* Sans mesure, les réglages passent devant sur un écran étroit, c'est par eux que tout commence. */}
          <div className={cn("flex min-w-0 flex-col gap-6 xl:order-2", !bank?.study && "order-first")}>
            <MeasurePanel
              board={board && bank ? board : null}
              kits={kits}
              kitId={kitId}
              kitName={kit?.name}
              onKit={chooseKit}
              accountId={accountId ?? board?.accountId}
              onAccount={setAccountId}
              task={task && (task.kitId ?? null) === (kitId ?? null) ? task : null}
              onTask={setTask}
              isAdmin={isAdmin}
            />
            <ChannelsPanel board={board && bank ? board : null} task={task} isAdmin={isAdmin} onBank={replaceBank} />
          </div>
        </div>
      </div>
    </MotionConfig>
  );
}

// ─── Mesure ──────────────────────────────────────────────────────

function MeasurePanel({
  board,
  kits,
  kitId,
  kitName,
  onKit,
  accountId,
  onAccount,
  task,
  onTask,
  isAdmin,
}: {
  board: IdeasBoard | null;
  kits: ReturnType<typeof useBrandKits>;
  kitId: string | null | undefined;
  kitName?: string;
  onKit: (value: string) => void;
  accountId?: string;
  onAccount: (id: string) => void;
  task: IdeaTask | null;
  onTask: (task: IdeaTask) => void;
  isAdmin: boolean;
}) {
  const [source, setSource] = useState<StudySourceKind | null>(null);
  const [spoken, setSpoken] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const feedback = useFeedback({ successDuration: 8000 });
  const { success: notifySuccess, info: notifyInfo, error: notifyError } = feedback;
  const bank = board?.bank;
  const study = bank?.study;
  const accounts = board?.accounts ?? [];
  const publicAvailable = board?.publicReading.available ?? false;
  // Par défaut : le compte de la marque s'il y en a un (sa propre chaîne est mesurée aussi), sinon la lecture publique.
  const chosen: StudySourceKind = source ?? (accounts.some((entry) => entry.linked) || !publicAvailable ? "account" : "public");
  const active = bank?.channels.filter((channel) => channel.state === "active").length ?? 0;
  const runningTask = task?.status === "running" ? task : null;
  const now = Date.now();
  const days = study && !study.channels.every((stat) => stat.error) ? Math.floor((now - study.at) / DAY_MS) : null;
  const recent = days !== null && days * DAY_MS < STUDY_INTERVAL_MS;
  const ready = Boolean(board) && isAdmin && active > 0 && (chosen === "public" ? publicAvailable : Boolean(accountId));
  const estimate = board?.estimate;
  const reads = board?.publicReading.reads;

  // L'issue d'une étude s'écrit ici, sous le bouton qui l'a lancée.
  const [reported, setReported] = useState<string | null>(null);
  useEffect(() => {
    if (!task || task.status === "running" || reported === task.id) return;
    setReported(task.id);
    setCancelling(false);
    if (task.status === "done") notifySuccess(task.notes?.[0] ?? "Étude terminée.");
    else if (task.status === "canceled") notifyInfo("Étude annulée : la banque n’a pas changé.");
    else notifyError(task.error ?? "L’étude n’a pas abouti. Réessayez dans un instant.");
  }, [task, reported, notifySuccess, notifyInfo, notifyError]);

  const launch = async (force: boolean) => {
    feedback.clear();
    setConfirming(false);
    try {
      const started = await callModule<IdeaTask>("startNicheStudy", {
        kitId: kitId ?? null,
        ...(chosen === "public" ? { source: "public" } : { accountId }),
        spoken,
        ...(force ? { force: true } : {}),
      });
      onTask(started);
    } catch (error) {
      feedback.error(errorMessage(error, "L’étude n’a pas pu démarrer. Réessayez dans un instant."));
    }
  };

  const cancel = async () => {
    if (!runningTask) return;
    setCancelling(true);
    try {
      await callModule("cancelIdeaTask", runningTask.id);
    } catch (error) {
      setCancelling(false);
      feedback.error(errorMessage(error, "L’étude n’a pas pu être arrêtée. Réessayez."));
    }
  };

  const progress = runningTask?.progress;
  return (
    <Panel aria-labelledby="niche-measure">
      <PanelHeader icon={Telescope} titleId="niche-measure" title="Mesurer la niche" description={"Une fois par mois suffit : les signaux bougent lentement."} />
      <PanelRows>
        {kits?.length ? (
          <SettingRow label="Marque" htmlFor="niche-kit">
            <Select value={kitId === undefined ? "" : (kitId ?? "none")} onValueChange={onKit} disabled={Boolean(runningTask)}>
              <SelectTrigger id="niche-kit" className="w-52 max-w-full min-w-0">
                <SelectValue placeholder="Marque" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sans marque</SelectItem>
                {kits.map((entry) => (
                  <SelectItem key={entry.id} value={entry.id}>
                    <span className="flex min-w-0 items-center gap-2">
                      <BrandKitMark kit={entry} />
                      <span className="truncate">{entry.name}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingRow>
        ) : null}

        <div className="grid min-w-0 gap-2 px-4 py-3">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
            <span className="min-w-0 text-sm font-medium">Lecture</span>
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={chosen}
              onValueChange={(value) => value && setSource(value as StudySourceKind)}
              disabled={Boolean(runningTask)}
              aria-label="Façon de lire les comptes"
            >
              <ToggleGroupItem value="public" className="px-2 text-xs" disabled={!publicAvailable}>
                Publique
              </ToggleGroupItem>
              <ToggleGroupItem value="account" className="px-2 text-xs" disabled={accounts.length === 0}>
                Compte connecté
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
          {chosen === "account" && accounts.length > 0 ? (
            <Select value={accountId ?? ""} onValueChange={onAccount} disabled={Boolean(runningTask)}>
              <SelectTrigger className="w-full min-w-0" aria-label="Compte de lecture">
                <SelectValue placeholder="Choisir un compte" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((entry) => (
                  <SelectItem key={entry.id} value={entry.id}>
                    <span className="flex min-w-0 items-center gap-2">
                      <BrandLogo brand="youtube" />
                      <span className="truncate">{entry.name}</span>
                      {entry.linked ? <span className="shrink-0 text-xs text-muted-foreground">compte de la marque</span> : null}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          <p className="text-xs text-pretty text-muted-foreground">
            {chosen === "public"
              ? `yt-dlp lit les pages publiques de YouTube, sans compte ni quota : ${reads ? (reads.min === reads.max ? plural(reads.min, "lecture") : `de ${reads.min} à ${plural(reads.max, "lecture")}`) : "une lecture par compte"}, une à la fois, quatre secondes au moins entre deux. Vues arrondies par YouTube.`
              : accounts.length === 0
                ? "Aucun compte YouTube connecté : la lecture publique reste possible."
                : estimate
                  ? `API YouTube : environ ${estimate.min === estimate.max ? estimate.min : `${estimate.min} à ${estimate.max}`} unités de quota${estimate.remaining !== undefined ? `, sur ${estimate.remaining.toLocaleString("fr-FR")} restantes aujourd’hui` : ""}.${estimate.own ? " Votre chaîne est mesurée aussi." : ""}`
                  : "Choisissez le compte qui lit les chaînes."}
          </p>
        </div>

        <label className="flex min-w-0 items-start justify-between gap-3 px-4 py-3">
          <span className="min-w-0 text-sm font-medium">
            Premières paroles
            <span className="block text-xs font-normal text-pretty text-muted-foreground">
              Lit les sous-titres des vidéos qui sortent du lot ({DETAILS_TOTAL} au plus) pour garder leur accroche dite, pas seulement leur titre.
            </span>
          </span>
          <Switch checked={spoken && publicAvailable} onCheckedChange={setSpoken} disabled={!publicAvailable || Boolean(runningTask)} aria-label="Lire les premières paroles" />
        </label>

        <div className="grid min-w-0 gap-3 px-4 py-3">
          {study ? (
            <p className="text-xs text-pretty text-muted-foreground">
              Dernière mesure le {longDate(study.at)}
              {study.source === "public" ? " (lecture publique)" : " (compte connecté)"}
              {recent ? ` ; la prochaine est conseillée à partir du ${longDate(study.at + STUDY_INTERVAL_MS)}.` : "."}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">Aucune mesure pour {kitName ? `« ${kitName} »` : "cette banque"}.</p>
          )}

          {runningTask ? (
            <div className="grid min-w-0 gap-3" aria-live="polite">
              {progress ? (
                <div className="flex min-w-0 items-center gap-3">
                  <Progress value={progress.total ? (progress.done / progress.total) * 100 : 0} aria-label="Avancement de l'étude" className="min-w-0 flex-1" />
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {progress.done}&nbsp;/&nbsp;{progress.total}
                  </span>
                </div>
              ) : null}
              <StepTimeline>
                {(runningTask.steps ?? []).map((entry) => (
                  <StepTimelineItem key={entry.id} state={entry.state}>
                    <StepTimelineIndicator />
                    <StepTimelineContent>
                      <StepTimelineTitle state={entry.state}>{entry.label}</StepTimelineTitle>
                      {entry.detail ? <StepTimelineDescription>{entry.detail}</StepTimelineDescription> : null}
                    </StepTimelineContent>
                  </StepTimelineItem>
                ))}
              </StepTimeline>
            </div>
          ) : null}

          <FormStatus state={feedback.state} />
          {!isAdmin && board ? <p className="text-xs text-muted-foreground">Réservé aux administrateurs.</p> : null}

          {runningTask ? (
            <Button variant="outline" className="w-full gap-2" onClick={cancel} loading={cancelling}>
              <X className="size-4" />
              Annuler l&apos;étude
            </Button>
          ) : confirming ? (
            <div className="grid min-w-0 gap-2">
              <p className="text-sm text-pretty">
                Dernière mesure il y a {days === 0 ? "moins d’un jour" : plural(days ?? 0, "jour")}&nbsp;: les chiffres auront peu bougé.
              </p>
              <div className="grid min-w-0 grid-cols-[repeat(2,minmax(0,1fr))] gap-2">
                <Button variant="ghost" onClick={() => setConfirming(false)}>
                  Garder
                </Button>
                <Button onClick={() => launch(true)}>Mesurer quand même</Button>
              </div>
            </div>
          ) : (
            <Button className="w-full gap-2" disabled={!ready} onClick={() => (recent ? setConfirming(true) : launch(false))}>
              <Telescope className="size-4" />
              {study ? "Mesurer à nouveau" : "Mesurer la niche"}
            </Button>
          )}
          {board && active === 0 ? <p className="text-xs text-muted-foreground">Ajoutez d&apos;abord des comptes de référence, ci-dessous.</p> : null}
        </div>
      </PanelRows>
    </Panel>
  );
}

/** Une ligne de réglage : intitulé à gauche, contrôle à droite (dessous sur un écran étroit). */
function SettingRow({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-4 py-3">
      <label htmlFor={htmlFor} className="min-w-0 text-sm font-medium">
        {label}
      </label>
      <div className="flex max-w-full min-w-0 justify-end">{children}</div>
    </div>
  );
}

// ─── Comptes de référence ────────────────────────────────────────

function ChannelsPanel({ board, task, isAdmin, onBank }: { board: IdeasBoard | null; task: IdeaTask | null; isAdmin: boolean; onBank: (bank: ConceptBank) => void }) {
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);
  const [suggesting, setSuggesting] = useState<IdeaTask | null>(null);
  const feedback = useFeedback();
  const { success: notifySuccess, error: notifyError } = feedback;
  const kitId = board?.kitId ?? null;
  const bank = board?.bank;
  const active = bank?.channels.filter((channel) => channel.state === "active") ?? [];
  const pending = bank?.channels.filter((channel) => channel.state === "pending") ?? [];
  const studying = task?.status === "running";

  // Propositions de Codex : suivies ici, la liste se recharge à la fin.
  const suggestId = suggesting?.status === "running" ? suggesting.id : null;
  useEffect(() => {
    if (!suggestId) return;
    const timer = setInterval(async () => {
      const next = await callModule<IdeaTask | null>("getIdeaTask", suggestId).catch(() => null);
      if (!next || next.status === "running") return;
      setSuggesting(next);
      if (next.status === "error") notifyError(next.error ?? "Les propositions n’ont pas abouti.");
      else {
        notifySuccess(next.notes?.[0] ?? "Comptes proposés.");
        const fresh = await callModule<IdeasBoard>("getIdeasBoard", { kitId }).catch(() => null);
        if (fresh) onBank(fresh.bank);
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [suggestId, kitId, notifySuccess, notifyError, onBank]);

  const run = async (call: () => Promise<ConceptBank>) => {
    setBusy(true);
    feedback.clear();
    try {
      onBank(await call());
      return true;
    } catch (error) {
      feedback.error(errorMessage(error, "La liste des comptes n’a pas pu être modifiée. Réessayez."));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    if (!handle.trim()) return;
    if (await run(() => callModule<ConceptBank>("addReferenceChannel", { kitId, handle }))) setHandle("");
  };

  const suggest = async () => {
    feedback.clear();
    try {
      setSuggesting(await callModule<IdeaTask>("suggestReferenceChannels", { kitId, topic: "" }));
    } catch (error) {
      feedback.error(errorMessage(error, "Les propositions n’ont pas pu démarrer. Réessayez dans un instant."));
    }
  };

  return (
    <Panel aria-labelledby="niche-channels">
      <PanelHeader
        icon={Users}
        titleId="niche-channels"
        title={
          <>
            Comptes de référence <span className="font-normal text-muted-foreground tabular-nums">({active.length})</span>
          </>
        }
        description={`De 5 à ${BANK_LIMITS.studied} comptes : directs (même sujet), voisins et beaucoup plus gros. Les ${BANK_LIMITS.studied} premiers sont mesurés.`}
        actions={
          <Button variant="outline" size="sm" className="gap-1.5" onClick={suggest} loading={suggesting?.status === "running"} disabled={!isAdmin || !board}>
            <Sparkles className="size-4" />
            Proposer
          </Button>
        }
      />
      <PanelBody className="grid min-w-0 gap-3">
        <form
          className="flex min-w-0 gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void add();
          }}
        >
          <Input
            value={handle}
            onChange={(event) => {
              setHandle(event.target.value);
              if (feedback.state?.tone === "error") feedback.clear();
            }}
            placeholder="@chaine ou youtube.com/@…"
            className="min-w-0 flex-1"
            aria-label="Compte à ajouter"
            disabled={!board}
          />
          <Button type="submit" variant="secondary" className="shrink-0 gap-1.5" disabled={busy || !handle.trim() || !board}>
            <Plus className="size-4" />
            Ajouter
          </Button>
        </form>
        <FormStatus state={feedback.state} />
      </PanelBody>
      {board === null ? (
        <div className="grid gap-2 border-t p-4">
          <Skeleton className="h-9 rounded-lg" />
          <Skeleton className="h-9 rounded-lg" />
        </div>
      ) : active.length + pending.length === 0 ? (
        <p className="border-t px-4 py-3 text-xs text-muted-foreground">Aucun compte pour l&apos;instant.</p>
      ) : (
        <PanelRows className="border-t">
          <AnimatePresence initial={false}>
            {pending.map((channel) => (
              <motion.div key={channel.handle} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, height: 0 }} className="flex min-w-0 items-center gap-2 bg-primary/5 px-4 py-2 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium" title={channel.title ? `${channel.handle} · ${channel.title}` : channel.handle}>
                    {channel.handle}
                  </span>
                  <span className="block truncate text-xs text-foreground/70" title={channel.note}>
                    Proposé{channel.note ? ` · ${channel.note}` : ""}
                  </span>
                </span>
                <Button size="sm" variant="ghost" className="h-7 shrink-0 px-2 text-xs" disabled={busy} onClick={() => run(() => callModule<ConceptBank>("answerChannelSuggestion", { kitId, handle: channel.handle, accept: true }))}>
                  Valider
                </Button>
                <Button size="icon" variant="ghost" className="size-7 shrink-0" disabled={busy} aria-label={`Refuser ${channel.handle}`} onClick={() => run(() => callModule<ConceptBank>("answerChannelSuggestion", { kitId, handle: channel.handle, accept: false }))}>
                  <X className="size-4" />
                </Button>
              </motion.div>
            ))}
            {active.map((channel, index) => (
              <motion.div key={channel.handle} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, height: 0 }} className="flex min-w-0 items-center gap-2 px-4 py-2 text-sm">
                <BrandLogo brand="youtube" className="shrink-0" />
                <a
                  href={`https://www.youtube.com/@${encodeURIComponent(channel.handle.replace(/^@/, ""))}/shorts`}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="min-w-0 flex-1 truncate hover:underline"
                  title={channel.title ? `${channel.handle} · ${channel.title}` : channel.handle}
                >
                  {channel.handle}
                  {channel.title ? <span className="text-muted-foreground"> · {channel.title}</span> : null}
                </a>
                {index >= BANK_LIMITS.studied ? <span className="shrink-0 text-xs text-muted-foreground">non mesuré</span> : null}
                <Button size="icon" variant="ghost" className="size-7 shrink-0 text-muted-foreground" disabled={busy || studying} aria-label={`Retirer ${channel.handle}`} onClick={() => run(() => callModule<ConceptBank>("removeReferenceChannel", { kitId, handle: channel.handle }))}>
                  <Trash2 className="size-3.5" />
                </Button>
              </motion.div>
            ))}
          </AnimatePresence>
        </PanelRows>
      )}
    </Panel>
  );
}

// ─── Concepts ────────────────────────────────────────────────────

function ConceptsPanel({ bank, onChanged, onShowVideos }: { bank: ConceptBank | null; onChanged: (bank: ConceptBank) => void; onShowVideos: (conceptId: string) => void }) {
  const feedback = useFeedback();
  const [failed, setFailed] = useState<string | null>(null);
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const outlier of bank?.study?.outliers ?? []) if (outlier.conceptId) map.set(outlier.conceptId, (map.get(outlier.conceptId) ?? 0) + 1);
    return map;
  }, [bank]);
  const remove = async (conceptId: string) => {
    if (!bank) return;
    feedback.clear();
    setFailed(null);
    try {
      onChanged(await callModule<ConceptBank>("removeConcept", { kitId: bank.kitId === "none" ? null : bank.kitId, conceptId }));
    } catch (error) {
      setFailed(conceptId);
      feedback.error(errorMessage(error, "Ce concept n’a pas pu être retiré. Réessayez."));
    }
  };

  return (
    <Panel aria-labelledby="niche-concepts">
      <PanelHeader
        icon={TrendingUp}
        titleId="niche-concepts"
        title="Concepts qui marchent"
        description={"Des formes de sujet nommées par Codex à partir des vidéos qui sortent du lot ; les chiffres viennent de la mesure. Une recette a trois succès sur deux comptes au moins, un pari moins."}
      />
      {bank === null ? (
        <div className="grid gap-3 p-4">
          <Skeleton className="h-16 rounded-lg" />
          <Skeleton className="h-16 rounded-lg" />
        </div>
      ) : bank.concepts.length === 0 ? (
        <Empty className="py-10">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <TrendingUp />
            </EmptyMedia>
            <EmptyTitle>Aucun concept pour l&apos;instant</EmptyTitle>
            <EmptyDescription>Ajoutez des comptes de référence, puis «&nbsp;Mesurer la niche&nbsp;»&nbsp;: leurs vidéos qui sortent du lot sont rangées ici.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <PanelRows>
          <AnimatePresence initial={false}>
            {bank.concepts.map((concept) => {
              const recipe = conceptStatus(concept) === "recipe";
              const accounts = new Set(concept.proofs.map((proof) => proof.channel.toLowerCase())).size;
              const videos = counts.get(concept.id) ?? 0;
              return (
                <motion.div key={concept.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, height: 0 }} className="grid min-w-0 gap-3 px-4 py-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
                  <div className="flex min-w-0 items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium [overflow-wrap:anywhere]">{concept.name}</p>
                      <p className="text-xs text-muted-foreground">
                        <span className={cn("font-medium", recipe ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400")}>{recipe ? "Recette" : "Pari"}</span>
                        {" · "}
                        {plural(concept.proofs.length, "succès", "succès")}, {plural(accounts, "compte")} · {concept.rhythm === "news" ? "actualité" : "intemporel"}
                      </p>
                      {concept.mold.hook ? <p className="mt-1 text-xs text-pretty text-muted-foreground [overflow-wrap:anywhere]">Forme&nbsp;: {concept.mold.hook}</p> : null}
                      {videos > 0 ? (
                        <button type="button" className="mt-1 text-xs font-medium text-primary hover:underline" onClick={() => onShowVideos(concept.id)}>
                          Voir ses {plural(videos, "vidéo")}
                        </button>
                      ) : null}
                      <ActionStatus state={failed === concept.id ? feedback.state : null} className="max-w-full empty:hidden" />
                    </div>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-7 shrink-0 text-muted-foreground lg:hidden" onClick={() => remove(concept.id)} aria-label="Retirer ce concept">
                          <Trash2 className="size-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Retirer de la banque</TooltipContent>
                    </Tooltip>
                  </div>
                  <div className="flex min-w-0 items-start gap-2">
                    <ul className="grid min-w-0 flex-1 gap-1.5">
                      {[...concept.proofs]
                        .sort((a, b) => b.score - a.score)
                        .slice(0, 3)
                        .map((proof) => (
                          <li key={proof.videoId} className="flex min-w-0 items-baseline gap-2 text-xs">
                            <span className="w-12 shrink-0 text-right font-semibold tabular-nums">{formatScore(proof.score)}</span>
                            <a href={proof.url} target="_blank" rel="noopener noreferrer nofollow" className="min-w-0 flex-1 truncate hover:underline" title={`${proof.title} (${proof.channel}, ${formatViews(proof.views)} vues)`}>
                              <span className="text-muted-foreground">{proof.channel} · </span>
                              {proof.title}
                            </a>
                          </li>
                        ))}
                    </ul>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="hidden size-7 shrink-0 text-muted-foreground lg:inline-flex" onClick={() => remove(concept.id)} aria-label="Retirer ce concept">
                          <Trash2 className="size-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Retirer de la banque</TooltipContent>
                    </Tooltip>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </PanelRows>
      )}
    </Panel>
  );
}

// ─── Vidéos qui sortent du lot ───────────────────────────────────

type SortKey = "score" | "views" | "date";
const MULTIPLES = [2, 3, 5] as const;

function OutliersPanel({ bank, conceptFilter, onConceptFilter }: { bank: ConceptBank | null; conceptFilter: string; onConceptFilter: (value: string) => void }) {
  const [query, setQuery] = useState("");
  const [account, setAccount] = useState("all");
  const [minimum, setMinimum] = useState<string>(String(OUTLIER_SCORE));
  const [sort, setSort] = useState<SortKey>("score");
  const outliers = useMemo(() => bank?.study?.outliers ?? [], [bank]);
  const concepts = useMemo(() => new Map((bank?.concepts ?? []).map((concept) => [concept.id, concept.name])), [bank]);
  const accounts = useMemo(() => [...new Set(outliers.map((outlier) => outlier.channel))].sort((a, b) => a.localeCompare(b, "fr")), [outliers]);

  const shown = useMemo(() => {
    const words = query.trim().toLocaleLowerCase("fr");
    const floor = Number(minimum) || OUTLIER_SCORE;
    const time = (outlier: NicheOutlier) => (outlier.publishedAt ? Date.parse(outlier.publishedAt) || 0 : 0);
    return outliers
      .filter((outlier) => outlier.score >= floor)
      .filter((outlier) => account === "all" || outlier.channel === account)
      .filter((outlier) => (conceptFilter === "all" ? true : conceptFilter === "none" ? !outlier.conceptId : outlier.conceptId === conceptFilter))
      .filter((outlier) => !words || `${outlier.title} ${outlier.spoken ?? ""}`.toLocaleLowerCase("fr").includes(words))
      .sort((a, b) => (sort === "views" ? b.views - a.views : sort === "date" ? time(b) - time(a) : b.score - a.score));
  }, [outliers, query, account, minimum, conceptFilter, sort]);

  const filtered = query || account !== "all" || conceptFilter !== "all" || minimum !== String(OUTLIER_SCORE);
  const reset = () => {
    setQuery("");
    setAccount("all");
    setMinimum(String(OUTLIER_SCORE));
    onConceptFilter("all");
  };

  // La flèche du tri n'apparaît que sur la colonne triée, du côté opposé à l'alignement : l'intitulé reste au ras des valeurs.
  const header = (key: SortKey, label: string, className?: string, align: "start" | "end" = "start") => {
    const arrow = sort === key ? <ArrowDown className="size-3 shrink-0" aria-hidden /> : null;
    return (
      <th scope="col" className={cn("px-2 py-2 font-medium", align === "end" && "text-right", className)} aria-sort={sort === key ? "descending" : "none"}>
        <button type="button" onClick={() => setSort(key)} className={cn("inline-flex items-center gap-1 hover:text-foreground", sort === key && "text-foreground")}>
          {align === "end" ? arrow : null}
          {label}
          {align === "start" ? arrow : null}
        </button>
      </th>
    );
  };

  return (
    <Panel aria-labelledby="niche-outliers">
      <PanelHeader
        icon={ChartNoAxesColumn}
        titleId="niche-outliers"
        title="Vidéos qui sortent du lot"
        description={`Chaque vidéo comparée à la médiane de son propre compte : ${OUTLIER_SCORE} × ou plus, sur un compte qui a assez d’historique.`}
      />
      {bank === null ? (
        <div className="grid gap-2 p-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-10 rounded-lg" />
          ))}
        </div>
      ) : outliers.length === 0 ? (
        <Empty className="py-10">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ChartNoAxesColumn />
            </EmptyMedia>
            <EmptyTitle>{bank.study ? "Aucune vidéo au-dessus de sa médiane" : "Pas encore de mesure"}</EmptyTitle>
            <EmptyDescription>
              {bank.study
                ? `La dernière mesure n’a trouvé aucune vidéo à ${OUTLIER_SCORE} × la médiane de son compte, ou elle date d’avant ce tableau.`
                : "La mesure lit les 30 dernières vidéos courtes de chaque compte et garde celles qui ont fait bien mieux que d’habitude."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <div className="flex min-w-0 flex-wrap items-center gap-2 border-b px-4 py-3">
            <div className="relative min-w-0 flex-1 basis-48">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Titre ou premières paroles" className="min-w-0 pl-8" aria-label="Chercher dans les vidéos" />
            </div>
            <Select value={account} onValueChange={setAccount}>
              <SelectTrigger className="w-44 max-w-full min-w-0" aria-label="Compte">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les comptes</SelectItem>
                {accounts.map((entry) => (
                  <SelectItem key={entry} value={entry}>
                    <span className="truncate">{entry}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={conceptFilter} onValueChange={onConceptFilter}>
              <SelectTrigger className="w-44 max-w-full min-w-0" aria-label="Concept">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les concepts</SelectItem>
                <SelectItem value="none">Sans concept</SelectItem>
                {[...concepts.entries()].map(([id, name]) => (
                  <SelectItem key={id} value={id}>
                    <span className="block max-w-64 truncate">{name}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <ToggleGroup type="single" variant="outline" size="sm" value={minimum} onValueChange={(value) => value && setMinimum(value)} aria-label="Multiple minimal">
              {MULTIPLES.map((value) => (
                <ToggleGroupItem key={value} value={String(value)} className="px-2 text-xs tabular-nums">
                  ≥&nbsp;{value}&nbsp;×
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

          {shown.length === 0 ? (
            <div className="flex min-w-0 flex-col items-center gap-2 px-4 py-8 text-center text-sm text-muted-foreground">
              Aucune vidéo ne correspond à ces filtres.
              <Button variant="ghost" size="sm" onClick={reset}>
                Retirer les filtres
              </Button>
            </div>
          ) : (
            <table className="w-full table-fixed text-sm">
              <thead className="border-b text-left text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-2 font-medium">
                    Vidéo
                  </th>
                  <th scope="col" className="hidden w-36 px-2 py-2 font-medium sm:table-cell">
                    Compte
                  </th>
                  {header("views", "Vues", "hidden w-20 sm:table-cell", "end")}
                  {header("score", "Multiple", "w-24 pr-4 md:pr-2", "end")}
                  {header("date", "Date", "hidden w-28 pr-4 md:table-cell")}
                </tr>
              </thead>
              <tbody className="divide-y">
                {shown.map((outlier) => (
                  <tr key={outlier.videoId} className="align-top">
                    <td className="min-w-0 px-4 py-2.5">
                      <a href={outlier.url} target="_blank" rel="noopener noreferrer nofollow" className="block truncate font-medium hover:underline" title={outlier.title}>
                        {outlier.title}
                      </a>
                      {outlier.spoken ? (
                        <p className="truncate text-xs text-muted-foreground" title={outlier.spoken}>
                          «&nbsp;{outlier.spoken}&nbsp;»
                        </p>
                      ) : null}
                      <p className="truncate text-xs text-muted-foreground sm:hidden" title={outlier.channel}>
                        {outlier.channel} · {formatViews(outlier.views)} vues{outlier.publishedAt ? ` · ${formatDate(outlier.publishedAt)}` : ""}
                      </p>
                      {outlier.conceptId && concepts.get(outlier.conceptId) ? (
                        <button type="button" className="block max-w-full truncate text-left text-xs text-primary hover:underline" title={concepts.get(outlier.conceptId)} onClick={() => onConceptFilter(outlier.conceptId as string)}>
                          {concepts.get(outlier.conceptId)}
                        </button>
                      ) : null}
                    </td>
                    <td className="hidden px-2 py-2.5 sm:table-cell">
                      <span className="block truncate" title={outlier.channel}>
                        {outlier.channel}
                      </span>
                      {outlier.own ? <span className="text-xs text-muted-foreground">votre chaîne</span> : null}
                    </td>
                    <td className="hidden px-2 py-2.5 text-right tabular-nums sm:table-cell" title={`${outlier.views.toLocaleString("fr-FR")} vues, médiane du compte ${outlier.median.toLocaleString("fr-FR")}`}>
                      {formatViews(outlier.views)}
                    </td>
                    <td className="py-2.5 pr-4 pl-2 text-right md:pr-2">
                      <span className="font-semibold tabular-nums">{formatScore(outlier.score)}</span>
                      {outlier.young ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="block cursor-help text-xs text-muted-foreground">provisoire</span>
                          </TooltipTrigger>
                          <TooltipContent>Une des trois plus récentes du compte&nbsp;: ses vues grimpent encore.</TooltipContent>
                        </Tooltip>
                      ) : null}
                    </td>
                    <td className="hidden py-2.5 pr-4 pl-2 text-xs whitespace-nowrap text-muted-foreground md:table-cell">{formatDate(outlier.publishedAt) || "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <PanelFooter>
            <span className="tabular-nums">
              {shown.length === outliers.length ? plural(outliers.length, "vidéo") : `${shown.length.toLocaleString("fr-FR")} sur ${plural(outliers.length, "vidéo")}`}
            </span>
            <span className="min-w-0 basis-full text-pretty sm:basis-auto">
              Multiple&nbsp;: vues ÷ médiane des 12 vidéos qui suivent les 3 plus récentes du compte, {MIN_BASELINE} au moins. Un succès peut venir d’autre chose que le sujet (tendance, collaboration, publicité).
            </span>
            {filtered && shown.length > 0 ? (
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={reset}>
                Retirer les filtres
              </Button>
            ) : null}
          </PanelFooter>
        </>
      )}
    </Panel>
  );
}

// ─── Comptes mesurés ─────────────────────────────────────────────

function AccountsResults({ bank }: { bank: ConceptBank | null }) {
  const study = bank?.study;
  if (!study || study.channels.length === 0) return null;
  const counts = new Map<string, number>();
  for (const outlier of study.outliers ?? []) counts.set(outlier.channel.toLowerCase(), (counts.get(outlier.channel.toLowerCase()) ?? 0) + 1);
  const rows = [...study.channels, ...(study.own ? [study.own] : [])];
  return (
    <Panel aria-labelledby="niche-accounts">
      <PanelHeader icon={Users} titleId="niche-accounts" title="Comptes mesurés" description={`Mesure du ${longDate(study.at)}.`} />
      <table className="w-full table-fixed text-sm">
        <thead className="border-b text-left text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="px-4 py-2 font-medium">
              Compte
            </th>
            <th scope="col" className="hidden w-24 px-2 py-2 text-right font-medium sm:table-cell">
              Vidéos lues
            </th>
            <th scope="col" className="w-28 px-2 py-2 pr-4 text-right font-medium sm:pr-2">
              Médiane
            </th>
            <th scope="col" className="hidden w-28 px-2 py-2 pr-4 text-right font-medium sm:table-cell">
              Au-dessus
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((stat) => (
            <tr key={stat.handle} className="align-top">
              <td className="min-w-0 px-4 py-2.5">
                <span className="block truncate" title={stat.title ? `${stat.handle} · ${stat.title}` : stat.handle}>
                  {stat.handle}
                  {stat.title && stat.title !== stat.handle ? <span className="text-muted-foreground"> · {stat.title}</span> : null}
                </span>
                {stat.error ? (
                  <p className="text-xs text-pretty text-destructive [overflow-wrap:anywhere]">{stat.error}</p>
                ) : stat.small ? (
                  <p className="text-xs text-muted-foreground">Moins de 15 vidéos courtes&nbsp;: médiane fragile</p>
                ) : null}
              </td>
              <td className="hidden px-2 py-2.5 text-right tabular-nums sm:table-cell">{stat.error ? "–" : stat.shorts}</td>
              <td className="px-2 py-2.5 pr-4 text-right tabular-nums sm:pr-2">{stat.median === null ? "–" : `${formatViews(stat.median)} vues`}</td>
              <td className="hidden px-2 py-2.5 pr-4 text-right tabular-nums sm:table-cell">{stat.error ? "–" : (counts.get(stat.handle.toLowerCase()) ?? 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {study.notes.length ? (
        <PanelFooter className="grid gap-1">
          {study.notes.map((note, index) => (
            <span key={index} className="[overflow-wrap:anywhere]">
              {note}
            </span>
          ))}
        </PanelFooter>
      ) : null}
    </Panel>
  );
}
