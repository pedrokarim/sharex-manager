import { describe, expect, it } from "vitest";

import { INPAINT_LIMITS, fingerprint, inpaint, inpaintWindow } from "@/modules/scan-studio/lib/inpaint";
import type { PixelData } from "@/modules/scan-studio/lib/mask-color";

// Des fonds dessinés par le code : un aplat, un dégradé, une trame de points.
// Le « texte » à effacer est un pavé noir posé au milieu.

type Rgb = [number, number, number];

function image(width: number, height: number, colorAt: (x: number, y: number) => Rgb): PixelData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = colorAt(x, y);
      data.set([r, g, b, 255], (y * width + x) * 4);
    }
  }
  return { data, width, height };
}

/** Masque rectangulaire, et la page où ce rectangle est couvert d'un pavé noir. */
function withBlock(source: PixelData, rect: { x: number; y: number; width: number; height: number }) {
  const mask = new Uint8Array(source.width * source.height);
  const data = new Uint8ClampedArray(source.data);
  for (let y = rect.y; y < rect.y + rect.height; y++) {
    for (let x = rect.x; x < rect.x + rect.width; x++) {
      mask[y * source.width + x] = 1;
      data.set([0, 0, 0, 255], (y * source.width + x) * 4);
    }
  }
  return { pixels: { data, width: source.width, height: source.height }, mask };
}

const pixelOf = (data: Uint8ClampedArray, width: number, x: number, y: number): Rgb => {
  const offset = (y * width + x) * 4;
  return [data[offset], data[offset + 1], data[offset + 2]];
};

/** Rien n'attend : les tests ne dépendent pas de l'horloge de la machine. */
const instant = { pause: async () => undefined, now: () => 0 };

describe("scan studio, reconstruction du fond", () => {
  it("rend exactement la couleur d'un fond uni", async () => {
    const { pixels, mask } = withBlock(image(60, 40, () => [240, 232, 210]), { x: 20, y: 12, width: 20, height: 14 });
    const result = await inpaint(pixels, mask, instant);
    if (!result.ok) throw new Error(result.message);

    expect(result.maskedPixels).toBe(280);
    expect(result.grain).toBe(false);
    for (let y = 12; y < 26; y++) {
      for (let x = 20; x < 40; x++) {
        const [r, g, b] = pixelOf(result.data, 60, x, y);
        expect(Math.abs(r - 240)).toBeLessThanOrEqual(1);
        expect(Math.abs(g - 232)).toBeLessThanOrEqual(1);
        expect(Math.abs(b - 210)).toBeLessThanOrEqual(1);
      }
    }
  });

  it("ne touche à aucun pixel hors du masque", async () => {
    const source = image(50, 50, (x, y) => [(x * 5) % 256, (y * 5) % 256, 128]);
    const { pixels, mask } = withBlock(source, { x: 15, y: 15, width: 20, height: 20 });
    const result = await inpaint(pixels, mask, instant);
    if (!result.ok) throw new Error(result.message);
    for (let index = 0; index < mask.length; index++) {
      if (mask[index]) continue;
      expect(result.data[index * 4]).toBe(pixels.data[index * 4]);
      expect(result.data[index * 4 + 1]).toBe(pixels.data[index * 4 + 1]);
      expect(result.data[index * 4 + 2]).toBe(pixels.data[index * 4 + 2]);
    }
  });

  it("prolonge un dégradé au lieu de laisser une tache", async () => {
    // Dégradé horizontal du sombre au clair : un aplat y ferait un pavé visible.
    const gradient = (x: number): Rgb => [40 + x * 2, 60 + x * 2, 90 + x];
    const { pixels, mask } = withBlock(image(100, 60, (x) => gradient(x)), { x: 35, y: 18, width: 30, height: 24 });
    const result = await inpaint(pixels, mask, instant);
    if (!result.ok) throw new Error(result.message);

    let worst = 0;
    for (let y = 18; y < 42; y++) {
      for (let x = 35; x < 65; x++) {
        const [r] = pixelOf(result.data, 100, x, y);
        worst = Math.max(worst, Math.abs(r - gradient(x)[0]));
      }
    }
    // Le dégradé va de 110 à 170 sous le masque : un aplat médian s'en écarterait de 30.
    expect(worst).toBeLessThanOrEqual(8);
    const left = pixelOf(result.data, 100, 37, 30)[0];
    const right = pixelOf(result.data, 100, 62, 30)[0];
    expect(right - left).toBeGreaterThan(35);
  });

  it("reporte le grain d'une trame dans la zone", async () => {
    // Trame de points sur fond gris : sans grain, la zone reconstruite serait lisse.
    const tone = (x: number, y: number): Rgb => (x % 4 === 0 && y % 4 === 0 ? [40, 40, 40] : [200, 200, 200]);
    const { pixels, mask } = withBlock(image(96, 96, tone), { x: 36, y: 36, width: 20, height: 20 });
    const result = await inpaint(pixels, mask, instant);
    if (!result.ok) throw new Error(result.message);
    expect(result.grain).toBe(true);

    const values: number[] = [];
    for (let y = 36; y < 56; y++) for (let x = 36; x < 56; x++) values.push(pixelOf(result.data, 96, x, y)[0]);
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const deviation = Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
    // La moyenne reste celle de la trame, et la zone garde du relief.
    expect(Math.abs(mean - 190)).toBeLessThan(12);
    expect(deviation).toBeGreaterThan(10);
    // Des points sombres existent bien à l'intérieur.
    expect(Math.min(...values)).toBeLessThan(120);
  });

  it("reconstruit une zone collée au bord de la page", async () => {
    const { pixels, mask } = withBlock(image(40, 30, () => [30, 30, 36]), { x: 0, y: 0, width: 14, height: 30 });
    const result = await inpaint(pixels, mask, instant);
    if (!result.ok) throw new Error(result.message);
    const [r, g, b] = pixelOf(result.data, 40, 2, 15);
    expect([r, g, b].every((channel, index) => Math.abs(channel - [30, 30, 36][index]) <= 1)).toBe(true);
  });

  it("rend toujours la même image pour le même masque", async () => {
    const tone = (x: number, y: number): Rgb => [(x * 7 + y * 3) % 200, (x * 3 + y * 5) % 200, 120];
    const { pixels, mask } = withBlock(image(70, 50, tone), { x: 20, y: 15, width: 25, height: 18 });
    const first = await inpaint(pixels, mask, instant);
    const second = await inpaint(pixels, mask, instant);
    if (!first.ok || !second.ok) throw new Error("reconstruction refusée");
    expect(Buffer.from(first.data).equals(Buffer.from(second.data))).toBe(true);
  });

  it("refuse honnêtement une zone trop grande, sans rien calculer", async () => {
    const side = Math.ceil(Math.sqrt(INPAINT_LIMITS.maskedPixels)) + 4;
    const pixels = image(side + 8, side + 8, () => [255, 255, 255]);
    const mask = new Uint8Array(pixels.width * pixels.height);
    for (let y = 2; y < side + 2; y++) mask.fill(1, y * pixels.width + 2, y * pixels.width + 2 + side);
    const result = await inpaint(pixels, mask, instant);
    expect(result).toMatchObject({ ok: false, reason: "too-large" });
    expect(result.ok ? "" : result.message).toMatch(/trop grande/);

    const huge = { data: new Uint8ClampedArray(0), width: 4000, height: 4000 };
    expect(await inpaint(huge, new Uint8Array(0), instant)).toMatchObject({ ok: false, reason: "empty" });
  });

  it("refuse un masque vide, et une zone sans rien autour", async () => {
    const pixels = image(20, 20, () => [10, 20, 30]);
    expect(await inpaint(pixels, new Uint8Array(400), instant)).toMatchObject({ ok: false, reason: "empty" });
    expect(await inpaint(pixels, new Uint8Array(400).fill(1), instant)).toMatchObject({ ok: false, reason: "no-context" });
    expect(await inpaint(pixels, new Uint8Array(12), instant)).toMatchObject({ ok: false, reason: "empty" });
  });

  it("s'arrête quand on l'annule", async () => {
    const { pixels, mask } = withBlock(image(80, 80, () => [200, 200, 200]), { x: 20, y: 20, width: 40, height: 40 });
    const controller = new AbortController();
    let pauses = 0;
    const result = await inpaint(pixels, mask, {
      now: () => 0,
      signal: controller.signal,
      pause: async () => {
        if (++pauses === 2) controller.abort();
      },
    });
    expect(result).toMatchObject({ ok: false, reason: "cancelled" });
  });

  it("s'arrête de lui-même quand il dépasse son temps", async () => {
    const { pixels, mask } = withBlock(image(80, 80, () => [200, 200, 200]), { x: 20, y: 20, width: 40, height: 40 });
    let clock = 0;
    const result = await inpaint(pixels, mask, { pause: async () => undefined, now: () => (clock += 400), timeBudgetMs: 1000 });
    expect(result).toMatchObject({ ok: false, reason: "timeout" });
    expect(result.ok ? "" : result.message).toMatch(/trop de temps/);
  });

  it("traite un pixel transparent comme à reconstruire", async () => {
    const pixels = image(30, 30, () => [120, 140, 160]);
    // Un trou transparent hors du masque : il ne doit pas déteindre en noir.
    for (let y = 4; y < 8; y++) for (let x = 4; x < 8; x++) pixels.data.set([0, 0, 0, 0], (y * 30 + x) * 4);
    const mask = new Uint8Array(900);
    for (let y = 12; y < 20; y++) mask.fill(1, y * 30 + 12, y * 30 + 20);
    const result = await inpaint(pixels, mask, instant);
    if (!result.ok) throw new Error(result.message);
    const [r, g, b] = pixelOf(result.data, 30, 15, 15);
    expect(Math.abs(r - 120) + Math.abs(g - 140) + Math.abs(b - 160)).toBeLessThanOrEqual(3);
  });
});

describe("scan studio, fenêtre de reconstruction", () => {
  it("entoure la zone d'un pourtour, sans sortir de la page", () => {
    expect(inpaintWindow({ x: 100, y: 80, width: 50, height: 40 }, { width: 800, height: 1200 })).toEqual({ x: 76, y: 56, width: 98, height: 88 });
    expect(inpaintWindow({ x: 4, y: 1190, width: 50, height: 40 }, { width: 800, height: 1200 })).toEqual({ x: 0, y: 1166, width: 78, height: 34 });
    expect(inpaintWindow({ x: 10.4, y: 10.6, width: 5.2, height: 5.2 }, { width: 100, height: 100 }, 2)).toEqual({ x: 8, y: 8, width: 10, height: 10 });
  });

  it("change d'empreinte dès que le masque change", () => {
    expect(fingerprint("a")).toBe(fingerprint("a"));
    expect(fingerprint("masque 1")).not.toBe(fingerprint("masque 2"));
    expect(fingerprint("")).toMatch(/^[0-9a-f]{8}$/);
  });
});
