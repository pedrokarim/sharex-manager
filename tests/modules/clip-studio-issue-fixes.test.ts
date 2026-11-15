import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// Données du module dans un dossier temporaire : `store.ts`, `music.ts` et
// `music-rights.ts` figent leurs chemins sur `process.cwd()` au chargement.
const { root, restoreCwd } = await vi.hoisted(async () => {
  const fsModule = await import("node:fs");
  const osModule = await import("node:os");
  const pathModule = await import("node:path");
  const dir = fsModule.mkdtempSync(pathModule.join(osModule.tmpdir(), "clip-fixes-"));
  const original = process.cwd.bind(process);
  process.cwd = () => dir;
  return { root: dir, restoreCwd: () => (process.cwd = original) };
});

const spies = vi.hoisted(() => ({ listJobs: vi.fn() }));

vi.mock("@/lib/connections", () => ({
  listJobs: (...args: unknown[]) => spies.listJobs(...args),
  listConnectors: () => [{ id: "youtube", label: "YouTube", logo: "youtube", publicationHealth: true }],
  readPublicationHealth: async () => [],
}));
vi.mock("@/lib/ai-usage", () => ({ recordAiUsage: () => undefined, usageError: () => "" }));
vi.mock("@/modules/clip-studio/lib/codex", () => ({
  askCodex: async () => "{}",
  findCodex: () => null,
  extractJson: (answer: string) => JSON.parse(answer),
}));

const fixes = await import("@/modules/clip-studio/lib/issue-fixes");
const issues = await import("@/modules/clip-studio/lib/publication-issues");
const { DATA_DIR, readProject, writeExports, writeProject } = await import("@/modules/clip-studio/lib/store");
const { projectCredits } = await import("@/modules/clip-studio/lib/credits");
const chat = await import("@/modules/clip-studio/lib/editor-chat");
const { describeProject, editorAssistantPrompt } = await import("@/modules/clip-studio/engine/editor-brief");

const EXPORT_ID = "exp-mwgzb2h2fl3z";
const PROJECT_ID = "clip-mwgyswszrdov92";
const JOB_ID = "job-tdsc01";
const VIDEO_ID = "TdSclzwxnYo";
const EPIC = "cafeace9-eb96-4459-8705-f4f246658804";

/** La banque : le morceau revendiqué, deux remplaçants possibles, et ceux que le serveur doit écarter. */
const LIBRARY = [
  { id: EPIC, title: "Epic Hip-Hop", artist: "Soundrider/Dope", mood: "epic", durationMs: 120_000, genres: [], license: "CC BY 3.0", licenseUrl: "https://creativecommons.org/licenses/by/3.0/", pageUrl: "https://www.jamendo.com/track/1670662", audioUrl: "https://prod-1.storage.jamendo.com/?trackid=101&format=mp32" },
  { id: "0a000000-0000-4000-8000-000000000001", title: "Free Epic", artist: "Open Band", mood: "epic", durationMs: 90_000, genres: [], license: "CC0", licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/", audioUrl: "https://prod-1.storage.jamendo.com/?trackid=97&format=mp32" },
  { id: "0b000000-0000-4000-8000-000000000002", title: "Brave Drums", artist: "Third Artist", mood: "epic", durationMs: 100_000, genres: [], license: "CC BY 4.0", licenseUrl: "https://creativecommons.org/licenses/by/4.0/", audioUrl: "https://prod-1.storage.jamendo.com/?trackid=98&format=mp32" },
  { id: "0c000000-0000-4000-8000-000000000003", title: "Other Soundrider", artist: "Soundrider", mood: "epic", durationMs: 100_000, genres: [], license: "CC BY 3.0", audioUrl: "https://prod-1.storage.jamendo.com/?trackid=99&format=mp32" },
  { id: "0d000000-0000-4000-8000-000000000004", title: "Short Epic", artist: "Someone", mood: "epic", durationMs: 20_000, genres: [], license: "CC0", audioUrl: "https://prod-1.storage.jamendo.com/?trackid=100&format=mp32" },
  { id: "0e000000-0000-4000-8000-000000000005", title: "Claimed Anthem", artist: "Claimed Artist", mood: "epic", durationMs: 200_000, genres: [], license: "CC0", audioUrl: "https://prod-1.storage.jamendo.com/?trackid=101&format=mp32" },
  { id: "0f000000-0000-4000-8000-000000000006", title: "Calm Waves", artist: "Chill Person", mood: "chill", durationMs: 150_000, genres: [], license: "CC0", audioUrl: "https://prod-1.storage.jamendo.com/?trackid=102&format=mp32" },
];

const DESCRIPTION = "7 animés de 2027 classés par leur promesse.\n\nMusique : « Epic Hip-Hop » par Soundrider/Dope, CC BY 3.0 (https://www.jamendo.com/track/1670662)";

function seed(options: { video?: boolean } = {}) {
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  const musicDir = path.join(root, "modules", "clip-studio", "music");
  fs.mkdirSync(musicDir, { recursive: true });
  fs.writeFileSync(path.join(musicDir, "library.json"), JSON.stringify(LIBRARY));
  // Fichiers audio présents : les morceaux sont écoutables.
  const files = path.join(DATA_DIR, "resources", "music");
  fs.mkdirSync(files, { recursive: true });
  for (const track of LIBRARY) fs.writeFileSync(path.join(files, `${track.id}.mp3`), "mp3");
  // Preuve de licence du morceau revendiqué, et un morceau déjà revendiqué ailleurs.
  fs.writeFileSync(
    path.join(DATA_DIR, "music-rights.json"),
    JSON.stringify({
      [EPIC]: {
        trackId: EPIC,
        note: { state: "claimed", reason: "Revendiqué sur YouTube", since: "2026-11-15" },
        evidence: { capturedAt: "2026-09-27T08:00:00.000Z", openverse: {}, license: "CC BY 3.0", licenseUrl: "https://creativecommons.org/licenses/by/3.0/", archiveUrl: "https://web.archive.org/web/20260927080000/https://api.openverse.org/v1/audio/cafeace9/", attribution: "« Epic Hip-Hop » par Soundrider/Dope, CC BY 3.0" },
        checks: [],
        history: [],
      },
      "0e000000-0000-4000-8000-000000000005": { trackId: "0e000000-0000-4000-8000-000000000005", note: { state: "claimed", reason: "Revendiqué", since: "2026-10-01" }, checks: [], history: [] },
    })
  );
  writeExports([{ id: EXPORT_ID, projectId: PROJECT_ID, projectName: "7 animés de 2027", file: "clip.mp4", width: 1080, height: 1920, durationMs: 66_000, sizeBytes: 1, createdAt: 1 }]);
  const music = (id: string, start: number, duration: number) => {
    const track = LIBRARY.find((entry) => entry.id === id)!;
    return {
      id: `music-${id.slice(0, 6)}-${start}`,
      type: "audio",
      start,
      duration,
      source: { url: `/api/modules/clip-studio/data/resources/music/${id}.mp3`, ref: `module:clip-studio/resources/music/${id}.mp3`, name: `${track.title} – ${track.artist}`, kind: "audio", durationMs: track.durationMs, credit: `« ${track.title} » par ${track.artist}, ${track.license}` },
      trimStart: 0,
      volume: 0.4,
      fadeIn: 0,
      fadeOut: 0,
      duck: 0.3,
    };
  };
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
      ...(options.video
        ? [
            {
              id: "t-visual",
              kind: "visual",
              name: "Images",
              items: [{ id: "trailer-1", type: "video", start: 300, duration: 300, source: { url: "/api/x/trailer.mp4", ref: "upload:trailer.mp4", name: "Bande-annonce", kind: "video" }, trimStart: 0, volume: 1, x: 0.5, y: 0.5, width: 1, height: 1, rotation: 0, opacity: 1, fit: "cover" }],
            },
          ]
        : []),
      { id: "t-voice", kind: "audio", name: "Voix", items: [{ id: "voice-1", type: "audio", start: 0, duration: 1980, source: { url: "/api/x/voice.mp3", ref: "upload:voice.mp3", name: "Voix", kind: "audio", credit: "Voix de synthèse" }, trimStart: 0, volume: 1, fadeIn: 0, fadeOut: 0 }] },
      { id: "t-music", kind: "audio", name: "Musique", items: [music(EPIC, 30, 1920)] },
    ],
    createdAt: 1,
    updatedAt: 1,
  } as never);
}

/** Le blocage du § 1, saisi depuis le texte de Studio. */
function claimIssue() {
  return issues.recordPublicationIssue({
    exportId: EXPORT_ID,
    jobId: JOB_ID,
    service: "youtube",
    externalId: VIDEO_ID,
    kind: "copyright-claim",
    scope: { worldwide: true },
    claim: { title: "Memories", claimant: "HAAWK for a 3rd Party", onBehalfOf: "Soundrider", startMs: 1000, endMs: 64_000, media: "audio" },
    source: "manual",
  });
}

beforeEach(() => {
  spies.listJobs.mockReset().mockReturnValue([{ id: JOB_ID, accountId: "acc-yt01", connector: "youtube", source: { module: "clip-studio", id: EXPORT_ID }, options: { title: "7 animés", description: DESCRIPTION }, state: "done", result: { externalId: VIDEO_ID, url: "" }, createdAt: 1, updatedAt: 1 }]);
  chat.editorChatDeps.dir = () => path.join(DATA_DIR, "editor-chats");
});

afterAll(() => {
  restoreCwd();
  fs.rmSync(root, { recursive: true, force: true });
});

describe("dossier du blocage", () => {
  it("retrouve la musique en cause, la plage et ce qu'elle couvre", () => {
    seed();
    const issue = claimIssue();
    const brief = fixes.buildIssueBrief(issue.id);
    expect(brief.range).toEqual({ startMs: 1000, endMs: 64_000 });
    expect(brief.coverage).toEqual({ claimedMs: 63_000, videoMs: 66_000, wholeVideo: true });
    expect(brief.culprit).toMatchObject({ type: "audio", startMs: 1000, endMs: 65_000, overlapMs: 63_000, music: { trackId: EPIC, title: "Epic Hip-Hop", rights: { state: "claimed" } } });
    expect(brief.culprit?.music?.evidence).toMatchObject({ license: "CC BY 3.0", capturedAt: "2026-09-27T08:00:00.000Z" });
    // La voix recouvre aussi la plage, sans être en cause.
    expect(brief.elements.find((element) => element.itemId === "voice-1")).toMatchObject({ culprit: false });
    expect(brief.service).toMatchObject({ disputeByApi: false, editPublishedByApi: false, republish: true });
  });

  it("propose des morceaux sans souci de droits, CC0 d'abord, jamais un morceau revendiqué ni le même artiste", () => {
    seed();
    const brief = fixes.buildIssueBrief(claimIssue().id);
    expect(brief.replacements.map((track) => track.trackId)).toEqual(["0a000000-0000-4000-8000-000000000001", "0b000000-0000-4000-8000-000000000002"]);
    const ids = brief.replacements.map((track) => track.trackId);
    for (const excluded of [EPIC, "0e000000-0000-4000-8000-000000000005", "0c000000-0000-4000-8000-000000000003", "0d000000-0000-4000-8000-000000000004"]) expect(ids).not.toContain(excluded);
    expect(brief.replacements.every((track) => track.url.endsWith(".mp3") && track.sameMood)).toBe(true);
  });

  it("relie les autres blocages du même morceau", () => {
    seed();
    const first = claimIssue();
    const other = issues.recordPublicationIssue({ exportId: EXPORT_ID, jobId: "job-autre", service: "youtube", externalId: "Autre123", kind: "copyright-claim", claim: { title: "Memories", claimant: "HAAWK for a 3rd Party", media: "audio", startMs: 1000, endMs: 64_000 }, source: "manual" });
    const brief = fixes.buildIssueBrief(first.id);
    expect(brief.history).toEqual([expect.objectContaining({ issueId: other.id, link: "track" })]);
  });
});

describe("contestation", () => {
  it("écrit le texte à partir de la preuve : licence, adresses, date, mention publiée", () => {
    seed();
    const brief = fixes.buildIssueBrief(claimIssue().id);
    const text = brief.dispute.text!;
    expect(brief.dispute).toMatchObject({ available: true, descriptionCredit: true });
    expect(text).toContain("I have a license to use this music.");
    expect(text).toContain('"Epic Hip-Hop" by Soundrider/Dope');
    expect(text).toContain("CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/)");
    expect(text).toContain(`https://api.openverse.org/v1/audio/${EPIC}/`);
    expect(text).toContain("https://web.archive.org/web/20260927080000/");
    expect(text).toContain("https://www.jamendo.com/track/1670662");
    expect(text).toContain("2026-09-27");
    expect(text).toContain("« Epic Hip-Hop » par Soundrider/Dope, CC BY 3.0");
    expect(text).toContain("Section 7(b)");
    expect(text).not.toMatch(/—/);
  });

  it("n'écrit pas de mention absente de la description", () => {
    seed();
    spies.listJobs.mockReturnValue([{ id: JOB_ID, options: { description: "Sans crédit." } }]);
    const brief = fixes.buildIssueBrief(claimIssue().id);
    expect(brief.dispute.descriptionCredit).toBe(false);
    expect(brief.dispute.text).not.toContain("description credits");
  });

  it("n'en propose pas sans preuve : un visuel qui ne vient pas de la banque", () => {
    seed({ video: true });
    const issue = issues.recordPublicationIssue({ exportId: EXPORT_ID, jobId: JOB_ID, service: "youtube", externalId: VIDEO_ID, kind: "copyright-claim", claim: { title: "Trailer", claimant: "Studio", startMs: 10_000, endMs: 20_000, media: "video" }, source: "manual" });
    const brief = fixes.buildIssueBrief(issue.id);
    expect(brief.culprit).toMatchObject({ itemId: "trailer-1", type: "video" });
    expect(brief.dispute.available).toBe(false);
    expect(brief.dispute.text).toBeUndefined();
    const byId = Object.fromEntries(brief.solutions.map((solution) => [solution.id, solution]));
    expect(byId.dispute.available).toBe(false);
    // Le passage ne couvre qu'une partie de la vidéo : on peut le retirer, ou remplacer le visuel.
    expect(byId.trim.available).toBe(true);
    expect(byId["replace-visual"].available).toBe(true);
    expect(byId["replace-music"].available).toBe(false);
    expect(fixes.createIssueFix({ issueId: issue.id, solution: "trim" }).href).toMatch(/^\/m\/clip-studio\/edit\?id=clip-[a-z0-9]+&item=trailer-1$/);
  });
});

describe("remplacer la musique", () => {
  it("crée une copie où le morceau est remplacé ; l'original ne bouge pas, les crédits suivent", () => {
    seed();
    const issue = claimIssue();
    const before = JSON.stringify(readProject(PROJECT_ID));
    const result = fixes.createIssueFix({ issueId: issue.id, solution: "replace-music", trackId: "0a000000-0000-4000-8000-000000000001" });
    expect(JSON.stringify(readProject(PROJECT_ID))).toBe(before);
    expect(result.href).toBe(`/m/clip-studio/export?project=${result.fix.projectId}`);
    const copy = readProject(result.fix.projectId)!;
    expect(copy.id).not.toBe(PROJECT_ID);
    expect(copy.name).toBe("7 animés de 2027 (musique remplacée)");
    const refs = copy.tracks.flatMap((lane) => lane.items).map((item) => ("source" in item ? item.source.ref : ""));
    expect(refs.some((ref) => ref.includes(EPIC))).toBe(false);
    const music = copy.tracks.find((lane) => lane.id === "t-music")!.items[0] as { start: number; duration: number; volume: number; duck?: number; source: { ref: string } };
    expect(music).toMatchObject({ start: 30, duration: 1920, volume: 0.4, duck: 0.3, source: { ref: "module:clip-studio/resources/music/0a000000-0000-4000-8000-000000000001.mp3" } });
    const credits = projectCredits(copy);
    expect(credits.some((line) => line.includes("Free Epic"))).toBe(true);
    expect(credits.some((line) => line.includes("Epic Hip-Hop"))).toBe(false);
    expect(projectCredits(readProject(PROJECT_ID)).some((line) => line.includes("Epic Hip-Hop"))).toBe(true);

    // Le blocage n'est réglé qu'une fois un export de la copie enregistré.
    expect(issues.getPublicationIssue(issue.id)?.resolution).toBeUndefined();
    issues.listIssueFixes({ issueId: issue.id });
    expect(fixes.noteIssueFixExport(result.fix.projectId, "exp-copie001")).toHaveLength(1);
    expect(issues.getPublicationIssue(issue.id)?.resolution).toMatchObject({ state: "replaced", newExportId: "exp-copie001" });
    expect(issues.listIssueFixes({ issueId: issue.id })[0].exportId).toBe("exp-copie001");
  });

  it("refuse un morceau que le dossier ne propose pas", () => {
    seed();
    const issue = claimIssue();
    expect(() => fixes.createIssueFix({ issueId: issue.id, solution: "replace-music", trackId: "0e000000-0000-4000-8000-000000000005" })).toThrow("Ce morceau n’est pas proposé pour ce blocage.");
    // Toute la vidéo est couverte : retirer le passage ne vaut pas.
    expect(() => fixes.createIssueFix({ issueId: issue.id, solution: "trim" })).toThrow("Le média revendiqué couvre toute la vidéo.");
  });
});

describe("assistant ouvert depuis le blocage", () => {
  it("cite le média, la plage et le demandeur, puis numérote les solutions", () => {
    seed();
    const brief = fixes.buildIssueBrief(claimIssue().id);
    const opening = fixes.issueOpening(brief);
    expect(opening.text.split("\n")[0]).toBe(
      "La musique « Epic Hip-Hop » est revendiquée de 0:01 à 1:04 par HAAWK for a 3rd Party pour Soundrider ; elle couvre toute la vidéo. Le titre revendiqué est « Memories »."
    );
    expect(opening.text).toContain("Effet sur YouTube : bloquée dans le monde entier.");
    expect(opening.solutions[0]).toMatch(/^Contester/);
    expect(opening.solutions[1]).toContain("« Free Epic » (Open Band, CC0, 1:30)");
    expect(opening.solutions.join("\n")).not.toContain("Claimed Anthem");
    expect(opening.solutions.join("\n")).not.toContain("Retirer le passage");
  });

  it("range le dossier avec la conversation, sans répéter le premier message", () => {
    seed();
    const issue = claimIssue();
    const fix = fixes.createIssueFix({ issueId: issue.id, solution: "assistant" });
    expect(fix.href).toBe(`/m/clip-studio/edit?id=${fix.fix.projectId}&issue=${issue.id}`);
    // Une deuxième ouverture rouvre la même copie.
    expect(fixes.createIssueFix({ issueId: issue.id, solution: "assistant" }).fix.projectId).toBe(fix.fix.projectId);

    const brief = fixes.buildIssueBrief(issue.id);
    const opening = fixes.issueOpening(brief);
    const input = { issueId: issue.id, brief: fixes.briefForAssistant(brief), ...opening };
    chat.startIssueChat(fix.fix.projectId, input);
    const second = chat.startIssueChat(fix.fix.projectId, input);
    expect(second.messages).toHaveLength(1);
    expect(second.messages[0]).toMatchObject({ role: "assistant", issueId: issue.id, solutions: opening.solutions });
    expect(second.issue?.id).toBe(issue.id);
    // Codex relit les solutions numérotées avec le message.
    expect(chat.historyOf(second.messages)[0].text).toContain("\n1. Contester");

    const prompt = editorAssistantPrompt({ brief: describeProject(readProject(fix.fix.projectId)!, { frame: 0 }), history: [], request: "la 2", image: false, issue: second.issue!.brief });
    expect(prompt).toContain("<blocage>");
    expect(prompt).toContain("Ne propose jamais un morceau revendiqué (claimed) ni retiré (withdrawn)");
    expect(prompt).toContain("Free Epic");
    expect(prompt).not.toContain("Claimed Anthem");
  });
});
