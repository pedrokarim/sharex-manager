import fs from "node:fs";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConnectorContext, PublicationHealth, PublishJobSummary } from "@/lib/connections/types";

// Données du module dans un dossier temporaire : `store.ts` fige ses chemins
// sur `process.cwd()` au chargement, d'où ce réglage avant tout import.
const { root, restoreCwd } = await vi.hoisted(async () => {
  const fsModule = await import("node:fs");
  const osModule = await import("node:os");
  const pathModule = await import("node:path");
  const dir = fsModule.mkdtempSync(pathModule.join(osModule.tmpdir(), "clip-issues-"));
  const original = process.cwd.bind(process);
  process.cwd = () => dir;
  return { root: dir, restoreCwd: () => (process.cwd = original) };
});

const spies = vi.hoisted(() => ({
  listJobs: vi.fn(),
  readPublicationHealth: vi.fn(),
  setTrackRightsNote: vi.fn(),
  askCodex: vi.fn(),
  findCodex: vi.fn(() => null as string | null),
}));

// La file et les comptes du cœur : simulés, aucun appel réseau.
vi.mock("@/lib/connections", () => ({
  listJobs: (...args: unknown[]) => spies.listJobs(...args),
  listConnectors: () => [{ id: "youtube", label: "YouTube", logo: "youtube", publicationHealth: true }],
  readPublicationHealth: (...args: unknown[]) => spies.readPublicationHealth(...args),
}));
// Écrit en même temps par l'étape R1 : seule sa signature compte ici.
vi.mock("@/modules/clip-studio/lib/music-rights", () => ({
  setTrackRightsNote: (...args: unknown[]) => spies.setTrackRightsNote(...args),
}));
vi.mock("@/modules/clip-studio/lib/codex", () => ({
  askCodex: (...args: unknown[]) => spies.askCodex(...args),
  findCodex: () => spies.findCodex(),
  extractJson: <T,>(answer: string): T => JSON.parse(answer.slice(answer.indexOf("{"), answer.lastIndexOf("}") + 1)) as T,
}));

const issues = await import("@/modules/clip-studio/lib/publication-issues");
const { issueStateText } = await import("@/modules/clip-studio/lib/rights-types");
const { readPublicationHealth: readYoutubeHealth } = await import("@/lib/connections/connectors/youtube/api");
const { writeExports, writeProject, DATA_DIR } = await import("@/modules/clip-studio/lib/store");

/** Le texte que montre YouTube Studio pour le Short `TdSclzwxnYo` (dossier 01 quater, § 1). */
const STUDIO_FR = `Revendication : Memories
Détails de la revendication
0:00 / 1:06
Memories
Soundrider
Partie concernée
0:01 - 1:04
Type
 Droits d'auteur - Audio
Demandeurs
HAAWK for a 3rd Party
au nom de Soundrider
Impact sur la vidéo
Vidéo bloquée dans le monde entier
Votre Short ne peut pas être lu, car il comporte du contenu revendiqué qui dépasse les limites de durée définies par le titulaire des droits d'auteur.
La vidéo ne peut pas générer de revenus
Le demandeur n'autorise pas la monétisation de cette vidéo.`;

const STUDIO_EN = `Claim: Memories
Claim details
0:00 / 1:06
Memories
Soundrider
Content found
0:01 – 1:04
Type
Copyright - Audio
Claimants
HAAWK for a 3rd Party
on behalf of Soundrider
Impact on the video
Blocked in all countries
Can't be monetized`;

const EXPORT_ID = "exp-mwgzb2h2fl3z";
const PROJECT_ID = "clip-mwgyswszrdov92";
const JOB_ID = "job-tdsc01";
const VIDEO_ID = "TdSclzwxnYo";
const TRACK_ID = "cafeace9-eb96-4459-8705-f4f246658804";
const target = { exportId: EXPORT_ID, jobId: JOB_ID, service: "youtube" as const, externalId: VIDEO_ID };

const NOW = Date.parse("2026-11-15T12:00:00Z");
const HOUR = 60 * 60 * 1000;

function healthy(externalId = VIDEO_ID, checkedAt = NOW): PublicationHealth {
  return { externalId, found: true, uploadStatus: "processed", privacyStatus: "public", checkedAt };
}

function job(patch: Partial<PublishJobSummary> = {}): PublishJobSummary {
  return {
    id: JOB_ID,
    accountId: "acc-yt01",
    connector: "youtube",
    source: { module: "clip-studio", id: EXPORT_ID, file: "clip.mp4", bytes: 1, kind: "video", name: "Clip", width: 1080, height: 1920, durationMs: 66_000 },
    options: {},
    state: "done",
    bytesSent: 1,
    result: { externalId: VIDEO_ID, url: `https://www.youtube.com/watch?v=${VIDEO_ID}` },
    createdAt: NOW - 2 * HOUR,
    updatedAt: NOW - 2 * HOUR,
    ...patch,
  } as PublishJobSummary;
}

/** Projet du § 1 : une voix, et la musique de la banque sur toute la vidéo (30 images par seconde). */
function seedProject(musicStart = 30, musicDuration = 1920) {
  writeExports([
    { id: EXPORT_ID, projectId: PROJECT_ID, projectName: "7 animés de 2027", file: "clip.mp4", width: 1080, height: 1920, durationMs: 66_000, sizeBytes: 1, createdAt: NOW - 3 * HOUR },
  ]);
  writeProject({
    version: 1,
    id: PROJECT_ID,
    name: "7 animés de 2027",
    aspect: "9:16",
    width: 1080,
    height: 1920,
    fps: 30,
    background: "#000000",
    tracks: [
      {
        id: "t-voice",
        kind: "audio",
        name: "Voix",
        items: [{ id: "voice-1", type: "audio", start: 0, duration: 1980, source: { url: "/api/x/voice.mp3", ref: "upload:voice.mp3", name: "Voix", kind: "audio" }, trimStart: 0, volume: 1, fadeIn: 0, fadeOut: 0 }],
      },
      {
        id: "t-music",
        kind: "audio",
        name: "Musique",
        items: [
          {
            id: "music-1",
            type: "audio",
            start: musicStart,
            duration: musicDuration,
            source: { url: `/api/modules/clip-studio/data/resources/music/${TRACK_ID}.mp3`, ref: `module:clip-studio/resources/music/${TRACK_ID}.mp3`, name: "Epic Hip-Hop – Soundrider/Dope", kind: "audio" },
            trimStart: 0,
            volume: 0.4,
            fadeIn: 0,
            fadeOut: 0,
          },
        ],
      },
    ],
    createdAt: NOW - 4 * HOUR,
    updatedAt: NOW - 4 * HOUR,
  } as never);
}

beforeEach(() => {
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  spies.listJobs.mockReset().mockReturnValue([]);
  spies.readPublicationHealth.mockReset();
  spies.setTrackRightsNote.mockReset();
  spies.askCodex.mockReset();
  spies.findCodex.mockReset().mockReturnValue(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(() => {
  restoreCwd();
  fs.rmSync(root, { recursive: true, force: true });
});

describe("texte collé depuis YouTube Studio", () => {
  it("lit le blocage du Short TdSclzwxnYo (français)", () => {
    const parsed = issues.parseStudioClaimRules(STUDIO_FR);
    expect(parsed.claim).toEqual({ title: "Memories", claimant: "HAAWK for a 3rd Party", onBehalfOf: "Soundrider", startMs: 1000, endMs: 64_000, media: "audio" });
    expect(parsed.kind).toBe("copyright-claim");
    expect(parsed.scope).toEqual({ worldwide: true });
    expect(parsed.missing).toEqual([]);
    expect(issueStateText({ kind: parsed.kind, scope: parsed.scope })).toBe("Bloquée dans le monde entier");
  });

  it("lit la même revendication en anglais", () => {
    const parsed = issues.parseStudioClaimRules(STUDIO_EN);
    expect(parsed.claim).toEqual({ title: "Memories", claimant: "HAAWK for a 3rd Party", onBehalfOf: "Soundrider", startMs: 1000, endMs: 64_000, media: "audio" });
    expect(parsed.scope).toEqual({ worldwide: true });
    expect(parsed.missing).toEqual([]);
  });

  it("dit ce qui manque, sans Codex ni erreur", async () => {
    const parsed = await issues.parseStudioClaim("Vidéo bloquée dans certains pays");
    expect(parsed.scope).toEqual({ worldwide: false });
    expect(parsed.missing).toEqual(expect.arrayContaining(["title", "claimant", "range"]));
    expect(parsed.via).toBe("rules");
    expect(spies.askCodex).not.toHaveBeenCalled();
  });

  it("laisse Codex compléter les seuls champs manquants", async () => {
    const ask = vi.fn(async () => '```json\n{"title":"Autre titre","claimant":"Identifyy","startMs":0,"endMs":30000,"media":"audio","effect":"worldwide"}\n```');
    const parsed = await issues.parseStudioClaim("Revendication : Memories\nType\nDroits d'auteur - Audio", { ask, available: () => true });
    expect(ask).toHaveBeenCalledTimes(1);
    expect(parsed.via).toBe("codex");
    // Le titre trouvé par les règles reste le sien.
    expect(parsed.claim).toMatchObject({ title: "Memories", claimant: "Identifyy", startMs: 0, endMs: 30_000 });
    expect(parsed.scope).toEqual({ worldwide: true });
    expect(parsed.missing).toEqual([]);
  });

  it("garde l'analyse des règles quand Codex échoue", async () => {
    const parsed = await issues.parseStudioClaim("Revendication : Memories", { ask: async () => Promise.reject(new Error("délai")), available: () => true });
    expect(parsed.claim.title).toBe("Memories");
    expect(parsed.via).toBe("rules");
  });
});

describe("lecture de santé YouTube", () => {
  const context = { accountId: "acc-yt01", externalId: "UCchaine", getAccessToken: async () => ({ value: "jeton", expiresAt: NOW + HOUR }), chargeQuota: vi.fn(), appSecretProof: () => "", appSettings: {} } as unknown as ConnectorContext;

  it("demande status,contentDetails en un appel compté, et traduit chaque réponse", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const ids = new URL(url).searchParams.get("id")!.split(",");
      expect(ids).toHaveLength(5);
      return new Response(
        JSON.stringify({
          items: [
            { id: "claimed01", status: { uploadStatus: "rejected", rejectionReason: "claim", privacyStatus: "public" }, contentDetails: { duration: "PT1M6S" } },
            { id: "blocked01", status: { uploadStatus: "processed", privacyStatus: "public" }, contentDetails: { regionRestriction: { blocked: ["US", "DE", "FR"] } } },
            { id: "allowed01", status: { uploadStatus: "processed", privacyStatus: "public" }, contentDetails: { regionRestriction: { allowed: [] } } },
            { id: "healthy01", status: { uploadStatus: "processed", privacyStatus: "public" }, contentDetails: { duration: "PT1M6S" } },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const readings = await readYoutubeHealth(context, ["claimed01", "blocked01", "allowed01", "healthy01", "gone01"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.pathname).toBe("/youtube/v3/videos");
    expect(url.searchParams.get("part")).toBe("status,contentDetails");
    expect(context.chargeQuota).toHaveBeenCalledWith("videos.list");

    const byId = Object.fromEntries(readings.map((reading) => [reading.externalId, reading]));
    expect(byId.claimed01).toMatchObject({ found: true, uploadStatus: "rejected", rejectionReason: "claim", privacyStatus: "public" });
    expect(byId.blocked01.regionRestriction).toEqual({ blocked: ["DE", "FR", "US"] });
    expect(byId.gone01).toMatchObject({ found: false });

    const label = (id: string) => {
      const issue = issues.healthToIssue(byId[id]);
      return issue ? issueStateText(issue) : null;
    };
    expect(label("claimed01")).toBe("Bloquée dans le monde entier");
    expect(issues.healthToIssue(byId.claimed01)?.kind).toBe("copyright-claim");
    expect(label("blocked01")).toBe("Bloquée dans 3 pays");
    expect(label("allowed01")).toBe("Bloquée dans le monde entier");
    expect(label("healthy01")).toBeNull();
    expect(label("gone01")).toBe("Retirée");
  });

  it("lit 249 pays bloqués comme un blocage mondial (mesuré sur TdSclzwxnYo)", () => {
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const codes = Array.from({ length: 249 }, (_, index) => `${letters[Math.floor(index / 26)]}${letters[index % 26]}`);
    const draft = issues.healthToIssue({ externalId: VIDEO_ID, found: true, uploadStatus: "processed", regionRestriction: { blocked: codes }, checkedAt: NOW });
    expect(draft?.kind).toBe("blocked");
    expect(draft?.scope?.worldwide).toBe(true);
    // La liste reste, pour le détail.
    expect(draft?.scope?.countries).toHaveLength(249);
    expect(issueStateText(draft!)).toBe("Bloquée dans le monde entier");
    // Quelques pays seulement : un blocage partiel.
    expect(issues.healthToIssue({ externalId: VIDEO_ID, found: true, regionRestriction: { blocked: codes.slice(0, 12) }, checkedAt: NOW })?.scope?.worldwide).toBe(false);

    // Relu par l'API après une saisie à la main « monde entier » : pas de doublon.
    seedProject();
    issues.recordPublicationIssue({ ...target, kind: "blocked", scope: { worldwide: true }, source: "manual" });
    expect(issues.recordHealthReading(target, { externalId: VIDEO_ID, found: true, regionRestriction: { blocked: codes }, checkedAt: NOW })).toBeNull();
    expect(issues.listPublicationIssues()).toHaveLength(1);
  });

  it("distingue un refus pour une autre raison", () => {
    expect(issues.healthToIssue({ externalId: "x", found: true, uploadStatus: "rejected", rejectionReason: "trademark", checkedAt: NOW })).toEqual({ kind: "rejected" });
    expect(issues.healthToIssue({ externalId: "x", found: true, regionRestriction: { allowed: ["FR"] }, checkedAt: NOW })).toEqual({ kind: "blocked", scope: { worldwide: false } });
  });
});

describe("blocages enregistrés", () => {
  it("ne recrée pas d'entrée pour un même état relu, et lève le blocage relu sain", () => {
    seedProject();
    const blocked: PublicationHealth = { externalId: VIDEO_ID, found: true, uploadStatus: "rejected", rejectionReason: "claim", checkedAt: NOW };
    const first = issues.recordHealthReading(target, blocked);
    expect(first).toMatchObject({ source: "api", kind: "copyright-claim", scope: { worldwide: true }, jobId: JOB_ID });
    expect(issues.recordHealthReading(target, { ...blocked, checkedAt: NOW + HOUR })).toBeNull();
    expect(issues.listPublicationIssues({ exportId: EXPORT_ID })).toHaveLength(1);

    // Une liste gardée en mémoire plus ancienne que le blocage ne le lève pas.
    issues.recordHealthReading(target, healthy(VIDEO_ID, NOW - HOUR));
    expect(issues.listPublicationIssues()[0].resolution).toBeUndefined();
    issues.recordHealthReading(target, healthy(VIDEO_ID, NOW + 2 * HOUR));
    expect(issues.listPublicationIssues()[0].resolution?.state).toBe("released");
    // Sans plage ni média connus, l'API ne touche pas aux droits des morceaux.
    expect(spies.setTrackRightsNote).not.toHaveBeenCalled();
  });

  it("ne double pas une saisie à la main par l'API", () => {
    seedProject();
    const manual = issues.recordPublicationIssue({ ...target, kind: "copyright-claim", scope: { worldwide: true }, claim: { title: "Memories", media: "audio", startMs: 1000, endMs: 64_000 }, source: "manual", raw: STUDIO_FR });
    expect(issues.recordPublicationIssue({ ...target, kind: "copyright-claim", scope: { worldwide: true }, claim: { title: "Memories", media: "audio", startMs: 1000, endMs: 64_000 }, source: "manual" }).id).toBe(manual.id);
    expect(issues.recordHealthReading(target, { externalId: VIDEO_ID, found: true, uploadStatus: "rejected", rejectionReason: "copyright", checkedAt: NOW })).toBeNull();
    expect(issues.listPublicationIssues()).toHaveLength(1);
  });

  it("règle un blocage : contesté, puis levé", () => {
    const issue = issues.recordPublicationIssue({ ...target, kind: "copyright-claim", scope: { worldwide: true }, source: "manual" });
    expect(issueStateText(issues.resolvePublicationIssue(issue.id, { state: "disputed", note: "Licence CC BY 3.0" }))).toBe("Contestée");
    const released = issues.resolvePublicationIssue(issue.id, { state: "released" });
    expect(issueStateText(released)).toBe("Revendication levée");
    expect(() => issues.resolvePublicationIssue(issue.id, { state: "nope" as never })).toThrow("Règlement inconnu.");
    expect(() => issues.resolvePublicationIssue("iss-inconnu", { state: "released" })).toThrow("Blocage introuvable.");
  });

  it("refuse un service non suivi ou un type inconnu", () => {
    expect(() => issues.recordPublicationIssue({ ...target, service: "tiktok" as never, kind: "blocked", source: "manual" })).toThrow("Service non suivi.");
    expect(() => issues.recordPublicationIssue({ ...target, kind: "autre" as never, source: "manual" })).toThrow("Type de blocage inconnu.");
  });
});

describe("morceau en cause", () => {
  it("retrouve la musique de la banque qui recouvre la plage revendiquée", () => {
    seedProject();
    expect(issues.findTrackForIssue(EXPORT_ID, { startMs: 1000, endMs: 64_000 })).toMatchObject({ trackId: TRACK_ID, itemId: "music-1", startMs: 1000, endMs: 65_000, overlapMs: 63_000 });
    // Sans plage : le morceau le plus long du projet ; la voix (hors banque) n'est jamais retenue.
    expect(issues.findTrackForIssue(EXPORT_ID)).toMatchObject({ trackId: TRACK_ID });
    // Une plage que la musique ne touche pas.
    seedProject(1800, 60);
    expect(issues.findTrackForIssue(EXPORT_ID, { startMs: 1000, endMs: 30_000 })).toBeNull();
    expect(issues.findTrackForIssue("exp-absent")).toBeNull();
  });

  it("passe le morceau revendiqué à l'enregistrement d'un blocage audio", () => {
    seedProject();
    const parsed = issues.parseStudioClaimRules(STUDIO_FR);
    const issue = issues.recordPublicationIssue({ ...target, kind: parsed.kind, scope: parsed.scope, claim: parsed.claim, source: "manual", raw: STUDIO_FR });
    expect(issue.trackId).toBe(TRACK_ID);
    expect(spies.setTrackRightsNote).toHaveBeenCalledTimes(1);
    const [trackId, note, history] = spies.setTrackRightsNote.mock.calls[0];
    expect(trackId).toBe(TRACK_ID);
    expect(note).toMatchObject({ state: "claimed", since: issue.detectedAt.slice(0, 10) });
    expect(note.reason).toContain("Memories");
    expect(note.reason).toContain("HAAWK for a 3rd Party");
    expect(typeof history).toBe("string");
    // Une deuxième saisie identique ne renote pas le morceau.
    issues.recordPublicationIssue({ ...target, kind: parsed.kind, scope: parsed.scope, claim: parsed.claim, source: "manual" });
    expect(spies.setTrackRightsNote).toHaveBeenCalledTimes(1);
  });
});

describe("calendrier des lectures de santé", () => {
  it("lit à 1 h, puis à 6 h, sans doublon, et ne lit plus une vieille publication", async () => {
    seedProject();
    spies.listJobs.mockReturnValue([job({ createdAt: NOW - 2 * HOUR }), job({ id: "job-vieux", createdAt: NOW - 9 * 24 * HOUR, result: { externalId: "oldvideo01", url: "" } })]);
    spies.readPublicationHealth.mockImplementation(async (_accountId: string, ids: string[]) =>
      ids.map((id) => ({ externalId: id, found: true, uploadStatus: "processed", regionRestriction: { blocked: ["FR"] }, checkedAt: NOW }))
    );

    const first = await issues.runDueHealthChecks(NOW);
    expect(spies.readPublicationHealth).toHaveBeenCalledTimes(1);
    expect(spies.readPublicationHealth).toHaveBeenCalledWith("acc-yt01", [VIDEO_ID]);
    expect(first.created).toHaveLength(1);
    expect(issueStateText(first.created[0])).toBe("Bloquée dans 1 pays");

    // Rien de dû avant la lecture de 6 h.
    await issues.runDueHealthChecks(NOW + HOUR);
    expect(spies.readPublicationHealth).toHaveBeenCalledTimes(1);

    // À 6 h : relu, même état, pas de nouvelle entrée.
    const second = await issues.runDueHealthChecks(NOW + 4 * HOUR + 1);
    expect(spies.readPublicationHealth).toHaveBeenCalledTimes(2);
    expect(second.created).toHaveLength(0);
    expect(issues.listPublicationIssues({ exportId: EXPORT_ID })).toHaveLength(1);
  });

  it("repousse d'une heure une lecture qui échoue", async () => {
    seedProject();
    spies.listJobs.mockReturnValue([job()]);
    spies.readPublicationHealth.mockRejectedValueOnce(new Error("Quota du jour épuisé"));
    await issues.runDueHealthChecks(NOW);
    await issues.runDueHealthChecks(NOW + 30 * 60 * 1000);
    expect(spies.readPublicationHealth).toHaveBeenCalledTimes(1);
    spies.readPublicationHealth.mockResolvedValueOnce([healthy()]);
    await issues.runDueHealthChecks(NOW + HOUR + 1);
    expect(spies.readPublicationHealth).toHaveBeenCalledTimes(2);
    expect(issues.listPublicationIssues()).toHaveLength(0);
  });

  it("range la santé lue avec les statistiques de la fiche", () => {
    seedProject();
    const health = new Map([["acc-yt01", new Map([[VIDEO_ID, { externalId: VIDEO_ID, found: true, regionRestriction: { allowed: [] }, checkedAt: NOW } as PublicationHealth]])]]);
    const rows = [{ accountId: "acc-yt01", connector: "youtube", jobId: JOB_ID, externalId: VIDEO_ID, state: "published" }];
    expect(issues.recordHealthFromPosts(EXPORT_ID, rows, health)).toBe(1);
    expect(issues.recordHealthFromPosts(EXPORT_ID, rows, health)).toBe(0);
    const lookup = issues.issueLookup();
    expect(lookup({ jobId: JOB_ID, connector: "youtube", externalId: VIDEO_ID })).toMatchObject({ kind: "blocked", scope: { worldwide: true } });
    // La ligne ne transporte pas la réponse brute.
    expect(lookup({ jobId: JOB_ID, connector: "youtube" })).not.toHaveProperty("raw");
  });
});
