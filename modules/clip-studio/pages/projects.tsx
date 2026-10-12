"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import {
  ArrowRight,
  AudioLines,
  Copy,
  Film,
  MoreHorizontal,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import logo from "../branding/logo-96.png";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatTimecode } from "../engine/timeline";
import type { ClipExport } from "../engine/types";
import { callModule, type ProjectSummary } from "../lib/client";
import type { AssistantJob } from "../lib/assistant";
import { AssistantProgress, CreateDialog } from "../components/create-dialog";
import { ExportCard, publishHref } from "../components/export-card";
import { useSession } from "@/lib/auth-client";

/** Données gardées entre deux visites : le retour à la liste est instantané. */
let snapshot: { projects: ProjectSummary[]; exports: ClipExport[] } | null = null;

/** Exports montrés sous les projets, les plus récents : tous les autres sont sur la page Exports. */
const RECENT_EXPORTS = 12;

export default function ProjectsPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [projects, setProjects] = useState<ProjectSummary[] | null>(snapshot?.projects ?? null);
  const [exports, setExports] = useState<ClipExport[]>(snapshot?.exports ?? []);
  const [creating, setCreating] = useState<{ files: string[] } | null>(null);
  const [assistantJobs, setAssistantJobs] = useState<AssistantJob[]>([]);
  // Publication : réservée aux administrateurs (comptes connectés du cœur).
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";

  const refresh = useCallback(async () => {
    const [nextProjects, nextExports] = await Promise.all([
      callModule<ProjectSummary[]>("listProjects"),
      callModule<ClipExport[]>("listExports"),
    ]);
    snapshot = { projects: nextProjects, exports: nextExports };
    setProjects(nextProjects);
    setExports(nextExports);
  }, []);

  useEffect(() => {
    void refresh().catch(() => setProjects([]));
  }, [refresh]);

  const refreshJobs = useCallback(async () => {
    const jobs = await callModule<AssistantJob[]>("listAssistantJobs").catch(() => []);
    // On montre les créations en cours et les échecs récents (moins d'une heure).
    setAssistantJobs(
      jobs.filter((job) => job.status === "running" || (job.status === "error" && Date.now() - job.createdAt < 3_600_000))
    );
    return jobs;
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    const tick = async () => {
      const jobs = await refreshJobs();
      if (stopped) return;
      const running = jobs.some((job) => job.status === "running");
      // Une création vient de se terminer : son projet apparaît dans la liste.
      if (!running) void refresh().catch(() => undefined);
      timer = setTimeout(tick, running ? 2000 : 15000);
    };
    void tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [refreshJobs, refresh]);

  // Ancienne adresse de publication (`?publish=<id>`, retour d'un parcours de
  // connexion lancé avant l'écran Publier) : on passe à l'écran Publier, en
  // gardant les paramètres du retour pour que le parcours reprenne.
  useEffect(() => {
    const id = params.get("publish");
    if (!id) return;
    const rest = new URLSearchParams(params.toString());
    rest.delete("publish");
    const suffix = rest.toString();
    router.replace(`${publishHref(id)}${suffix ? `&${suffix}` : ""}`, { scroll: false });
  }, [params, router]);

  // Arrivée depuis la galerie : « Créer un clip avec la sélection ».
  useEffect(() => {
    const files = params.get("files");
    if (params.get("action") === "create") {
      setCreating({ files: files ? files.split(",").filter(Boolean) : [] });
      router.replace("/m/clip-studio", { scroll: false });
    }
  }, [params, router]);

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex flex-col gap-8">
        <header className="flex flex-wrap items-center gap-3">
          <Image src={logo} alt="" width={44} height={44} className="size-11 shrink-0" />
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight">Clip Studio</h1>
            <p className="text-sm text-muted-foreground">
              Montez des clips à partir de vos images, vidéos et sons, puis exportez-les en MP4.
            </p>
          </div>
          <Button asChild variant="outline" className="ml-auto gap-2">
            <Link href="/m/clip-studio/voices">
              <AudioLines className="h-4 w-4" />
              Voix en ligne
            </Link>
          </Button>
          <Button className="gap-2" onClick={() => setCreating({ files: [] })}>
            <Plus className="h-4 w-4" />
            Nouveau clip
          </Button>
        </header>

        <AnimatePresence initial={false}>
          {assistantJobs.length > 0 && (
            <motion.section
              key="assistant"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="flex flex-col gap-3 overflow-hidden"
            >
              <h2 className="text-sm font-semibold">En cours de création</h2>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {assistantJobs.map((job) => (
                  <motion.div key={job.id} layout className="rounded-xl border p-4">
                    <AssistantProgress
                      job={job}
                      onCancel={async () => {
                        await callModule("cancelAssistant", job.id);
                        void refreshJobs();
                      }}
                    />
                  </motion.div>
                ))}
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold">Projets</h2>
          {projects === null ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {Array.from({ length: 5 }, (_, index) => (
                <Skeleton key={index} className="aspect-video rounded-xl" />
              ))}
            </div>
          ) : projects.length === 0 ? (
            <button
              type="button"
              onClick={() => setCreating({ files: [] })}
              className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed px-6 py-14 text-center transition-colors hover:border-primary/40 hover:bg-primary/5"
            >
              <Film className="h-8 w-8 text-primary" />
              <span className="text-sm font-medium">Créer votre premier clip</span>
              <span className="max-w-sm text-xs text-muted-foreground">
                Ou sélectionnez des images dans la galerie, puis clic droit,
                «&nbsp;Modules&nbsp;», «&nbsp;Créer un clip avec la sélection&nbsp;».
              </span>
            </button>
          ) : (
            <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-4 sm:grid-cols-[repeat(3,minmax(0,1fr))] lg:grid-cols-[repeat(4,minmax(0,1fr))] xl:grid-cols-[repeat(5,minmax(0,1fr))]">
              <AnimatePresence initial={false}>
                {projects.map((project) => (
                  <motion.div
                    key={project.id}
                    layout
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.94 }}
                    className="min-w-0"
                  >
                    <ProjectCard project={project} onChanged={refresh} />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </section>

        {exports.length > 0 && (
          <section className="flex flex-col gap-3">
            <div className="flex min-w-0 items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold">Exports</h2>
              <Link href="/m/clip-studio/exports" className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
                {exports.length > RECENT_EXPORTS ? `Tous les exports (${exports.length.toLocaleString("fr-FR")})` : "Tous les exports"}
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-4 sm:grid-cols-[repeat(3,minmax(0,1fr))] lg:grid-cols-[repeat(4,minmax(0,1fr))] xl:grid-cols-[repeat(6,minmax(0,1fr))]">
              <AnimatePresence initial={false}>
                {exports.slice(0, RECENT_EXPORTS).map((entry) => (
                  // min-w-0 : sans lui, un nom long (tronqué sur une ligne) élargit la
                  // cellule à sa pleine longueur et la carte déborde sur sa voisine.
                  <motion.div key={entry.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="min-w-0">
                    <ExportCard entry={entry} canPublish={isAdmin} onChanged={() => void refresh()} />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </section>
        )}
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

// ─── Cartes ──────────────────────────────────────────────────────

function ProjectCard({ project, onChanged }: { project: ProjectSummary; onChanged: () => void }) {
  const href = `/m/clip-studio/edit?id=${project.id}`;
  const ratio = project.width / project.height;

  const actions = {
    duplicate: async () => {
      await callModule("duplicateProject", project.id);
      toast.success("Projet dupliqué");
      onChanged();
    },
    remove: async () => {
      await callModule("deleteProject", project.id);
      toast.success("Projet supprimé");
      onChanged();
    },
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="group flex min-w-0 flex-col gap-2">
          <Link
            href={href}
            className="relative flex aspect-video items-center justify-center overflow-hidden rounded-xl border bg-[linear-gradient(135deg,color-mix(in_oklch,var(--primary)_22%,transparent),transparent)]"
          >
            <div
              className="relative h-[82%] overflow-hidden rounded-md bg-black/80 shadow-lg transition-transform duration-300 group-hover:scale-[1.04]"
              style={{ aspectRatio: ratio }}
            >
              {project.cover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={project.cover} alt="" className="h-full w-full object-cover" />
              ) : (
                <Film className="absolute inset-0 m-auto h-5 w-5 text-white/40" />
              )}
            </div>
            <span className="absolute top-2 left-2 rounded bg-background/85 px-1.5 py-0.5 text-[10px] font-medium backdrop-blur">
              {project.aspect}
            </span>
          </Link>
          <div className="flex min-w-0 items-start gap-1 px-0.5">
            <div className="min-w-0 flex-1">
              <Link href={href} className="block truncate text-sm font-medium hover:underline" title={project.name}>
                {project.name}
              </Link>
              <p className="text-[11px] text-muted-foreground tabular-nums">
                {formatTimecode(project.durationFrames, project.fps).split(".")[0]} ·{" "}
                {project.itemCount} élément(s) ·{" "}
                {new Date(project.updatedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
              </p>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:data-[state=open]:opacity-100" aria-label="Actions du projet">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem asChild>
                  <Link href={href}>Ouvrir</Link>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={actions.duplicate}>
                  <Copy className="mr-2 h-4 w-4" />
                  Dupliquer
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={actions.remove}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Supprimer
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-44">
        <ContextMenuItem asChild>
          <Link href={href}>Ouvrir</Link>
        </ContextMenuItem>
        <ContextMenuItem onClick={actions.duplicate}>
          <Copy className="mr-2 h-4 w-4" />
          Dupliquer
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onClick={actions.remove}>
          <Trash2 className="mr-2 h-4 w-4" />
          Supprimer
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
