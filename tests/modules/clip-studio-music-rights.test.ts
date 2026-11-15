import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Les droits et les fichiers vivent dans un répertoire temporaire, jamais dans `modules/clip-studio/data`.
const store = vi.hoisted(() => ({ root: "", dataDir: "" }));
const usage = vi.hoisted(() => ({ calls: [] as any[] }));

vi.mock("@/modules/clip-studio/lib/store", async (importOriginal) => {
  const nodeFs = await import("node:fs");
  const nodeOs = await import("node:os");
  const nodePath = await import("node:path");
  const root = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "sxm-clip-rights-"));
  store.root = root;
  const DATA_DIR = nodePath.join(root, "data");
  store.dataDir = DATA_DIR;
  return {
    ...(await importOriginal<object>()),
    DATA_DIR,
    ensureDirs: () => nodeFs.mkdirSync(DATA_DIR, { recursive: true }),
  };
});

// Le registre des IA n'écrit rien pendant les tests : on lit seulement ce qu'il reçoit.
vi.mock("@/lib/ai-usage", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  recordAiUsage: (event: unknown) => usage.calls.push(event),
}));

import { isAutoPickable, MUSIC_USER_AGENT, trackFilePath, type MusicTrack } from "@/modules/clip-studio/lib/music";
import {
  captureTrackEvidence,
  checkTrackRights,
  configureRightsChecks,
  effectiveRights,
  getTrackRightsRecord,
  setTrackRightsNote,
  startMusicRightsChecks,
} from "@/modules/clip-studio/lib/music-rights";

const library = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "modules", "clip-studio", "music", "library.json"), "utf-8"),
) as MusicTrack[];

const EPIC_HIP_HOP = "cafeace9-eb96-4459-8705-f4f246658804";
const plainTracks = library.filter((track) => !track.rights);
const [trackA, trackB] = plainTracks;

/** Fiche Openverse simulée, à la licence du morceau (« CC BY 3.0 » → `by` / `3.0`). */
function openverseBody(track: MusicTrack, overrides: Record<string, unknown> = {}) {
  const [, kind = "by", version = ""] = /^CC\s+([A-Z-]+)\s*([\d.]*)$/i.exec(track.license) ?? [];
  return {
    id: track.id,
    title: track.title,
    creator: track.artist,
    license: kind.toLowerCase(),
    license_version: version,
    license_url: `https://creativecommons.org/licenses/${kind.toLowerCase()}/${version}/`,
    ...overrides,
  };
}

type Reply = { status: number; body?: unknown; url?: string } | Error;

/** `fetch` simulé : les réponses Openverse sont servies dans l'ordre, la Wayback Machine à part. */
function mockFetch(openverse: Reply[], wayback: Reply = { status: 200, url: "" }) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const queue = [...openverse];
  const answer = (reply: Reply, url: string) => {
    if (reply instanceof Error) return Promise.reject(reply);
    return Promise.resolve({
      ok: reply.status >= 200 && reply.status < 300,
      status: reply.status,
      url: reply.url ?? url,
      headers: new Headers(),
      json: async () => reply.body,
    });
  };
  vi.stubGlobal(
    "fetch",
    vi.fn((input: string | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      if (url.startsWith("https://web.archive.org/save/")) return answer(wayback, url);
      if (url.startsWith("https://api.openverse.org/")) {
        const next = queue.shift();
        if (!next) return Promise.reject(new Error(`Appel Openverse inattendu : ${url}`));
        return answer(next, url);
      }
      return Promise.reject(new Error(`Appel réseau inattendu : ${url}`));
    }),
  );
  return calls;
}

beforeEach(() => {
  configureRightsChecks({ pauseMs: 0 });
  fs.rmSync(path.join(store.dataDir, "music-rights.json"), { force: true });
  usage.calls = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

afterAll(() => {
  fs.rmSync(store.root, { recursive: true, force: true });
});

describe("droits des morceaux de la banque", () => {
  it("laisse l'assistant choisir un morceau sans note ou à l'état inconnu", () => {
    expect(isAutoPickable({})).toBe(true);
    expect(isAutoPickable({ rights: { state: "clear" } })).toBe(true);
    expect(isAutoPickable({ rights: { state: "unknown" } })).toBe(true);
  });

  it("écarte du choix automatique un morceau revendiqué, à risque ou retiré", () => {
    expect(isAutoPickable({ rights: { state: "claimed" } })).toBe(false);
    expect(isAutoPickable({ rights: { state: "at-risk" } })).toBe(false);
    expect(isAutoPickable({ rights: { state: "withdrawn" } })).toBe(false);
  });

  it("garde « Epic Hip-Hop » dans la banque, mais hors du choix de l'assistant", () => {
    const track = library.find((entry) => entry.id === EPIC_HIP_HOP);
    expect(track?.rights?.state).toBe("claimed");
    expect(isAutoPickable(track!)).toBe(false);
  });

  it("laisse au moins un autre morceau épique au choix de l'assistant", () => {
    expect(library.filter((entry) => entry.mood === "epic" && isAutoPickable(entry)).length).toBeGreaterThan(0);
  });
});

describe("état effectif d'un morceau", () => {
  it("dit « non vérifié » tant qu'aucun contrôle n'a abouti", () => {
    expect(effectiveRights(trackA)?.state).toBe("unknown");
  });

  it("reprend la note statique de library.json quand le fichier n'a rien", () => {
    const epic = library.find((entry) => entry.id === EPIC_HIP_HOP)!;
    expect(effectiveRights(epic)?.state).toBe("claimed");
  });

  it("fait primer la note du fichier sur la note statique et sur les contrôles", async () => {
    const epic = library.find((entry) => entry.id === EPIC_HIP_HOP)!;
    setTrackRightsNote(epic.id, { state: "clear", reason: "Contestation gagnée" }, "Libre à la main : contestation gagnée");
    expect(effectiveRights(epic)).toMatchObject({ state: "clear", reason: "Contestation gagnée" });

    mockFetch([{ status: 404 }, { status: 404 }]);
    await checkTrackRights(trackA.id);
    await checkTrackRights(trackA.id);
    expect(effectiveRights(trackA)?.state).toBe("withdrawn");
    setTrackRightsNote(trackA.id, { state: "at-risk", reason: "Artiste revendiqué ailleurs" }, "À risque");
    expect(effectiveRights(trackA)?.state).toBe("at-risk");
  });

  it("passe « libre » quand la fiche Openverse répond avec la même licence", async () => {
    const calls = mockFetch([{ status: 200, body: openverseBody(trackA) }]);
    await checkTrackRights(trackA.id);
    expect(effectiveRights(trackA)?.state).toBe("clear");
    expect(calls[0].url).toBe(`https://api.openverse.org/v1/audio/${trackA.id}/`);
    expect((calls[0].init?.headers as Record<string, string>)["user-agent"]).toBe(MUSIC_USER_AGENT);
    expect(usage.calls).toEqual([expect.objectContaining({ provider: "openverse", module: "clip-studio", ok: true })]);
  });
});

describe("contrôles Openverse", () => {
  it("retire un morceau absent d'Openverse à deux contrôles de suite, pas au premier", async () => {
    mockFetch([{ status: 200, body: openverseBody(trackA) }, { status: 404 }, { status: 404 }]);
    await checkTrackRights(trackA.id);
    await checkTrackRights(trackA.id);
    expect(effectiveRights(trackA)?.state).toBe("clear");
    expect(effectiveRights(trackA)?.reason).toMatch(/à confirmer/);

    const record = await checkTrackRights(trackA.id);
    expect(effectiveRights(trackA)?.state).toBe("withdrawn");
    expect(isAutoPickable({ rights: effectiveRights(trackA) })).toBe(false);
    expect(record.history.at(-1)).toMatchObject({ state: "withdrawn" });
  });

  it("retire un morceau dont la licence a changé à deux contrôles de suite", async () => {
    const changed = openverseBody(trackB, { license: "by-nc", license_version: "4.0" });
    mockFetch([{ status: 200, body: changed }, { status: 200, body: changed }]);
    await checkTrackRights(trackB.id);
    await checkTrackRights(trackB.id);
    const rights = effectiveRights(trackB);
    expect(rights?.state).toBe("withdrawn");
    expect(rights?.reason).toMatch(/CC BY-NC 4\.0/);
  });

  it("ne change pas l'état sur une erreur réseau ou une panne du service", async () => {
    mockFetch([
      { status: 200, body: openverseBody(trackA) },
      new TypeError("fetch failed"),
      { status: 503 },
    ]);
    await checkTrackRights(trackA.id);
    await checkTrackRights(trackA.id);
    const record = await checkTrackRights(trackA.id);
    expect(effectiveRights(trackA)?.state).toBe("clear");
    expect(record.checks.map((check) => check.ok)).toEqual([true, false, false]);
    expect(usage.calls.map((call) => call.ok)).toEqual([true, false, false]);
  });

  it("ne compte pas une erreur réseau entre deux absences comme un retour", async () => {
    mockFetch([{ status: 200, body: openverseBody(trackA) }, { status: 404 }, new TypeError("fetch failed"), { status: 404 }]);
    for (let index = 0; index < 4; index += 1) await checkTrackRights(trackA.id);
    expect(effectiveRights(trackA)?.state).toBe("withdrawn");
  });

  it("reste « non vérifié » si aucun contrôle n'a jamais abouti", async () => {
    mockFetch([new TypeError("fetch failed")]);
    await checkTrackRights(trackA.id);
    expect(effectiveRights(trackA)?.state).toBe("unknown");
  });

  it("ne lance aucun contrôle de fond sous Vitest", () => {
    vi.useFakeTimers();
    const calls = mockFetch([]);
    startMusicRightsChecks();
    vi.advanceTimersByTime(2 * 24 * 60 * 60 * 1000);
    expect(calls).toHaveLength(0);
  });
});

describe("preuve de licence", () => {
  it("garde la réponse Openverse, l'empreinte du fichier, l'archive et la mention", async () => {
    const file = trackFilePath(trackA);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "audio de test");
    const archive = `https://web.archive.org/web/20261115120000/https://api.openverse.org/v1/audio/${trackA.id}/`;
    const calls = mockFetch([{ status: 200, body: openverseBody(trackA) }], { status: 200, url: archive });

    const evidence = await captureTrackEvidence(trackA);
    expect(evidence).toMatchObject({
      openverse: openverseBody(trackA),
      audioSha256: createHash("sha256").update("audio de test").digest("hex"),
      archiveUrl: archive,
      license: trackA.license,
      attribution: expect.stringContaining(trackA.title),
    });
    expect(calls.map((call) => call.url)).toContain(`https://web.archive.org/save/https://api.openverse.org/v1/audio/${trackA.id}/`);
    // La lecture de la fiche compte aussi comme contrôle.
    expect(effectiveRights(trackA)?.state).toBe("clear");
    fs.rmSync(file, { force: true });
  });

  it("ne remplace jamais la plus ancienne preuve", async () => {
    mockFetch([{ status: 200, body: openverseBody(trackB, { title: "Première lecture" }) }], new Error("Wayback injoignable"));
    const first = await captureTrackEvidence(trackB);
    expect(first?.archiveUrl).toBeUndefined();

    mockFetch([{ status: 200, body: openverseBody(trackB, { title: "Seconde lecture" }) }]);
    const second = await captureTrackEvidence(trackB);
    expect(second).toEqual(first);
    expect((getTrackRightsRecord(trackB.id)?.evidence?.openverse as { title: string }).title).toBe("Première lecture");
  });

  it("ne range aucune preuve si la fiche est absente, mais compte le contrôle", async () => {
    mockFetch([{ status: 404 }]);
    expect(await captureTrackEvidence(trackA)).toBeUndefined();
    const record = getTrackRightsRecord(trackA.id);
    expect(record?.evidence).toBeUndefined();
    expect(record?.checks).toEqual([expect.objectContaining({ source: "openverse", ok: true, listed: false })]);
  });
});

describe("note posée par un blocage ou à la main", () => {
  it("écrit la note et l'historique", () => {
    setTrackRightsNote(trackA.id, { state: "claimed", reason: "Revendiqué par HAAWK sur YouTube", since: "2026-11-15" }, "Blocage YouTube TdSclzwxnYo");
    setTrackRightsNote(trackA.id, { state: "clear", reason: "Licence confirmée" }, "Levée à la main : licence confirmée");

    const record = getTrackRightsRecord(trackA.id)!;
    expect(record.note).toMatchObject({ state: "clear", reason: "Licence confirmée" });
    expect(record.note?.since).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(record.history).toEqual([
      expect.objectContaining({ state: "claimed", note: "Blocage YouTube TdSclzwxnYo" }),
      expect.objectContaining({ state: "clear", note: "Levée à la main : licence confirmée" }),
    ]);
    const saved = JSON.parse(fs.readFileSync(path.join(store.dataDir, "music-rights.json"), "utf-8"));
    expect(saved[trackA.id].history).toHaveLength(2);
  });
});
