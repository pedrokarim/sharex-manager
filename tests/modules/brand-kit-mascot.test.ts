import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BANNER_SAFE_AREA, FORMATS, buildFormat } from "@/modules/brand-kit/lib/formats";
import { formatPose, openingPose, proposedFormatPose } from "@/modules/brand-kit/lib/mascot";
import { toBrandTheme } from "@/modules/brand-kit/lib/theme";
import { sanitizeKit } from "@/modules/brand-kit/lib/validate";
import {
  addImageToKit,
  clearFormatImage,
  createKit,
  exportKit,
  getWatermarkImage,
  importKit,
  removeKitAsset,
  requireKit,
  saveKit,
  setFormatImage,
} from "@/modules/brand-kit/lib/server/kits";
import { kitDir, readKit, setDataRoot } from "@/modules/brand-kit/lib/server/store";
import type { BrandKit } from "@/modules/brand-kit/lib/types";
import type { ClipItem, ImageItem, TextItem } from "@/modules/clip-studio/engine/types";

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "brand-kit-mascot-"));
  setDataRoot(root);
});
afterEach(() => {
  setDataRoot(null);
  fs.rmSync(root, { recursive: true, force: true });
});

const png = (width: number, height: number, color = "#ff48b0", channels: 3 | 4 = 4) =>
  sharp({ create: { width, height, channels, background: color } }).png().toBuffer();

const items = (format: ReturnType<typeof buildFormat>): ClipItem[] => format.project.tracks.flatMap((track) => track.items);
const images = (format: ReturnType<typeof buildFormat>) => items(format).filter((item): item is ImageItem => item.type === "image");
const showsAsset = (format: ReturnType<typeof buildFormat>, file: string) => images(format).some((item) => item.source.url.endsWith(`/${file}`));

/** Une marque avec un logo, une accroche et trois poses notées comme celles d'une vraie mascotte. */
async function kitWithPoses() {
  const kit = createKit({ name: "Kanto" });
  await addImageToKit(kit.id, await png(1378, 320), "logo", "Impression double");
  const standing = (await addImageToKit(kit.id, await png(729, 1502), "mascot-pose", "Debout, qui pointe")).asset;
  const leaning = (await addImageToKit(kit.id, await png(1459, 1004), "mascot-pose", "Accoudée à la manette")).asset;
  const portrait = (await addImageToKit(kit.id, await png(1205, 1244), "mascot-pose", "Portrait, capuche à cloches")).asset;
  const stored = requireKit(kit.id);
  const noted = saveKit(
    {
      ...stored,
      tagline: "Le jeu, en couleurs.",
      assets: stored.assets.map((asset) =>
        asset.id === standing.id ? { ...asset, note: "Carton de fin et en-tête X." } : asset.id === leaning.id ? { ...asset, note: "Bannière YouTube." } : asset.id === portrait.id ? { ...asset, note: "Avatar." } : asset
      ),
    },
    stored.updatedAt
  );
  return { kit: noted, standing, leaning, portrait };
}

describe("pose de la mascotte par format", () => {
  it("propose une pose par format d'après les notes, jamais sur le filigrane", async () => {
    const { kit, standing, leaning, portrait } = await kitWithPoses();
    expect(proposedFormatPose(kit, "banner")?.id).toBe(leaning.id);
    expect(proposedFormatPose(kit, "avatar")?.id).toBe(portrait.id);
    expect(proposedFormatPose(kit, "x-header")?.id).toBe(standing.id);
    expect(proposedFormatPose(kit, "short-cover")).toBeUndefined();
    expect(formatPose(kit, "watermark")).toBeUndefined();

    expect(showsAsset(buildFormat(kit, "banner"), leaning.file)).toBe(true);
    expect(showsAsset(buildFormat(kit, "avatar"), portrait.file)).toBe(true);
    expect(showsAsset(buildFormat(kit, "x-header"), standing.file)).toBe(true);
    for (const pose of [standing, leaning, portrait]) expect(showsAsset(buildFormat(kit, "watermark"), pose.file)).toBe(false);
  });

  it("sans note, choisit d'après la forme : la plus large, la plus carrée, la plus haute", async () => {
    const kit = createKit({ name: "Riso" });
    const tall = (await addImageToKit(kit.id, await png(300, 900), "mascot-pose", "Une")).asset;
    const wide = (await addImageToKit(kit.id, await png(900, 400), "mascot-pose", "Deux")).asset;
    const square = (await addImageToKit(kit.id, await png(500, 520), "mascot-pose", "Trois")).asset;
    const stored = requireKit(kit.id);
    expect(proposedFormatPose(stored, "banner")?.id).toBe(wide.id);
    expect(proposedFormatPose(stored, "avatar")?.id).toBe(square.id);
    expect(proposedFormatPose(stored, "x-header")?.id).toBe(tall.id);
  });

  it("suit le choix de la marque, « sans mascotte » compris, et le garde à l'enregistrement", async () => {
    const { kit, standing, leaning, portrait } = await kitWithPoses();
    const saved = saveKit({ ...kit, mascot: { ...kit.mascot!, formatPoses: { banner: standing.id, avatar: null, "short-cover": portrait.id } } }, kit.updatedAt);
    expect(saved.mascot?.formatPoses).toEqual({ banner: standing.id, avatar: null, "short-cover": portrait.id });
    expect(showsAsset(buildFormat(saved, "banner"), standing.file)).toBe(true);
    expect(showsAsset(buildFormat(saved, "banner"), leaning.file)).toBe(false);
    // Sans mascotte : le rendu d'avant, un logo sur l'accent.
    expect(buildFormat(saved, "avatar").pose).toBeUndefined();
    expect(images(buildFormat(saved, "avatar"))).toHaveLength(1);
    expect(showsAsset(buildFormat(saved, "short-cover", { coverTitle: "Titre" }), portrait.file)).toBe(true);
  });

  it("garde le logo, l'accroche et le visage de la bannière dans la zone sûre", async () => {
    const { kit, leaning } = await kitWithPoses();
    const banner = buildFormat(kit, "banner");
    const safe = BANNER_SAFE_AREA;
    const inside = (item: ImageItem | TextItem) => {
      const { x, y, width, height } = item.transform;
      return x - width / 2 >= safe.x - 1e-9 && x + width / 2 <= safe.x + safe.width + 1e-9 && y - height / 2 >= safe.y - 1e-9 && y + height / 2 <= safe.y + safe.height + 1e-9;
    };
    const logo = images(banner).find((item) => item.source.name === "Impression double")!;
    const tagline = items(banner).find((item): item is TextItem => item.type === "text")!;
    const pose = images(banner).find((item) => item.source.url.endsWith(leaning.file))!;
    expect(inside(logo)).toBe(true);
    expect(inside(tagline)).toBe(true);
    expect(tagline.style.align).toBe("left");
    // La mascotte est à côté du logo, son centre (le visage) dans la zone sûre.
    expect(pose.transform.x - pose.transform.width / 2).toBeGreaterThan(logo.transform.x + logo.transform.width / 2);
    expect(pose.transform.x).toBeLessThan(safe.x + safe.width);
    expect(pose.transform.y).toBeGreaterThan(safe.y);
    expect(pose.transform.y).toBeLessThan(safe.y + safe.height);
  });

  it("cadre l'avatar sur le haut de la pose et garde l'en-tête X libre en bas à gauche", async () => {
    const { kit, portrait, standing } = await kitWithPoses();
    const avatar = images(buildFormat(kit, "avatar")).find((item) => item.source.url.endsWith(portrait.file))!;
    // Le haut de la pose (la tête) près du haut du cercle.
    expect(avatar.transform.y - avatar.transform.height / 2).toBeLessThan(0.1);
    const header = buildFormat(kit, "x-header");
    const pose = images(header).find((item) => item.source.url.endsWith(standing.file))!;
    expect(pose.transform.x - pose.transform.width / 2).toBeGreaterThan(0.5);
    for (const item of items(header)) {
      if (item.type === "audio" || item.type === "shape" || (item.type === "image" && (item.transform.width >= 0.95 || item.source.ref.startsWith("decor:")))) continue;
      // Logo, accroche, mascotte : rien dans le quart bas gauche, sous l'avatar.
      const left = item.transform.x - item.transform.width / 2;
      const top = item.transform.y - item.transform.height / 2;
      expect(left < 0.25 && top + item.transform.height > 0.6).toBe(false);
    }
  });

  it("met la pose du carton de fin dans le format et dans le thème des vidéos", async () => {
    const { kit, standing } = await kitWithPoses();
    const withPose = saveKit({ ...kit, endCard: { ...kit.endCard, poseAssetId: standing.id } }, kit.updatedAt);
    expect(showsAsset(buildFormat(withPose, "endcard-vertical"), standing.file)).toBe(true);
    expect(toBrandTheme(withPose).endCard?.pose?.url).toContain(standing.file);
    // Sans pose de carton : rien de la mascotte.
    expect(buildFormat(kit, "endcard-vertical").pose).toBeUndefined();
  });

  it("ne change rien aux formats d'une marque sans pose", async () => {
    const kit = createKit({ name: "Riso" });
    await addImageToKit(kit.id, await png(400, 200), "logo", "Logo");
    const stored = requireKit(kit.id);
    for (const spec of FORMATS) {
      const built = buildFormat(stored, spec.id);
      expect(built.pose).toBeUndefined();
      expect(built.supplied).toBeUndefined();
      expect(images(built).every((item) => !item.source.ref.startsWith("decor:"))).toBe(true);
    }
  });
});

describe("image finie d'un format", () => {
  it("remplace le rendu composé, contrôlée et ré-encodée à la taille exacte", async () => {
    const { kit } = await kitWithPoses();
    const saved = await setFormatImage(kit.id, "banner", await png(2560, 1440, "#3d5588", 3));
    const assetId = saved.formatImages?.banner;
    const asset = saved.assets.find((entry) => entry.id === assetId)!;
    expect(asset.kind).toBe("format");
    expect([asset.width, asset.height]).toEqual([2560, 1440]);
    const built = buildFormat(saved, "banner");
    expect(built.supplied?.id).toBe(assetId);
    expect(items(built)).toHaveLength(1);
    expect(images(built)[0].transform).toMatchObject({ x: 0.5, y: 0.5, width: 1, height: 1 });
    // Les autres formats gardent leur rendu composé.
    expect(buildFormat(saved, "avatar").supplied).toBeUndefined();
  });

  it("ramène une image à la bonne proportion à sa taille, refuse une mauvaise proportion", async () => {
    const kit = createKit({ name: "Riso" });
    const saved = await setFormatImage(kit.id, "x-header", await png(3000, 1000));
    const asset = saved.assets.find((entry) => entry.id === saved.formatImages?.["x-header"])!;
    const meta = await sharp(path.join(kitDir(kit.id), "assets", asset.file)).metadata();
    expect([meta.width, meta.height, meta.format]).toEqual([1500, 500, "png"]);
    await expect(setFormatImage(kit.id, "avatar", await png(800, 600))).rejects.toThrow(/800 × 800/);
    await expect(setFormatImage(kit.id, "avatar", Buffer.from("pas une image"))).rejects.toThrow(/pas une image/);
    await expect(setFormatImage(kit.id, "inconnu", await png(10, 10))).rejects.toThrow(/Format inconnu/);
  });

  it("ne range pas deux fois la même image, remplace la précédente, et revient au rendu composé", async () => {
    const kit = createKit({ name: "Riso" });
    const image = await png(1080, 1920, "#f2ede4", 3);
    const first = await setFormatImage(kit.id, "endcard-vertical", image);
    const again = await setFormatImage(kit.id, "endcard-vertical", image);
    expect(again.formatImages).toEqual(first.formatImages);
    expect(again.assets.filter((asset) => asset.kind === "format")).toHaveLength(1);

    const other = await setFormatImage(kit.id, "endcard-vertical", await png(1080, 1920, "#ff48b0", 3));
    expect(other.assets.filter((asset) => asset.kind === "format")).toHaveLength(1);
    expect(other.formatImages?.["endcard-vertical"]).not.toBe(first.formatImages?.["endcard-vertical"]);
    expect(fs.readdirSync(path.join(kitDir(kit.id), "assets"))).toHaveLength(1);
    // Le carton des shorts reprend l'image finie ; celui des vidéos en paysage reste composé.
    expect(toBrandTheme(other).endCard?.images?.vertical).toBeDefined();
    expect(toBrandTheme(other).endCard?.images?.horizontal).toBeUndefined();

    const cleared = clearFormatImage(kit.id, "endcard-vertical");
    expect(cleared.formatImages?.["endcard-vertical"]).toBeUndefined();
    expect(cleared.assets.some((asset) => asset.kind === "format")).toBe(false);
    expect(buildFormat(cleared, "endcard-vertical").supplied).toBeUndefined();
  });

  it("sert de filigrane aux captures, telle quelle", async () => {
    const kit = createKit({ name: "Riso" });
    await addImageToKit(kit.id, await png(200, 200), "logo", "Logo");
    const saved = await setFormatImage(kit.id, "watermark", await png(150, 150, "#3d5588"));
    const asset = saved.assets.find((entry) => entry.id === saved.formatImages?.watermark)!;
    const mark = getWatermarkImage(kit.id);
    expect(mark.image.equals(fs.readFileSync(path.join(kitDir(kit.id), "assets", asset.file)))).toBe(true);
    // La transparence du filigrane est gardée.
    expect((await sharp(mark.image).metadata()).hasAlpha).toBe(true);
  });

  it("ne vient jamais du navigateur : une fiche envoyée ne peut ni l'ajouter ni la déplacer", async () => {
    const kit = createKit({ name: "Riso" });
    const logo = (await addImageToKit(kit.id, await png(200, 200), "logo", "Logo")).asset;
    const stored = requireKit(kit.id);
    const saved = saveKit({ ...stored, formatImages: { banner: logo.id } }, stored.updatedAt);
    expect(saved.formatImages).toBeUndefined();
  });

  it("quitte la marque avec son image, et suit les archives", async () => {
    const { kit, leaning } = await kitWithPoses();
    const withImage = await setFormatImage(kit.id, "avatar", await png(800, 800, "#ff48b0", 3));
    const posed = saveKit({ ...withImage, mascot: { ...withImage.mascot!, formatPoses: { banner: leaning.id, avatar: null } } }, withImage.updatedAt);
    const copy = await importKit(exportKit(posed.id).data);
    expect(copy.formatImages?.avatar).toBeDefined();
    expect(copy.assets.find((asset) => asset.id === copy.formatImages?.avatar)?.kind).toBe("format");
    const copiedLeaning = copy.assets.find((asset) => asset.label === "Accoudée à la manette")!;
    expect(copy.mascot?.formatPoses).toEqual({ banner: copiedLeaning.id, avatar: null });

    const removed = removeKitAsset(posed.id, posed.formatImages!.avatar!);
    expect(removed.formatImages?.avatar).toBeUndefined();
    const withoutPose = removeKitAsset(posed.id, leaning.id);
    expect(withoutPose.mascot?.formatPoses?.banner).toBeUndefined();
  });
});

describe("présence de la mascotte dans les vidéos", () => {
  it("passe au thème seulement quand elle est allumée", async () => {
    const { kit, standing, leaning } = await kitWithPoses();
    expect(toBrandTheme(kit).mascot).toBeUndefined();
    const on = saveKit({ ...kit, mascot: { ...kit.mascot!, presence: { opening: true, reactions: true } } }, kit.updatedAt);
    const theme = toBrandTheme(on);
    // Ouverture : la pose de l'en-tête X, faute de choix.
    expect(openingPose(on)?.id).toBe(standing.id);
    expect(theme.mascot?.opening?.url).toContain(standing.file);
    expect(theme.mascot?.reactions).toHaveLength(3);

    const chosen = saveKit({ ...on, mascot: { ...on.mascot!, presence: { opening: true, openingPoseId: leaning.id, reactions: false } } }, on.updatedAt);
    expect(toBrandTheme(chosen).mascot?.opening?.url).toContain(leaning.file);
    expect(toBrandTheme(chosen).mascot?.reactions).toEqual([]);
  });
});

describe("migration douce", () => {
  it("lit une fiche d'avant les poses par format et la complète sans rien casser", async () => {
    const { kit, leaning } = await kitWithPoses();
    // Une fiche écrite avant : ni poses par format, ni présence, ni images finies.
    const legacy = JSON.parse(fs.readFileSync(path.join(kitDir(kit.id), "brand.json"), "utf-8")) as BrandKit;
    delete legacy.formatImages;
    delete legacy.registrationMarks;
    delete legacy.mascot!.formatPoses;
    delete legacy.mascot!.presence;
    fs.writeFileSync(path.join(kitDir(kit.id), "brand.json"), JSON.stringify(legacy));
    const read = readKit(kit.id)!;
    expect(formatPose(read, "banner")?.id).toBe(leaning.id);
    expect(toBrandTheme(read).mascot).toBeUndefined();

    // Des réglages abîmés sont oubliés, pas inventés.
    const cleaned = sanitizeKit(
      { ...read, mascot: { ...read.mascot!, formatPoses: { banner: "ast-inconnue", watermark: leaning.id, avatar: 42 }, presence: { opening: "oui", reactions: true, openingPoseId: "x" } } },
      read
    );
    expect(cleaned.mascot?.formatPoses).toBeUndefined();
    expect(cleaned.mascot?.presence).toEqual({ opening: false, reactions: true });
  });
});
