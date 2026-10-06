"use client";

/**
 * Lecteur de page du navigateur : découpe l'image sur un canevas et la donne
 * au moteur de lecture.
 *
 * La page n'est jamais posée entière sur un canevas : chaque appel n'en dessine
 * qu'un rectangle (une tranche pour le repérage, une zone pour la lecture).
 * Une bande de webtoon de vingt mille pixels de haut passe donc par des
 * canevas de la hauteur d'une tranche, quelle que soit la limite de taille du
 * navigateur ; seule l'image décodée est gardée en mémoire, par le navigateur.
 */

import type { Rect } from "../geometry";
import type { SourceLanguage } from "../types";
import { recognize } from "./engine";
import { readingModel } from "./languages";
import type { PageReader, ReadOptions } from "./pipeline";
import type { PageSize } from "./words";

export type Surface = ImageBitmap | HTMLImageElement | HTMLCanvasElement;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function sizeOf(image: Surface): PageSize {
  if (typeof HTMLImageElement !== "undefined" && image instanceof HTMLImageElement) {
    return { width: image.naturalWidth, height: image.naturalHeight };
  }
  return { width: image.width, height: image.height };
}

/**
 * Lecteur d'une image. `size` est la taille de la page ; l'image peut en avoir
 * une autre. `language` choisit le modèle de lecture : celui des lignes de la
 * langue, ou celui de ses colonnes pour une zone écrite de haut en bas. Un
 * modèle n'est téléchargé qu'à la première zone qui le demande.
 */
export function createBrowserReader(image: Surface, size: PageSize, language?: SourceLanguage): PageReader {
  const natural = sizeOf(image);
  const scaleX = natural.width / size.width;
  const scaleY = natural.height / size.height;

  /** Canevas neuf, prêt à recevoir un rectangle de la page. */
  const createCanvas = (width: number, height: number): CanvasRenderingContext2D => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Cette page est trop grande pour être lue par le navigateur");
    ctx.imageSmoothingQuality = "high";
    return ctx;
  };

  return {
    size,
    async read(rect: Rect, options: ReadOptions, onProgress) {
      const width = Math.max(1, Math.round(rect.width * options.scale));
      const height = Math.max(1, Math.round(rect.height * options.scale));
      // Une image tournée déborde de son rectangle : le canevas prend sa boîte englobante.
      const angle = (options.rotate * Math.PI) / 180;
      const cos = Math.abs(Math.cos(angle));
      const sin = Math.abs(Math.sin(angle));
      const canvasWidth = Math.ceil(width * cos + height * sin);
      const canvasHeight = Math.ceil(width * sin + height * cos);
      const ctx = createCanvas(canvasWidth, canvasHeight);
      // Le fond du canevas prend la teinte du papier : blanc, ou noir pour un texte clair.
      ctx.fillStyle = options.invert ? "#000000" : "#ffffff";
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
      ctx.translate(canvasWidth / 2, canvasHeight / 2);
      ctx.rotate(angle);
      ctx.drawImage(image, rect.x * scaleX, rect.y * scaleY, rect.width * scaleX, rect.height * scaleY, -width / 2, -height / 2, width, height);
      // Le texte voisin qui dépasse dans le rectangle est recouvert de la teinte du papier.
      for (const patch of options.erase ?? []) {
        ctx.fillRect(-width / 2 + (patch.x - rect.x) * options.scale, -height / 2 + (patch.y - rect.y) * options.scale, patch.width * options.scale, patch.height * options.scale);
      }
      if (options.invert) {
        // « Différence » avec du blanc : le négatif, sans dépendre des filtres du canevas.
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalCompositeOperation = "difference";
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);
      }
      const model = readingModel(language, options.mode === "vertical" ? "vertical" : "horizontal");
      return recognize(ctx.canvas, options.mode, onProgress, model);
    },
    pixels(rect: Rect) {
      const x = clamp(Math.floor(rect.x), 0, size.width - 1);
      const y = clamp(Math.floor(rect.y), 0, size.height - 1);
      const width = clamp(Math.ceil(rect.x + rect.width) - x, 1, size.width - x);
      const height = clamp(Math.ceil(rect.y + rect.height) - y, 1, size.height - y);
      try {
        const ctx = createCanvas(width, height);
        ctx.drawImage(image, x * scaleX, y * scaleY, width * scaleX, height * scaleY, 0, 0, width, height);
        return { pixels: ctx.getImageData(0, 0, width, height), offset: { x, y } };
      } catch {
        // Rectangle trop grand pour un canevas, ou image d'une autre origine.
        return null;
      }
    },
  };
}
