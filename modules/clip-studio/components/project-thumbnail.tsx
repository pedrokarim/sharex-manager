"use client";

/**
 * Vignette d'un projet : une image du clip dessinée par `drawFrame`, la même
 * fonction que l'aperçu et l'export. Elle est rendue dans le navigateur la
 * première fois que la carte devient visible (ou quand le projet a changé
 * depuis), envoyée au serveur qui la réencode et la garde : les visites
 * suivantes ne la redessinent pas. Un rendu à la fois, pour ne pas charger
 * vingt-quatre projets d'un coup.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Film } from "lucide-react";
import { cn } from "@/lib/utils";
import { drawFrame } from "../engine/render";
import { isActive, projectDuration, sourceTimeAt } from "../engine/timeline";
import type { ClipProject, ImageItem, VideoItem } from "../engine/types";
import { callModule, setProjectThumbnail, type ProjectSummary } from "../lib/client";
import { ensureProjectFonts } from "../lib/fonts";

const THUMB_SIDE = 480;
const MEDIA_TIMEOUT_MS = 8000;

/** Vignettes rendues pendant cette visite (adresse locale), par projet et par version. */
const rendered = new Map<string, string>();
/** Rendus ratés pendant cette visite : on ne les retente pas en boucle. */
const failed = new Set<string>();
let queue: Promise<void> = Promise.resolve();

const versionKey = (project: Pick<ProjectSummary, "id" | "updatedAt">) => `${project.id}@${project.updatedAt}`;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Délai dépassé")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

function once(target: HTMLMediaElement, event: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ok = () => {
      target.removeEventListener("error", ko);
      resolve();
    };
    const ko = () => {
      target.removeEventListener(event, ok);
      reject(new Error("Média illisible"));
    };
    target.addEventListener(event, ok, { once: true });
    target.addEventListener("error", ko, { once: true });
  });
}

/** Image d'une vidéo à un instant : l'élément, calé sur cet instant. */
async function videoAt(url: string, seconds: number): Promise<HTMLVideoElement> {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;
  await withTimeout(once(video, "loadeddata"), MEDIA_TIMEOUT_MS);
  const end = Number.isFinite(video.duration) ? Math.max(0, video.duration - 0.05) : seconds;
  video.currentTime = Math.min(Math.max(0, seconds), end);
  await withTimeout(once(video, "seeked"), MEDIA_TIMEOUT_MS);
  return video;
}

/** Image retenue : un peu après le début, quand les textes d'entrée sont posés. */
export function thumbnailFrame(project: Pick<ClipProject, "fps">, duration: number): number {
  if (duration <= 1) return 0;
  const target = Math.min(Math.round(duration * 0.2), Math.round(project.fps * 3));
  return Math.min(duration - 1, Math.max(target, Math.min(duration - 1, Math.round(project.fps))));
}

async function renderThumbnail(summary: ProjectSummary): Promise<string> {
  const project = await callModule<ClipProject | null>("getProject", summary.id);
  if (!project) throw new Error("Projet introuvable");
  await withTimeout(ensureProjectFonts(project), MEDIA_TIMEOUT_MS).catch(() => undefined);
  const frame = thumbnailFrame(project, projectDuration(project));

  const images = new Map<string, CanvasImageSource>();
  const videos = new Map<string, HTMLVideoElement>();
  try {
    for (const track of project.tracks) {
      if (track.kind !== "visual" || track.hidden) continue;
      for (const item of track.items) {
        if (!isActive(item, frame)) continue;
        if (item.type === "image" && !images.has(item.source.url)) {
          const blob = await withTimeout(
            fetch(item.source.url).then((response) => (response.ok ? response.blob() : Promise.reject(new Error("Image absente")))),
            MEDIA_TIMEOUT_MS
          ).catch(() => null);
          const bitmap = blob ? await createImageBitmap(blob).catch(() => null) : null;
          if (bitmap) images.set(item.source.url, bitmap);
        } else if (item.type === "video") {
          const video = await videoAt(item.source.url, sourceTimeAt(item, frame, project.fps)).catch(() => null);
          if (video) videos.set(item.id, video);
        }
      }
    }

    const full = document.createElement("canvas");
    full.width = project.width;
    full.height = project.height;
    const ctx = full.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Canevas indisponible");
    drawFrame(ctx, project, frame, (item: ImageItem | VideoItem) => (item.type === "image" ? (images.get(item.source.url) ?? null) : (videos.get(item.id) ?? null)));

    // 480 px au plus sur le grand côté : assez pour une carte, léger à garder.
    const scale = Math.min(1, THUMB_SIDE / Math.max(project.width, project.height));
    const thumb = document.createElement("canvas");
    thumb.width = Math.max(16, Math.round(project.width * scale));
    thumb.height = Math.max(16, Math.round(project.height * scale));
    const small = thumb.getContext("2d", { alpha: false });
    if (!small) throw new Error("Canevas indisponible");
    small.imageSmoothingQuality = "high";
    small.drawImage(full, 0, 0, thumb.width, thumb.height);
    const blob = await new Promise<Blob | null>((resolve) => thumb.toBlob(resolve, "image/jpeg", 0.82));
    if (!blob) throw new Error("Vignette impossible");
    // Envoyée en fond : un échec d'enregistrement n'empêche pas de la montrer.
    void setProjectThumbnail(project.id, project.updatedAt, blob).catch(() => undefined);
    return URL.createObjectURL(blob);
  } finally {
    for (const video of videos.values()) {
      video.removeAttribute("src");
      video.load();
    }
    for (const image of images.values()) if (image instanceof ImageBitmap) image.close();
  }
}

/** Met un rendu dans la file (un à la fois) ; rend l'adresse de la vignette. */
function enqueue(summary: ProjectSummary): Promise<string> {
  const run = queue.then(() => renderThumbnail(summary));
  queue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

/** La vignette à montrer et s'il faut la (re)dessiner. */
export function thumbnailSource(project: ProjectSummary): { src: string | null; needsRender: boolean } {
  const local = rendered.get(versionKey(project));
  if (local) return { src: local, needsRender: false };
  const src = project.thumbnail ?? project.cover ?? null;
  const needsRender = project.itemCount > 0 && (!project.thumbnail || Boolean(project.thumbnailStale)) && !failed.has(versionKey(project));
  return { src, needsRender };
}

export function ProjectThumbnail({ project, className, imageClassName }: { project: ProjectSummary; className?: string; imageClassName?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const initial = thumbnailSource(project);
  const [src, setSrc] = useState<string | null>(initial.src);
  const key = versionKey(project);

  useEffect(() => {
    const next = thumbnailSource(project);
    setSrc(next.src);
    if (!next.needsRender || !ref.current) return;
    let alive = true;
    const node = ref.current;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        void enqueue(project)
          .then((url) => {
            rendered.set(key, url);
            if (alive) setSrc(url);
          })
          .catch(() => failed.add(key));
      },
      { rootMargin: "200px" }
    );
    observer.observe(node);
    return () => {
      alive = false;
      observer.disconnect();
    };
    // Une seule tentative par version du projet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, project.thumbnail]);

  return (
    <div ref={ref} className={cn("relative overflow-hidden bg-muted", className)} style={{ aspectRatio: `${project.width} / ${project.height}` }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- vignette du module, déjà réduite
        <img key={src} src={src} alt="" loading="lazy" className={cn("size-full object-cover animate-in fade-in-0 duration-300", imageClassName)} />
      ) : (
        <Film className="absolute inset-0 m-auto size-5 text-muted-foreground/60" aria-hidden />
      )}
    </div>
  );
}

/**
 * Cadre commun des cartes de projet : un 16:9 léger, la vignette posée au
 * centre à son propre format (vertical, carré ou paysage), et ce qu'on y
 * superpose (format, durée).
 */
export function ProjectFrame({ project, className, children }: { project: ProjectSummary; className?: string; children?: ReactNode }) {
  return (
    <div className={cn("relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-lg bg-[linear-gradient(135deg,color-mix(in_oklch,var(--primary)_18%,transparent),transparent)] ring-1 ring-border", className)}>
      <ProjectThumbnail project={project} className="h-[84%] max-w-[92%] rounded-md shadow-md transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100" />
      {children}
    </div>
  );
}
