import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { clearBrandLogoCache, normalizeBrandOptions, processImage } from "@/modules/watermark/index.process";

const callModuleFunction = vi.fn();

vi.mock("@/lib/modules/module-manager.api", () => ({
  apiModuleManager: { callModuleFunction: (...args: unknown[]) => callModuleFunction(...args) },
}));

/** Fond gris uni, sans transparence. */
const background = (width: number, height: number, format: "png" | "jpeg" = "png") =>
  sharp({ create: { width, height, channels: 3, background: { r: 128, g: 128, b: 128 } } })[format]().toBuffer();

/** Logo carré rouge opaque. */
const redLogo = () =>
  sharp({ create: { width: 200, height: 200, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } } })
    .png()
    .toBuffer();

async function brand(overrides: Record<string, unknown> = {}) {
  return {
    kitId: "kit-1",
    name: "Ma marque",
    image: await redLogo(),
    anchor: "top-left",
    size: 0.2,
    opacity: 1,
    margin: 0.05,
    updatedAt: 1,
    ...overrides,
  };
}

async function pixel(buffer: Buffer, x: number, y: number) {
  const { data, info } = await sharp(buffer).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const offset = (y * info.width + x) * info.channels;
  return [data[offset], data[offset + 1], data[offset + 2]];
}

const isRed = ([r, g, b]: number[]) => r > 200 && g < 60 && b < 60;
const isGrey = ([r, g, b]: number[]) => Math.abs(r - 128) < 12 && Math.abs(g - 128) < 12 && Math.abs(b - 128) < 12;

/** Boîte englobante des pixels rouges. */
async function redBox(buffer: Buffer) {
  const { data, info } = await sharp(buffer).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const offset = (y * info.width + x) * info.channels;
      if (isRed([data[offset], data[offset + 1], data[offset + 2]])) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

describe("filigrane par image de marque", () => {
  beforeEach(() => {
    callModuleFunction.mockReset();
    clearBrandLogoCache();
  });

  it("pose le logo dans le coin de la marque, à sa taille et sa marge", async () => {
    callModuleFunction.mockResolvedValue(await brand());
    const output = await processImage(await background(800, 400), { source: "brand", kitId: "kit-1" });

    expect(callModuleFunction).toHaveBeenCalledWith("brand-kit", "getWatermarkImage", "kit-1");
    // Petit côté 400 : logo de 0,2 × 400 = 80 px, marge de 0,05 × 400 = 20 px.
    expect(await redBox(output)).toEqual({ left: 20, top: 20, width: 80, height: 80 });
    expect(isGrey(await pixel(output, 790, 390))).toBe(true);
    const { width, height, format } = await sharp(output).metadata();
    expect([width, height, format]).toEqual([800, 400, "png"]);
  });

  it("suit la position, la taille et la marge choisies pour l'image", async () => {
    callModuleFunction.mockResolvedValue(await brand());
    const output = await processImage(await background(600, 900), {
      source: "brand",
      kitId: "kit-1",
      position: "bottom-right",
      size: 0.5,
      margin: 0,
    });
    // Petit côté 600 : logo de 300 px collé au coin bas droit.
    expect(await redBox(output)).toEqual({ left: 300, top: 600, width: 300, height: 300 });
    expect(isGrey(await pixel(output, 10, 10))).toBe(true);
  });

  it("applique l'opacité sur le canal alpha du logo", async () => {
    callModuleFunction.mockResolvedValue(await brand({ opacity: 0.5 }));
    const output = await processImage(await background(400, 400), { source: "brand", kitId: "kit-1" });
    const [r, g, b] = await pixel(output, 40, 40);
    // Rouge à moitié sur gris 128 : environ (191, 64, 64).
    expect(Math.abs(r - 191)).toBeLessThan(6);
    expect(Math.abs(g - 64)).toBeLessThan(6);
    expect(Math.abs(b - 64)).toBeLessThan(6);
  });

  it("garde le format d'origine", async () => {
    callModuleFunction.mockResolvedValue(await brand());
    const output = await processImage(await background(300, 200, "jpeg"), { source: "brand", kitId: "kit-1" });
    expect((await sharp(output).metadata()).format).toBe("jpeg");
  });

  it("garde un logo très grand dans l'image", async () => {
    callModuleFunction.mockResolvedValue(await brand({ size: 0.8, margin: 0.25 }));
    const output = await processImage(await background(100, 50), {
      source: "brand",
      kitId: "kit-1",
      position: "middle-center",
    });
    const box = await redBox(output);
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.top).toBeGreaterThanOrEqual(0);
    expect(box.left + box.width).toBeLessThanOrEqual(100);
    expect(box.top + box.height).toBeLessThanOrEqual(50);
  });

  it("reprend les valeurs de la marque quand un réglage enregistré est vide", async () => {
    callModuleFunction.mockResolvedValue(await brand({ anchor: "bottom-left" }));
    const output = await processImage(await background(400, 400), {
      source: "brand",
      kitId: "kit-1",
      position: null as never,
      size: null,
      opacity: null as never,
      margin: null,
    });
    expect(await redBox(output)).toEqual({ left: 20, top: 300, width: 80, height: 80 });
  });

  it("échoue clairement sans logo, sans marque ou sans module", async () => {
    const input = await background(200, 200);

    callModuleFunction.mockRejectedValue(new Error("L'image de marque « X » n'a pas de logo pour le filigrane."));
    await expect(processImage(input, { source: "brand", kitId: "kit-1" })).rejects.toThrow(/pas de logo/);

    callModuleFunction.mockResolvedValue(await brand({ image: Buffer.alloc(0) }));
    await expect(processImage(input, { source: "brand", kitId: "kit-1" })).rejects.toThrow(/pas de logo/);

    callModuleFunction.mockResolvedValue(null);
    await expect(processImage(input, { source: "brand", kitId: "kit-1" })).rejects.toThrow(/absent ou désactivé/);

    await expect(processImage(input, { source: "brand" })).rejects.toThrow(/Aucune image de marque/);
    expect(() => normalizeBrandOptions({ kitId: "  " })).toThrow(/Aucune image de marque/);
  });

  it("garde le mode texte, avec ou sans source", async () => {
    const input = await background(400, 200);
    const implicit = await processImage(input, { text: "Bonjour", fontSize: 60 });
    const explicit = await processImage(input, { source: "text", text: "Bonjour", fontSize: 60 });
    expect(Buffer.compare(implicit, input)).not.toBe(0);
    expect(Buffer.compare(explicit, implicit)).toBe(0);
    expect(callModuleFunction).not.toHaveBeenCalled();
  });
});
