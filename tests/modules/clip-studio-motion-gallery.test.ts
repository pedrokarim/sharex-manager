import { describe, expect, it } from "vitest";
import { listPresets } from "@/modules/clip-studio/engine/motion/registry";
import { listCameraMoves, listShotFx, listTransitions } from "@/modules/clip-studio/engine/motion/scenes";
import type { MotionPreset } from "@/modules/clip-studio/engine/motion/types";
import { FAVORITES_STORAGE_KEY, fitsItemType } from "@/modules/clip-studio/lib/motion-catalog";
import {
  COUNTER_SAMPLE,
  DEFAULT_GALLERY_TAB,
  GALLERY_TABS,
  GALLERY_TAB_IDS,
  GRID_SECTION,
  appliesTo,
  cardDetail,
  easeText,
  editorPath,
  filterGallery,
  galleryCounts,
  galleryEntries,
  galleryFavoritesKey,
  gallerySectionsOf,
  galleryTabOfPreset,
  galleryTabParser,
  galleryTotal,
  groupGallery,
  itemTypesText,
  parseGalleryTab,
  phasesText,
  searchGallery,
  type GalleryEntry,
  type MotionGalleryEntry,
} from "@/modules/clip-studio/lib/motion-gallery";
import { buildPreviewScene } from "@/modules/clip-studio/lib/motion-preview";
import type { TextItem } from "@/modules/clip-studio/engine/types";

const motionEntries = (tab: (typeof GALLERY_TAB_IDS)[number]) => galleryEntries(tab) as MotionGalleryEntry[];
const allEntries = () => GALLERY_TAB_IDS.flatMap((tab) => galleryEntries(tab));

describe("galerie des animations : onglets", () => {
  it("montre chaque préréglage du moteur une fois, et toutes les transitions, la caméra et les effets", () => {
    const motion = GALLERY_TAB_IDS.filter((tab) => !["transitions", "camera", "shotfx"].includes(tab)).flatMap((tab) => motionEntries(tab));
    const registered = listPresets();
    expect(motion).toHaveLength(registered.length);
    expect(new Set(motion.map((entry) => entry.key)).size).toBe(motion.length);
    for (const preset of registered) expect(motion.some((entry) => entry.preset === preset)).toBe(true);

    expect(galleryEntries("transitions")).toHaveLength(listTransitions().length);
    // « Fixe » est l'absence de mouvement, pas une animation à montrer.
    expect(galleryEntries("camera")).toHaveLength(listCameraMoves().filter((move) => move.id !== "none").length);
    expect(galleryEntries("shotfx")).toHaveLength(listShotFx().length);

    const counts = galleryCounts();
    expect(Object.values(counts).reduce((sum, count) => sum + count, 0)).toBe(galleryTotal());
    expect(galleryTotal()).toBe(allEntries().length);
    expect(new Set(allEntries().map((entry) => entry.key)).size).toBe(galleryTotal());
  });

  it("range les entrées et sorties d'éléments, le texte découpé, les effets et les mises en avant", () => {
    for (const entry of motionEntries("elements")) {
      expect(["in", "out"]).toContain(entry.preset.phase);
      expect(entry.preset.target).not.toBe("text");
      expect(entry.preset.grid).toBeUndefined();
    }
    for (const entry of motionEntries("text")) {
      expect(entry.itemType).toBe("text");
      expect(["in", "out"]).toContain(entry.preset.phase);
    }
    for (const entry of motionEntries("effects")) {
      expect(["typing", "counter", "glitch", "blur-light", "mask"]).toContain(entry.preset.category);
    }
    for (const entry of motionEntries("highlights")) {
      expect(entry.preset.phase === "emphasis" || entry.preset.phase === "loop" || Boolean(entry.preset.grid)).toBe(true);
    }
    // Les lettres par lettre vont sous « Texte », les grilles sous « Mises en avant ».
    expect(motionEntries("text").some((entry) => entry.preset.split === "char")).toBe(true);
    expect(motionEntries("highlights").filter((entry) => entry.section === GRID_SECTION.key).length).toBeGreaterThan(0);
  });

  it("dit l'onglet d'un préréglage d'après sa phase, sa catégorie et sa cible", () => {
    const base: MotionPreset = { id: "x", label: "X", category: "slide", phase: "in", target: "any", durationMs: 400, tracks: {} };
    expect(galleryTabOfPreset(base)).toBe("elements");
    expect(galleryTabOfPreset({ ...base, target: "text" })).toBe("text");
    expect(galleryTabOfPreset({ ...base, split: "word" })).toBe("text");
    expect(galleryTabOfPreset({ ...base, category: "glitch" })).toBe("effects");
    expect(galleryTabOfPreset({ ...base, phase: "loop" })).toBe("highlights");
    expect(galleryTabOfPreset({ ...base, grid: { columns: 3, rows: 3, order: "rows" } })).toBe("highlights");
  });

  it("lit l'onglet de l'adresse, et retombe sur le premier pour une valeur inconnue", () => {
    expect(GALLERY_TABS.map((tab) => tab.label)).toEqual(["Éléments", "Texte", "Effets", "Mises en avant", "Transitions", "Caméra", "Effets de plan"]);
    expect(parseGalleryTab("camera")).toBe("camera");
    expect(parseGalleryTab("inconnu")).toBe(DEFAULT_GALLERY_TAB);
    expect(parseGalleryTab(null)).toBe("elements");
    // Le lecteur de `?tab=` : même règle, et l'onglet par défaut n'écrit rien dans l'adresse.
    expect(galleryTabParser.parse("shotfx")).toBe("shotfx");
    expect(galleryTabParser.parse("bogus")).toBeNull();
    expect(galleryTabParser.defaultValue).toBe("elements");
    expect(galleryTabParser.serialize("highlights")).toBe("highlights");
    expect(galleryTabParser.clearOnDefault).toBe(true);
  });
});

describe("galerie des animations : sections", () => {
  it("garde l'ordre des catégories, mises en avant et boucles d'abord, grilles à la fin", () => {
    const highlights = gallerySectionsOf("highlights").map((section) => section.key);
    expect(highlights.slice(0, 2)).toEqual(["attention", "loop"]);
    expect(highlights.at(-1)).toBe(GRID_SECTION.key);
    expect(gallerySectionsOf("elements").map((section) => section.key)[0]).toBe("fade");
    expect(gallerySectionsOf("transitions").map((section) => section.label)[0]).toBe("Fondus");
  });

  it("compte chaque entrée dans une seule section, sans section vide", () => {
    for (const tab of GALLERY_TAB_IDS) {
      const groups = groupGallery(galleryEntries(tab), tab);
      expect(groups.every((group) => group.entries.length > 0)).toBe(true);
      expect(groups.reduce((sum, group) => sum + group.entries.length, 0)).toBe(galleryEntries(tab).length);
      expect(new Set(groups.map((group) => group.key)).size).toBe(groups.length);
    }
  });
});

describe("galerie des animations : recherche et filtres", () => {
  it("cherche sans accents ni majuscules, nom en tête", () => {
    const entries = galleryEntries("elements");
    const results = searchGallery(entries, "MONTEE");
    expect(results.length).toBeGreaterThan(0);
    const first = results[0].label.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    expect(first.includes("montee")).toBe(true);
    expect(searchGallery(entries, "")).toHaveLength(entries.length);
    expect(searchGallery(entries, "zzzz introuvable")).toHaveLength(0);
  });

  it("trouve par catégorie, par phase et par découpage", () => {
    expect(searchGallery(galleryEntries("text"), "lettre par lettre").length).toBeGreaterThan(0);
    expect(searchGallery(galleryEntries("elements"), "sortie").every((entry) => entry.source === "motion" && entry.preset.phase === "out")).toBe(true);
    expect(searchGallery(galleryEntries("highlights"), "grilles").length).toBe(
      galleryEntries("highlights").filter((entry) => entry.section === GRID_SECTION.key).length
    );
    expect(searchGallery(galleryEntries("transitions"), "balayage").length).toBeGreaterThan(0);
  });

  it("filtre par section, par favoris (par identifiant), puis par recherche", () => {
    const entries = galleryEntries("elements");
    const slides = filterGallery(entries, { section: "slide" });
    expect(slides.length).toBeGreaterThan(0);
    expect(slides.every((entry) => entry.section === "slide")).toBe(true);
    expect(filterGallery(entries, { section: "all" })).toHaveLength(entries.length);

    const favorite = slides[0].id;
    const favorites = filterGallery(entries, { favoritesOnly: true, favorites: [favorite, "inconnu"] });
    expect(favorites.length).toBeGreaterThan(0);
    expect(favorites.every((entry) => entry.id === favorite)).toBe(true);
    expect(filterGallery(entries, { favoritesOnly: true, favorites: [] })).toHaveLength(0);
    // Sans « Favoris seulement », la liste de favoris ne filtre rien.
    expect(filterGallery(entries, { favorites: [favorite] })).toHaveLength(entries.length);

    const searched = filterGallery(entries, { section: "slide", query: "zzzz" });
    expect(searched).toHaveLength(0);
  });

  it("partage les favoris avec le sélecteur de l'éditeur", () => {
    expect(galleryFavoritesKey("elements")).toBe(FAVORITES_STORAGE_KEY);
    expect(galleryFavoritesKey("highlights")).toBe(FAVORITES_STORAGE_KEY);
    expect(galleryFavoritesKey("transitions")).toBe("clip-studio:scene-favorites:transition");
    expect(galleryFavoritesKey("camera")).toBe("clip-studio:scene-favorites:camera");
    expect(galleryFavoritesKey("shotfx")).toBe("clip-studio:scene-favorites:shotfx");
  });
});

describe("galerie des animations : cartes et fiche", () => {
  const typography = (text: string) => {
    expect(text).not.toMatch(/—/);
    expect(text).not.toMatch(/[^  ][;:!?](\s|$)/);
    expect(text).not.toMatch(/«(?! )|(?<! )»/);
  };

  it("écrit des textes français justes : phase, durée par unité, chemins de l'éditeur", () => {
    for (const entry of allEntries()) {
      const detail = cardDetail(entry);
      expect(detail.length).toBeGreaterThan(0);
      typography(detail);
      const path = editorPath(entry);
      expect(path.steps.length).toBeGreaterThanOrEqual(3);
      for (const step of [...path.steps, path.shortcut]) typography(step);
      if (entry.source === "motion") typography(phasesText(entry.preset));
    }
    const letters = motionEntries("text").find((entry) => entry.preset.split === "char")!;
    expect(cardDetail(letters)).toMatch(/par lettre$/);
    const shotfx = galleryEntries("shotfx")[0];
    expect(editorPath(shotfx).steps.join(" ")).toContain("Ajouter un effet de plan ici");
    const camera = galleryEntries("camera")[0];
    expect(editorPath(camera).steps.join(" ")).toContain("Mouvement de caméra");
  });

  it("dit où poser une animation d'élément : section, onglet de phase, catégorie", () => {
    const loop = motionEntries("highlights").find((entry) => entry.preset.phase === "loop")!;
    const steps = editorPath(loop).steps.join(" ");
    expect(steps).toContain("« Animations »");
    expect(steps).toContain("« Mise en avant »");
    const out = motionEntries("elements").find((entry) => entry.preset.phase === "out")!;
    expect(editorPath(out).shortcut).toContain("Animation de sortie");
  });

  it("décrit les courbes et les types d'éléments en clair", () => {
    expect(easeText("outCubic")).toBe("Cubique qui ralentit");
    expect(easeText("inOutBack")).toBe("Avec recul qui accélère puis ralentit");
    expect(easeText("linear")).toBe("Linéaire");
    expect(easeText(undefined)).toBe("Linéaire");
    expect(easeText({ spring: { mass: 1, stiffness: 100, damping: 10 } })).toBe("Ressort");
    expect(easeText({ bezier: [0.2, 0.8, 0.2, 1] })).toBe("Bézier (0,2 ; 0,8 ; 0,2 ; 1)");
    for (const entry of allEntries()) {
      if (entry.source !== "motion") continue;
      expect(easeText(entry.preset.ease, entry.preset)).not.toMatch(/^(in|out|inOut)[A-Z]/);
      const types = appliesTo(entry.preset);
      expect(types.length).toBeGreaterThan(0);
      expect(types.every((type) => fitsItemType(entry.preset, type))).toBe(true);
    }
    expect(itemTypesText(["text", "image", "video", "shape"])).toBe("Texte, image, vidéo et forme");
  });

  it("montre un nombre aux compteurs, et passe les réglages à l'aperçu", () => {
    const counter = allEntries().find((entry): entry is MotionGalleryEntry => entry.source === "motion" && entry.preset.category === "counter")!;
    expect(counter.sampleText).toBe(COUNTER_SAMPLE);
    const withParams = allEntries().find((entry): entry is MotionGalleryEntry => entry.source === "motion" && (entry.preset.params?.length ?? 0) > 0)!;
    const param = withParams.preset.params![0];
    const value = param.kind === "amount" ? param.max : "left";
    const scene = buildPreviewScene(withParams.preset, withParams.pickerPhase, {
      width: 320,
      height: 200,
      color: "#000000",
      itemType: withParams.itemType,
      params: { [param.id]: value },
      text: "Votre titre",
    });
    const item = scene.project.tracks[0].items[0] as TextItem;
    const anim = withParams.pickerPhase === "emphasis" ? item.animEmphasis : withParams.pickerPhase === "in" ? item.animIn : item.animOut;
    expect(anim?.params).toEqual({ [param.id]: value });
    if (item.type === "text") expect(item.text).toBe("Votre titre");
  });
});

/** Les entrées sont des objets du catalogue : la page les compare par clé. */
function keys(entries: readonly GalleryEntry[]) {
  return entries.map((entry) => entry.key);
}

describe("galerie des animations : stabilité", () => {
  it("rend les mêmes entrées à chaque appel (cache)", () => {
    expect(keys(galleryEntries("effects"))).toEqual(keys(galleryEntries("effects")));
  });
});
