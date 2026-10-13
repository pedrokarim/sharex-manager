import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PublishField } from "@/lib/connections/types";

// Données du module dans un dossier temporaire : `store.ts` fige ses chemins
// sur `process.cwd()` au chargement, d'où ce réglage avant tout import.
const { root, restoreCwd } = await vi.hoisted(async () => {
  const fsModule = await import("node:fs");
  const osModule = await import("node:os");
  const pathModule = await import("node:path");
  const dir = fsModule.mkdtempSync(pathModule.join(osModule.tmpdir(), "clip-post-"));
  const original = process.cwd.bind(process);
  process.cwd = () => dir;
  return { root: dir, restoreCwd: () => (process.cwd = original) };
});

const spies = vi.hoisted(() => ({
  callModuleFunction: vi.fn(),
  enqueuePublish: vi.fn(),
  listJobs: vi.fn(),
}));

vi.mock("@/lib/modules/module-manager.api", () => ({
  apiModuleManager: { callModuleFunction: (...args: unknown[]) => spies.callModuleFunction(...args), getLoadedModule: () => null },
}));
vi.mock("@/lib/gallery-events", () => ({ announceNewUpload: async () => undefined }));
vi.mock("@/lib/media/video", () => ({ prepareVideo: async () => undefined }));
vi.mock("@/lib/config", () => ({ getAbsoluteUploadPath: () => path.join(root, "uploads") }));

const YOUTUBE_FIELDS: PublishField[] = [
  { key: "title", kind: "text", label: "Titre", role: "title", maxLength: 100, required: true },
  { key: "description", kind: "textarea", label: "Description", role: "description", maxLength: 5000, maxBytes: 5000 },
  { key: "tags", kind: "tags", label: "Tags", role: "tags", maxTotal: 500 },
  { key: "privacy", kind: "select", label: "Visibilité", role: "privacy", choices: [{ value: "private", label: "Privée" }], defaultValue: "private" },
];
const THREADS_FIELDS: PublishField[] = [
  { key: "text", kind: "textarea", label: "Texte", role: "caption", maxLength: 500, sourceKinds: ["image", "video"] },
  { key: "topicTag", kind: "text", label: "Sujet", role: "topic", maxLength: 50 },
  { key: "linkAttachment", kind: "text", label: "Lien", maxLength: 2000, sourceKinds: ["text"] },
];
const CONNECTORS = [
  { id: "youtube", label: "YouTube", logo: "youtube", status: "ready", capabilities: ["publish.video"], publishFields: YOUTUBE_FIELDS },
  { id: "threads", label: "Threads", logo: "threads", status: "ready", capabilities: ["publish.video"], publishFields: THREADS_FIELDS },
  { id: "instagram", label: "Instagram", logo: "instagram", status: "planned", capabilities: [], publishFields: [] },
];
const ACCOUNTS = [
  { id: "acc-yt01", connector: "youtube", connectorLabel: "YouTube", logo: "youtube", name: "Chaîne", status: "connected" },
  { id: "acc-th01", connector: "threads", connectorLabel: "Threads", logo: "threads", name: "Compte", status: "connected" },
];

vi.mock("@/lib/connections", () => ({
  enqueuePublish: (...args: unknown[]) => spies.enqueuePublish(...args),
  listJobs: (...args: unknown[]) => spies.listJobs(...args),
  listAccounts: () => ACCOUNTS,
  listConnectors: () => CONNECTORS,
}));

const clip = await import("@/modules/clip-studio/index.process");
/** Début d'un MP4 tel que l'écrit l'encodeur (boîte `ftyp`, marque `isom`), complété d'octets quelconques. */
function fakeMp4(size = 2048): Buffer {
  const file = Buffer.alloc(size, 1);
  Buffer.from([0, 0, 0, 0x1c, ...Buffer.from("ftypisom", "latin1")]).copy(file);
  return file;
}

const { ASSETS_DIR, EXPORTS_DIR, writeProject } = await import("@/modules/clip-studio/lib/store");

const KIT = {
  id: "kit-abc123",
  name: "Riso",
  tagline: "Le jeu vidéo en trente secondes",
  language: "fr",
  endCard: { callToAction: "Abonne-toi" },
  publishing: {
    titleTemplate: "{title} | {brand}",
    descriptionTemplate: "{summary}\n\n{credits}",
    captionTemplate: "{title}",
    firstCommentTemplate: "Et vous, lequel attendez-vous ?",
    serviceTemplates: { threads: { captionTemplate: "{title} ({brand})" } },
    hashtags: ["jeuxvideo"],
    tags: ["jeux vidéo"],
    links: [],
  },
};

const SRT = "1\n00:00:00,000 --> 00:00:01,000\nBonjour\n";

afterAll(() => {
  restoreCwd();
  fs.rmSync(root, { recursive: true, force: true });
});

beforeEach(() => {
  fs.rmSync(path.join(root, "modules"), { recursive: true, force: true });
  fs.mkdirSync(ASSETS_DIR, { recursive: true });
  fs.mkdirSync(EXPORTS_DIR, { recursive: true });
  fs.mkdirSync(path.join(root, "uploads"), { recursive: true });
  spies.callModuleFunction.mockImplementation(async (module: string, fn: string, kitId: string) =>
    module === "brand-kit" && fn === "getKit" && kitId === KIT.id ? { kit: KIT, exports: [] } : null
  );
  let count = 0;
  spies.enqueuePublish.mockImplementation((input: { accountId: string }) => ({ id: `pub-${++count}`, accountId: input.accountId, state: "queued" }));
  spies.listJobs.mockReturnValue([]);
  writeProject({
    version: 1,
    id: "clip-demo",
    name: "Cinq jeux à surveiller",
    aspect: "9:16",
    width: 1080,
    height: 1920,
    fps: 30,
    background: "#000000",
    brandKitId: KIT.id,
    brief: { prompt: "Les jeux de la semaine", title: "Cinq jeux à surveiller", script: ["Cinq sorties cette semaine", "La troisième surprend"] },
    tracks: [
      {
        id: "a",
        kind: "audio",
        name: "Musique",
        items: [
          {
            id: "m",
            type: "audio",
            start: 0,
            duration: 300,
            trimStart: 0,
            volume: 1,
            fadeIn: 0,
            fadeOut: 0,
            source: { url: "/api/modules/clip-studio/data/assets/m.mp3", ref: "module:clip-studio/assets/m.mp3", name: "m", kind: "audio", credit: "« Sunrise » par Artiste, CC BY 4.0" },
          },
        ],
      },
    ],
    createdAt: 1,
    updatedAt: 1000,
  } as never);
});

/** Dépose une vidéo comme le ferait la route d'upload, puis l'enregistre. */
async function newExport(extra: Record<string, unknown> = {}) {
  const file = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}.mp4`;
  fs.writeFileSync(path.join(ASSETS_DIR, file), fakeMp4());
  return clip.registerExport({ file, projectId: "clip-demo", projectName: "Cinq jeux à surveiller", width: 1080, height: 1920, durationMs: 12_000, ...extra });
}

const png = (width: number, height: number) => sharp({ create: { width, height, channels: 3, background: "#3366cc" } }).png().toBuffer();

describe("registerExport", () => {
  it("range crédits, volume, sous-titres et marque, et préremplit les textes par la marque", async () => {
    const entry = await newExport({ credits: ["Voix X", "Voix X", "a\nb"], loudness: { lufs: -14.04, peakDb: -1.02 }, subtitles: { srt: SRT, language: "fr" }, projectUpdatedAt: 1000 });
    expect(entry).toMatchObject({ brandKitId: KIT.id, projectUpdatedAt: 1000, credits: ["Voix X", "a b"], loudness: { lufs: -14, peakDb: -1 } });
    expect(entry.subtitles?.language).toBe("fr");
    expect(fs.readFileSync(path.join(EXPORTS_DIR, entry.subtitles!.file), "utf-8")).toBe(SRT);
    expect(entry.post?.base).toMatchObject({
      title: "Cinq jeux à surveiller | Riso",
      description: "Cinq sorties cette semaine. La troisième surprend.\n\nCrédits :\n– Voix X\n– a b",
      caption: "Cinq jeux à surveiller",
      firstComment: "Et vous, lequel attendez-vous ?",
      hashtags: ["jeuxvideo"],
    });
    expect(entry.post?.variants).toEqual({ threads: { caption: "Cinq jeux à surveiller (Riso)" } });
  });

  it("relève les crédits du projet quand le navigateur n'en envoie pas", async () => {
    const entry = await newExport();
    expect(entry.credits).toEqual(["« Sunrise » par Artiste, CC BY 4.0"]);
    expect(entry.subtitles).toBeUndefined();
    expect(entry.loudness).toBeUndefined();
  });

  it("refuse des sous-titres mal formés sans déplacer la vidéo", async () => {
    const file = "refus-1.mp4";
    fs.writeFileSync(path.join(ASSETS_DIR, file), fakeMp4());
    await expect(clip.registerExport({ file, projectId: "clip-demo", projectName: "p", width: 1, height: 1, durationMs: 1, subtitles: { srt: "n'importe quoi" } })).rejects.toThrow("Sous-titres invalides");
    expect(fs.existsSync(path.join(ASSETS_DIR, file))).toBe(true);
    expect(await clip.listExports()).toEqual([]);
  });

  it("refuse un fichier déposé qui n'est pas une vidéo MP4", async () => {
    const file = "pas-une-video.mp4";
    fs.writeFileSync(path.join(ASSETS_DIR, file), "x".repeat(64));
    await expect(clip.registerExport({ file, projectId: "clip-demo", projectName: "p", width: 1, height: 1, durationMs: 1 })).rejects.toThrow("n'est pas une vidéo MP4");
    expect(fs.existsSync(path.join(ASSETS_DIR, file))).toBe(true);
  });

  it("enregistre l'export même sans marque disponible", async () => {
    spies.callModuleFunction.mockRejectedValue(new Error("module désactivé"));
    const entry = await newExport();
    expect(entry.post?.base.title).toBe("Cinq jeux à surveiller");
  });
});

describe("textes d'un export", () => {
  it("lit la fiche, enregistre un jeu validé et refuse un jeu modifié ailleurs", async () => {
    const entry = await newExport();
    const details = await clip.getExport(entry.id);
    expect(details).toMatchObject({ project: { exists: true, name: "Cinq jeux à surveiller" }, projectChanged: false, brand: { id: KIT.id, name: "Riso" } });

    const saved = await clip.updateExportPost(entry.id, { ...entry.post!, variants: { threads: { caption: "Court" } } }, entry.post!.updatedAt);
    expect(saved.variants).toEqual({ threads: { caption: "Court" } });
    expect(saved.updatedAt).toBeGreaterThan(entry.post!.updatedAt);
    expect((await clip.getExport(entry.id)).export.post).toEqual(saved);

    await expect(clip.updateExportPost(entry.id, saved, entry.post!.updatedAt)).rejects.toThrow("changé ailleurs");
    await expect(clip.updateExportPost(entry.id, { ...saved, variants: { myspace: { title: "x" } } })).rejects.toThrow("Service inconnu");
    await expect(clip.updateExportPost("exp-inconnu", saved)).rejects.toThrow("Export introuvable");
  });

  it("« Reprendre la marque » rend le jeu tiré de la marque sans l'enregistrer", async () => {
    const entry = await newExport();
    await clip.updateExportPost(entry.id, { ...entry.post!, base: { ...entry.post!.base, title: "Changé" } });
    const fresh = await clip.defaultPostTexts(entry.id);
    expect(fresh.base.title).toBe("Cinq jeux à surveiller | Riso");
    expect((await clip.getExport(entry.id)).export.post?.base.title).toBe("Changé");
  });

  it("signale un projet modifié depuis le rendu", async () => {
    const entry = await newExport({ projectUpdatedAt: 500 });
    expect((await clip.getExport(entry.id)).projectChanged).toBe(true);
  });
});

describe("couverture", () => {
  it("réencode l'image du clip en JPEG au cadre de la vidéo, remplace puis retire", async () => {
    const entry = await newExport();
    fs.writeFileSync(path.join(ASSETS_DIR, "frame.png"), await png(400, 300));
    const withCover = await clip.setExportCover(entry.id, { file: "frame.png", atMs: 99_999 });
    const cover = withCover.cover!;
    expect(cover).toMatchObject({ width: 1080, height: 1920, atMs: 12_000 });
    expect(cover.file).toMatch(/-cover-[0-9a-f]{6}\.jpg$/);
    expect(fs.existsSync(path.join(ASSETS_DIR, "frame.png"))).toBe(false);
    expect((await sharp(path.join(EXPORTS_DIR, cover.file)).metadata()).format).toBe("jpeg");

    fs.writeFileSync(path.join(root, "uploads", "galerie.png"), await png(800, 800));
    const fromGallery = await clip.setExportCover(entry.id, { galleryFile: "galerie.png" });
    expect(fromGallery.cover?.atMs).toBeUndefined();
    expect(fs.existsSync(path.join(EXPORTS_DIR, cover.file))).toBe(false);

    const removed = await clip.setExportCover(entry.id, null);
    expect(removed.cover).toBeUndefined();
    expect(fs.readdirSync(EXPORTS_DIR).filter((name) => name.includes("-cover-"))).toEqual([]);
  });

  it("refuse ce qui n'est pas une image PNG, JPEG ou WebP, et les chemins", async () => {
    const entry = await newExport();
    fs.writeFileSync(path.join(ASSETS_DIR, "faux.png"), "pas une image");
    await expect(clip.setExportCover(entry.id, { file: "faux.png" })).rejects.toThrow("PNG, JPEG ou WebP");
    await expect(clip.setExportCover(entry.id, { file: "../exports.json" })).rejects.toThrow("Nom de fichier invalide");
    await expect(clip.setExportCover(entry.id, { galleryFile: "../secret.png" })).rejects.toThrow("galerie invalide");
  });
});

describe("fichiers pour la file", () => {
  it("résout la vidéo, la couverture et les sous-titres, rien d'autre", async () => {
    const entry = await newExport({ subtitles: { srt: SRT } });
    fs.writeFileSync(path.join(ASSETS_DIR, "frame.png"), await png(90, 160));
    const { cover } = await clip.setExportCover(entry.id, { file: "frame.png" });

    expect((await clip.resolveExportFile(entry.id)).file).toBe(entry.file);
    expect(await clip.resolveExportFile(`${entry.id}-cover`)).toMatchObject({ file: cover!.file, mimeType: "image/jpeg", width: cover!.width });
    expect(await clip.resolveExportFile(entry.id, { file: entry.subtitles!.file, purpose: "subtitles" })).toMatchObject({ file: entry.subtitles!.file, mimeType: "application/x-subrip" });
    expect((await clip.resolveExportFile(entry.id, cover!.file)).path).toBe(path.join(EXPORTS_DIR, cover!.file));
    await expect(clip.resolveExportFile(entry.id, { file: "autre.jpg", purpose: "cover" })).rejects.toThrow("n'est plus celui");
    await expect(clip.resolveExportFile(entry.id, "exports.json")).rejects.toThrow("Fichier inconnu");
  });

  it("supprime couverture et sous-titres avec l'export", async () => {
    const entry = await newExport({ subtitles: { srt: SRT } });
    fs.writeFileSync(path.join(ASSETS_DIR, "frame.png"), await png(90, 160));
    await clip.setExportCover(entry.id, { file: "frame.png" });
    await clip.deleteExport(entry.id);
    expect(fs.readdirSync(EXPORTS_DIR)).toEqual([]);
  });
});

describe("publishExport", () => {
  it("calcule les textes de chaque service côté serveur, laisse l'écran surcharger et ajoute les suites", async () => {
    const entry = await newExport({ subtitles: { srt: SRT } });
    fs.writeFileSync(path.join(ASSETS_DIR, "frame.png"), await png(90, 160));
    await clip.setExportCover(entry.id, { file: "frame.png" });

    const result = await clip.publishExport({
      exportId: entry.id,
      targets: [
        { accountId: "acc-yt01", options: { title: "Titre choisi à l'écran", privacy: "unlisted" } },
        { accountId: "acc-th01", followUps: { comment: false, subtitles: false } },
        { accountId: "acc-yt01" },
      ],
    });
    expect(result.failed).toEqual([]);
    expect(result.jobs).toHaveLength(2);
    expect(spies.enqueuePublish).toHaveBeenCalledTimes(2);

    const [youtube] = spies.enqueuePublish.mock.calls[0];
    expect(youtube.source).toMatchObject({ module: "clip-studio", id: entry.id, file: entry.file, kind: "video", width: 1080, height: 1920, durationMs: 12_000 });
    expect(youtube.options).toEqual({
      title: "Titre choisi à l'écran",
      description: "Cinq sorties cette semaine. La troisième surprend.\n\nCrédits :\n– « Sunrise » par Artiste, CC BY 4.0\n\n#jeuxvideo",
      tags: ["jeux vidéo"],
      privacy: "unlisted",
    });
    expect(youtube.followUps).toMatchObject({
      comment: "Et vous, lequel attendez-vous ?",
      subtitles: { file: entry.subtitles!.file, language: "fr" },
      cover: { id: `${entry.id}-cover`, mimeType: "image/jpeg", width: 1080, height: 1920 },
    });

    const [threads] = spies.enqueuePublish.mock.calls[1];
    // Variante Threads, sujet tiré du premier hashtag ; le champ « lien » (messages seuls) n'est pas rempli.
    expect(threads.options).toEqual({ text: "Cinq jeux à surveiller (Riso)", topicTag: "jeuxvideo" });
    expect(threads.followUps).toEqual({ cover: expect.objectContaining({ file: expect.stringMatching(/-cover-/) }) });
  });

  it("garde la variante relue à l'écran pour la publication suivante", async () => {
    const entry = await newExport();
    await clip.updateExportPost(entry.id, { ...entry.post!, variants: { threads: { caption: "Relu et corrigé" } } });
    await clip.publishExport({ exportId: entry.id, targets: [{ accountId: "acc-th01" }] });
    expect(spies.enqueuePublish.mock.calls[0][0].options.text).toBe("Relu et corrigé");
    expect(spies.enqueuePublish.mock.calls[0][0]).not.toHaveProperty("followUps.subtitles");
  });

  it("rapporte un refus de la file compte par compte", async () => {
    const entry = await newExport();
    spies.enqueuePublish.mockImplementation(() => {
      throw new Error("Compte à reconnecter");
    });
    const result = await clip.publishExport({ exportId: entry.id, targets: [{ accountId: "acc-yt01" }] });
    expect(result).toEqual({ jobs: [], failed: [{ accountId: "acc-yt01", error: "Compte à reconnecter" }] });
    await expect(clip.publishExport({ exportId: entry.id, targets: [] })).rejects.toThrow("au moins un compte");
  });

  it("retrouve les publications d'un export par leur source", async () => {
    const entry = await newExport();
    spies.listJobs.mockReturnValue([{ id: "pub-1" }]);
    expect(await clip.listExportPublications(entry.id)).toEqual([{ id: "pub-1" }]);
    expect(spies.listJobs).toHaveBeenCalledWith({ sourceModule: "clip-studio", sourceId: entry.id });
  });
});

describe("brief de l'assistant", () => {
  it("accepte une demande bornée et refuse le reste", async () => {
    const base = { version: 1, id: "clip-brief", name: "B", aspect: "9:16", width: 1080, height: 1920, fps: 30, background: "#000", tracks: [], createdAt: 1, updatedAt: 1 };
    await expect(clip.saveProject({ ...base, brief: { prompt: "ok", script: ["a"] } } as never)).resolves.toBeTruthy();
    await expect(clip.saveProject({ ...base, brief: { prompt: "x".repeat(5000) } } as never)).rejects.toThrow("Demande de l'assistant invalide");
    await expect(clip.saveProject({ ...base, brief: { prompt: "ok", script: [3] } } as never)).rejects.toThrow("Demande de l'assistant invalide");
  });
});
