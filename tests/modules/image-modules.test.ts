import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { addWatermark, normalizeOptions as watermarkOptions } from "@/modules/watermark/index.process";
import { cropImage, toPixelArea } from "@/modules/crop/index.process";
import { resizeImage } from "@/modules/resize/index.process";

const image = (width: number, height: number, format: "png" | "jpeg" = "png") =>
  sharp({ create: { width, height, channels: 3, background: { r: 40, g: 60, b: 90 } } })[format]().toBuffer();

describe("filigrane", () => {
  it("échappe le texte au lieu de casser le SVG", async () => {
    const input = await image(400, 200);
    const output = await addWatermark(input, { text: "A & <B>", fontSize: 40 });
    expect(Buffer.compare(output, input)).not.toBe(0);
    const { width, height } = await sharp(output).metadata();
    expect([width, height]).toEqual([400, 200]);
  });

  it("fonctionne sur une image plus petite que le texte", async () => {
    const output = await addWatermark(await image(60, 40), { text: "© ShareX Manager", fontSize: 200, padding: 50 });
    expect((await sharp(output).metadata()).width).toBe(60);
  });

  it("refuse un texte vide et corrige les valeurs aberrantes", () => {
    expect(() => watermarkOptions({ text: "   " })).toThrow("vide");
    const options = watermarkOptions({ text: "x", opacity: 7, color: "red", position: "nowhere" as never });
    expect(options).toMatchObject({ opacity: 1, color: "#ffffff", position: "bottom-right" });
  });
});

describe("recadrage", () => {
  it("convertit une zone en pourcentage vers les pixels de l'image d'origine", () => {
    expect(toPixelArea({ x: 25, y: 10, width: 50, height: 80, unit: "%" }, 2000, 1000)).toEqual({
      left: 500,
      top: 100,
      width: 1000,
      height: 800,
    });
  });

  it("borne une zone qui déborde et refuse une zone vide", () => {
    expect(toPixelArea({ x: 90, y: 0, width: 50, height: 100, unit: "%" }, 100, 100)).toEqual({ left: 90, top: 0, width: 10, height: 100 });
    expect(() => toPixelArea({ x: 0, y: 0, width: 0, height: 10, unit: "px" }, 100, 100)).toThrow();
  });

  it("recadre en rond avec de la transparence", async () => {
    const output = await cropImage(await image(400, 400, "jpeg"), {
      crop: { x: 0, y: 0, width: 50, height: 50, unit: "%" },
      circularCrop: true,
    });
    const meta = await sharp(output).metadata();
    expect(meta).toMatchObject({ width: 200, height: 200, format: "png", hasAlpha: true });
  });

  it("demande une zone quand il n'y en a pas", async () => {
    await expect(cropImage(await image(100, 100), {})).rejects.toThrow("zone");
  });
});

describe("redimensionnement", () => {
  it("réduit dans le cadre en gardant les proportions", async () => {
    const output = await resizeImage(await image(2000, 1000), { maxWidth: 800, maxHeight: 800 });
    const meta = await sharp(output).metadata();
    expect([meta.width, meta.height]).toEqual([800, 400]);
  });

  it("dit quand l'image tient déjà dans le cadre au lieu de la réencoder", async () => {
    await expect(resizeImage(await image(300, 200), { maxWidth: 800, maxHeight: 800 })).rejects.toThrow("déjà");
  });

  it("rogne au format demandé en mode « cover »", async () => {
    const output = await resizeImage(await image(2000, 1000), { maxWidth: 300, maxHeight: 300, fitMode: "cover" });
    const meta = await sharp(output).metadata();
    expect([meta.width, meta.height]).toEqual([300, 300]);
  });
});
