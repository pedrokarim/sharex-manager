/**
 * Détecteur de bulles et de texte : ce qui se teste sans navigateur ni modèle.
 * Les boîtes sont écrites à la main ; le modèle lui-même tourne dans l'atelier.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  coverage,
  detectorTiles,
  dropDuplicates,
  mergeTileDetections,
  pairTexts,
  readDetections,
  type DetectedBox,
} from "@/modules/scan-studio/lib/analysis/detector-boxes";
import { analyzeWithBoxes, type PageReader, type ReadOptions } from "@/modules/scan-studio/lib/analysis/pipeline";
import type { WordBox } from "@/modules/scan-studio/lib/analysis/words";
import type { Rect } from "@/modules/scan-studio/lib/geometry";
import { DETECTOR_VARIANTS, downloadDetector, getDetector, removeDetector, setDetectorChoice, type DetectorFetch } from "@/modules/scan-studio/lib/server/detector";
import { setDataRoot } from "@/modules/scan-studio/lib/store";
import { DEFAULT_CHAPTER_SETTINGS, boundsOf } from "@/modules/scan-studio/lib/types";

const box = (kind: DetectedBox["kind"], x0: number, y0: number, x1: number, y1: number, score = 0.9): DetectedBox => ({ kind, x0, y0, x1, y1, score });

describe("détecteur : lecture des sorties du modèle", () => {
  it("garde les boîtes assez sûres, bornées à la page, avec leur sorte", () => {
    const labels = [BigInt(1), BigInt(0), BigInt(2), BigInt(1), BigInt(7)];
    const boxes = [10, 20, 110, 80, -5, 0, 300, 250, 400, 400, 520, 430, 50, 50, 51, 51, 0, 0, 10, 10];
    const scores = [0.92, 0.81, 0.45, 0.99, 0.99];
    const found = readDetections(labels, boxes, scores, { width: 500, height: 420 });
    expect(found).toEqual([
      { kind: "text_bubble", score: 0.92, x0: 10, y0: 20, x1: 110, y1: 80 },
      { kind: "bubble", score: 0.81, x0: 0, y0: 0, x1: 300, y1: 250 },
      // Bornée à la page ; la boîte d'un pixel et l'étiquette inconnue sont écartées.
      { kind: "text_free", score: 0.45, x0: 400, y0: 400, x1: 500, y1: 420 },
    ]);
    expect(readDetections([BigInt(1)], [0, 0, 50, 50], [0.39], { width: 100, height: 100 })).toEqual([]);
  });

  it("retire les doublons d'une même sorte, pas un texte et sa bulle", () => {
    const kept = dropDuplicates([
      box("text_bubble", 100, 100, 200, 160, 0.7),
      box("text_free", 104, 102, 198, 158, 0.9),
      box("bubble", 80, 80, 220, 180, 0.8),
      box("bubble", 82, 82, 219, 178, 0.6),
      box("text_bubble", 400, 100, 480, 150, 0.5),
    ]);
    expect(kept.map((entry) => [entry.kind, entry.score])).toEqual([
      ["text_free", 0.9],
      ["bubble", 0.8],
      ["text_bubble", 0.5],
    ]);
    expect(coverage(box("bubble", 0, 0, 10, 10), box("bubble", 20, 20, 30, 30))).toBe(0);
  });

  it("donne à chaque texte la plus petite bulle qui le contient, ou aucune", () => {
    const texts = pairTexts([
      box("bubble", 0, 0, 400, 400),
      box("bubble", 90, 90, 210, 170),
      box("text_bubble", 100, 100, 200, 160),
      box("text_free", 300, 500, 380, 540),
    ]);
    expect(texts).toEqual([
      { x0: 100, y0: 100, x1: 200, y1: 160, score: 0.9, bubble: { x0: 90, y0: 90, x1: 210, y1: 170 } },
      { x0: 300, y0: 500, x1: 380, y1: 540, score: 0.9 },
    ]);
  });
});

describe("détecteur : longues bandes", () => {
  it("laisse une page de manga entière, et découpe une bande en tranches qui se recouvrent", () => {
    expect(detectorTiles({ width: 1000, height: 1430 })).toEqual([{ x: 0, y: 0, width: 1000, height: 1430 }]);
    const tiles = detectorTiles({ width: 800, height: 6000 });
    expect(tiles.length).toBeGreaterThan(4);
    expect(tiles[0]).toEqual({ x: 0, y: 0, width: 800, height: 1200 });
    for (let index = 1; index < tiles.length; index++) {
      const previous = tiles[index - 1];
      // Recouvrement : une bulle coupée par une frontière est entière dans l'une des deux tranches.
      expect(tiles[index].y).toBeLessThan(previous.y + previous.height - 200);
      expect(tiles[index].y).toBeGreaterThan(previous.y);
    }
    const last = tiles[tiles.length - 1];
    expect(last.y + last.height).toBe(6000);
  });

  it("réunit les tranches : la boîte entière l'emporte sur la boîte coupée à la frontière", () => {
    const page = { width: 800, height: 3000 };
    const first: Rect = { x: 0, y: 0, width: 800, height: 1200 };
    const second: Rect = { x: 0, y: 920, width: 800, height: 1200 };
    const merged = mergeTileDetections(
      [
        // Dans la première tranche, la bulle touche le bas : elle y est coupée, mais le modèle en est très sûr.
        { tile: first, boxes: [box("text_bubble", 100, 1100, 300, 1199, 0.98), box("text_bubble", 50, 50, 200, 120, 0.9)] },
        // Dans la seconde, elle est entière.
        { tile: second, boxes: [box("text_bubble", 100, 182, 300, 330, 0.7)] },
      ],
      page
    );
    expect(merged).toHaveLength(2);
    expect(merged).toContainEqual({ kind: "text_bubble", score: 0.7, x0: 100, y0: 1102, x1: 300, y1: 1250 });
    expect(merged).toContainEqual({ kind: "text_bubble", score: 0.9, x0: 50, y0: 50, x1: 200, y1: 120 });
  });
});

describe("détecteur : des boîtes aux zones", () => {
  function reader(answer: (rect: Rect, options: ReadOptions) => WordBox[]) {
    const calls: Rect[] = [];
    const page: PageReader = {
      size: { width: 1000, height: 1400 },
      async read(rect, options) {
        calls.push(rect);
        return answer(rect, options);
      },
      pixels(rect) {
        const width = Math.max(1, Math.round(rect.width));
        const height = Math.max(1, Math.round(rect.height));
        return { pixels: { data: new Uint8ClampedArray(width * height * 4).fill(255), width, height }, offset: { x: Math.round(rect.x), y: Math.round(rect.y) } };
      },
    };
    return { page, calls };
  }
  let counter = 0;
  const createId = () => `zone${String(++counter).padStart(8, "0")}`;
  const words = (text: string): WordBox[] => text.split(" ").map((word, index) => ({ text: word, confidence: 0.9, x0: 20 + index * 120, y0: 20, x1: 120 + index * 120, y1: 60, line: 0, spaced: index > 0 }));

  it("lit chaque texte repéré, seul, et rend une zone par texte lu, dans l'ordre de lecture", async () => {
    const { page, calls } = reader((rect) => (rect.x < 500 ? words("Left side") : words("Right side")));
    const regions = await analyzeWithBoxes(
      page,
      [
        { x0: 100, y0: 100, x1: 300, y1: 200, bubble: { x0: 60, y0: 60, x1: 340, y1: 240 } },
        { x0: 700, y0: 100, x1: 900, y1: 200 },
      ],
      { ...DEFAULT_CHAPTER_SETTINGS, format: "manga" },
      { createId }
    );
    expect(calls).toHaveLength(2);
    // Format manga : de droite à gauche.
    expect(regions.map((region) => region.reading.clean)).toEqual(["Right side", "Left side"]);
    // La zone du texte en bulle ne sort pas de sa bulle.
    const bounds = boundsOf(regions[1].outline);
    expect(bounds.x).toBeGreaterThanOrEqual(60);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(340);
  });

  it("laisse de côté une boîte où rien ne se lit", async () => {
    const { page } = reader((rect) => (rect.x < 500 ? [] : words("Only this")));
    const regions = await analyzeWithBoxes(page, [{ x0: 100, y0: 100, x1: 300, y1: 200 }, { x0: 700, y0: 110, x1: 900, y1: 210 }], DEFAULT_CHAPTER_SETTINGS, { createId });
    expect(regions.map((region) => region.reading.clean)).toEqual(["Only this"]);
  });
});

describe("détecteur : le modèle sur le serveur", () => {
  let root = "";
  const fast = DETECTOR_VARIANTS.find((variant) => variant.id === "fast")!;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "scan-studio-detector-"));
    setDataRoot(path.join(root, "data"));
  });
  afterEach(() => {
    setDataRoot(null);
    fs.rmSync(root, { recursive: true, force: true });
  });

  const respond = (body: Uint8Array, status = 200): DetectorFetch => async () => new Response(new Blob([body as BlobPart]), { status });

  it("part sur la variante précise, sans modèle : l'analyse garde son repérage par les pixels", () => {
    const status = getDetector();
    expect(status.active).toBe("precise");
    expect(status.modelUrl).toBeUndefined();
    expect(status.variants.map((variant) => [variant.id, variant.installed])).toEqual([
      ["precise", false],
      ["fast", false],
    ]);
  });

  it("jette un fichier qui n'a pas la taille ou l'empreinte attendues", async () => {
    await expect(downloadDetector("fast", respond(new Uint8Array(1000)))).rejects.toThrow("n’est pas le modèle attendu");
    // À la bonne taille, mais pas le bon contenu.
    await expect(downloadDetector("fast", respond(new Uint8Array(fast.size)))).rejects.toThrow("n’est pas le modèle attendu");
    await expect(downloadDetector("fast", respond(new Uint8Array(fast.size + 10)))).rejects.toThrow("plus gros");
    await expect(downloadDetector("fast", respond(new Uint8Array(0), 404))).rejects.toThrow("404");
    expect(getDetector().variants.find((variant) => variant.id === "fast")?.installed).toBe(false);
    expect(fs.readdirSync(path.join(root, "data", "models"))).toEqual([]);
  });

  it("range un fichier vérifié, le sert par une adresse à empreinte, puis l'efface à la demande", async () => {
    // Un fichier de la bonne taille dont on connaît l'empreinte : on la fait passer pour celle attendue.
    const bytes = new Uint8Array(fast.size).fill(7);
    const original = fast.sha256;
    fast.sha256 = createHash("sha256").update(bytes).digest("hex");
    try {
      const urls: string[] = [];
      const status = await downloadDetector("fast", async (url) => {
        urls.push(url);
        return new Response(new Blob([bytes as BlobPart]));
      });
      expect(urls).toHaveLength(1);
      expect(urls[0]).toMatch(/^https:\/\/huggingface\.co\/ogkalu\/comic-text-and-bubble-detector\/resolve\/[0-9a-f]{40}\/detector-v4-s_int8\.onnx$/);
      expect(status.variants.find((variant) => variant.id === "fast")?.installed).toBe(true);
      // Choisie, elle devient l'adresse que le navigateur charge.
      const chosen = setDetectorChoice("fast");
      expect(chosen.variant).toBe("fast");
      expect(chosen.modelUrl).toBe(`/api/modules/scan-studio/data/models/detector-v4-s_int8.onnx?v=${fast.sha256.slice(0, 12)}`);
      // Déjà là : rien n'est redemandé.
      await downloadDetector("fast", async () => {
        throw new Error("ne doit pas être appelé");
      });
      expect(setDetectorChoice("off").modelUrl).toBeUndefined();
      expect(removeDetector("fast").variants.find((variant) => variant.id === "fast")?.installed).toBe(false);
    } finally {
      fast.sha256 = original;
    }
  });

  it("refuse un choix ou une variante inconnus", async () => {
    expect(() => setDetectorChoice("énorme")).toThrow("Choix de détecteur invalide.");
    await expect(downloadDetector("../secret")).rejects.toThrow("Variante de détecteur inconnue.");
    expect(() => removeDetector("../secret")).toThrow("Variante de détecteur inconnue.");
  });
});
