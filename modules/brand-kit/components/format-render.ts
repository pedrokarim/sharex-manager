"use client";

/**
 * Dessin des formats et des aperçus de styles avec le moteur de Clip Studio.
 *
 * `drawFrame` travaille en coordonnées relatives au cadre : dessiner une
 * vignette, c'est dessiner le même projet avec une largeur et une hauteur
 * plus petites. L'aperçu et le PNG exporté sont donc la même image.
 */

import { drawFrame } from "@/modules/clip-studio/engine/render";
import type { ClipProject, ImageItem, VideoItem } from "@/modules/clip-studio/engine/types";
import { ensureBrandFonts, ensureFonts } from "@/modules/clip-studio/lib/fonts";
import type { BuiltFormat } from "../lib/formats";
import { toBrandTheme } from "../lib/theme";
import { kitAssetUrl, type BrandKit } from "../lib/types";

// ─── Images ──────────────────────────────────────────────────────

const images = new Map<string, HTMLImageElement>();
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

function imageElement(url: string): HTMLImageElement {
  let element = images.get(url);
  if (!element) {
    element = new Image();
    element.decoding = "async";
    element.onload = notify;
    element.onerror = notify;
    element.src = url;
    images.set(url, element);
  }
  return element;
}

const isReady = (element: HTMLImageElement) => element.complete && element.naturalWidth > 0;

/** Image chargée, ou `null` tant qu'elle arrive : la vignette se redessine à son arrivée. */
export function cachedImage(url: string): HTMLImageElement | null {
  const element = imageElement(url);
  return isReady(element) ? element : null;
}

/** Prévient quand une image du cache finit de charger (ou échoue). */
export function onImageLoaded(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  const element = imageElement(url);
  if (element.complete) return Promise.resolve(isReady(element) ? element : null);
  return new Promise((resolve) => {
    const done = () => {
      element.removeEventListener("load", done);
      element.removeEventListener("error", done);
      resolve(isReady(element) ? element : null);
    };
    element.addEventListener("load", done);
    element.addEventListener("error", done);
  });
}

function imageUrls(project: ClipProject): string[] {
  const urls = new Set<string>();
  for (const track of project.tracks) {
    for (const item of track.items) if (item.type === "image") urls.add(item.source.url);
  }
  return [...urls];
}

const resolver = (item: ImageItem | VideoItem) => (item.type === "image" ? cachedImage(item.source.url) : null);

// ─── Polices ─────────────────────────────────────────────────────

/** Polices du catalogue et polices importées de la marque, avant tout dessin. */
export async function prepareKitFonts(kit: BrandKit): Promise<void> {
  await Promise.all([ensureFonts(), ensureBrandFonts(toBrandTheme(kit).fonts)]);
}

// ─── Dessin ──────────────────────────────────────────────────────

/** Dessine un projet d'une image à la taille du canevas, quelle qu'elle soit. */
export function drawProject(canvas: HTMLCanvasElement, project: ClipProject, frame: number) {
  const context = canvas.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  drawFrame(context, { ...project, width: canvas.width, height: canvas.height }, frame, resolver);
}

/**
 * PNG plein format d'un format : polices et images attendues, aucune zone
 * sûre. Une image finie importée est reprise telle quelle, sans être
 * redessinée : elle est déjà contrôlée et à la bonne taille.
 */
export async function renderFormatPng(kit: BrandKit, built: BuiltFormat): Promise<Blob> {
  if (built.supplied) {
    const response = await fetch(kitAssetUrl(kit.id, built.supplied.file));
    if (!response.ok) throw new Error(`L’image finie de ce format est introuvable (HTTP ${response.status}).`);
    const blob = await response.blob();
    return blob.type === "image/png" ? blob : new Blob([await blob.arrayBuffer()], { type: "image/png" });
  }
  await prepareKitFonts(kit);
  await Promise.all(imageUrls(built.project).map(loadImage));
  const canvas = document.createElement("canvas");
  canvas.width = built.spec.width;
  canvas.height = built.spec.height;
  drawProject(canvas, built.project, built.frame);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Le PNG n’a pas pu être produit."))), "image/png");
  });
}
