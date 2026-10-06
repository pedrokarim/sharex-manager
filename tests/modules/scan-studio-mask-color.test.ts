import { describe, expect, it } from "vitest";
import { rgbToHex, sampleBackgroundColor, sampleColorAt, type PixelData } from "@/modules/scan-studio/lib/mask-color";

type Rgb = [number, number, number];

/** Image unie, retouchée pixel par pixel par `paint`. */
function makeImage(width: number, height: number, base: Rgb, paint?: (x: number, y: number) => Rgb | null): PixelData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const color = paint?.(x, y) ?? base;
      data.set([...color, 255], (y * width + x) * 4);
    }
  }
  return { data, width, height };
}

const bounds = { x: 10, y: 10, width: 20, height: 20 };

describe("sampleBackgroundColor", () => {
  it("rend le blanc d'une bulle blanche malgré le texte noir à l'intérieur", () => {
    const image = makeImage(40, 40, [255, 255, 255], (x, y) => (x > 14 && x < 26 && y > 14 && y < 26 ? [0, 0, 0] : null));
    expect(sampleBackgroundColor(image, bounds)).toBe("#ffffff");
  });

  it("ignore le trait noir qui traverse le pourtour d'une bulle claire", () => {
    // Un tiers du pourtour est du trait : la médiane seule resterait claire, mais salie sans le filtre.
    const image = makeImage(40, 40, [250, 248, 240], (x) => (x % 3 === 0 ? [10, 10, 10] : null));
    expect(sampleBackgroundColor(image, bounds)).toBe("#faf8f0");
  });

  it("rend le noir d'une bulle noire malgré des reflets blancs", () => {
    const image = makeImage(40, 40, [12, 12, 14], (x, y) => ((x + y) % 4 === 0 ? [255, 255, 255] : null));
    expect(sampleBackgroundColor(image, bounds)).toBe("#0c0c0e");
  });

  it("rend une couleur de fond autre que noir ou blanc", () => {
    const image = makeImage(40, 40, [240, 200, 120]);
    expect(sampleBackgroundColor(image, bounds)).toBe("#f0c878");
  });

  it("lit à l'intérieur quand la zone couvre toute l'image", () => {
    const image = makeImage(20, 20, [200, 220, 240]);
    expect(sampleBackgroundColor(image, { x: 0, y: 0, width: 20, height: 20 })).toBe("#c8dcf0");
  });

  it("rend la couleur de repli pour une zone vide ou une image sans pixel lisible", () => {
    const image = makeImage(10, 10, [0, 0, 0]);
    expect(sampleBackgroundColor(image, { x: 2, y: 2, width: 0, height: 0 }, { fallback: "#123456" })).toBe("#123456");
    const transparent: PixelData = { data: new Uint8ClampedArray(10 * 10 * 4), width: 10, height: 10 };
    expect(sampleBackgroundColor(transparent, { x: 2, y: 2, width: 4, height: 4 })).toBe("#ffffff");
  });

  it("accepte des bornes décimales et qui débordent de l'image", () => {
    const image = makeImage(30, 30, [100, 110, 120]);
    expect(sampleBackgroundColor(image, { x: -5.4, y: 12.6, width: 20.2, height: 40 })).toBe("#646e78");
  });
});

describe("sampleColorAt", () => {
  it("lisse un pixel isolé de trame par la médiane du voisinage", () => {
    const image = makeImage(9, 9, [200, 200, 200], (x, y) => (x === 4 && y === 4 ? [0, 0, 0] : null));
    expect(sampleColorAt(image, 4.5, 4.5)).toBe("#c8c8c8");
  });

  it("rend null hors de l'image", () => {
    const image = makeImage(4, 4, [1, 2, 3]);
    expect(sampleColorAt(image, 40, 40)).toBeNull();
    expect(sampleColorAt(image, 0, 0)).toBe("#010203");
  });
});

describe("rgbToHex", () => {
  it("écrit chaque canal sur deux chiffres", () => {
    expect(rgbToHex([0, 10.4, 255])).toBe("#000aff");
  });
});
