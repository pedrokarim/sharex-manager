import { describe, expect, it } from "vitest";
import { addItem, createAudioItem, createImageItem, createProject, createVideoItem } from "@/modules/clip-studio/engine/edit";
import { projectDuration } from "@/modules/clip-studio/engine/timeline";
import type { AudioItem, ClipProject, ImageItem, VideoItem } from "@/modules/clip-studio/engine/types";
import {
  canRender,
  clampRange,
  creditsText,
  isCustomized,
  isWholeRange,
  markReviewed,
  mergeDraft,
  preRenderChecks,
  publishTimes,
  remainingSeconds,
  resetPostField,
  samePost,
  scheduleProblems,
  setPostField,
  sliceProject,
  staggerSchedule,
  textsOf,
  type PreRenderInput,
} from "@/modules/clip-studio/lib/export-screens";
import { resolvePostTexts } from "@/modules/clip-studio/lib/post-texts";
import { emptyPostTexts, type ExportPost } from "@/modules/clip-studio/lib/post-types";

const image = { url: "/api/files/a.png", ref: "upload:a.png", name: "a.png", kind: "image" as const };
const video = { url: "/api/files/b.mp4", ref: "upload:b.mp4", name: "b.mp4", kind: "video" as const, durationMs: 60_000 };
const sound = { url: "/api/files/c.mp3", ref: "upload:c.mp3", name: "c.mp3", kind: "audio" as const, durationMs: 60_000 };

function project(): { project: ClipProject; image: ImageItem; video: VideoItem; audio: AudioItem } {
  let next = createProject("Plage", "9:16");
  const img = { ...createImageItem(image, 0, next.fps), duration: 90 };
  img.animOut = { kind: "fade", frames: 10 };
  const vid = { ...createVideoItem(video, 90, next.fps), duration: 120, trimStart: 30, speed: 2 };
  const aud = { ...createAudioItem(sound, 0, next.fps), duration: 300, fadeIn: 15 };
  next = addItem(next, img);
  next = addItem(next, vid);
  next = addItem(next, aud);
  return { project: next, image: img, video: vid, audio: aud };
}

const items = (value: ClipProject) => value.tracks.flatMap((track) => track.items);
const byId = <T>(value: ClipProject, id: string) => items(value).find((item) => item.id === id) as T | undefined;

describe("plage à exporter", () => {
  it("borne la plage au projet, une image au moins", () => {
    expect(clampRange({ from: -5, to: 500 }, 300)).toEqual({ from: 0, to: 300 });
    expect(clampRange({ from: 120, to: 100 }, 300)).toEqual({ from: 120, to: 121 });
    expect(isWholeRange({ from: 0, to: 300 }, 300)).toBe(true);
    expect(isWholeRange({ from: 10, to: 300 }, 300)).toBe(false);
  });

  it("ramène la plage à l'image 0 et coupe la fin", () => {
    const { project: value } = project();
    const sliced = sliceProject(value, { from: 60, to: 150 });
    expect(projectDuration(sliced)).toBe(90);
  });

  it("garde le départ négatif d'une image pour que ses animations restent au même point", () => {
    const { project: value, image: img } = project();
    const sliced = sliceProject(value, { from: 30, to: 300 });
    const kept = byId<ImageItem>(sliced, img.id)!;
    expect(kept.start).toBe(-30);
    expect(kept.duration).toBe(90);
    expect(kept.animOut.kind).toBe("fade");
  });

  it("avance une vidéo coupée au début dans sa source, vitesse comprise", () => {
    const { project: value, video: vid } = project();
    const sliced = sliceProject(value, { from: 100, to: 300 });
    const kept = byId<VideoItem>(sliced, vid.id)!;
    expect(kept.start).toBe(0);
    expect(kept.duration).toBe(110);
    expect(kept.trimStart).toBe(30 + 10 * 2);
    expect(kept.animIn.kind).toBe("none");
  });

  it("avance un son coupé au début sans rejouer son fondu d'entrée", () => {
    const { project: value, audio } = project();
    const sliced = sliceProject(value, { from: 60, to: 120 });
    const kept = byId<AudioItem>(sliced, audio.id)!;
    expect(kept.start).toBe(0);
    expect(kept.trimStart).toBe(audio.trimStart + 60);
    expect(kept.duration).toBe(60);
    expect(kept.fadeIn).toBe(0);
  });

  it("retire la sortie animée d'un élément coupé avant qu'elle commence, la garde sinon", () => {
    const { project: value, image: img } = project();
    expect(byId<ImageItem>(sliceProject(value, { from: 0, to: 50 }), img.id)!.animOut.kind).toBe("none");
    expect(byId<ImageItem>(sliceProject(value, { from: 0, to: 85 }), img.id)!.animOut.kind).toBe("fade");
  });

  it("retire les éléments hors de la plage, sans toucher au projet d'origine", () => {
    const { project: value, image: img } = project();
    const sliced = sliceProject(value, { from: 200, to: 300 });
    expect(byId(sliced, img.id)).toBeUndefined();
    expect(byId<ImageItem>(value, img.id)!.start).toBe(0);
  });
});

describe("vérifications avant rendu", () => {
  const base: PreRenderInput = {
    missingFonts: [],
    missingMedia: [],
    unverifiedImages: [],
    frame: { width: 1080, height: 1920, durationMs: 200_000 },
    targets: [],
  };

  it("attend les vérifications en cours sans bloquer", () => {
    const checks = preRenderChecks({ ...base, missingFonts: null, missingMedia: null });
    expect(checks.map((check) => check.tone)).toEqual(["pending", "pending"]);
    expect(canRender(checks)).toBe(true);
  });

  it("bloque le rendu quand une image manque, pas quand seul un son manque", () => {
    const missingImage = preRenderChecks({ ...base, missingMedia: [{ name: "a.png", kind: "image" }] });
    expect(missingImage[0]).toMatchObject({ id: "media", tone: "blocked" });
    expect(canRender(missingImage)).toBe(false);
    const missingSound = preRenderChecks({ ...base, missingMedia: [{ name: "c.mp3", kind: "audio" }] });
    expect(missingSound.find((check) => check.id === "media")?.tone).toBe("warning");
    expect(canRender(missingSound)).toBe(true);
  });

  it("signale polices manquantes et droits à vérifier, bloquants d'abord", () => {
    const checks = preRenderChecks({ ...base, missingFonts: ["Inter Display"], unverifiedImages: ["chat.jpg", "chien.jpg"], missingMedia: [{ name: "b.mp4", kind: "video" }] });
    expect(checks[0].id).toBe("media");
    expect(checks.find((check) => check.id === "fonts")).toMatchObject({ tone: "warning", detail: "Inter Display" });
    expect(checks.find((check) => check.id === "rights")).toMatchObject({ tone: "warning", title: "2 images aux droits à vérifier" });
  });

  it("compare durée et format aux limites des comptes de la marque", () => {
    const checks = preRenderChecks({
      ...base,
      targets: [
        { accountId: "acc-1", accountName: "Ma chaîne", connectorLabel: "Service A", limits: { maxDurationMs: 90_000 } },
        { accountId: "acc-2", accountName: "Mon compte", connectorLabel: "Service B", limits: { maxDurationMs: 900_000 }, shortForm: { maxSeconds: 180, verticalNote: "", horizontalNote: "" } },
        { accountId: "acc-3", accountName: "Autre", connectorLabel: "Service C", limits: { aspectRatio: { min: 16 / 9, max: 16 / 9 } } },
      ],
    });
    expect(checks.find((check) => check.id === "limits-acc-1")).toMatchObject({ tone: "warning", title: "Trop long pour Service A" });
    expect(checks.find((check) => check.id === "short-acc-2")).toMatchObject({ tone: "info", title: "Trop long pour une vidéo courte : 3 min au plus" });
    expect(checks.find((check) => check.id === "limits-acc-3")).toMatchObject({ tone: "warning", inEditor: true });
    expect(canRender(checks)).toBe(true);
  });

  it("dit qu'un clip convient quand il respecte les limites", () => {
    const checks = preRenderChecks({ ...base, frame: { width: 1080, height: 1920, durationMs: 30_000 }, targets: [{ accountId: "acc-1", accountName: "Ma chaîne", connectorLabel: "Service A", limits: { maxDurationMs: 90_000 } }] });
    expect(checks.find((check) => check.id === "limits-acc-1")?.tone).toBe("ok");
  });

  it("estime le temps restant seulement quand c'est raisonnable", () => {
    expect(remainingSeconds(0.01, 10_000)).toBeNull();
    expect(remainingSeconds(0.5, 1000)).toBeNull();
    expect(remainingSeconds(0.5, 20_000)).toBe(20);
    expect(remainingSeconds(1, 20_000)).toBeNull();
  });
});

describe("textes par service", () => {
  const post = (): ExportPost => ({
    base: { ...emptyPostTexts(), title: "Titre", caption: "Légende commune", hashtags: ["chat"] },
    variants: {},
    unreviewed: ["instagram.caption", "base.title"],
    updatedAt: 1,
  });

  it("modifier le texte d'un service crée une variante de ce seul champ", () => {
    const next = setPostField(post(), "instagram", "caption", "Légende courte");
    expect(next.variants).toEqual({ instagram: { caption: "Légende courte" } });
    expect(isCustomized(next, "instagram", "caption")).toBe(true);
    expect(isCustomized(next, "instagram", "title")).toBe(false);
    expect(resolvePostTexts(next, "instagram").caption).toBe("Légende courte");
    expect(resolvePostTexts(next, "threads").caption).toBe("Légende commune");
    expect(next.unreviewed).toEqual(["base.title"]);
  });

  it("revenir à la valeur commune retire la variante", () => {
    const custom = setPostField(post(), "instagram", "caption", "Autre");
    expect(setPostField(custom, "instagram", "caption", "Légende commune").variants).toEqual({});
    expect(resetPostField(custom, "instagram", "caption").variants).toEqual({});
  });

  it("une variante retrouvée après enregistrement reste celle du service", () => {
    const edited = setPostField(setPostField(post(), "threads", "hashtags", ["un"]), "threads", "caption", "Pour Threads");
    const reloaded = JSON.parse(JSON.stringify(edited)) as ExportPost;
    expect(textsOf(reloaded, "threads")).toMatchObject({ caption: "Pour Threads", hashtags: ["un"], title: "Titre" });
    expect(samePost(edited, reloaded)).toBe(true);
  });

  it("changer le texte commun efface les variantes devenues identiques", () => {
    const custom = setPostField(post(), "youtube", "title", "Nouveau titre");
    expect(setPostField(custom, null, "title", "Nouveau titre").variants).toEqual({});
  });

  it("les propositions de l'assistant arrivent « à relire », seulement pour les champs demandés", () => {
    const start = markReviewed(markReviewed(post(), "base.title"), "instagram.caption");
    const draft = { base: { ...emptyPostTexts(), title: "Titre proposé", caption: "Légende proposée" }, variants: { threads: { caption: "Court" } } };
    const merged = mergeDraft(start, draft);
    expect(merged.base.title).toBe("Titre proposé");
    expect(merged.variants.threads?.caption).toBe("Court");
    expect(merged.unreviewed).toEqual(expect.arrayContaining(["base.title", "base.caption", "threads.caption"]));
    const onlyTitle = mergeDraft(start, draft, ["base.title"]);
    expect(onlyTitle.base.caption).toBe("Légende commune");
    expect(onlyTitle.unreviewed).toEqual(["base.title"]);
  });

  it("met les crédits en forme pour la copie", () => {
    expect(creditsText([])).toBe("");
    expect(creditsText(["Musique : A", "Voix : B"])).toBe("Crédits :\nMusique : A\nVoix : B");
  });
});

describe("dates de publication", () => {
  it("décale les comptes d'un pas", () => {
    const start = "2026-10-14T16:00:00.000Z";
    expect(staggerSchedule(start, ["a", "b", "c"], 5)).toEqual({
      a: "2026-10-14T16:00:00.000Z",
      b: "2026-10-14T16:05:00.000Z",
      c: "2026-10-14T16:10:00.000Z",
    });
    expect(staggerSchedule("pas une date", ["a"], 5)).toEqual({});
  });

  it("donne l'instant de chaque compte selon le mode", () => {
    const common = "2026-10-14T16:00:00.000Z";
    const time = Date.parse(common);
    expect(publishTimes("now", common, {}, ["a"])).toEqual({ a: undefined });
    expect(publishTimes("common", common, {}, ["a", "b"])).toEqual({ a: time, b: time });
    expect(publishTimes("perAccount", common, { a: common }, ["a", "b"])).toEqual({ a: time, b: undefined });
  });

  it("refuse une date absente ou passée", () => {
    const now = Date.parse("2026-10-14T16:00:00.000Z");
    expect(scheduleProblems("now", { a: undefined }, now)).toEqual({});
    expect(scheduleProblems("perAccount", { a: undefined, b: now + 30_000, c: now + 3_600_000 }, now)).toEqual({
      a: "Choisissez une date de publication.",
      b: "La date de publication doit être dans le futur.",
    });
  });
});
