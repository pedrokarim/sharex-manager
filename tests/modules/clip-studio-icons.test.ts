import { describe, expect, it, vi } from "vitest";

// L'assistant appelle d'autres modules par le gestionnaire : aucun appel ici, les accès sont injectés.
vi.mock("@/lib/modules/module-manager.api", () => ({ apiModuleManager: { callModuleFunction: vi.fn(), getLoadedModule: vi.fn() } }));

import {
  findIcons,
  imagesProgress,
  imagesSummary,
  sanitize,
  scriptPrompt,
  segmentPlans,
  type AssistantJob,
  type AssistantRequest,
  type SegmentPlan,
} from "@/modules/clip-studio/lib/assistant";
import { applyBrandTheme, defaultRoleStyles, type BrandTheme } from "@/modules/clip-studio/engine/brand";
import { isKnownPreset } from "@/modules/clip-studio/engine/motion/registry";
import {
  SAMPLE_FREE,
  SAMPLE_QUIZ,
  SAMPLE_SLIDESHOW,
  SAMPLE_TOP,
  buildFree,
  buildQuiz,
  buildSlideshow,
  buildTop,
} from "@/modules/clip-studio/engine/templates";
import type { AspectPreset, ClipItem, ClipProject, ImageItem, MediaSource, ShapeItem } from "@/modules/clip-studio/engine/types";

const REQUEST: AssistantRequest = {
  brief: "Top des prochains gachas les plus attendus",
  template: "top",
  aspect: "9:16",
  count: 3,
  imageSource: "find-then-generate",
  webSearch: true,
};

const RAW = {
  title: "Les gachas les plus attendus",
  entries: [
    {
      title: "Ananta",
      detail: "Un monde ouvert urbain",
      image: { mode: "find", query: "Ananta key art", prompt: "A neon city", official: true, icon: { query: "Ananta game logo" } },
    },
    { title: "L'attente", detail: "Ce qui nous fait rêver", image: { mode: "generate", prompt: "A dreamy sky", official: false, icon: null } },
    { title: "La mascotte", image: { mode: "find", query: "brand mascot", prompt: "The mascot", icon: { query: "mascot logo" } }, mascot: true },
  ],
};

const media = (name: string, width = 512, height = 512): MediaSource => ({
  url: `/api/modules/clip-studio/data/assets/${name}`,
  ref: `module:clip-studio/assets/${name}`,
  name,
  kind: "image",
  width,
  height,
  credit: "Icône officielle, Droits à vérifier",
  rights: "unverified",
});

const items = (project: ClipProject) => project.tracks.flatMap((track) => track.items);
const iconItems = (project: ClipProject, icon: MediaSource) =>
  items(project).filter((item): item is ImageItem => item.type === "image" && item.source.ref === icon.ref);

/** Élément sans ce qui varie d'un appel à l'autre (identifiants). */
const stableItem = (item: ClipItem) => JSON.stringify({ ...item, id: "" });

/** Les éléments d'un projet, comparables d'un appel à l'autre. */
const stableItems = (project: ClipProject) => items(project).map(stableItem).sort();

describe("icônes : plan de l'assistant", () => {
  it("demande au script le drapeau officiel et une icône, seulement quand le web est permis", () => {
    const withWeb = scriptPrompt(REQUEST);
    expect(withWeb).toContain('"official": boolean, "icon": {"query": string} | null');
    expect(withWeb).toContain('"app icon"');
    expect(withWeb).toContain("key art");
    const withoutWeb = scriptPrompt({ ...REQUEST, webSearch: false });
    expect(withoutWeb).not.toContain('"icon"');
    expect(withoutWeb).not.toContain('"official"');
    // Au quiz, l'icône est celle de la bonne réponse, montrée à la révélation.
    expect(scriptPrompt({ ...REQUEST, template: "quiz" })).toContain("BONNE RÉPONSE");
  });

  it("lit l'icône et le drapeau officiel ; la mascotte n'en a jamais", () => {
    const script = sanitize(REQUEST, RAW);
    expect(script.imagePlans).toEqual([
      { mode: "find", query: "Ananta key art", prompt: "A neon city", official: true, iconQuery: "Ananta game logo" },
      { mode: "generate", query: undefined, prompt: "A dreamy sky" },
      { mode: "generate", query: undefined, prompt: "The mascot" },
    ]);
  });

  it("met l'icône et le « web d'abord » dans le plan, seulement avec la recherche web", () => {
    const script = sanitize(REQUEST, RAW);
    const plans = segmentPlans(REQUEST, script);
    expect(plans[0]).toMatchObject({ action: "find", iconQuery: "Ananta game logo", webFirst: true });
    expect(plans[1].iconQuery).toBeUndefined();
    expect(plans[2].iconQuery).toBeUndefined();

    const offline = segmentPlans({ ...REQUEST, webSearch: false }, script);
    expect(offline.some((plan) => plan.iconQuery || plan.webFirst)).toBe(false);
    expect(segmentPlans({ ...REQUEST, imageSource: "generate" }, script).some((plan) => plan.iconQuery)).toBe(false);
  });
});

describe("icônes : recherche et suivi", () => {
  const plan = (overrides: Partial<SegmentPlan>): SegmentPlan => ({ action: "none", fallback: false, prompt: "p", mascot: false, text: "t", ...overrides });

  it("cherche une icône par segment qui en demande une, et compte celles reconnues", async () => {
    const job: Pick<AssistantJob, "icons"> = {};
    const findIcon = vi.fn(async (entry: SegmentPlan) => {
      if (entry.iconQuery === "panne") throw new Error("Codex s'est arrêté");
      return entry.iconQuery === "Ananta game logo" ? media("ananta.png") : null;
    });
    const seen: number[] = [];
    const icons = await findIcons(
      job,
      [plan({ iconQuery: "Ananta game logo" }), plan({}), plan({ iconQuery: "faux" }), plan({ iconQuery: "panne" })],
      new AbortController().signal,
      () => seen.push(job.icons!.found),
      findIcon
    );
    expect(findIcon).toHaveBeenCalledTimes(3);
    expect(icons.map((icon) => icon?.name)).toEqual(["ananta.png", undefined, undefined, undefined]);
    expect(job.icons).toEqual({ total: 3, found: 1 });
    expect(seen).toEqual([1]);
  });

  it("ne touche pas au suivi quand aucun segment ne demande d'icône", async () => {
    const job: Pick<AssistantJob, "icons"> = {};
    const findIcon = vi.fn(async () => media("x.png"));
    expect(await findIcons(job, [plan({})], new AbortController().signal, () => {}, findIcon)).toEqual([undefined]);
    expect(job.icons).toBeUndefined();
    expect(findIcon).not.toHaveBeenCalled();
  });

  it("dit combien d'illustrations ont été trouvées, où, combien créées, et les icônes", () => {
    const job = {
      images: { total: 5, done: 4, failed: 1, found: 3, generated: 1, missing: 1 },
      imageSources: ["web", "web", "openverse", "generated", "none"] as AssistantJob["imageSources"],
      icons: { total: 3, found: 2 },
    };
    expect(imagesSummary(job)).toBe("3 trouvées (2 sur le web, 1 sur Openverse), 1 créée, 1 sans image, 2 icônes officielles sur 3");
    expect(imagesProgress(job)).toBe("5 sur 5, 3 trouvées (2 sur le web, 1 sur Openverse), 1 créée, 1 sans image, 2 icônes");
    expect(imagesSummary({ ...job, imageSources: ["web", "web", "web", "generated", "none"], icons: { total: 2, found: 0 } })).toBe(
      "3 trouvées sur le web, 1 créée, 1 sans image, aucune icône reconnue sur 2"
    );
    expect(imagesSummary({ images: { total: 2, done: 2, failed: 0, found: 0, generated: 2, missing: 0 } })).toBe("2 créées");
  });
});

describe("icônes : emplacement dans les modèles", () => {
  const ICON = media("icone.png", 512, 512);
  const LOGO = media("logo.png", 1200, 300);
  const ASPECTS: AspectPreset[] = ["9:16", "16:9", "1:1", "4:5"];

  /** Chaque élément d'icône tient dans le canevas. */
  function expectInside(project: ClipProject, item: ClipItem) {
    if (item.type === "audio") return;
    const { x, y, width, height } = item.transform;
    expect(x - width / 2).toBeGreaterThanOrEqual(0);
    expect(x + width / 2).toBeLessThanOrEqual(1);
    expect(y - height / 2).toBeGreaterThanOrEqual(0);
    expect(y + height / 2).toBeLessThanOrEqual(1);
    expect(project.width * width).toBeGreaterThan(0);
  }

  it("ne change rien au rendu quand il n'y a pas d'icône", () => {
    for (const aspect of ASPECTS) {
      const top = buildTop("Top", aspect, SAMPLE_TOP);
      expect(top.tracks.some((track) => track.name.startsWith("Icônes"))).toBe(false);
      const explicit = buildTop("Top", aspect, { ...SAMPLE_TOP, entries: SAMPLE_TOP.entries.map((entry) => ({ ...entry, icon: undefined })) });
      expect(stableItems(explicit)).toEqual(stableItems(top));
      expect(explicit.tracks.map((track) => track.name)).toEqual(top.tracks.map((track) => track.name));
    }
    for (const project of [buildQuiz("Q", "9:16", SAMPLE_QUIZ), buildSlideshow("S", "9:16", SAMPLE_SLIDESHOW), buildFree("F", "9:16", SAMPLE_FREE)]) {
      expect(project.tracks.some((track) => track.name.startsWith("Icônes"))).toBe(false);
    }
  });

  it("classement : l'icône s'ajoute à côté du nom, sans rien déplacer d'autre", () => {
    for (const aspect of ASPECTS) {
      const plain = buildTop("Top", aspect, SAMPLE_TOP);
      const data = { ...SAMPLE_TOP, entries: SAMPLE_TOP.entries.map((entry, index) => (index === 1 ? { ...entry, icon: ICON } : entry)) };
      const withIcon = buildTop("Top", aspect, data);

      // Tout l'ancien rendu est là, à l'identique ; l'icône n'ajoute que son image et son ombre.
      const before = stableItems(plain);
      const after = stableItems(withIcon);
      for (const entry of before) expect(after).toContain(entry);
      expect(after.length - before.length).toBe(2);

      const [icon] = iconItems(withIcon, ICON);
      expect(icon.fit).toBe("cover");
      expect(icon.radius).toBeGreaterThan(0);
      expect(isKnownPreset(String(icon.animIn.kind))).toBe(true);
      expect(icon.animIn.kind).toBe("pop-in");
      expectInside(withIcon, icon);

      // Au-dessus du nom de l'entrée, pendant qu'il est affiché.
      const name = items(withIcon).find((item) => item.type === "text" && item.text === SAMPLE_TOP.entries[1].title)!;
      expect(icon.start).toBe(name.start);
      expect(icon.duration).toBe(name.duration);
      if (name.type !== "audio") expect(icon.transform.y + icon.transform.height / 2).toBeLessThanOrEqual(name.transform.y - name.transform.height / 2);

      const shadow = items(withIcon).find((item): item is ShapeItem => item.type === "shape" && item.theme?.paint === "shadow" && item.start === icon.start && item.transform.opacity < 1)!;
      expect(shadow.transform.y).toBeGreaterThan(icon.transform.y);
      expect(shadow.animIn.kind).toBe("pop-in");
    }
  });

  it("un logo large est posé dans une carte claire, réduit pour tenir, et suit l'image de marque", () => {
    const data = { ...SAMPLE_TOP, entries: SAMPLE_TOP.entries.map((entry) => ({ ...entry, icon: LOGO })) };
    for (const aspect of ASPECTS) {
      const project = buildTop("Top", aspect, data);
      const logos = iconItems(project, LOGO);
      expect(logos).toHaveLength(3);
      for (const logo of logos) {
        expect(logo.fit).toBe("contain");
        expectInside(project, logo);
      }
      const plates = items(project).filter((item): item is ShapeItem => item.type === "shape" && item.theme?.paint === "surface");
      expect(plates).toHaveLength(3);
      for (const plate of plates) {
        expect(plate.fill).toBe("#ffffff");
        expectInside(project, plate);
      }
    }

    const theme = {
      kitId: "kit-test01",
      name: "Riso",
      palette: { background: "#fdf2e9", ink: "#1d1d6b", surface: "#fff8f0", onSurface: "#1d1d6b", accent: "#ff4f9a", accentSecondary: "#2f6bff", onAccent: "#ffffff", extras: [] },
      textStyles: defaultRoleStyles(),
      fonts: [],
    } as unknown as BrandTheme;
    const branded = applyBrandTheme(buildTop("Top", "9:16", data), theme);
    const plates = items(branded).filter((item): item is ShapeItem => item.type === "shape" && item.theme?.paint === "surface");
    expect(plates.every((plate) => plate.fill === "#fff8f0")).toBe(true);
  });

  it("quiz : l'icône de la bonne réponse n'apparaît qu'à la révélation, à côté de l'étiquette", () => {
    for (const aspect of ASPECTS) {
      const data = { ...SAMPLE_QUIZ, questions: SAMPLE_QUIZ.questions.map((question, index) => (index === 0 ? { ...question, icon: LOGO } : question)) };
      const project = buildQuiz("Quiz", aspect, data);
      const [icon] = iconItems(project, LOGO);
      // La révélation commence avec le surlignage vert de la bonne réponse.
      const highlight = items(project).find((item) => item.type === "shape" && item.fill === "#22c55e")!;
      expect(icon.start).toBe(highlight.start);
      expect(icon.start + icon.duration).toBe(highlight.start + highlight.duration);
      expectInside(project, icon);
      const label = items(project).find((item) => item.type === "text" && item.text === "Question 1/3")!;
      if (label.type !== "audio") expect(icon.transform.x - icon.transform.width / 2).toBeGreaterThanOrEqual(label.transform.x + label.transform.width / 2);
    }
  });

  it("diaporama et modèle libre : l'icône se pose au-dessus du texte du segment", () => {
    for (const aspect of ASPECTS) {
      const slideshow = buildSlideshow("S", aspect, { ...SAMPLE_SLIDESHOW, slides: [{ caption: "Genshin Impact", icon: ICON }, { icon: ICON }] });
      const slideIcons = iconItems(slideshow, ICON);
      expect(slideIcons).toHaveLength(2);
      slideIcons.forEach((icon) => expectInside(slideshow, icon));

      const free = buildFree("F", aspect, {
        ...SAMPLE_FREE,
        scenes: [
          { heading: "Le jeu", text: "Sorti en 2020.", icon: ICON },
          { heading: "Titre seul", icon: LOGO },
          { text: "Texte seul", icon: ICON },
        ],
      });
      const freeIcons = [...iconItems(free, ICON), ...iconItems(free, LOGO)];
      expect(freeIcons).toHaveLength(3);
      freeIcons.forEach((icon) => expectInside(free, icon));
      const caption = items(free).find((item) => item.type === "text" && item.text === "Sorti en 2020.")!;
      const first = freeIcons.find((icon) => icon.start === caption.start)!;
      if (caption.type !== "audio") expect(first.transform.y + first.transform.height / 2).toBeLessThanOrEqual(caption.transform.y - caption.transform.height / 2);
    }
  });
});
