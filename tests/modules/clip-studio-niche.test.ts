import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// Données du module dans un dossier temporaire : `store.ts` fige ses chemins
// sur `process.cwd()` au chargement, d'où ce réglage avant tout import.
const { root, restoreCwd } = await vi.hoisted(async () => {
  const fsModule = await import("node:fs");
  const osModule = await import("node:os");
  const pathModule = await import("node:path");
  const dir = fsModule.mkdtempSync(pathModule.join(osModule.tmpdir(), "clip-niche-"));
  const original = process.cwd.bind(process);
  process.cwd = () => dir;
  return { root: dir, restoreCwd: () => (process.cwd = original) };
});

vi.mock("@/lib/modules/module-manager.api", () => ({ apiModuleManager: { callModuleFunction: vi.fn(), getLoadedModule: () => null } }));

const service = await import("@/modules/clip-studio/lib/idea-service");
const store = await import("@/modules/clip-studio/lib/idea-store");
const measure = await import("@/modules/clip-studio/lib/niche-measure");
const publicReading = await import("@/modules/clip-studio/lib/niche-public");
import type { IdeaDeps } from "@/modules/clip-studio/lib/idea-service";
import type { NicheOutlier } from "@/modules/clip-studio/lib/idea-types";
import type { PublicAccount, PublicNicheReader, PublicReaderDeps } from "@/modules/clip-studio/lib/niche-public";
import type { RunOptions } from "@/lib/media/ytdlp";

const DATA = () => path.join(root, "modules", "clip-studio", "data");
const KIT = "kit-niche123";
const NOW = new Date(2026, 9, 25, 10, 0, 0);

afterAll(() => {
  restoreCwd();
  fs.rmSync(root, { recursive: true, force: true });
});

beforeEach(() => {
  fs.rmSync(DATA(), { recursive: true, force: true });
});

// ─── Ce que yt-dlp rend (format relevé sur une vraie chaîne, le 25/10/2026) ───

/** Onglet « Shorts » en liste plate : id, titre, vues arrondies, ni date ni durée. */
const SHORTS_TAB = JSON.stringify({
  id: "UCWedHS9qKebauVIK2J7383g",
  title: "Chaîne démo - Shorts",
  channel: "Chaîne démo",
  uploader_id: "@chaine-demo",
  channel_follower_count: 967000,
  _type: "playlist",
  entries: [
    { _type: "url", ie_key: "Youtube", id: "Oz6fZ6WAeJQ", url: "https://www.youtube.com/shorts/Oz6fZ6WAeJQ", title: "Backstage de l'interview", view_count: 24000 },
    { _type: "url", ie_key: "Youtube", id: "wBe97k57KxY", url: "https://www.youtube.com/shorts/wBe97k57KxY", title: "Exclusive Q&A", view_count: 2200000 },
    { _type: "url", ie_key: "Youtube", id: "pas-un-id", title: "Entrée illisible", view_count: 10 },
    { _type: "url", ie_key: "Youtube", id: "AAAAAAAAAAA", title: "Sans vues" },
  ],
});

/** Sous-titres automatiques de YouTube : chaque repère répète la ligne précédente. */
const ROLLING_VTT = `WEBVTT
Kind: captions
Language: fr

00:00:00.160 --> 00:00:01.990 align:start position:0%

personne<00:00:00.480><c> ne</c><00:00:00.640><c> te</c><00:00:00.800><c> dit</c>

00:00:01.990 --> 00:00:02.000 align:start position:0%
personne ne te dit


00:00:02.000 --> 00:00:04.100 align:start position:0%
personne ne te dit
ça<00:00:02.300><c> sur</c><00:00:02.500><c> les</c><00:00:02.700><c> shorts</c>

00:00:04.100 --> 00:00:06.000 align:start position:0%
ça sur les shorts
et<00:00:04.400><c> pourtant</c> &amp; voilà
`;

describe("lecture du texte rendu par yt-dlp", () => {
  it("onglet « Shorts » : ordre gardé, identifiants contrôlés, vues arrondies", () => {
    const account = publicReading.parseShortsTab(SHORTS_TAB);
    expect(account).toMatchObject({ title: "Chaîne démo", handle: "@chaine-demo", followers: 967000 });
    expect(account.shorts.map((short) => short.id)).toEqual(["Oz6fZ6WAeJQ", "wBe97k57KxY", "AAAAAAAAAAA"]);
    expect(account.shorts[1]).toEqual({ id: "wBe97k57KxY", title: "Exclusive Q&A", url: "https://www.youtube.com/shorts/wBe97k57KxY", views: 2200000 });
    expect(account.shorts[2].views).toBeUndefined();
    expect(() => publicReading.parseShortsTab("pas du json")).toThrow(/illisible/);
  });

  it("détail d'une vidéo : date, durée, vues exactes, langue", () => {
    const detail = publicReading.parseVideoDetail(`${JSON.stringify({ id: "wBe97k57KxY", upload_date: "20261020", duration: 41.6, view_count: 2_214_032, language: "fr" })}\n`);
    expect(detail).toEqual({ publishedAt: "2026-10-20T12:00:00.000Z", durationSeconds: 42, views: 2_214_032, language: "fr" });
    expect(publicReading.parseVideoDetail(JSON.stringify({ timestamp: 1_760_000_000 })).publishedAt).toBe(new Date(1_760_000_000_000).toISOString());
  });

  it("premières paroles : les premières secondes, sans balises ni répétitions", () => {
    expect(publicReading.firstSpokenLine(ROLLING_VTT, 3.5)).toBe("personne ne te dit ça sur les shorts");
    expect(publicReading.firstSpokenLine(ROLLING_VTT, 10)).toBe("personne ne te dit ça sur les shorts et pourtant & voilà");
    expect(publicReading.firstSpokenLine(ROLLING_VTT, 3.5, 20)).toBe("personne ne te dit…");
    expect(publicReading.firstSpokenLine("WEBVTT\n\n")).toBe("");
  });

  it("piste de sous-titres : l'originale d'abord, puis le français, puis l'anglais", () => {
    const files = ["wBe97k57KxY.en.vtt", "wBe97k57KxY.fr.vtt", "wBe97k57KxY.en-orig.vtt", "autre.fr-orig.vtt", "wBe97k57KxY.info.json"];
    expect(publicReading.pickSubtitle(files, "wBe97k57KxY")).toEqual({ file: "wBe97k57KxY.en-orig.vtt", language: "en" });
    expect(publicReading.pickSubtitle(["wBe97k57KxY.fr.vtt", "wBe97k57KxY.en.vtt"], "wBe97k57KxY")).toEqual({ file: "wBe97k57KxY.fr.vtt", language: "fr" });
    expect(publicReading.pickSubtitle(["autre.fr.vtt"], "wBe97k57KxY")).toBeNull();
  });

  it("arguments fixés : l'adresse après « -- », le @nom déjà validé encodé", () => {
    expect(publicReading.shortsArgs("@chaine-demo")).toEqual(["-J", "--flat-playlist", "--playlist-end", "30", "--", "https://www.youtube.com/@chaine-demo/shorts"]);
    expect(publicReading.detailArgs("wBe97k57KxY")).toEqual(["-j", "--", "https://www.youtube.com/watch?v=wBe97k57KxY"]);
    const withSubtitles = publicReading.detailArgs("wBe97k57KxY", "/tmp/x");
    expect(withSubtitles.slice(-2)).toEqual(["--", "https://www.youtube.com/watch?v=wBe97k57KxY"]);
    expect(withSubtitles).toEqual(expect.arrayContaining(["--skip-download", "--write-auto-subs", "--sub-langs", "fr-orig,en-orig,fr,en"]));
  });
});

// ─── Mesure ──────────────────────────────────────────────────────

const shorts = (views: number[], prefix = "v") => views.map((count, index) => ({ id: `${prefix}${String(index).padStart(10, "0")}`.slice(0, 11), title: `Vidéo ${index}`, url: `https://www.youtube.com/shorts/${index}`, views: count }));

describe("mesure contre la médiane de son propre compte", () => {
  it("écarte les trois plus récentes de la médiane et garde ce qui fait 2 × ou plus", () => {
    // Les 3 premières sont jeunes ; la médiane se prend sur les 12 suivantes (1 000).
    const views = [9000, 500, 1000, ...Array(12).fill(1000), 5000, 1900, 2000];
    views[5] = 3000;
    const result = measure.measureOrdered(shorts(views));
    expect(result.median).toBe(1000);
    expect(result.baseline).toBe(12);
    const outliers = measure.outliersOf(result, { channel: "@demo", service: "youtube" });
    expect(outliers.map((outlier) => [outlier.score, outlier.young])).toEqual([
      [9, true],
      [5, false],
      [3, false],
      [2, false],
    ]);
    expect(outliers.every((outlier) => outlier.median === 1000 && outlier.channel === "@demo")).toBe(true);
  });

  it("aucun écart retenu sous huit vidéos de référence : un compte trop jeune ne prouve rien", () => {
    const result = measure.measureOrdered(shorts([100, 100, 100, 1000, 100, 100, 100, 100, 100, 100]));
    expect(result.baseline).toBe(7);
    expect(measure.trustedMeasure(result)).toBe(false);
    expect(measure.outliersOf(result, { channel: "@petit", service: "youtube" })).toEqual([]);
  });

  it("détail lu pour trois vidéos au plus par compte, vingt-quatre en tout", () => {
    const many = (channel: string, count: number): NicheOutlier[] =>
      Array.from({ length: count }, (_, index) => ({ videoId: `${channel}${index}`.padEnd(11, "x"), service: "youtube", channel, title: "", url: "https://www.youtube.com/shorts/x", views: 1, score: 10 - index / 10, median: 1, young: false }));
    const picked = measure.pickForDetails([...many("@a", 6), ...many("@b", 2)]);
    expect(picked.filter((outlier) => outlier.channel === "@a")).toHaveLength(3);
    expect(picked.filter((outlier) => outlier.channel === "@b")).toHaveLength(2);
    const lots = Array.from({ length: 12 }, (_, index) => many(`@c${index}`, 3)).flat();
    expect(measure.pickForDetails(lots)).toHaveLength(measure.DETAILS_TOTAL);
  });
});

// ─── Lecteur public ──────────────────────────────────────────────

function readerDeps(overrides: Partial<PublicReaderDeps> = {}) {
  let clock = 100_000;
  const calls: { args: string[]; options: RunOptions }[] = [];
  const waits: number[] = [];
  const workRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clip-niche-work-"));
  const deps: PublicReaderDeps = {
    run: async (args, options) => {
      calls.push({ args, options });
      if (args.includes("--flat-playlist")) return { code: 0, stdout: SHORTS_TAB, stderr: "" };
      const output = args[args.indexOf("-o") + 1];
      if (output) fs.writeFileSync(output.replace("%(id)s.%(ext)s", "wBe97k57KxY.fr-orig.vtt"), ROLLING_VTT);
      return { code: 0, stdout: JSON.stringify({ upload_date: "20261020", duration: 30, view_count: 2_214_032 }), stderr: "" };
    },
    gate: { run: (_key, task) => task() },
    busyMessages: ["porte pleine"],
    workRoot,
    cookies: () => null,
    onCookiesRejected: vi.fn(),
    now: () => clock,
    sleep: async (ms) => {
      waits.push(ms);
      clock += ms;
    },
    ...overrides,
  };
  return { deps, calls, waits, workRoot, tick: (ms: number) => (clock += ms) };
}

describe("lecteur public (yt-dlp simulé)", () => {
  it("un appel à la fois, quatre secondes entre deux, sous-titres lus puis effacés", async () => {
    const { deps, calls, waits, workRoot } = readerDeps();
    const reader = publicReading.createPublicReader(deps);
    const account = await reader.readShorts("@chaine-demo");
    expect(account.shorts).toHaveLength(3);
    const detail = await reader.readDetail("wBe97k57KxY", { spoken: true });
    expect(detail).toMatchObject({ publishedAt: "2026-10-20T12:00:00.000Z", durationSeconds: 30, spoken: "personne ne te dit ça sur les shorts", spokenLanguage: "fr" });
    expect(waits).toEqual([publicReading.PUBLIC_READ.pauseMs]);
    expect(calls[0].args.at(-2)).toBe("--");
    expect(calls[1].args).toContain("--write-auto-subs");
    expect(reader.calls()).toBe(2);
    // Chaque dossier de travail part avec son appel.
    expect(fs.readdirSync(workRoot)).toEqual([]);
  });

  it("porte pleine : attend puis réessaie ; un refus de YouTube garde un message clair", async () => {
    let refused = 0;
    const { deps, waits } = readerDeps({
      gate: {
        run: (_key, task) => (refused++ < 1 ? Promise.reject(new Error("porte pleine")) : task()),
      },
    });
    const reader = publicReading.createPublicReader(deps);
    await reader.readShorts("@chaine-demo");
    expect(waits).toContain(publicReading.PUBLIC_READ.busyWaitMs);

    const failing = publicReading.createPublicReader(readerDeps({ run: async () => ({ code: 1, stdout: "", stderr: "ERROR: [youtube] Sign in to confirm you’re not a bot" }) }).deps);
    await expect(failing.readShorts("@chaine-demo")).rejects.toThrow(/YouTube demande une connexion/);
  });
});

// ─── Étude ───────────────────────────────────────────────────────

/** Un compte : 20 vidéos à 1 000 vues, une à `hit` vues en 5e position. */
function accountWith(handle: string, hit: number): PublicAccount {
  const key = handle.replace(/\W/g, "").slice(-5);
  return {
    title: `Titre ${handle}`,
    shorts: Array.from({ length: 20 }, (_, index) => ({
      id: `${key}${String(index).padStart(11 - key.length, "0")}`,
      title: `${handle} vidéo ${index}`,
      url: `https://www.youtube.com/shorts/${key}${index}`,
      views: index === 5 ? hit : 1000,
    })),
  };
}

function fakeReader(overrides: Partial<PublicNicheReader> = {}): PublicNicheReader & { details: string[] } {
  const details: string[] = [];
  let calls = 0;
  return {
    service: "youtube",
    details,
    calls: () => calls,
    readShorts: async (handle) => {
      calls++;
      return accountWith(handle, handle === "@chaine-a" ? 5000 : 2500);
    },
    readDetail: async (videoId, options) => {
      calls++;
      details.push(videoId);
      return { publishedAt: "2026-10-01T12:00:00.000Z", durationSeconds: 35, ...(options.spoken ? { spoken: "Personne ne te dit ça : voilà", spokenLanguage: "fr" } : {}) };
    },
    ...overrides,
  };
}

function deps(overrides: Partial<IdeaDeps> = {}, reader = fakeReader()): IdeaDeps & { prompts: string[]; reader: ReturnType<typeof fakeReader> } {
  const prompts: string[] = [];
  return {
    prompts,
    reader,
    ask: async (prompt) => {
      prompts.push(prompt);
      const ids = [...prompt.matchAll(/"videoId":"([^"]+)"/g)].map((match) => match[1]);
      // Codex rend aussi des chiffres : ils ne comptent pas.
      return JSON.stringify({ concepts: [{ id: null, name: "Ce que personne ne dit sur X", mold: { hook: "Personne ne te dit [vérité]", beats: ["La vérité", "La preuve"] }, rhythm: "evergreen", hits: ids, flops: [], score: 99, views: 1 }] });
    },
    loadBrand: async () => ({ brand: { name: "Marque démo", language: "fr", always: [], never: [], tags: [], hashtags: [] }, accountIds: [] }),
    history: () => [],
    researchAccounts: () => [],
    readChannel: async () => {
      throw new Error("aucun compte connecté ici");
    },
    channelCost: () => null,
    quota: () => null,
    assistantJob: () => null,
    publicReader: () => reader,
    now: () => NOW,
    ...overrides,
  };
}

describe("étude publique de la niche", () => {
  it("mesure, lit le détail des plus fortes, range en concepts ; les chiffres viennent de la mesure", async () => {
    service.addReferenceChannel(KIT, "@chaine-a");
    service.addReferenceChannel(KIT, "@chaine-b");
    const fake = deps();
    const steps: string[] = [];
    const study = await service.studyNiche(KIT, { kind: "public" }, fake, {
      spoken: true,
      track: { plan: (planned) => steps.push(...planned.map((step) => step.id)), set: () => undefined },
    });
    expect(steps).toEqual(["read-0", "read-1", "details", "concepts", "save"]);
    expect(study.source).toBe("public");
    expect(study.outliers?.map((outlier) => [outlier.channel, outlier.score])).toEqual([
      ["@chaine-a", 5],
      ["@chaine-b", 2.5],
    ]);
    expect(fake.reader.details).toHaveLength(2);
    expect(study.reads).toBe(4);
    const stored = store.readBank(KIT);
    expect(stored.concepts).toHaveLength(1);
    expect(stored.concepts[0].proofs.map((proof) => proof.score)).toEqual([5, 2.5]);
    expect(stored.study?.outliers?.[0]).toMatchObject({ publishedAt: "2026-10-01T12:00:00.000Z", durationSeconds: 35, spokenLanguage: "fr", conceptId: stored.concepts[0].id });
    // Typographie française sur les premières paroles en français.
    expect(stored.study?.outliers?.[0].spoken).toBe("Personne ne te dit ça : voilà");
    // Codex a reçu les premières paroles comme données.
    expect(fake.prompts[0]).toContain('"spoken":"Personne ne te dit ça');
  });

  it("refuse une deuxième étude dans le mois sans confirmation", async () => {
    service.addReferenceChannel(KIT, "@chaine-a");
    await service.studyNiche(KIT, { kind: "public" }, deps());
    expect(() => service.startStudy(KIT, "public", deps())).toThrow(/une par mois suffit/);
    expect(() => service.startStudy(KIT, "public", deps({ publicReader: undefined }))).toThrow(/Lecture publique indisponible/);
    const task = service.startStudy(KIT, "public", deps(), { force: true });
    await vi.waitFor(() => expect(service.getTask(task.id)?.status).toBe("done"));
    const done = service.getTask(task.id);
    expect(done?.steps?.every((step) => step.state === "done" || step.state === "skipped")).toBe(true);
    expect(done?.progress).toEqual({ done: 4, total: 4 });
  });

  it("annulée en cours : rien n'est enregistré, l'étape en cours passe", async () => {
    service.addReferenceChannel(KIT, "@chaine-a");
    const slow = fakeReader({
      readShorts: (_handle, signal) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(new Error("Lecture annulée.")), { once: true });
        }),
    });
    const task = service.startStudy(KIT, "public", deps({}, slow));
    await vi.waitFor(() => expect(service.getTask(task.id)?.steps?.[0]?.state).toBe("running"));
    expect(service.cancelTask(task.id)).toBe(true);
    await vi.waitFor(() => expect(service.getTask(task.id)?.status).toBe("canceled"));
    expect(service.getTask(task.id)?.steps?.[0]).toMatchObject({ state: "skipped", detail: "Annulée" });
    expect(store.readBank(KIT).study).toBeUndefined();
    expect(service.cancelTask(task.id)).toBe(false);
  });

  it("une banque relue garde ses vidéos au-dessus de leur médiane, bornées et contrôlées", () => {
    const outlier = { videoId: "wBe97k57KxY", service: "youtube", channel: "@a", title: "T", url: "https://www.youtube.com/shorts/wBe97k57KxY", views: 10, score: 3, median: 3, young: false };
    const bank = store.cleanBank(
      { channels: [{ handle: "@chaine-a", service: "tiktok" }], study: { at: 1, channels: [], hits: 1, unitsUsed: 0, notes: [], source: "public", outliers: [outlier, { ...outlier, url: "http://pas-https" }, { ...outlier, videoId: "x" }] } },
      KIT
    );
    expect(bank.study?.outliers).toEqual([outlier]);
    expect(bank.study?.source).toBe("public");
    // Un service inconnu n'est pas gardé : le compte reste lu comme YouTube.
    expect(bank.channels[0].service).toBeUndefined();
  });
});
