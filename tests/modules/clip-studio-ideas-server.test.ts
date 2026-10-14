import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AccountSummary, ChannelQuery, ChannelVideos } from "@/lib/connections/types";

// Données du module dans un dossier temporaire : `store.ts` fige ses chemins
// sur `process.cwd()` au chargement, d'où ce réglage avant tout import.
const { root, restoreCwd } = await vi.hoisted(async () => {
  const fsModule = await import("node:fs");
  const osModule = await import("node:os");
  const pathModule = await import("node:path");
  const dir = fsModule.mkdtempSync(pathModule.join(osModule.tmpdir(), "clip-ideas-"));
  const original = process.cwd.bind(process);
  process.cwd = () => dir;
  return { root: dir, restoreCwd: () => (process.cwd = original) };
});

vi.mock("@/lib/modules/module-manager.api", () => ({ apiModuleManager: { callModuleFunction: vi.fn(), getLoadedModule: () => null } }));

const service = await import("@/modules/clip-studio/lib/idea-service");
const store = await import("@/modules/clip-studio/lib/idea-store");
import type { IdeaDeps } from "@/modules/clip-studio/lib/idea-service";
import type { Idea } from "@/modules/clip-studio/lib/idea-types";

const DATA = () => path.join(root, "modules", "clip-studio", "data");
const NOW = new Date(2026, 9, 14, 10, 0, 0);
const DAY = 24 * 60 * 60 * 1000;
const KIT = "kit-demo1234";

afterAll(() => {
  restoreCwd();
  fs.rmSync(root, { recursive: true, force: true });
});

beforeEach(() => {
  fs.rmSync(DATA(), { recursive: true, force: true });
});

const ACCOUNT: AccountSummary = {
  id: "acc-yt01",
  connector: "youtube",
  connectorLabel: "YouTube",
  logo: "youtube",
  externalId: "UC1",
  name: "Chaîne démo",
  displayName: "Chaîne démo",
  scopes: [],
  capabilities: ["posts.list"],
  status: "connected",
  connectedAt: 1,
  lastCheckedAt: 1,
  tokenState: "ok",
} as AccountSummary;

/** Vidéos courtes d'une chaîne : la 5e fait 10 fois la médiane. */
function videosFor(handle: string, hitIndex = 5): ChannelVideos {
  const videos = Array.from({ length: 20 }, (_, index) => ({
    id: `${handle.replace(/\W/g, "").slice(0, 6)}${String(index).padStart(4, "0")}`,
    title: `${handle} vidéo ${index}`,
    url: `https://www.youtube.com/watch?v=${handle.replace(/\W/g, "")}${index}`,
    publishedAt: new Date(NOW.getTime() - index * DAY).toISOString(),
    durationSeconds: 45,
    views: index === hitIndex ? 10_000 : 1000,
  }));
  return { channel: { id: `UC${handle}`, title: `Titre ${handle}`, url: "https://www.youtube.com/@x" }, videos, calls: ["channels.list", "playlistItems.list", "videos.list"] };
}

function deps(overrides: Partial<IdeaDeps> = {}): IdeaDeps & { prompts: string[]; reads: ChannelQuery[] } {
  const prompts: string[] = [];
  const reads: ChannelQuery[] = [];
  return {
    prompts,
    reads,
    ask: async (prompt) => {
      prompts.push(prompt);
      return JSON.stringify({ ideas: [] });
    },
    loadBrand: async () => ({ brand: { name: "Marque démo", language: "fr", always: [], never: [], tags: ["jeux"], hashtags: [] }, accountIds: ["acc-yt01"] }),
    history: () => [{ title: "Les 5 jeux les plus attendus de 2027" }],
    researchAccounts: () => [ACCOUNT],
    readChannel: async (_account, query) => {
      reads.push(query);
      return videosFor("mine" in query ? "@moi" : query.handle);
    },
    channelCost: () => ({ min: 3, max: 5 }),
    quota: () => ({ connector: "youtube", day: "2026-10-14", buckets: [{ id: "general", label: "Unités", used: 100, limit: 10_000 }], resetsAt: 0 }),
    assistantJob: () => null,
    now: () => NOW,
    ...overrides,
  };
}

const rawIdea = (title: string, extra: Record<string, unknown> = {}) => ({
  kind: "fresh",
  title,
  hook: "3 jeux gratuits à tester ce soir",
  angle: "Des jeux gratuits sortis cette année.",
  concept: { name: "Jeux gratuits", conceptId: null },
  template: "top",
  count: 3,
  targetSeconds: 40,
  prompt: "Classement de trois jeux gratuits sortis en 2026, une phrase par jeu avec son nom exact et sa plateforme.",
  checks: { concreteOpening: true, visualFirstSecond: true, singlePromise: true, shortEnough: true },
  ...extra,
});

describe("recherche d'idées", () => {
  it("range les idées trouvées, bornées, avec le bilan du mélange", async () => {
    const fake = deps({
      ask: async () => JSON.stringify({ ideas: [rawIdea("Trois jeux gratuits à tester ce soir"), rawIdea("5 jeux les plus attendus en 2027")] }),
    });
    const { ideas, notes } = await service.searchIdeas(service.cleanSettings({ kitId: KIT, count: 5 }), fake);
    expect(ideas.map((idea) => idea.title)).toEqual(["Trois jeux gratuits à tester ce soir"]);
    expect(ideas[0].status).toBe("new");
    expect(ideas[0].kitId).toBe(KIT);
    expect(notes[0]).toContain("1 idée(s)");
    expect(notes.join(" ")).toContain("déjà faite");
    const saved = JSON.parse(fs.readFileSync(path.join(DATA(), "ideas.json"), "utf-8")) as Idea[];
    expect(saved).toHaveLength(1);
  });

  it("une idée écartée n'est plus reproposée et sert d'exemple négatif", async () => {
    const fake = deps({ ask: async () => JSON.stringify({ ideas: [rawIdea("Trois jeux gratuits à tester ce soir")] }) });
    const first = await service.searchIdeas(service.cleanSettings({ kitId: KIT }), fake);
    service.setIdeaStatus(first.ideas[0].id, "dismissed");

    const second = deps({
      ask: async (prompt) => {
        second.prompts.push(prompt);
        return JSON.stringify({ ideas: [rawIdea("Trois jeux gratuits à tester ce soir !"), rawIdea("Le quiz des manettes oubliées", { template: "quiz" })] });
      },
    });
    const result = await service.searchIdeas(service.cleanSettings({ kitId: KIT }), second);
    expect(result.ideas.map((idea) => idea.title)).toEqual(["Le quiz des manettes oubliées"]);
    expect(second.prompts[0]).toContain("<ecartees>");
    expect(second.prompts[0]).toContain("Trois jeux gratuits à tester ce soir");
  });

  it("une recherche qui ne rend rien d'utilisable échoue clairement", async () => {
    await expect(service.searchIdeas(service.cleanSettings({}), deps())).rejects.toThrow(/aucune idée/i);
  });

  it("garder, écarter, et jamais rouvrir une idée faite", async () => {
    const fake = deps({ ask: async () => JSON.stringify({ ideas: [rawIdea("Trois jeux gratuits à tester ce soir")] }) });
    const { ideas } = await service.searchIdeas(service.cleanSettings({ kitId: KIT }), fake);
    expect(service.setIdeaStatus(ideas[0].id, "kept").status).toBe("kept");
    expect(() => service.setIdeaStatus(ideas[0].id, "done")).toThrow(/Statut invalide/);

    // « Créer cette vidéo » : le travail de l'assistant est noté, puis l'idée devient faite avec le projet.
    service.linkIdeaToJob(ideas[0].id, "asst-abc123");
    const board = await service.getBoard({ kitId: KIT }, deps({ assistantJob: (id) => (id === "asst-abc123" ? { status: "done", projectId: "clip-xyz789" } : null) }));
    expect(board.ideas[0]).toMatchObject({ status: "done", projectId: "clip-xyz789" });
    expect(() => service.setIdeaStatus(ideas[0].id, "new")).toThrow(/déjà donné une vidéo/);
  });

  it("une création annulée libère l'idée", async () => {
    const fake = deps({ ask: async () => JSON.stringify({ ideas: [rawIdea("Trois jeux gratuits à tester ce soir")] }) });
    const { ideas } = await service.searchIdeas(service.cleanSettings({ kitId: KIT }), fake);
    service.linkIdeaToJob(ideas[0].id, "asst-abc123");
    const board = await service.getBoard({ kitId: KIT }, deps({ assistantJob: () => ({ status: "canceled" }) }));
    expect(board.ideas[0].status).toBe("new");
    expect(board.ideas[0].jobId).toBeUndefined();
  });
});

describe("rangement borné", () => {
  it("relit un fichier modifié à la main : adresses https seulement, champs bornés", () => {
    fs.mkdirSync(DATA(), { recursive: true });
    const base = {
      id: "idea-abcdef12",
      status: "new",
      kind: "news",
      title: "T".repeat(500),
      hook: "Accroche",
      angle: "",
      concept: { name: "C" },
      why: { text: "x", source: { url: "javascript:alert(1)", title: "x", date: "2026-10-14" } },
      template: "top",
      count: 4,
      targetSeconds: 40,
      aspect: "9:16",
      prompt: "Prompt",
      checks: {},
      batchId: "batch-abcdef",
      createdAt: 1,
      updatedAt: 1,
    };
    fs.writeFileSync(path.join(DATA(), "ideas.json"), JSON.stringify([base, { ...base, id: "../../etc" }]));
    const ideas = store.readIdeas();
    expect(ideas).toHaveLength(1);
    expect(ideas[0].title).toHaveLength(90);
    expect(ideas[0].why?.source).toBeUndefined();
  });

  it("garde au plus 300 idées, en retirant d'abord les nouvelles les plus anciennes", () => {
    const make = (index: number, status: Idea["status"]): Idea => ({
      id: `idea-${String(index).padStart(8, "0")}`,
      status,
      kind: "fresh",
      title: `Idée ${index}`,
      hook: "Accroche",
      angle: "",
      concept: { name: "C" },
      template: "free",
      count: 4,
      targetSeconds: 40,
      aspect: "9:16",
      prompt: "Prompt",
      checks: { concreteOpening: false, visualFirstSecond: false, singlePromise: false, shortEnough: true },
      batchId: "batch-abcdef",
      createdAt: index,
      updatedAt: index,
    });
    const ideas = [...Array.from({ length: 330 }, (_, index) => make(index + 10, "new")), make(1, "kept"), make(2, "done")];
    const bounded = store.boundIdeas(ideas);
    expect(bounded).toHaveLength(300);
    expect(bounded.some((idea) => idea.status === "kept")).toBe(true);
    expect(bounded.some((idea) => idea.status === "done")).toBe(true);
    expect(bounded.some((idea) => idea.id === "idea-00000010")).toBe(false);
  });
});

describe("étude de la niche", () => {
  it("refuse sans compte YouTube connecté, avec un message clair", () => {
    service.addReferenceChannel(KIT, "@chaine-a");
    expect(() => service.startStudy(KIT, "acc-yt01", deps({ researchAccounts: () => [] }))).toThrow(/Aucun compte YouTube connecté/);
    expect(() => service.startStudy(KIT, "inconnu", deps())).toThrow(/Choisissez un compte/);
  });

  it("estime le coût avant de lancer : 3 à 5 unités par chaîne, la sienne comprise", async () => {
    service.addReferenceChannel(KIT, "@chaine-a");
    service.addReferenceChannel(KIT, "youtube.com/@chaine-b");
    const board = await service.getBoard({ kitId: KIT }, deps());
    expect(board.accountId).toBe("acc-yt01");
    expect(board.estimate).toEqual({ channels: 2, own: true, min: 9, max: 15, remaining: 9900, limit: 10_000, resetsAt: 0 });
    expect(board.studyDue).toBe(true);
  });

  it("mesure les chaînes et la sienne, puis range les succès en concepts", async () => {
    service.addReferenceChannel(KIT, "@chaine-a");
    service.addReferenceChannel(KIT, "@chaine-b");
    const fake = deps({
      ask: async (prompt) => {
        fake.prompts.push(prompt);
        const ids = [...prompt.matchAll(/"videoId":"([^"]+)"/g)].map((match) => match[1]);
        return JSON.stringify({ concepts: [{ id: null, name: "N jeux à surveiller", mold: { hook: "[N] jeux avant [date]", beats: ["Le plus attendu en dernier"] }, rhythm: "news", hits: ids, flops: [] }] });
      },
    });
    const study = await service.studyNiche(KIT, "acc-yt01", fake);
    expect(fake.reads).toEqual([{ handle: "@chaine-a" }, { handle: "@chaine-b" }, { mine: true }]);
    expect(study.unitsUsed).toBe(9);
    expect(study.hits).toBe(3);
    expect(study.channels[0]).toMatchObject({ handle: "@chaine-a", shorts: 20, median: 1000, small: false });
    expect(study.own?.recentHits).toHaveLength(1);
    const bank = store.readBank(KIT);
    expect(bank.concepts).toHaveLength(1);
    expect(bank.concepts[0].proofs).toHaveLength(3);
    expect(bank.concepts[0].proofs.every((proof) => proof.score === 10)).toBe(true);
    expect(bank.channels[0].title).toBe("Titre @chaine-a");
    expect(bank.study?.at).toBeGreaterThan(0);
  });

  it("s'arrête net sur un quota épuisé, sans perdre ce qui a été lu", async () => {
    service.addReferenceChannel(KIT, "@chaine-a");
    service.addReferenceChannel(KIT, "@chaine-b");
    const quota = Object.assign(new Error("Quota du jour épuisé"), { name: "QuotaExceededError" });
    const fake = deps({
      readChannel: async (_account, query) => {
        if ("handle" in query && query.handle === "@chaine-b") throw quota;
        return videosFor("handle" in query ? query.handle : "@moi");
      },
      ask: async () => JSON.stringify({ concepts: [] }),
    });
    const study = await service.studyNiche(KIT, "acc-yt01", fake);
    expect(study.channels.map((stat) => Boolean(stat.error))).toEqual([false, true]);
    expect(study.own).toBeUndefined();
    expect(study.notes.join(" ")).toContain("Quota du jour");
  });

  it("chaînes proposées : en attente jusqu'à validation", async () => {
    const fake = deps({ ask: async () => JSON.stringify({ channels: [{ handle: "@proposee", relation: "bigger", note: "Grosse chaîne" }] }) });
    const task = service.startChannelSuggestions(KIT, "jeux", fake);
    await vi.waitFor(() => expect(service.getTask(task.id)?.status).toBe("done"));
    expect(store.readBank(KIT).channels).toEqual([expect.objectContaining({ handle: "@proposee", state: "pending", origin: "suggested", relation: "bigger" })]);
    service.answerSuggestedChannel(KIT, "@proposee", true);
    expect(store.readBank(KIT).channels[0].state).toBe("active");
  });
});

describe("autres accroches", () => {
  it("ajoute trois variantes, puis en choisit une", async () => {
    const fake = deps({ ask: async () => JSON.stringify({ ideas: [rawIdea("Trois jeux gratuits à tester ce soir")] }) });
    const { ideas } = await service.searchIdeas(service.cleanSettings({ kitId: KIT }), fake);
    const hooks = deps({
      ask: async () =>
        JSON.stringify({
          hooks: [
            { text: "Zéro euro, trois jeux, ce soir", family: "number-result", score: 8 },
            { text: "Tu cherches un jeu gratuit ?", family: "their-question", score: 7 },
            { text: "Arrête de payer tes jeux", family: "stop-start", score: 6 },
          ],
        }),
    });
    const task = service.startHookVariants(ideas[0].id, hooks);
    await vi.waitFor(() => expect(service.getTask(task.id)?.status).toBe("done"));
    const updated = store.readIdeas()[0];
    expect(updated.altHooks).toHaveLength(3);
    const chosen = service.chooseIdeaHook(updated.id, "Arrête de payer tes jeux");
    expect(chosen.hook).toBe("Arrête de payer tes jeux");
    expect(chosen.altHooks).toContain("3 jeux gratuits à tester ce soir");
    expect(() => service.chooseIdeaHook(updated.id, "Une accroche inventée")).toThrow(/inconnue/);
  });
});
