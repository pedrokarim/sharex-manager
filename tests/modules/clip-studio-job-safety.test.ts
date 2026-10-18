import fs from "node:fs";
import path from "node:path";
import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Les données du module vivent dans un répertoire temporaire, jamais dans `modules/clip-studio/data`.
const store = vi.hoisted(() => ({
  assets: [] as any[],
  projects: [] as any[],
}));

vi.mock("@/modules/clip-studio/lib/store", async () => {
  const nodeFs = await import("node:fs");
  const nodeOs = await import("node:os");
  const nodePath = await import("node:path");
  const root = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "sxm-clip-safety-"));
  const DATA_DIR = nodePath.join(root, "data");
  const ASSETS_DIR = nodePath.join(DATA_DIR, "assets");
  return {
    DATA_DIR,
    ASSETS_DIR,
    ensureDirs: () => nodeFs.mkdirSync(ASSETS_DIR, { recursive: true }),
    readAssets: () => store.assets.map((asset) => ({ ...asset })),
    writeAssets: (assets: unknown[]) => {
      store.assets = assets as any[];
    },
    listProjectFiles: () => store.projects,
  };
});

import { killProcessTree, treeSpawnOptions, type ProcessTreeDeps } from "@/lib/media/process-tree";
import {
  DISK_FULL_MESSAGE,
  WORK_DIR_TTL_MS,
  assertDiskSpace,
  diskDeps,
  holdWorkDir,
  publicErrorMessage,
  stripServerPaths,
  sweepWorkDirs,
} from "@/modules/clip-studio/lib/job-safety";
import {
  PROBE_BUSY_MESSAGE,
  PROBE_RATE_MESSAGE,
  REMOTE_LIMITS,
  createProbeGate,
  enforceRemoteBudget,
  remoteAssetGuards,
  startRemoteImport,
} from "@/modules/clip-studio/lib/remote-import";
import { ASSETS_DIR, DATA_DIR } from "@/modules/clip-studio/lib/store";

const GB = 1024 * 1024 * 1024;
const MB = 1024 * 1024;

// ─── Arrêt de l'arbre de processus ───────────────────────────────

function fakeChild(patch: Partial<{ pid: number; exitCode: number | null; signalCode: NodeJS.Signals | null }> = {}) {
  return { pid: 4242, exitCode: null, signalCode: null, kill: vi.fn(() => true), ...patch };
}

function deps(platform: NodeJS.Platform, kill: ProcessTreeDeps["kill"] = vi.fn()): ProcessTreeDeps & { spawned: unknown[][] } {
  const spawned: unknown[][] = [];
  return {
    platform,
    kill,
    spawned,
    spawn: ((command: string, args: string[], options: unknown) => {
      spawned.push([command, args, options]);
      return new EventEmitter();
    }) as unknown as ProcessTreeDeps["spawn"],
  };
}

describe("arrêt de l'arbre de processus", () => {
  it("lance yt-dlp dans son propre groupe sous Linux, pas sous Windows", () => {
    expect(treeSpawnOptions("linux")).toEqual({ detached: true });
    expect(treeSpawnOptions("win32")).toEqual({ detached: false });
  });

  it("tue tout le groupe sous Linux (numéro négatif)", () => {
    const kill = vi.fn();
    const child = fakeChild();
    killProcessTree(child, deps("linux", kill));
    expect(kill).toHaveBeenCalledWith(-4242, "SIGKILL");
    expect(child.kill).not.toHaveBeenCalled();
  });

  it("vise encore le groupe quand yt-dlp a fini mais qu'un ffmpeg peut survivre", () => {
    const kill = vi.fn();
    killProcessTree(fakeChild({ exitCode: 0 }), deps("linux", kill));
    expect(kill).toHaveBeenCalledWith(-4242, "SIGKILL");
  });

  it("se rabat sur le processus seul si le groupe n'existe pas, sans lever", () => {
    const kill = vi.fn(() => {
      throw Object.assign(new Error("kill ESRCH"), { code: "ESRCH" });
    });
    const child = fakeChild();
    expect(() => killProcessTree(child, deps("linux", kill))).not.toThrow();
    expect(child.kill).toHaveBeenCalledWith("SIGKILL");
  });

  it("utilise taskkill /T /F sous Windows, sans shell", () => {
    const windows = deps("win32");
    const child = fakeChild();
    killProcessTree(child, windows);
    expect(windows.spawned).toHaveLength(1);
    const [command, args, options] = windows.spawned[0] as [string, string[], { shell?: boolean }];
    expect(command).toBe("taskkill");
    expect(args).toEqual(["/PID", "4242", "/T", "/F"]);
    expect(options.shell).toBe(false);
    expect(windows.kill).not.toHaveBeenCalled();
  });

  it("ne fait rien sans numéro de processus, ni sous Windows pour un processus fini", () => {
    const windows = deps("win32");
    killProcessTree(fakeChild({ pid: undefined as unknown as number }), windows);
    killProcessTree(fakeChild({ exitCode: 1 }), windows);
    expect(windows.spawned).toHaveLength(0);
  });
});

// ─── Lectures d'adresse ──────────────────────────────────────────

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("lectures d'adresse simultanées", () => {
  it("en lance deux à la fois, met les suivantes en attente, refuse au-delà de quatre en attente", async () => {
    const gate = createProbeGate({ maxConcurrent: 2, maxQueued: 4, perMinute: 100 });
    const tasks = Array.from({ length: 6 }, () => deferred<string>());
    let started = 0;
    const runs = tasks.map((task, index) =>
      gate.run(`https://example.com/${index}`, () => {
        started++;
        return task.promise;
      })
    );
    await flush();
    expect(started).toBe(2);
    expect(gate.stats()).toMatchObject({ active: 2, queued: 4 });
    await expect(gate.run("https://example.com/7", async () => "x")).rejects.toThrow(PROBE_BUSY_MESSAGE);

    tasks[0].resolve("a");
    await expect(runs[0]).resolves.toBe("a");
    await flush();
    // La place libérée passe à la première lecture en attente.
    expect(started).toBe(3);
    expect(gate.stats()).toMatchObject({ active: 2, queued: 3 });
    tasks.forEach((task, index) => task.resolve(String(index)));
    await Promise.all(runs);
    expect(gate.stats()).toMatchObject({ active: 0, queued: 0, inFlight: 0 });
  });

  it("ne lit pas deux fois une adresse déjà en cours de lecture", async () => {
    const gate = createProbeGate({ maxConcurrent: 2, maxQueued: 4, perMinute: 100 });
    const task = deferred<{ title: string }>();
    const read = vi.fn(() => task.promise);
    const first = gate.run("https://www.youtube.com/watch?v=jNQXAC9IVRw", read);
    const second = gate.run("https://www.youtube.com/watch?v=jNQXAC9IVRw", read);
    expect(second).toBe(first);
    task.resolve({ title: "Me at the zoo" });
    await expect(second).resolves.toEqual({ title: "Me at the zoo" });
    expect(read).toHaveBeenCalledTimes(1);
    // Terminée, la lecture suivante repart (le cache des 15 minutes est ailleurs).
    await gate.run("https://www.youtube.com/watch?v=jNQXAC9IVRw", async () => ({ title: "Encore" }));
    expect(gate.stats().inFlight).toBe(0);
  });

  it("partage aussi l'échec d'une lecture, puis libère l'adresse", async () => {
    const gate = createProbeGate();
    const failing = gate.run("https://clips.twitch.tv/abc", async () => {
      throw new Error("Cette vidéo est introuvable.");
    });
    await expect(failing).rejects.toThrow("introuvable");
    await expect(gate.run("https://clips.twitch.tv/abc", async () => "ok")).resolves.toBe("ok");
  });

  it("limite les lectures à vingt par minute pour tout le serveur", async () => {
    let now = 1_000_000;
    const gate = createProbeGate({ maxConcurrent: 2, maxQueued: 4, perMinute: 20 }, () => now);
    for (let index = 0; index < 20; index++) await gate.run(`https://example.com/${index}`, async () => index);
    await expect(gate.run("https://example.com/21", async () => 21)).rejects.toThrow(PROBE_RATE_MESSAGE);
    now += 60_000;
    await expect(gate.run("https://example.com/21", async () => 21)).resolves.toBe(21);
  });
});

// ─── Place sur le disque ─────────────────────────────────────────

describe("place sur le disque", () => {
  const statfs = diskDeps.statfs;
  afterEach(() => {
    diskDeps.statfs = statfs;
  });

  it("refuse quand il manque la taille attendue plus 2 Go de marge", () => {
    diskDeps.statfs = () => ({ bavail: 2 * GB, bsize: 1 });
    expect(() => assertDiskSpace(DATA_DIR, 500 * MB)).toThrow(/^Disque presque plein sur le serveur/);
    diskDeps.statfs = () => ({ bavail: BigInt(3 * GB), bsize: BigInt(1) });
    expect(() => assertDiskSpace(DATA_DIR, 500 * MB)).not.toThrow();
  });

  it("ne bloque pas quand la place est illisible", () => {
    diskDeps.statfs = () => {
      throw new Error("statfs indisponible");
    };
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => assertDiskSpace(DATA_DIR, 100 * GB)).not.toThrow();
    log.mockRestore();
  });

  it("refuse une récupération par adresse avant de lancer quoi que ce soit", () => {
    diskDeps.statfs = () => ({ bavail: 1 * GB, bsize: 1 });
    store.assets = [];
    expect(() => startRemoteImport({ url: "https://clips.twitch.tv/CrypticConfidentWoodcockDatSheffy-7bIqt_3zwrUM0MP9" })).toThrow(/Disque presque plein/);
    expect(fs.existsSync(path.join(DATA_DIR, "remote-imports.json"))).toBe(false);
  });
});

// ─── Budget des vidéos récupérées ────────────────────────────────

describe("budget des vidéos récupérées", () => {
  const now = Date.UTC(2026, 9, 18);
  const hour = 60 * 60 * 1000;
  const remote = (file: string, size: number, lastUsedAt: number) => ({
    file,
    kind: "video",
    originalName: file,
    size,
    origin: { site: "youtube", url: "https://www.youtube.com/watch?v=abcdefghijk", title: file },
    lastUsedAt,
    createdAt: lastUsedAt,
  });

  beforeEach(() => {
    fs.rmSync(ASSETS_DIR, { recursive: true, force: true });
    fs.mkdirSync(ASSETS_DIR, { recursive: true });
    store.projects = [];
    remoteAssetGuards.busyFiles = () => new Set();
  });

  it("compte la taille réelle des fichiers, et seulement les médias venus d'ailleurs", () => {
    store.assets = [
      remote("old.mp4", 1, now - 50 * hour),
      remote("older.mp4", 1, now - 90 * hour),
      remote("used.mp4", 1, now - 200 * hour),
      { file: "upload.mp4", kind: "video", originalName: "x", size: 1, createdAt: 1 },
    ];
    store.projects = [{ tracks: [{ items: [{ type: "video", source: { url: "/api/modules/clip-studio/data/assets/used.mp4" } }] }] }];
    // Dix octets chacun sur le disque : la taille de la fiche ne sert qu'à défaut.
    for (const asset of store.assets) fs.writeFileSync(path.join(ASSETS_DIR, asset.file), "0123456789");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    expect(enforceRemoteBudget(5, now, 25)).toEqual(["older.mp4"]);
    expect(fs.existsSync(path.join(ASSETS_DIR, "older.mp4"))).toBe(false);
    expect(fs.existsSync(path.join(ASSETS_DIR, "upload.mp4"))).toBe(true);
    expect(store.assets.map((asset) => asset.file)).toEqual(["old.mp4", "used.mp4", "upload.mp4"]);
    info.mockRestore();
  });

  it("efface dans l'ordre d'ancienneté et garde ce qu'un projet ou un travail tient", () => {
    store.assets = [
      remote("old.mp4", 8 * GB, now - 50 * hour),
      remote("older.mp4", 8 * GB, now - 90 * hour),
      remote("used.mp4", 8 * GB, now - 200 * hour),
      remote("busy.mp4", 8 * GB, now - 300 * hour),
      remote("fresh.mp4", 8 * GB, now - 10 * 60 * 1000),
    ];
    store.projects = [{ tracks: [{ items: [{ type: "video", source: { url: "/api/modules/clip-studio/data/assets/used.mp4" } }] }] }];
    remoteAssetGuards.busyFiles = () => new Set(["busy.mp4"]);
    // Aucun fichier sur le disque : la taille de la fiche compte.
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    expect(enforceRemoteBudget(1 * GB, now, 33 * GB)).toEqual(["older.mp4"]);
    expect(store.assets.map((asset) => asset.file)).toEqual(["old.mp4", "used.mp4", "busy.mp4", "fresh.mp4"]);
    info.mockRestore();
  });

  it("refuse quand il ne reste rien d'effaçable", () => {
    store.assets = [remote("used.mp4", 19 * GB, now - 200 * hour), remote("fresh.mp4", 1 * GB, now - 60_000)];
    store.projects = [{ tracks: [{ items: [{ type: "video", source: { url: "/api/modules/clip-studio/data/assets/used.mp4" } }] }] }];
    expect(() => enforceRemoteBudget(500 * MB, now)).toThrow(/occupent déjà 20,0 Go sur le serveur \(20,0 Go au plus\)/);
    expect(store.assets).toHaveLength(2);
  });

  it("ne fait rien sous le budget", () => {
    store.assets = [remote("a.mp4", 1 * GB, now - 900 * hour)];
    expect(enforceRemoteBudget(500 * MB, now)).toEqual([]);
    expect(REMOTE_LIMITS.totalBudgetBytes).toBe(20 * GB);
  });
});

// ─── Messages d'erreur ───────────────────────────────────────────

describe("messages d'erreur rangés avec les travaux", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("traduit un disque plein, sans chemin", () => {
    const error = Object.assign(new Error("ENOSPC: no space left on device, write '/app/modules/clip-studio/data/.remote-tmp/rimp-1/final.mp4'"), {
      code: "ENOSPC",
      syscall: "write",
    });
    expect(publicErrorMessage(error, "La vidéo n’a pas pu être récupérée.")).toBe(DISK_FULL_MESSAGE);
    expect(console.error).toHaveBeenCalled();
  });

  it("traduit un refus de droits et les autres erreurs système", () => {
    const denied = Object.assign(new Error("EACCES: permission denied, open 'C:\\data\\x.mp4'"), { code: "EACCES", syscall: "open" });
    expect(publicErrorMessage(denied, "Échec.")).toMatch(/^Le serveur n’a pas le droit d’écrire/);
    const other = Object.assign(new Error("EMFILE: too many open files, open '/app/data/x'"), { code: "EMFILE", syscall: "open" });
    expect(publicErrorMessage(other, "La vidéo n’a pas pu être récupérée.")).toBe("La vidéo n’a pas pu être récupérée (erreur du serveur EMFILE).");
  });

  it("retire les chemins Unix et Windows, garde les adresses web", () => {
    expect(stripServerPaths("Échec de /app/modules/clip-studio/data/.clip-tmp/a.mp4 ici")).toBe("Échec de … ici");
    expect(stripServerPaths("Fichier C:\\Users\\karim\\data\\a.mp4 illisible")).toBe("Fichier … illisible");
    expect(stripServerPaths("open '/srv/data/mon fichier.mp4' refusé")).toBe("open '…' refusé");
    expect(stripServerPaths("Voir https://www.pexels.com/api/ et pexels.com/api")).toBe("Voir https://www.pexels.com/api/ et pexels.com/api");
  });

  it("garde nos messages français tels quels, et le repli pour le reste", () => {
    expect(publicErrorMessage(new Error("Ce fichier ne contient pas de vidéo lisible."), "Échec.")).toBe("Ce fichier ne contient pas de vidéo lisible.");
    expect(publicErrorMessage("texte", "Échec.")).toBe("Échec.");
    expect(publicErrorMessage(new Error("write failed: No space left on device"), "Échec.")).toBe(DISK_FULL_MESSAGE);
  });
});

// ─── Dossiers de travail ─────────────────────────────────────────

describe("ménage des dossiers de travail", () => {
  it("efface ce qui a plus de six heures, sauf un travail en cours, dans chaque dossier caché", () => {
    const now = Date.now();
    const old = new Date(now - WORK_DIR_TTL_MS - 60_000);
    const make = (dir: string, name: string, at?: Date) => {
      const full = path.join(DATA_DIR, dir, name);
      fs.mkdirSync(full, { recursive: true });
      if (at) fs.utimesSync(full, at, at);
      return full;
    };
    const stale = make(".transcribe-tmp", "transcribe-abc", old);
    const staleClip = make(".clip-tmp", "cjob-old", old);
    const held = make(".video-tmp", "pexels-long", old);
    const active = make(".remote-tmp", "rimp-running", old);
    const recent = make(".clip-tmp", "cjob-new");
    const release = holdWorkDir(held);

    const removed = sweepWorkDirs(now, DATA_DIR, (name) => name === "rimp-running");
    expect(removed.sort()).toEqual([staleClip, stale].sort());
    expect(fs.existsSync(held)).toBe(true);
    expect(fs.existsSync(active)).toBe(true);
    expect(fs.existsSync(recent)).toBe(true);

    release();
    expect(sweepWorkDirs(now, DATA_DIR)).toEqual(expect.arrayContaining([held, active]));
  });
});
