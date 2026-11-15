import { describe, expect, it } from "vitest";
import { addItem, createImageItem, createMusicItems, createProject, createTextItem } from "@/modules/clip-studio/engine/edit";
import type { AudioItem, ClipProject, MediaSource } from "@/modules/clip-studio/engine/types";
import { canRender, preRenderChecks } from "@/modules/clip-studio/lib/export-screens";
import {
  groupRightsWarnings,
  musicTrackIdOf,
  projectRightsWarnings,
  publishRightsProblem,
  replaceMusic,
  unconfirmedBlockers,
  type RightsTrack,
} from "@/modules/clip-studio/lib/rights-warnings";

const CLAIMED = "cafeace9-eb96-4459-8705-f4f246658804";
const RISKY = "11111111-1111-4111-8111-111111111111";
const CLEAR = "22222222-2222-4222-8222-222222222222";
const BARE = "33333333-3333-4333-8333-333333333333";
const GONE = "44444444-4444-4444-8444-444444444444";

const bank: RightsTrack[] = [
  { id: CLAIMED, title: "Epic Hip-Hop", artist: "Soundrider/Dope", rights: { state: "claimed", reason: "Revendiqué par HAAWK au nom de Soundrider.", since: "2026-11-15" } },
  { id: RISKY, title: "Risqué", artist: "Quelqu’un", rights: { state: "at-risk" } },
  { id: CLEAR, title: "Libre", artist: "Autre", rights: { state: "clear" } },
  { id: BARE, title: "Sans note", artist: "Encore" },
  { id: GONE, title: "Disparu", artist: "Parti", rights: { state: "withdrawn", reason: "Retiré d’Openverse." } },
];

const source = (id: string, durationMs = 10_000): MediaSource => ({
  url: `/api/modules/clip-studio/data/resources/music/${id}.mp3`,
  ref: `module:clip-studio/resources/music/${id}.mp3`,
  name: `Morceau ${id.slice(0, 4)}`,
  kind: "audio",
  durationMs,
});

function withMusic(id: string, start: number, end: number, base?: ClipProject): { project: ClipProject; items: AudioItem[] } {
  let project = base ?? createProject("Droits", "9:16");
  const items = createMusicItems(source(id), start, end, project.fps);
  for (const item of items) project = addItem(project, item, undefined, "Musique");
  return { project, items };
}

describe("morceau de la banque lu par une source", () => {
  it("se lit dans la référence, sinon dans l'adresse", () => {
    expect(musicTrackIdOf(source(CLAIMED))).toBe(CLAIMED);
    expect(musicTrackIdOf({ ref: "upload:x.mp3", url: `/api/modules/clip-studio/data/resources/music/${CLEAR}.mp3` })).toBe(CLEAR);
    expect(musicTrackIdOf({ ref: "module:clip-studio/resources/sfx/whoosh.mp3", url: "/x.mp3" })).toBeNull();
    expect(musicTrackIdOf(undefined)).toBeNull();
  });
});

describe("avertissements de droits d'un projet", () => {
  it("signale un morceau revendiqué, avec sa raison et le blocage de la publication", () => {
    const { project, items } = withMusic(CLAIMED, 0, 300);
    const warnings = projectRightsWarnings(project, bank);
    expect(warnings).toHaveLength(1);
    const [warning] = warnings;
    expect(warning.item.id).toBe(items[0].id);
    expect(warning.track.name).toBe("Musique");
    expect(warning.music.title).toBe("Epic Hip-Hop");
    expect(warning.state).toBe("claimed");
    expect(warning.reason).toBe("Revendiqué par HAAWK au nom de Soundrider.");
    expect(warning.since).toBe("2026-11-15");
    expect(warning.blocksPublication).toBe(true);
  });

  it("signale un morceau à risque sans bloquer, avec le sens de l'état à défaut de raison", () => {
    const { project } = withMusic(RISKY, 0, 300);
    const [warning] = projectRightsWarnings(project, bank);
    expect(warning.state).toBe("at-risk");
    expect(warning.reason).toContain("Content ID");
    expect(warning.blocksPublication).toBe(false);
  });

  it("bloque aussi un morceau retiré", () => {
    const { project } = withMusic(GONE, 0, 300);
    expect(projectRightsWarnings(project, bank)[0]).toMatchObject({ state: "withdrawn", blocksPublication: true });
  });

  it("ne dit rien d'un morceau libre, sans note, ou absent de la banque", () => {
    let { project } = withMusic(CLEAR, 0, 300);
    ({ project } = withMusic(BARE, 300, 600, project));
    ({ project } = withMusic("55555555-5555-4555-8555-555555555555", 600, 900, project));
    expect(projectRightsWarnings(project, bank)).toEqual([]);
    expect(projectRightsWarnings(null, bank)).toEqual([]);
  });

  it("ignore les éléments qui ne sont pas du son de la banque", () => {
    let project = createProject("Visuels", "9:16");
    // Une image et un texte qui porteraient par erreur l'adresse d'un morceau ne comptent pas.
    project = addItem(project, createImageItem({ ...source(CLAIMED), kind: "image" }, 0, project.fps));
    project = addItem(project, createTextItem("impact", 0, project.fps));
    expect(projectRightsWarnings(project, bank)).toEqual([]);
  });

  it("rend un avertissement par élément, et une ligne par morceau", () => {
    // 10 s de morceau sur 25 s : trois éléments en boucle, plus un ailleurs dans le projet.
    let { project, items } = withMusic(CLAIMED, 0, 750);
    expect(items).toHaveLength(3);
    ({ project } = withMusic(RISKY, 750, 900, project));
    ({ project } = withMusic(CLAIMED, 900, 960, project));
    const warnings = projectRightsWarnings(project, bank);
    expect(warnings.filter((warning) => warning.music.id === CLAIMED)).toHaveLength(4);
    const groups = groupRightsWarnings(warnings);
    expect(groups.map((group) => group.music.id)).toEqual([CLAIMED, RISKY]);
    expect(groups[0].items).toHaveLength(4);
    expect(groups[0].items[0].item.id).toBe(items[0].id);
  });
});

describe("vérifications de l'écran Exporter", () => {
  it("ajoute une ligne par morceau, qui mène à son premier élément sans bloquer le rendu", () => {
    let { project, items } = withMusic(CLAIMED, 0, 750);
    ({ project } = withMusic(RISKY, 750, 900, project));
    const checks = preRenderChecks({
      missingFonts: [],
      missingMedia: [],
      unverifiedImages: [],
      musicRights: groupRightsWarnings(projectRightsWarnings(project, bank)),
      frame: { width: 1080, height: 1920, durationMs: 30_000 },
      targets: [],
    });
    const claimed = checks.find((check) => check.id === `music-${CLAIMED}`);
    expect(claimed).toMatchObject({ tone: "warning", inEditor: true, editorItemId: items[0].id });
    expect(claimed?.title).toBe("Musique revendiquée : « Epic Hip-Hop »");
    expect(claimed?.detail).toContain("Utilisé 3 fois");
    expect(claimed?.fix).toContain("panneau Musique");
    expect(checks.find((check) => check.id === `music-${RISKY}`)?.tone).toBe("info");
    expect(canRender(checks)).toBe(true);
  });
});

describe("garde-fou de la publication", () => {
  it("attend une confirmation pour chaque morceau revendiqué ou retiré, pas pour un morceau à risque", () => {
    let { project } = withMusic(CLAIMED, 0, 300);
    ({ project } = withMusic(RISKY, 300, 600, project));
    ({ project } = withMusic(GONE, 600, 900, project));
    const groups = groupRightsWarnings(projectRightsWarnings(project, bank));
    expect(unconfirmedBlockers(groups, []).map((group) => group.music.id).sort()).toEqual([CLAIMED, GONE].sort());
    expect(unconfirmedBlockers(groups, [CLAIMED]).map((group) => group.music.id)).toEqual([GONE]);
    expect(unconfirmedBlockers(groups, [CLAIMED, GONE])).toEqual([]);
  });

  it("refuse côté serveur sans la confirmation, accepte avec", () => {
    const { project } = withMusic(CLAIMED, 0, 300);
    const problem = publishRightsProblem(project, bank, undefined);
    expect(problem).toContain("« Epic Hip-Hop » (revendiqué)");
    expect(publishRightsProblem(project, bank, ["autre"])).not.toBeNull();
    expect(publishRightsProblem(project, bank, [CLAIMED])).toBeNull();
    expect(publishRightsProblem(withMusic(RISKY, 0, 300).project, bank, [])).toBeNull();
    expect(publishRightsProblem(null, bank, [])).toBeNull();
  });
});

describe("remplacement d'un morceau", () => {
  it("remplace toute la boucle du morceau sur la même piste et la même plage, au même volume", () => {
    const { project, items } = withMusic(CLAIMED, 30, 780);
    const trackId = project.tracks.find((track) => track.items.some((item) => item.id === items[1].id))!.id;
    const volume = 0.5;
    const tuned: ClipProject = {
      ...project,
      tracks: project.tracks.map((track) => ({ ...track, items: track.items.map((item) => (item.type === "audio" ? { ...item, volume, duck: 0.4 } : item)) })),
    };
    const result = replaceMusic(tuned, items[1].id, source(CLEAR, 20_000));
    const track = result.project.tracks.find((entry) => entry.id === trackId)!;
    const audio = track.items.filter((item): item is AudioItem => item.type === "audio");
    expect(audio.every((item) => item.source.ref.includes(CLEAR))).toBe(true);
    expect(audio[0].start).toBe(30);
    expect(audio[audio.length - 1].start + audio[audio.length - 1].duration).toBe(780);
    expect(audio.every((item) => item.volume === volume && item.duck === 0.4)).toBe(true);
    expect(result.itemId).toBe(audio[0].id);
    expect(projectRightsWarnings(result.project, bank)).toEqual([]);
  });

  it("ne touche à rien pour un élément introuvable ou qui n'est pas un son", () => {
    const { project } = withMusic(CLAIMED, 0, 300);
    expect(replaceMusic(project, "absent", source(CLEAR)).project).toBe(project);
  });
});
