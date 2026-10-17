import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { contentBox, cutOutPose, dropSpecks, hasGreenBackground, keyOutGreen, type RgbaImage } from "@/modules/brand-kit/lib/cutout";
import { upgradeKit } from "@/modules/brand-kit/lib/defaults";
import { pickPose, poseCoverage, poseTags, proposePoseTags, sanitizePoseTags } from "@/modules/brand-kit/lib/mascot";
import { sanitizeKit } from "@/modules/brand-kit/lib/validate";
import { addImageToKit, createKit, exportKit, importKit, requireKit, saveKit } from "@/modules/brand-kit/lib/server/kits";
import { acceptPoseCandidate, listPoseJobs, posePrompt, rejectPoseCandidate, sanitizePoseRequests, startPoseGeneration } from "@/modules/brand-kit/lib/server/poses";
import { setDataRoot } from "@/modules/brand-kit/lib/server/store";
import type { BrandAsset, BrandKit, PoseTags } from "@/modules/brand-kit/lib/types";

// La génération d'images passe par AI Image Gen : remplacée ici par un rendu synthétique sur fond vert.
let renders: string;
vi.mock("@/modules/brand-kit/lib/server/image-gen", () => ({
  chooseModel: async () => "test/model",
  generateImage: async (input: { prompt: string }) => {
    const file = path.join(renders, `render-${Math.random().toString(36).slice(2)}.png`);
    await sharp({ create: { width: 120, height: 180, channels: 3, background: "#00ff00" } })
      .composite([{ input: await sharp({ create: { width: 40, height: 100, channels: 3, background: "#ff48b0" } }).png().toBuffer(), left: 40, top: 40 }])
      .png()
      .toFile(file);
    if (input.prompt.includes("FAIL")) throw new Error("rendu refusé");
    return { path: file, file: path.basename(file), jobId: "img-test" };
  },
}));

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "brand-kit-poses-"));
  renders = fs.mkdtempSync(path.join(os.tmpdir(), "brand-kit-renders-"));
  setDataRoot(root);
});
afterEach(() => {
  setDataRoot(null);
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(renders, { recursive: true, force: true });
});

// ─── Images synthétiques ─────────────────────────────────────────

/** Image RGBA unie, avec des rectangles posés dessus. */
function canvas(width: number, height: number, background: [number, number, number, number], boxes: { x: number; y: number; w: number; h: number; color: [number, number, number, number] }[] = []): RgbaImage {
  const data = new Uint8Array(width * height * 4);
  for (let index = 0; index < width * height; index++) data.set(background, index * 4);
  for (const box of boxes) for (let y = box.y; y < box.y + box.h; y++) for (let x = box.x; x < box.x + box.w; x++) data.set(box.color, (y * width + x) * 4);
  return { data, width, height };
}
const alphaAt = (image: RgbaImage, x: number, y: number) => image.data[(y * image.width + x) * 4 + 3];
const pixelAt = (image: RgbaImage, x: number, y: number) => Array.from(image.data.subarray((y * image.width + x) * 4, (y * image.width + x) * 4 + 4));

const GREEN: [number, number, number, number] = [0, 255, 0, 255];
const PINK: [number, number, number, number] = [255, 72, 176, 255];
const CLEAR: [number, number, number, number] = [0, 0, 0, 0];

describe("détourage d'une pose", () => {
  it("rend le fond vert transparent, garde le personnage et recadre au plus près", () => {
    const image = canvas(100, 150, GREEN, [{ x: 30, y: 40, w: 40, h: 60, color: PINK }]);
    expect(hasGreenBackground(image)).toBe(true);
    const { image: out, method } = cutOutPose(image, 0);
    expect(method).toBe("green");
    expect([out.width, out.height]).toEqual([40, 60]);
    expect(alphaAt(out, 0, 0)).toBe(255);
    expect(pixelAt(out, 20, 30)).toEqual(PINK);
  });

  it("garde une marge autour du personnage, sans sortir de l'image", () => {
    const { image: out } = cutOutPose(canvas(100, 150, GREEN, [{ x: 30, y: 40, w: 40, h: 60, color: PINK }]), 0.1);
    // 10 % du grand côté (60) : 6 pixels de chaque côté.
    expect([out.width, out.height]).toEqual([52, 72]);
    expect(alphaAt(out, 0, 0)).toBe(0);
  });

  it("adoucit un bord teinté de vert et lui retire son reflet", () => {
    // Un bord mêlé de vert : écart vert de 60, entre les deux seuils.
    const keyed = keyOutGreen(canvas(4, 4, GREEN, [{ x: 1, y: 1, w: 2, h: 2, color: [60, 140, 80, 255] }]));
    const edge = pixelAt(keyed, 1, 1);
    expect(edge[3]).toBeGreaterThan(0);
    expect(edge[3]).toBeLessThan(255);
    expect(edge[1]).toBe(80);
    expect(alphaAt(keyed, 0, 0)).toBe(0);
  });

  it("ne prend pas un vert sombre du dessin pour du fond", () => {
    const keyed = keyOutGreen(canvas(4, 4, GREEN, [{ x: 1, y: 1, w: 2, h: 2, color: [10, 90, 10, 255] }]));
    expect(alphaAt(keyed, 1, 1)).toBeGreaterThan(0);
  });

  it("retire la lueur d'un fond déjà transparent", () => {
    const image = canvas(80, 80, CLEAR, [
      { x: 10, y: 10, w: 60, h: 60, color: [255, 72, 176, 60] },
      { x: 30, y: 30, w: 20, h: 20, color: PINK },
    ]);
    const { image: out, method } = cutOutPose(image, 0);
    expect(method).toBe("glow");
    expect([out.width, out.height]).toEqual([20, 20]);
    expect(contentBox(out)).toEqual({ left: 0, top: 0, width: 20, height: 20 });
  });

  it("efface les poussières isolées sans toucher au personnage", () => {
    const image = canvas(50, 50, CLEAR, [
      { x: 10, y: 10, w: 20, h: 20, color: PINK },
      { x: 45, y: 45, w: 2, h: 2, color: [0, 200, 255, 255] },
    ]);
    const cleaned = dropSpecks(image, 10);
    expect(alphaAt(cleaned, 45, 45)).toBe(0);
    expect(alphaAt(cleaned, 15, 15)).toBe(255);
  });

  it("laisse telle quelle une image sans fond reconnu", () => {
    const image = canvas(20, 20, [240, 240, 240, 255], [{ x: 5, y: 5, w: 10, h: 10, color: PINK }]);
    const { image: out, method } = cutOutPose(image);
    expect(method).toBe("none");
    expect(out).toBe(image);
  });
});

// ─── Étiquettes ──────────────────────────────────────────────────

const pose = (id: string, tags: Partial<PoseTags> | undefined, label = "Pose"): BrandAsset => ({
  id,
  file: `${id}.png`,
  kind: "mascot-pose",
  label,
  width: 600,
  height: 1200,
  createdAt: 1,
  ...(tags ? { pose: { emotion: "neutral", gesture: "idle", framing: "full", facing: "front", ...tags } } : {}),
});

function kitWith(poses: BrandAsset[]): BrandKit {
  const kit = createKit({ name: "Bibliothèque" });
  return { ...kit, assets: poses, mascot: { identityPrompt: "", sheetAssetIds: [], poseAssetIds: poses.map((entry) => entry.id) } };
}

describe("étiquettes d'une pose", () => {
  it("n'acceptent que les listes fermées, champ par champ", () => {
    const fallback: PoseTags = { emotion: "joy", gesture: "waving", framing: "bust", facing: "left" };
    expect(sanitizePoseTags({ emotion: "surprise", gesture: "dance", framing: "full", facing: "up" }, fallback)).toEqual({
      emotion: "surprise",
      gesture: "waving",
      framing: "full",
      facing: "left",
    });
    expect(sanitizePoseTags("joie", fallback)).toEqual(fallback);
  });

  it("sont proposées d'après le libellé et la note", () => {
    expect(proposePoseTags({ label: "Debout, qui pointe", note: "Carton de fin et en-tête X.", width: 729, height: 1502 })).toEqual({
      emotion: "excitement",
      gesture: "pointing",
      framing: "full",
      facing: "front",
    });
    expect(proposePoseTags({ label: "Accoudée à la manette", note: "Bannière YouTube.", width: 1459, height: 1004 })).toMatchObject({ gesture: "leaning", framing: "bust" });
    expect(proposePoseTags({ label: "Portrait, capuche à cloches", width: 1205, height: 1244 })).toEqual({ emotion: "neutral", gesture: "idle", framing: "bust", facing: "front" });
    expect(proposePoseTags({ label: "Mains sur les joues, étonnée", width: 800, height: 800 })).toMatchObject({ emotion: "surprise", gesture: "hands-on-cheeks" });
    expect(proposePoseTags({ label: "Montre du doigt vers la droite", width: 600, height: 1200 })).toMatchObject({ gesture: "pointing", facing: "right" });
    expect(proposePoseTags({ label: "Montre sa manette, fière", width: 600, height: 1200 })).toMatchObject({ emotion: "pride", gesture: "showing-object" });
  });

  it("migration douce : une pose d'avant reçoit des étiquettes, une étiquette abîmée est complétée", () => {
    const legacy = { ...kitWith([]), assets: [pose("ast-old1", undefined, "Debout, qui pointe"), { ...pose("ast-old2", undefined), pose: { emotion: "rage", gesture: "waving" } as unknown as PoseTags }] };
    legacy.assets.push({ id: "ast-logo1", file: "logo.png", kind: "logo", label: "Logo", width: 10, height: 10, createdAt: 1 });
    const upgraded = upgradeKit(legacy);
    expect(upgraded.assets[0].pose).toEqual({ emotion: "excitement", gesture: "pointing", framing: "full", facing: "front" });
    expect(upgraded.assets[1].pose).toEqual({ emotion: "neutral", gesture: "waving", framing: "full", facing: "front" });
    expect(upgraded.assets[2].pose).toBeUndefined();
  });

  it("l'éditeur les modifie, avec rigueur ; les autres images n'en ont jamais", () => {
    const stored = { ...kitWith([pose("ast-joy1", { emotion: "joy" })]) };
    stored.assets.push({ id: "ast-logo1", file: "logo.png", kind: "logo", label: "Logo", width: 10, height: 10, createdAt: 1 });
    const changed = sanitizeKit(
      {
        ...stored,
        assets: [
          { ...stored.assets[0], pose: { emotion: "anger", gesture: "arms-crossed", framing: "giant", facing: "right" } },
          { ...stored.assets[1], pose: { emotion: "joy", gesture: "waving", framing: "full", facing: "front" } },
        ],
      },
      stored
    );
    expect(changed.assets[0].pose).toEqual({ emotion: "anger", gesture: "arms-crossed", framing: "full", facing: "right" });
    expect(changed.assets[1].pose).toBeUndefined();
  });

  it("compte les poses par émotion", () => {
    const kit = kitWith([pose("ast-a1", { emotion: "joy" }), pose("ast-a2", { emotion: "joy" }), pose("ast-a3", { emotion: "doubt" })]);
    const coverage = poseCoverage(kit);
    expect(coverage.joy).toBe(2);
    expect(coverage.doubt).toBe(1);
    expect(coverage.anger).toBe(0);
  });
});

// ─── Choix de la pose ────────────────────────────────────────────

describe("pickPose", () => {
  const library = kitWith([
    pose("ast-neutral1", { emotion: "neutral", gesture: "presenting", facing: "right" }),
    pose("ast-joy1", { emotion: "joy", gesture: "thumbs-up", facing: "right" }),
    pose("ast-joy2", { emotion: "joy", gesture: "waving", framing: "bust", facing: "left" }),
    pose("ast-excite1", { emotion: "excitement", gesture: "arms-raised" }),
    pose("ast-sad1", { emotion: "sadness", gesture: "idle" }),
  ]);

  it("prend l'émotion exacte", () => {
    expect(pickPose(library, { emotion: "excitement" })?.id).toBe("ast-excite1");
    expect(pickPose(library, { emotion: "sadness" })?.id).toBe("ast-sad1");
  });

  it("sinon une émotion voisine, la plus proche d'abord", () => {
    // Fierté : voisines joie, puis enthousiasme.
    expect(poseTags(pickPose(library, { emotion: "pride" })!).emotion).toBe("joy");
    // Surprise : voisines choc (absent), puis enthousiasme.
    expect(pickPose(library, { emotion: "surprise" })?.id).toBe("ast-excite1");
    // Déception : voisine tristesse.
    expect(pickPose(library, { emotion: "disappointment" })?.id).toBe("ast-sad1");
  });

  it("sinon une pose neutre, jamais une émotion qui n'est pas voisine", () => {
    // Colère : ni déception ni choc dans la bibliothèque ; la tristesse n'est pas voisine.
    expect(pickPose(library, { emotion: "anger" })?.id).toBe("ast-neutral1");
  });

  it("ne rend rien quand seules des émotions éloignées existent", () => {
    const sad = kitWith([pose("ast-sad1", { emotion: "sadness" })]);
    expect(pickPose(sad, { emotion: "joy" })).toBeUndefined();
    expect(pickPose(kitWith([]), { emotion: "joy" })).toBeUndefined();
  });

  it("évite la pose précédente quand une autre convient, la garde sinon", () => {
    expect(pickPose(library, { emotion: "joy", exclude: "ast-joy1" })?.id).toBe("ast-joy2");
    // Les deux poses de joie exclues : une voisine (enthousiasme) plutôt que de répéter.
    expect(pickPose(library, { emotion: "joy", exclude: ["ast-joy1", "ast-joy2"] })?.id).toBe("ast-excite1");
    const single = kitWith([pose("ast-only1", { emotion: "doubt" })]);
    expect(pickPose(single, { emotion: "doubt", exclude: "ast-only1" })?.id).toBe("ast-only1");
  });

  it("préfère le bon geste et le bon cadrage à émotion égale", () => {
    expect(pickPose(library, { emotion: "joy", gesture: "waving" })?.id).toBe("ast-joy2");
    expect(pickPose(library, { emotion: "joy", framing: "bust" })?.id).toBe("ast-joy2");
  });

  it("préfère le côté demandé, puis une pose de face, puis le côté opposé", () => {
    expect(pickPose(library, { emotion: "joy", side: "left" })?.id).toBe("ast-joy2");
    expect(pickPose(library, { emotion: "joy", side: "right" })?.id).toBe("ast-joy1");
    const sides = kitWith([
      pose("ast-right1", { emotion: "pride", facing: "right" }),
      pose("ast-front1", { emotion: "pride", facing: "front" }),
    ]);
    expect(pickPose(sides, { emotion: "pride", side: "left" })?.id).toBe("ast-front1");
  });

  it("lit les poses sans étiquettes d'après leur libellé", () => {
    const legacy = kitWith([pose("ast-old1", undefined, "Debout, qui pointe"), pose("ast-old2", undefined, "Portrait")]);
    expect(pickPose(legacy, { emotion: "excitement" })?.id).toBe("ast-old1");
    expect(pickPose(legacy, { emotion: "thinking" })?.id).toBe("ast-old2");
  });
});

// ─── Serveur ─────────────────────────────────────────────────────

const greenScreen = () =>
  sharp({ create: { width: 200, height: 300, channels: 3, background: "#00ff00" } })
    .composite([{ input: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="200"><rect width="80" height="200" fill="#3d5588"/></svg>'), left: 60, top: 50 }])
    .png()
    .toBuffer();

async function waitForJob(kitId: string) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const jobs = listPoseJobs(kitId);
    if (jobs.every((job) => job.status !== "running")) return jobs;
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  throw new Error("génération trop longue");
}

describe("poses côté serveur", () => {
  it("une pose importée sur fond vert est détourée, recadrée et étiquetée", async () => {
    const kit = createKit({ name: "Import" });
    const { asset } = await addImageToKit(kit.id, await greenScreen(), "mascot-pose", "Bras croisés, fâchée");
    // 80 × 200 et une marge de 2 % du grand côté (4 px).
    expect([asset.width, asset.height]).toEqual([88, 208]);
    expect(asset.pose).toMatchObject({ emotion: "anger", gesture: "arms-crossed" });
    const stored = await sharp(path.join(root, "kits", kit.id, "assets", asset.file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(stored.data[3]).toBe(0);
    expect(requireKit(kit.id).mascot?.poseAssetIds).toEqual([asset.id]);
  });

  it("une archive exportée puis importée garde les étiquettes des poses", async () => {
    const kit = createKit({ name: "Archive" });
    const { asset } = await addImageToKit(kit.id, await greenScreen(), "mascot-pose", "Pose", { pose: { emotion: "mischief", gesture: "finger-on-lips", framing: "bust", facing: "left" } });
    const copy = await importKit(exportKit(kit.id).data);
    const imported = copy.assets.find((entry) => entry.kind === "mascot-pose");
    expect(imported?.id).not.toBe(asset.id);
    expect(imported?.pose).toEqual({ emotion: "mischief", gesture: "finger-on-lips", framing: "bust", facing: "left" });
  });

  it("les demandes sont contrôlées, dédoublonnées et bornées", () => {
    const requests = sanitizePoseRequests([
      { emotion: "joy", gesture: "thumbs-up", framing: "full", facing: "front" },
      { emotion: "joy", gesture: "thumbs-up", framing: "full", facing: "front" },
      { emotion: "rage" },
      { emotion: "doubt", gesture: "juggling" },
      ...Array.from({ length: 20 }, () => ({ emotion: "pride", facing: "left" })),
    ]);
    expect(requests[0]).toEqual({ emotion: "joy", gesture: "thumbs-up", framing: "full", facing: "front" });
    expect(requests[1]).toEqual({ emotion: "doubt", gesture: "idle", framing: "full", facing: "front" });
    expect(requests).toHaveLength(3);
  });

  it("la consigne demande le même personnage, la pose et un fond vert uni", () => {
    const kit = { ...createKit({ name: "Consigne" }), mascot: { identityPrompt: "Young woman, pink headphones.", sheetAssetIds: [], poseAssetIds: [] } };
    const prompt = posePrompt(kit, { emotion: "surprise", gesture: "hands-on-cheeks", framing: "bust", facing: "left" });
    expect(prompt).toContain("Young woman, pink headphones.");
    expect(prompt).toContain("palms pressed on her cheeks");
    expect(prompt).toContain("#00FF00");
    expect(prompt).toContain("LEFT side");
  });

  it("génère des poses à accepter ou rejeter, sans rien ajouter en silence", async () => {
    const created = createKit({ name: "Génération" });
    const kit = saveKit({ ...created, mascot: { identityPrompt: "Original mascot.", sheetAssetIds: [], poseAssetIds: [] } }, created.updatedAt);
    await expect(startPoseGeneration(kit.id, [])).rejects.toThrow(/au moins une pose/);

    const job = await startPoseGeneration(kit.id, [
      { emotion: "joy", gesture: "thumbs-up", framing: "full", facing: "right" },
      { emotion: "doubt", gesture: "shrugging", framing: "full", facing: "front" },
    ]);
    expect(job.candidates).toHaveLength(2);
    const [done] = await waitForJob(kit.id);
    expect(done.status).toBe("done");
    expect(done.candidates.every((candidate) => candidate.state === "ready" && candidate.file)).toBe(true);
    // Rien dans la marque avant la décision.
    expect(requireKit(kit.id).mascot?.poseAssetIds).toEqual([]);

    const [first, second] = done.candidates;
    const accepted = await acceptPoseCandidate(kit.id, done.id, first.id, { ...first.tags, facing: "left" });
    const added = accepted.assets.find((asset) => asset.kind === "mascot-pose")!;
    expect(added.pose).toEqual({ emotion: "joy", gesture: "thumbs-up", framing: "full", facing: "left" });
    expect(added.label).toBe("Joie · pouce levé");
    // 40 × 100 et une marge de 2 % du grand côté, la même après le second passage du détourage.
    expect([added.width, added.height]).toEqual([44, 104]);
    expect(fs.existsSync(path.join(root, "kits", kit.id, "pending", first.file!))).toBe(false);
    await expect(acceptPoseCandidate(kit.id, done.id, first.id)).rejects.toThrow(/n’attend plus/);

    rejectPoseCandidate(kit.id, done.id, second.id);
    expect(fs.existsSync(path.join(root, "kits", kit.id, "pending", second.file!))).toBe(false);
    expect(requireKit(kit.id).mascot?.poseAssetIds).toEqual([added.id]);
    expect(listPoseJobs(kit.id)).toEqual([]);
  });

  it("refuse de générer sans identité ni feuille de modèle", async () => {
    const kit = createKit({ name: "Sans mascotte" });
    await expect(startPoseGeneration(kit.id, [{ emotion: "joy" }])).rejects.toThrow(/Décrivez d’abord la mascotte/);
  });
});
