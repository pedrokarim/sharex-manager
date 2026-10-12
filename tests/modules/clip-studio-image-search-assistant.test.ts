import { describe, expect, it, vi } from "vitest";

// L'assistant appelle d'autres modules par le gestionnaire : aucun appel ici, les accès sont injectés.
vi.mock("@/lib/modules/module-manager.api", () => ({ apiModuleManager: { callModuleFunction: vi.fn(), getLoadedModule: vi.fn() } }));

import {
  cleanRequest,
  illustrateSegments,
  resolveImageSource,
  sanitize,
  scriptPrompt,
  segmentPlans,
  type AssistantJob,
  type AssistantRequest,
  type IllustrationDeps,
  type SegmentPlan,
} from "@/modules/clip-studio/lib/assistant";
import type { MediaSource } from "@/modules/clip-studio/engine/types";

const REQUEST: AssistantRequest = { brief: "Les jeux de Nintendo", template: "free", aspect: "9:16", count: 3, imageSource: "find-then-generate" };

const RAW = {
  title: "Nintendo",
  scenes: [
    { heading: "Zelda", text: "Un monde ouvert.", image: { mode: "find", query: "Zelda Breath of the Wild", prompt: "A hero on a cliff" } },
    { heading: "L'idée", text: "Jouer ensemble.", image: { mode: "generate", prompt: "Friends playing together" } },
    { heading: "La mascotte", image: { mode: "find", query: "brand mascot", prompt: "The mascot waves" }, mascot: true },
  ],
};

const media = (name: string, extra: Partial<MediaSource> = {}): MediaSource => ({ url: `/api/modules/x/${name}`, ref: `module:x/${name}`, name, kind: "image", ...extra });

function newJob(): Pick<AssistantJob, "images" | "imageSources"> {
  return { images: { total: 0, done: 0, failed: 0, found: 0, generated: 0, missing: 0 } };
}

/** Accès simulés : `found` dit ce que la recherche rend pour chaque requête. */
function fakeDeps(found: Record<string, "openverse" | "web" | null>, options: { generationFails?: boolean } = {}) {
  const find = vi.fn<IllustrationDeps["find"]>(async (plan) => {
    const provider = found[plan.query ?? ""] ?? null;
    return provider ? { provider, source: media(`${provider}.jpg`, { credit: "Fuji, CC0", rights: provider === "web" ? "unverified" : "free" }) } : null;
  });
  const generate = vi.fn<IllustrationDeps["generate"]>(async (entries, _signal, onResult) => {
    if (options.generationFails) throw new Error("AI Image Gen n'est pas disponible pour créer les illustrations.");
    entries.forEach((entry, index) => onResult(index, media(`gen-${entry.prompt}.png`)));
  });
  return { find, generate };
}

const plan = (overrides: Partial<SegmentPlan>): SegmentPlan => ({ action: "find", fallback: true, query: "q", prompt: "p", mascot: false, text: "t", ...overrides });

describe("assistant : mode des illustrations", () => {
  it("reste compatible avec l'ancien champ images", () => {
    expect(resolveImageSource({ images: true })).toBe("generate");
    expect(resolveImageSource({ images: false })).toBe("none");
    expect(resolveImageSource({})).toBe("none");
    expect(resolveImageSource({ images: true, imageSource: "bogus" as never })).toBe("generate");
    expect(resolveImageSource({ images: false, imageSource: "find" })).toBe("find");
  });

  it("nettoie la demande : le web seulement sur un geste explicite, et seulement quand on cherche", () => {
    expect(cleanRequest({ ...REQUEST, webSearch: true })).toMatchObject({ imageSource: "find-then-generate", webSearch: true, images: true });
    expect(cleanRequest({ ...REQUEST, webSearch: "oui" as never }).webSearch).toBe(false);
    expect(cleanRequest({ ...REQUEST, imageSource: "generate", webSearch: true }).webSearch).toBe(false);
    expect(cleanRequest({ ...REQUEST, imageSource: undefined, images: false })).toMatchObject({ imageSource: "none", images: false });
  });

  it("demande un objet image par segment quand l'assistant cherche, imagePrompt sinon", () => {
    const finding = scriptPrompt(REQUEST);
    expect(finding).toContain('"image": {"mode": "find" | "generate", "query": string, "prompt": string}');
    expect(finding).not.toContain('"imagePrompt"');
    const generating = scriptPrompt({ ...REQUEST, imageSource: undefined, images: true });
    expect(generating).toContain('"imagePrompt": string');
    expect(generating).not.toContain('"query"');
    // Au quiz, l'image cherchée ne révèle pas la réponse.
    expect(scriptPrompt({ ...REQUEST, template: "quiz" })).toContain("jamais la bonne réponse");
  });
});

describe("assistant : plan des illustrations", () => {
  const script = sanitize(REQUEST, RAW);

  it("lit l'objet image, et la mascotte est toujours générée", () => {
    expect(script.imagePlans).toEqual([
      { mode: "find", query: "Zelda Breath of the Wild", prompt: "A hero on a cliff" },
      { mode: "generate", query: undefined, prompt: "Friends playing together" },
      { mode: "generate", query: undefined, prompt: "The mascot waves" },
    ]);
    expect(script.prompts).toEqual(["A hero on a cliff", "Friends playing together", "The mascot waves"]);
    expect(script.segmentTexts[0]).toBe("Zelda. Un monde ouvert.");
  });

  it("garde l'ancien imagePrompt", () => {
    const legacy = sanitize({ ...REQUEST, imageSource: "generate" }, { title: "Volcans", scenes: [{ heading: "Le magma", imagePrompt: "Magma" }] });
    expect(legacy.imagePlans).toEqual([{ mode: "generate", query: undefined, prompt: "Magma" }]);
  });

  it("dépend du mode de la demande", () => {
    const actions = (imageSource: AssistantRequest["imageSource"]) => segmentPlans({ ...REQUEST, imageSource }, script).map((entry) => `${entry.action}${entry.fallback ? "+" : ""}`);
    expect(actions("find-then-generate")).toEqual(["find+", "generate", "generate"]);
    expect(actions("find")).toEqual(["find", "none", "none"]);
    expect(actions("generate")).toEqual(["generate", "generate", "generate"]);
    expect(actions("none")).toEqual([]);
  });
});

describe("assistant : échelle des sources", () => {
  const signal = () => new AbortController().signal;

  it("retient l'image trouvée et ne génère pas ce segment", async () => {
    const job = newJob();
    const deps = fakeDeps({ fuji: "openverse" });
    const images = await illustrateSegments(job, [plan({ query: "fuji" }), plan({ action: "generate", fallback: false, prompt: "idea" })], signal(), () => {}, deps);
    expect(job.imageSources).toEqual(["openverse", "generated"]);
    expect(images[0]).toMatchObject({ credit: "Fuji, CC0", rights: "free" });
    expect(images[1]?.name).toBe("gen-idea.png");
    expect(job.images).toEqual({ total: 2, done: 2, failed: 0, found: 1, generated: 1, missing: 0 });
    expect(deps.generate).toHaveBeenCalledTimes(1);
    expect(deps.generate.mock.calls[0][0]).toEqual([{ prompt: "idea", mascot: false }]);
  });

  it("génère quand la recherche ne trouve rien", async () => {
    const job = newJob();
    const deps = fakeDeps({ web: "web" });
    const images = await illustrateSegments(job, [plan({ query: "rien", prompt: "secours" }), plan({ query: "web" })], signal(), () => {}, deps);
    expect(job.imageSources).toEqual(["generated", "web"]);
    expect(images[0]?.name).toBe("gen-secours.png");
    expect(images[1]?.rights).toBe("unverified");
    expect(job.images).toMatchObject({ found: 1, generated: 1, missing: 0 });
  });

  it("en mode « find », ne génère jamais et laisse un aplat", async () => {
    const job = newJob();
    const deps = fakeDeps({ fuji: "openverse" });
    const plans = segmentPlans({ ...REQUEST, imageSource: "find" }, {
      title: "T",
      imagePlans: [
        { mode: "find", query: "fuji", prompt: "a" },
        { mode: "find", query: "rien", prompt: "b" },
        { mode: "generate", prompt: "c" },
      ],
      mascots: [false, false, false],
      segmentTexts: ["", "", ""],
    });
    const images = await illustrateSegments(job, plans, signal(), () => {}, deps);
    expect(job.imageSources).toEqual(["openverse", "none", "none"]);
    expect(images.slice(1)).toEqual([undefined, undefined]);
    expect(job.images).toMatchObject({ found: 1, generated: 0, missing: 2, done: 1, failed: 2 });
    expect(deps.generate).not.toHaveBeenCalled();
  });

  it("en mode « generate », ne cherche rien", async () => {
    const job = newJob();
    const deps = fakeDeps({ fuji: "openverse" });
    const plans = segmentPlans({ ...REQUEST, imageSource: "generate" }, sanitize(REQUEST, RAW));
    await illustrateSegments(job, plans, signal(), () => {}, deps);
    expect(deps.find).not.toHaveBeenCalled();
    expect(job.imageSources).toEqual(["generated", "generated", "generated"]);
    // La mascotte garde son drapeau jusqu'à la génération.
    expect(deps.generate.mock.calls[0][0].map((entry) => entry.mascot)).toEqual([false, false, true]);
  });

  it("une recherche en erreur passe à la génération ; sans aucune image, l'erreur d'AI Image Gen remonte", async () => {
    const job = newJob();
    const deps = fakeDeps({}, { generationFails: true });
    deps.find.mockRejectedValueOnce(new Error("Openverse est injoignable."));
    await expect(illustrateSegments(job, [plan({ query: "a" }), plan({ query: "b" })], signal(), () => {}, deps)).rejects.toThrow("AI Image Gen");

    const partial = newJob();
    const someFound = fakeDeps({ a: "openverse" }, { generationFails: true });
    await illustrateSegments(partial, [plan({ query: "a" }), plan({ query: "b" })], signal(), () => {}, someFound);
    expect(partial.imageSources).toEqual(["openverse", "none"]);
    expect(partial.images).toMatchObject({ found: 1, missing: 1 });
  });

  it("suit l'avancement segment par segment", async () => {
    const job = newJob();
    const seen: number[] = [];
    await illustrateSegments(job, [plan({ query: "fuji" }), plan({ action: "none", fallback: false })], signal(), () => seen.push(job.images.found + job.images.missing), fakeDeps({ fuji: "openverse" }));
    expect(seen).toEqual([1, 2]);
  });

  it("s'arrête à l'annulation", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(illustrateSegments(newJob(), [plan({})], controller.signal, () => {}, fakeDeps({}))).rejects.toThrow();
  });
});
