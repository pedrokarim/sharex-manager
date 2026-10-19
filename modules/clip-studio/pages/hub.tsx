"use client";

/**
 * Accueil de Clip Studio : un tableau de bord, pas une liste.
 *
 * - « Reprendre » : les derniers projets modifiés, en vignettes rendues.
 * - « Derniers exports » : deux rangées de clips rendus, avec les services
 *   où chacun a été publié (administrateurs).
 * - « Activité » : exports et publications des trente derniers jours, puis
 *   les publications par service.
 * - « Meilleures publications » : d'après les statistiques déjà lues chez
 *   les services (administrateurs) ; les lire est un geste.
 *
 * L'accueil garde aussi les arrivées d'ailleurs : « Créer un clip avec la
 * sélection » de la galerie, « Créer cette vidéo » de l'écran Idées, et
 * l'ancienne adresse de publication (`?publish=`).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Activity, ArrowRight, BarChart3, Clapperboard, FileVideo, History, Lightbulb, Plus, RefreshCw, Scissors, Send, Sparkles, TrendingUp } from "lucide-react";
import logo from "../branding/logo-96.png";
import { ActionStatus, errorMessage, useFeedback } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Panel, PanelBody, PanelFooter, PanelHeader, PanelRows } from "@/components/connections/panel";
import { ServiceLogo } from "@/components/connections/shared";
import { useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import type { ClipExport } from "../engine/types";
import { callModule, getPublicationsOverview, getStudioOverview, useBrandKits, type BrandKitChoice, type PublicationsOverview, type StudioOverview } from "../lib/client";
import type { AssistantJob } from "../lib/assistant";
import { AssistantProgress, CreateDialog } from "../components/create-dialog";
import type { CreatePrefill } from "../lib/idea-prefill";
import { legacyCreateHref } from "../lib/create-mode";
import { exportHref, publishHref } from "../components/export-card";
import { ProjectFrame } from "../components/project-thumbnail";
import { AspectChip, BrandName, ChannelLogos, ExportPoster, formatClock, formatCount, formatRelative, formatShortDate } from "../components/library-ui";
import { EXPORT_STATUS_LABELS, activity, dayKey, exportTitle, type ExportPublications, type ProjectSummary } from "../lib/library";

/** Données gardées entre deux visites : le retour à l'accueil est instantané. */
let snapshot: { overview: StudioOverview; publications: PublicationsOverview | null } | null = null;

/** Arrivée de la galerie ou de l'écran Idées : la fenêtre de création, préremplie. */
type CreateRequest = { files: string[]; prefill?: CreatePrefill };

const NEW_CLIP_HREF = "/m/clip-studio/new";
/** « Importer une vidéo » : la création, ouverte sur « Découper ». */
const IMPORT_VIDEO_HREF = "/m/clip-studio/new?mode=clipping";

export default function HubPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";
  const kits = useBrandKits();
  const [data, setData] = useState<StudioOverview | null>(snapshot?.overview ?? null);
  const [publications, setPublications] = useState<PublicationsOverview | null>(snapshot?.publications ?? null);
  const [failed, setFailed] = useState<string | null>(null);
  const [creating, setCreating] = useState<CreateRequest | null>(null);
  const [assistantJobs, setAssistantJobs] = useState<AssistantJob[]>([]);

  const refresh = useCallback(async () => {
    try {
      const next = await getStudioOverview();
      setData(next);
      setFailed(null);
      snapshot = { overview: next, publications: snapshot?.publications ?? null };
      return next;
    } catch (error) {
      setFailed(errorMessage(error, "L’accueil n’a pas pu être chargé."));
      return null;
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const exportIds = useMemo(() => (data?.recentExports ?? []).map((entry) => entry.id).join(","), [data]);
  const loadPublications = useCallback(
    async (readStats = false) => {
      const next = await getPublicationsOverview({ exportIds: exportIds ? exportIds.split(",") : [], readStats });
      setPublications(next);
      if (snapshot) snapshot = { ...snapshot, publications: next };
      return next;
    },
    [exportIds]
  );
  useEffect(() => {
    if (!isAdmin || !data) return;
    void loadPublications().catch(() => undefined);
  }, [isAdmin, data, loadPublications]);

  // ─── Créations en cours ───────────────────────────────────────
  const refreshJobs = useCallback(async () => {
    const jobs = await callModule<AssistantJob[]>("listAssistantJobs").catch(() => []);
    // Les créations en cours et les échecs récents (moins d'une heure).
    setAssistantJobs(jobs.filter((job) => job.status === "running" || (job.status === "error" && Date.now() - job.createdAt < 3_600_000)));
    return jobs;
  }, []);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    let wasRunning = false;
    const tick = async () => {
      const jobs = await refreshJobs();
      if (stopped) return;
      const running = jobs.some((job) => job.status === "running");
      // Une création vient de se terminer : son projet apparaît dans « Reprendre ».
      if (wasRunning && !running) void refresh();
      wasRunning = running;
      timer = setTimeout(tick, running ? 2000 : 15000);
    };
    void tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [refreshJobs, refresh]);

  // Ancienne adresse de publication (`?publish=<id>`) : on passe à l'écran Publier, avec les paramètres du retour.
  useEffect(() => {
    const id = params.get("publish");
    if (!id) return;
    const rest = new URLSearchParams(params.toString());
    rest.delete("publish");
    const suffix = rest.toString();
    router.replace(`${publishHref(id)}${suffix ? `&${suffix}` : ""}`, { scroll: false });
  }, [params, router]);

  // Arrivée depuis la galerie (« Créer un clip avec la sélection ») ou l'écran Idées (assistant prérempli).
  // La création a sa page (`/m/clip-studio/new`) : l'ancienne adresse y renvoie, paramètres compris.
  useEffect(() => {
    const target = legacyCreateHref(params);
    if (target) router.replace(target, { scroll: false });
  }, [params, router]);

  const empty = data !== null && data.projectCount === 0 && data.exportCount === 0;

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex min-h-full shrink-0 flex-col gap-6">
        <header className="flex min-w-0 flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="flex min-w-0 flex-1 basis-72 items-center gap-3">
            <Image src={logo} alt="" width={44} height={44} className="size-11 shrink-0" />
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight">Clip Studio</h1>
              <p className="text-sm text-pretty text-muted-foreground">Montez des clips à partir de vos images, vidéos et sons, exportez-les en MP4 et publiez-les sur vos comptes.</p>
            </div>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Button asChild variant="ghost" className="gap-2">
              <Link href="/m/clip-studio/ideas">
                <Lightbulb className="size-4" />
                Idées
              </Link>
            </Button>
            <Button asChild variant="outline" className="gap-2">
              <Link href={IMPORT_VIDEO_HREF}>
                <Scissors className="size-4" />
                Importer une vidéo
              </Link>
            </Button>
            <Button asChild className="gap-2">
              <Link href={NEW_CLIP_HREF}>
                <Plus className="size-4" />
                Nouveau clip
              </Link>
            </Button>
          </div>
        </header>

        {failed && !data ? (
          <Empty className="border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Clapperboard />
              </EmptyMedia>
              <EmptyTitle>Accueil indisponible</EmptyTitle>
              <EmptyDescription>{failed}</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button variant="outline" className="gap-2" onClick={() => void refresh()}>
                <RefreshCw className="size-4" />
                Réessayer
              </Button>
            </EmptyContent>
          </Empty>
        ) : null}

        <AnimatePresence initial={false}>
          {assistantJobs.length > 0 ? (
            <motion.div key="assistant" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <Panel>
                <PanelHeader icon={Sparkles} title="En cours de création" description="L’assistant monte ces clips ; chacun s’ouvrira dans « Reprendre » une fois prêt." />
                <PanelRows>
                  {assistantJobs.map((job) => (
                    <motion.div key={job.id} layout className="p-4">
                      <AssistantProgress
                        job={job}
                        onCancel={async () => {
                          await callModule("cancelAssistant", job.id);
                          void refreshJobs();
                        }}
                      />
                    </motion.div>
                  ))}
                </PanelRows>
              </Panel>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {failed && data ? <ActionStatus state={{ tone: "error", message: failed, id: 0 }} /> : null}

        <ResumePanel data={data} kits={kits ?? []} empty={empty} />

        <ExportsPanel data={data} publications={isAdmin ? publications : null} isAdmin={isAdmin} />

        {data && data.exportCount > 0 ? (
          <div className={cn("grid min-w-0 gap-6", isAdmin && "xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]")}>
            <ActivityPanel data={data} publications={isAdmin ? publications : null} isAdmin={isAdmin} />
            {isAdmin ? <TopPanel publications={publications} onRead={() => loadPublications(true)} /> : null}
          </div>
        ) : null}
      </div>

      <CreateDialog
        request={creating}
        onClose={() => setCreating(null)}
        onCreated={(id) => router.push(`/m/clip-studio/edit?id=${id}`)}
        onAssistantStarted={() => void refreshJobs()}
      />
    </MotionConfig>
  );
}

// ─── Reprendre ───────────────────────────────────────────────────

/** Cartes au-delà de la première rangée, masquées sur les écrans étroits. */
const RESUME_HIDE = ["", "", "", "", "hidden sm:block", "hidden sm:block"];

function ResumePanel({ data, kits, empty }: { data: StudioOverview | null; kits: BrandKitChoice[]; empty: boolean }) {
  const total = data?.projectCount ?? 0;
  return (
    <Panel aria-labelledby="hub-resume">
      <PanelHeader
        icon={History}
        titleId="hub-resume"
        title="Reprendre"
        description="Les derniers projets modifiés, là où vous les avez laissés."
        actions={
          total > 0 ? (
            <Button asChild variant="ghost" size="sm" className="gap-1.5">
              <Link href="/m/clip-studio/projects">
                Tous les projets
                <span className="text-muted-foreground tabular-nums">{total.toLocaleString("fr-FR")}</span>
                <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          ) : null
        }
      />
      <PanelBody>
        {data === null ? (
          <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-4 sm:grid-cols-[repeat(3,minmax(0,1fr))] xl:grid-cols-[repeat(6,minmax(0,1fr))]" aria-busy>
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className={cn("grid gap-2", RESUME_HIDE[index])}>
                <Skeleton className="aspect-video w-full rounded-lg" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))}
          </div>
        ) : data.recentProjects.length === 0 ? (
          <Empty className="py-8">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Clapperboard />
              </EmptyMedia>
              <EmptyTitle>{empty ? "Votre premier clip" : "Aucun projet"}</EmptyTitle>
              <EmptyDescription>
                Laissez l’assistant monter un short, partez d’un modèle, ou importez une vidéo à sous-titrer ou à découper. Depuis la galerie, sélectionnez des images puis clic droit, «&nbsp;Créer un clip avec la sélection&nbsp;».
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent className="flex-row flex-wrap justify-center">
              <Button asChild className="gap-2">
                <Link href={NEW_CLIP_HREF}>
                  <Plus className="size-4" />
                  Nouveau clip
                </Link>
              </Button>
              <Button asChild variant="outline" className="gap-2">
                <Link href={IMPORT_VIDEO_HREF}>
                  <Scissors className="size-4" />
                  Importer une vidéo
                </Link>
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-4 sm:grid-cols-[repeat(3,minmax(0,1fr))] xl:grid-cols-[repeat(6,minmax(0,1fr))]">
            {data.recentProjects.map((project, index) => (
              <motion.div key={project.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.03 }} className={cn("min-w-0", RESUME_HIDE[index])}>
                <ResumeCard project={project} kit={kits.find((kit) => kit.id === project.brandKitId)} />
              </motion.div>
            ))}
          </div>
        )}
      </PanelBody>
    </Panel>
  );
}

function ResumeCard({ project, kit }: { project: ProjectSummary; kit?: BrandKitChoice }) {
  const href = `/m/clip-studio/edit?id=${encodeURIComponent(project.id)}`;
  return (
    <Link href={href} className="group grid min-w-0 gap-1.5 rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" aria-label={`Reprendre ${project.name}`}>
      <ProjectFrame project={project}>
        <AspectChip width={project.width} height={project.height} className="absolute top-1.5 left-1.5" />
        <span className="absolute right-1.5 bottom-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white tabular-nums">{formatClock(project.durationFrames / Math.max(1, project.fps))}</span>
      </ProjectFrame>
      <span className="truncate px-0.5 text-sm font-medium group-hover:underline" title={project.name}>
        {project.name}
      </span>
      <span className="flex min-w-0 items-center gap-1.5 px-0.5 text-[11px] text-muted-foreground">
        {project.brandKitId ? <BrandName id={project.brandKitId} kit={kit} compact /> : null}
        <span className="min-w-0 truncate">modifié {formatRelative(project.updatedAt)}</span>
      </span>
    </Link>
  );
}

// ─── Derniers exports ────────────────────────────────────────────

/** Deux rangées quelle que soit la largeur : 2, 3, 4 puis 6 colonnes. */
const EXPORT_HIDE = (index: number) => (index >= 8 ? "hidden xl:block" : index >= 6 ? "hidden lg:block" : index >= 4 ? "hidden sm:block" : "");

function ExportsPanel({ data, publications, isAdmin }: { data: StudioOverview | null; publications: PublicationsOverview | null; isAdmin: boolean }) {
  const total = data?.exportCount ?? 0;
  return (
    <Panel aria-labelledby="hub-exports">
      <PanelHeader
        icon={FileVideo}
        titleId="hub-exports"
        title="Derniers exports"
        description={isAdmin ? "Les clips rendus, et les comptes où chacun a été publié." : "Les clips rendus, prêts à télécharger ou à envoyer dans la galerie."}
        actions={
          total > 0 ? (
            <Button asChild variant="ghost" size="sm" className="gap-1.5">
              <Link href="/m/clip-studio/exports">
                Tous les exports
                <span className="text-muted-foreground tabular-nums">{total.toLocaleString("fr-FR")}</span>
                <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          ) : null
        }
      />
      <PanelBody>
        {data === null ? (
          <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-4 sm:grid-cols-[repeat(3,minmax(0,1fr))] lg:grid-cols-[repeat(4,minmax(0,1fr))] xl:grid-cols-[repeat(6,minmax(0,1fr))]" aria-busy>
            {Array.from({ length: 12 }, (_, index) => (
              <div key={index} className={cn("grid gap-2", EXPORT_HIDE(index))}>
                <Skeleton className="aspect-video w-full rounded-lg" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))}
          </div>
        ) : data.recentExports.length === 0 ? (
          <Empty className="py-6">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FileVideo />
              </EmptyMedia>
              <EmptyTitle>Aucun export</EmptyTitle>
              <EmptyDescription>Ouvrez un projet puis «&nbsp;Exporter&nbsp;» : le clip rendu arrive ici, prêt à publier.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-4 sm:grid-cols-[repeat(3,minmax(0,1fr))] lg:grid-cols-[repeat(4,minmax(0,1fr))] xl:grid-cols-[repeat(6,minmax(0,1fr))]">
            {data.recentExports.map((entry, index) => (
              <motion.div key={entry.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.02 }} className={cn("min-w-0", EXPORT_HIDE(index))}>
                <ExportTile entry={entry} state={publications?.byExport[entry.id]} publications={publications} isAdmin={isAdmin} />
              </motion.div>
            ))}
          </div>
        )}
      </PanelBody>
    </Panel>
  );
}

const STATUS_TONE: Record<string, string> = {
  failed: "text-destructive",
  pending: "text-amber-700 dark:text-amber-400",
  scheduled: "text-primary",
  none: "text-muted-foreground",
};

function ExportTile({ entry, state, publications, isAdmin }: { entry: ClipExport; state?: ExportPublications; publications: PublicationsOverview | null; isAdmin: boolean }) {
  const title = exportTitle(entry);
  return (
    <div className="group grid min-w-0 gap-1.5">
      <Link href={exportHref(entry.id)} className="relative block aspect-video w-full overflow-hidden rounded-lg bg-black focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" aria-label={`Ouvrir la fiche de ${title}`}>
        <ExportPoster entry={entry} />
        <AspectChip width={entry.width} height={entry.height} className="absolute top-1.5 left-1.5" />
        <span className="absolute right-1.5 bottom-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white tabular-nums">{formatClock(entry.durationMs / 1000)}</span>
      </Link>
      <Link href={exportHref(entry.id)} className="truncate px-0.5 text-sm font-medium hover:underline" title={title}>
        {title}
      </Link>
      <div className="flex min-h-5 min-w-0 items-center justify-between gap-2 px-0.5 text-[11px] text-muted-foreground">
        <span className="shrink-0 whitespace-nowrap tabular-nums">{formatShortDate(entry.createdAt)}</span>
        {isAdmin ? (
          state === undefined ? (
            <Skeleton className="h-4 w-12" />
          ) : state.rows.length > 0 ? (
            <ChannelLogos rows={state.rows} connectors={publications?.connectors ?? []} accounts={publications?.accounts} max={3} className="min-w-0" />
          ) : (
            <span className={cn("shrink-0", STATUS_TONE.none)}>{EXPORT_STATUS_LABELS.none}</span>
          )
        ) : null}
      </div>
      {state && state.status !== "published" && state.status !== "none" ? (
        <span className={cn("truncate px-0.5 text-[11px]", STATUS_TONE[state.status])}>{EXPORT_STATUS_LABELS[state.status]}</span>
      ) : null}
    </div>
  );
}

// ─── Activité ────────────────────────────────────────────────────

const chartConfig = {
  exports: { label: "Exports", color: "var(--chart-1)" },
  publications: { label: "Publications", color: "var(--chart-2)" },
} satisfies ChartConfig;

function ActivityPanel({ data, publications, isAdmin }: { data: StudioOverview; publications: PublicationsOverview | null; isAdmin: boolean }) {
  // Les publications viennent de la file (administrateurs) : on les ajoute, jour par jour, aux exports.
  const merged = useMemo(() => {
    const extra = activity([], publications?.publicationDates ?? []);
    const byDay = new Map(extra.days.map((day) => [day.day, day.publications]));
    return {
      days: data.activity.days.map((day) => ({ ...day, publications: byDay.get(day.day) ?? 0, label: dayLabel(day.day) })),
      publicationsWeek: extra.publicationsWeek,
      publicationsMonth: extra.publicationsMonth,
    };
  }, [data, publications]);
  const { exportsWeek, exportsMonth } = data.activity;
  const summary = [
    `${exportsWeek.toLocaleString("fr-FR")} export${exportsWeek > 1 ? "s" : ""} cette semaine, ${exportsMonth.toLocaleString("fr-FR")} sur 30 jours`,
    isAdmin && publications ? `${merged.publicationsMonth.toLocaleString("fr-FR")} publication${merged.publicationsMonth > 1 ? "s" : ""} sur 30 jours` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const channels = publications?.channels ?? [];
  const connectorOf = (id: string) => publications?.connectors.find((entry) => entry.id === id);
  const today = dayKey(Date.now());

  return (
    <Panel aria-labelledby="hub-activity">
      <PanelHeader icon={Activity} titleId="hub-activity" title="Activité" description={`${summary}.`} />
      <PanelBody>
        <ChartContainer config={chartConfig} className="aspect-auto h-44 w-full" aria-label="Exports et publications des 30 derniers jours">
          <BarChart data={merged.days} margin={{ top: 4, right: 4, bottom: 0, left: -24 }} barGap={2}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/60" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} interval={6} tickMargin={6} fontSize={11} />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={40} fontSize={11} />
            <ChartTooltip cursor={{ fill: "var(--muted)", opacity: 0.5 }} content={<ChartTooltipContent labelFormatter={(_, payload) => (payload?.[0]?.payload?.day === today ? "Aujourd’hui" : String(payload?.[0]?.payload?.label ?? ""))} />} />
            {isAdmin && publications ? <ChartLegend content={<ChartLegendContent />} /> : null}
            <Bar dataKey="exports" fill="var(--color-exports)" radius={[4, 4, 0, 0]} maxBarSize={14} />
            {isAdmin && publications ? <Bar dataKey="publications" fill="var(--color-publications)" radius={[4, 4, 0, 0]} maxBarSize={14} /> : null}
          </BarChart>
        </ChartContainer>
      </PanelBody>
      {isAdmin ? (
        channels.length > 0 ? (
          <PanelRows className="border-t" aria-label="Publications par service">
            {channels.map((channel) => {
              const connector = connectorOf(channel.connector);
              const parts = [
                channel.published ? `${channel.published} publié${channel.published > 1 ? "s" : ""}` : null,
                channel.scheduled ? `${channel.scheduled} programmé${channel.scheduled > 1 ? "s" : ""}` : null,
                channel.pending ? `${channel.pending} en cours` : null,
              ].filter(Boolean);
              return (
                <Link
                  key={channel.connector}
                  href={`/m/clip-studio/exports?channel=${encodeURIComponent(channel.connector)}`}
                  className="flex min-w-0 items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-muted/50"
                >
                  {connector ? <ServiceLogo logo={connector.logo} /> : null}
                  <span className="min-w-0 flex-1 truncate font-medium">{connector?.label ?? channel.connector}</span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{parts.join(" · ") || "–"}</span>
                  {channel.failed ? <span className="shrink-0 text-xs text-destructive tabular-nums">{channel.failed} échec{channel.failed > 1 ? "s" : ""}</span> : null}
                  <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              );
            })}
          </PanelRows>
        ) : publications ? (
          <PanelFooter>
            <Send className="size-3.5" aria-hidden />
            Aucun export publié pour l’instant : ouvrez la fiche d’un export puis «&nbsp;Publier&nbsp;».
          </PanelFooter>
        ) : null
      ) : null}
    </Panel>
  );
}

function dayLabel(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

// ─── Meilleures publications ─────────────────────────────────────

function TopPanel({ publications, onRead }: { publications: PublicationsOverview | null; onRead: () => Promise<PublicationsOverview> }) {
  const [reading, setReading] = useState(false);
  const feedback = useFeedback();
  const read = async () => {
    setReading(true);
    feedback.clear();
    try {
      const next = await onRead();
      if (next.statsErrors.length > 0) feedback.error(next.statsErrors[0]);
      else if (next.top.length === 0) feedback.success("Statistiques lues : aucune vue relevée pour l’instant.");
    } catch (error) {
      feedback.error(errorMessage(error, "Les statistiques n’ont pas pu être lues."));
    } finally {
      setReading(false);
    }
  };
  const top = publications?.top ?? [];
  const canRead = (publications?.statsAccounts ?? 0) > 0;
  const connectorOf = (id: string) => publications?.connectors.find((entry) => entry.id === id);
  const accountOf = (id: string) => publications?.accounts.find((entry) => entry.id === id);

  return (
    <Panel aria-labelledby="hub-top" className="xl:self-start">
      <PanelHeader
        icon={TrendingUp}
        titleId="hub-top"
        title="Meilleures publications"
        description="Les clips les plus vus, d’après les statistiques des services."
        actions={
          canRead ? (
            <Button variant="outline" size="sm" className="gap-1.5" loading={reading} onClick={() => void read()}>
              <BarChart3 className="size-3.5" />
              {publications?.statsFetchedAt ? "Actualiser" : "Lire les statistiques"}
            </Button>
          ) : null
        }
      />
      {publications === null ? (
        <PanelRows aria-busy>
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="flex items-center gap-3 px-4 py-2.5">
              <Skeleton className="h-9 w-16 rounded" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-12" />
            </div>
          ))}
        </PanelRows>
      ) : top.length === 0 ? (
        <PanelBody>
          <p className="text-sm text-pretty text-muted-foreground">
            {!canRead
              ? "Aucune publication dont les statistiques peuvent être lues : publiez un export sur un compte qui sait lister ses publications."
              : publications.statsFetchedAt
                ? "Aucune vue relevée sur les publications de Clip Studio pour l’instant."
                : "Les statistiques ne sont lues qu’à votre demande, pour ménager les quotas des services."}
          </p>
        </PanelBody>
      ) : (
        <PanelRows>
          {top.map((row) => {
            const connector = connectorOf(row.connector);
            const account = accountOf(row.accountId);
            return (
              <div key={`${row.exportId}-${row.accountId}`} className="flex min-w-0 items-center gap-3 px-4 py-2.5">
                <Link href={exportHref(row.exportId)} className="relative h-9 w-16 shrink-0 overflow-hidden rounded bg-black">
                  <ExportPoster entry={{ file: row.file, cover: row.cover ? { file: row.cover, width: 0, height: 0 } : undefined }} playOnHover={false} />
                </Link>
                <div className="grid min-w-0 flex-1 gap-0.5">
                  <Link href={exportHref(row.exportId)} className="truncate text-sm font-medium hover:underline" title={row.title}>
                    {row.title}
                  </Link>
                  <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
                    {connector ? <ServiceLogo logo={connector.logo} className="size-3.5" /> : null}
                    <span className="min-w-0 truncate">{account?.displayName ?? connector?.label ?? row.connector}</span>
                  </span>
                </div>
                <div className="grid shrink-0 text-right text-xs tabular-nums">
                  <span className="font-medium">{formatCount(row.stats.views)} vue{(row.stats.views ?? 0) > 1 ? "s" : ""}</span>
                  <span className="text-muted-foreground">{formatCount(row.stats.likes)} j’aime</span>
                </div>
              </div>
            );
          })}
        </PanelRows>
      )}
      {publications?.statsFetchedAt || feedback.state ? (
        <PanelFooter>
          {publications?.statsFetchedAt ? <span>Statistiques lues {formatRelative(publications.statsFetchedAt)}</span> : null}
          <ActionStatus state={feedback.state} className="max-w-full" />
        </PanelFooter>
      ) : null}
    </Panel>
  );
}
