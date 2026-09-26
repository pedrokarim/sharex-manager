"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import {
  Clapperboard,
  Copy,
  Download,
  Film,
  MoreHorizontal,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { appendSequence, createImageItem, createProject } from "../engine/edit";
import { formatTimecode } from "../engine/timeline";
import { ASPECTS, type AspectPreset, type ClipExport, type Motion } from "../engine/types";
import { callModule, exportUrl, probeMedia, type ProjectSummary } from "../lib/client";

/** Données gardées entre deux visites : le retour à la liste est instantané. */
let snapshot: { projects: ProjectSummary[]; exports: ClipExport[] } | null = null;

export default function ProjectsPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [projects, setProjects] = useState<ProjectSummary[] | null>(snapshot?.projects ?? null);
  const [exports, setExports] = useState<ClipExport[]>(snapshot?.exports ?? []);
  const [creating, setCreating] = useState<{ files: string[] } | null>(null);

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
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Clapperboard className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight">Clip Studio</h1>
            <p className="text-sm text-muted-foreground">
              Montez des clips à partir de vos images, vidéos et sons, puis exportez-les en MP4.
            </p>
          </div>
          <Button className="ml-auto gap-2" onClick={() => setCreating({ files: [] })}>
            <Plus className="h-4 w-4" />
            Nouveau clip
          </Button>
        </header>

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
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              <AnimatePresence initial={false}>
                {projects.map((project) => (
                  <motion.div
                    key={project.id}
                    layout
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.94 }}
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
            <h2 className="text-sm font-semibold">Exports</h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
              <AnimatePresence initial={false}>
                {exports.map((entry) => (
                  <motion.div key={entry.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <ExportCard entry={entry} onChanged={refresh} />
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
        <div className="group flex flex-col gap-2">
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
          <div className="flex items-start gap-1 px-0.5">
            <div className="min-w-0 flex-1">
              <Link href={href} className="block truncate text-sm font-medium hover:underline">
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

function ExportCard({ entry, onChanged }: { entry: ClipExport; onChanged: () => void }) {
  const url = exportUrl(entry.file);
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="flex flex-col gap-1.5">
          <video
            src={url}
            muted
            loop
            playsInline
            preload="metadata"
            onMouseEnter={(event) => void event.currentTarget.play().catch(() => undefined)}
            onMouseLeave={(event) => {
              event.currentTarget.pause();
              event.currentTarget.currentTime = 0;
            }}
            className="aspect-video w-full rounded-lg bg-black object-contain"
          />
          <p className="truncate px-0.5 text-xs font-medium">{entry.projectName}</p>
          <p className="px-0.5 text-[11px] text-muted-foreground tabular-nums">
            {Math.round(entry.durationMs / 1000)} s · {(entry.sizeBytes / 1024 / 1024).toFixed(1)} Mo
          </p>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuItem asChild>
          <a href={url} download={`${entry.projectName}.mp4`}>
            <Download className="mr-2 h-4 w-4" />
            Télécharger
          </a>
        </ContextMenuItem>
        <ContextMenuItem asChild>
          <Link href={`/m/clip-studio/edit?id=${entry.projectId}`}>Ouvrir le projet</Link>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          variant="destructive"
          onClick={async () => {
            await callModule("deleteExport", entry.id);
            onChanged();
          }}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Supprimer l&apos;export
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

// ─── Création ────────────────────────────────────────────────────

const MOTIONS: Motion[] = ["zoom-in", "pan-right", "zoom-out", "pan-left"];

function CreateDialog({
  request,
  onClose,
  onCreated,
}: {
  request: { files: string[] } | null;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [aspect, setAspect] = useState<AspectPreset>("9:16");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (request) {
      setName(request.files.length ? `Diaporama du ${new Date().toLocaleDateString("fr-FR")}` : "Nouveau clip");
      setBusy(false);
    }
  }, [request]);

  const create = async () => {
    if (!request) return;
    setBusy(true);
    try {
      let project = createProject(name.trim() || "Nouveau clip", aspect);
      if (request.files.length) {
        // Diaporama : 3 s par image, mouvements de caméra alternés, fondus.
        const sources = await Promise.all(
          request.files.map(async (file) => {
            const url = `/api/files/${encodeURIComponent(file)}`;
            const probe = await probeMedia(url, "image");
            return { url, ref: `upload:${file}`, name: file, kind: "image" as const, ...probe };
          })
        );
        let start = 0;
        const items = sources.map((source, index) => {
          const item = createImageItem(source, start, project.fps);
          item.motion = MOTIONS[index % MOTIONS.length];
          start += item.duration;
          return item;
        });
        project = appendSequence(project, items);
      }
      await callModule("saveProject", project);
      onCreated(project.id);
    } catch (error: any) {
      toast.error(error?.message ?? "Création impossible");
      setBusy(false);
    }
  };

  return (
    <Dialog open={request !== null} onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Nouveau clip</DialogTitle>
          <DialogDescription>
            {request?.files.length
              ? `${request.files.length} image(s) montée(s) en diaporama, prêt(es) à retoucher.`
              : "Choisissez un format ; il reste modifiable dans l'éditeur."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nom du clip" autoFocus />
          <div className="grid grid-cols-4 gap-2">
            {(Object.keys(ASPECTS) as AspectPreset[]).map((key) => {
              const { width, height, label } = ASPECTS[key];
              const selected = aspect === key;
              const scale = 56 / Math.max(width, height);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setAspect(key)}
                  className={cn(
                    "flex flex-col items-center gap-2 rounded-xl border px-2 pt-4 pb-3 transition-colors",
                    selected ? "border-primary bg-primary/10" : "hover:bg-muted"
                  )}
                >
                  <span className="flex h-14 items-center justify-center">
                    <span
                      className={cn("rounded-[3px] border-2", selected ? "border-primary" : "border-muted-foreground/60")}
                      style={{ width: width * scale, height: height * scale }}
                    />
                  </span>
                  <span className="text-sm font-medium">{key}</span>
                  <span className="text-[11px] text-muted-foreground">{label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Annuler
          </Button>
          <Button onClick={create} disabled={busy} className="gap-2">
            {busy ? <Spinner className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            Créer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
