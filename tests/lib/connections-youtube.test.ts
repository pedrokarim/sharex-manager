import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { setDataRoot } from "@/lib/connections/store";
import { readTransaction, startAuthorization } from "@/lib/connections/oauth";
import { accountContext, completeConnection } from "@/lib/connections/accounts";
import {
  checkProcessingJobs,
  configurePublishQueue,
  enqueuePublish,
  getJob,
  listJobs,
  retryJob,
  runPublishQueue,
} from "@/lib/connections/publish-queue";
import { getQuotaUsage, quotaPausedUntil } from "@/lib/connections/quota";
import { setProfileImage } from "@/lib/connections/manage";
import { getConnector } from "@/lib/connections/registry";
import { uploadVideo } from "@/lib/connections/connectors/youtube/upload";
import { normalizeYoutubeOptions } from "@/lib/connections/connectors/youtube/metadata";
import type { PublishContext, PublishFileSource } from "@/lib/connections/types";
import { ALL_SCOPES, TEST_CHANNELS, createFakeGoogle, type FakeGoogle } from "./connections-fake-google";

const saved = { ...process.env };
const realFetch = globalThis.fetch;
const CHUNK = 256 * 1024;
let root: string;
let google: FakeGoogle;
let videoPath: string;
let video: Buffer;
let sleeps: number[];

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "connections-yt-"));
  setDataRoot(path.join(root, "data"));
  delete process.env.CONNECTIONS_ENCRYPTION_KEY;
  process.env.AUTH_SECRET = "secret-de-test-assez-long-pour-hkdf";
  process.env.AUTH_URL = "https://sxm.test";
  process.env.YOUTUBE_CLIENT_ID = "client-id";
  process.env.YOUTUBE_CLIENT_SECRET = "client-secret";
  google = createFakeGoogle();
  globalThis.fetch = google.fetch;
  // Trois blocs et demi de 256 Kio.
  video = randomBytes(CHUNK * 3 + 1000);
  videoPath = path.join(root, "clip.mp4");
  fs.writeFileSync(videoPath, video);
  sleeps = [];
  configurePublishQueue({
    autoRun: false,
    resolveSource: async () => videoPath,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  });
});

afterEach(() => {
  configurePublishQueue({ autoRun: true, resolveSource: null, sleep: null });
  globalThis.fetch = realFetch;
  setDataRoot(null);
  fs.rmSync(root, { recursive: true, force: true });
  for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
  Object.assign(process.env, saved);
});

async function connectFirst() {
  const { url, cookie } = startAuthorization("youtube", "all");
  google.codes.set("code-1", { channel: TEST_CHANNELS.first, scope: ALL_SCOPES });
  return completeConnection("youtube", "code-1", readTransaction(cookie, "youtube", new URL(url).searchParams.get("state")));
}

const source = (): PublishFileSource => ({ module: "clip-studio", id: "exp-1", file: "clip.mp4", bytes: video.length, kind: "video", name: "Mon short" });

function publishContext(accountId: string, overrides: Partial<PublishContext> = {}) {
  const { context } = accountContext(accountId);
  const progress: { resume?: Record<string, unknown>; bytes: number }[] = [];
  const full: PublishContext = {
    ...context,
    filePath: videoPath,
    filePaths: [videoPath],
    attempt: 1,
    source: source(),
    options: { privacy: "unlisted" },
    saveProgress: (resume, bytes) => progress.push({ resume, bytes }),
    signal: new AbortController().signal,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    // YouTube reçoit le fichier : aucun lien public ni fichier dérivé.
    publicUrl: () => {
      throw new Error("inutile pour YouTube");
    },
    publicLink: () => {
      throw new Error("inutile pour YouTube");
    },
    publicLinkAccesses: () => [],
    revokePublicUrls: () => undefined,
    tempFile: () => {
      throw new Error("inutile pour YouTube");
    },
    ...overrides,
  };
  return { context: full, progress };
}

describe("envoi reprenable", () => {
  test("coupure au milieu d'un bloc : reprise au bon octet, sans renvoyer le début", async () => {
    const account = await connectFirst();
    const { context, progress } = publishContext(account.id);
    // Le deuxième bloc est coupé après 1 000 octets reçus par Google.
    let chunks = 0;
    const originalFetch = google.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).startsWith("https://upload.fake") && !String((init?.headers as Record<string, string>)?.["Content-Range"] ?? "").startsWith("bytes */")) {
        chunks += 1;
        if (chunks === 2) google.upload.cutNextChunkAfter = 1000;
      }
      return originalFetch(input, init);
    }) as typeof fetch;

    const result = await uploadVideo(context, normalizeYoutubeOptions({ privacy: "unlisted", title: "Short" }, source()), CHUNK);
    expect(result).toEqual({ externalId: "video-1", url: "https://www.youtube.com/watch?v=video-1" });
    expect(google.upload.received.equals(video)).toBe(true);
    expect(google.upload.sessions).toBe(1);
    // Blocs : 0, 256 Kio (coupé), puis reprise à 256 Kio + 1 000.
    expect(google.upload.chunkStarts).toEqual([0, CHUNK, CHUNK + 1000, 2 * CHUNK + 1000]);
    expect(sleeps).toEqual([1000]);
    // Métadonnées : visibilité toujours envoyée.
    expect(google.upload.metadata).toMatchObject({ snippet: { title: "Short" }, status: { privacyStatus: "unlisted" } });
    // L'URI de session est rangée dans l'état de reprise.
    expect(progress.some((entry) => String(entry.resume?.sessionUri).startsWith("https://upload.fake/"))).toBe(true);
    expect(google.calls.filter((call) => call.url.startsWith("https://upload.fake")).every((call) => call.headers["content-range"])).toBe(true);
  });

  test("reprise après redémarrage : on demande l'état à Google avant d'envoyer", async () => {
    const account = await connectFirst();
    // Un premier processus a ouvert la session et envoyé un bloc.
    const first = publishContext(account.id);
    google.upload.cutNextChunkAfter = null;
    const controller = new AbortController();
    let sent = 0;
    const originalFetch = google.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const response = await originalFetch(input, init);
      if (String(input).startsWith("https://upload.fake") && ++sent === 1) controller.abort();
      return response;
    }) as typeof fetch;
    await expect(uploadVideo({ ...first.context, signal: controller.signal }, normalizeYoutubeOptions({}, source()), CHUNK)).rejects.toThrow();
    const resume = first.progress.at(-1)!.resume!;
    expect(resume.sessionUri).toBeDefined();
    expect(google.upload.received.length).toBe(CHUNK);

    globalThis.fetch = google.fetch;
    const second = publishContext(account.id, { resume });
    const result = await uploadVideo(second.context, normalizeYoutubeOptions({}, source()), CHUNK);
    expect(result.externalId).toBe("video-1");
    expect(google.upload.sessions).toBe(1);
    expect(google.upload.received.equals(video)).toBe(true);
    // Aucun octet du début n'a été renvoyé.
    expect(google.upload.chunkStarts).toEqual([0, CHUNK, 2 * CHUNK, 3 * CHUNK]);
  });

  test("session expirée (404) : on repart du début avec une nouvelle session", async () => {
    const account = await connectFirst();
    const { context } = publishContext(account.id, { resume: { sessionUri: "https://upload.fake/session/old", total: video.length, charged: true } });
    google.upload.total = video.length;
    google.upload.expireNext = true;
    const result = await uploadVideo(context, normalizeYoutubeOptions({}, source()), CHUNK);
    expect(result.externalId).toBe("video-1");
    expect(google.upload.sessions).toBe(1);
    expect(google.upload.received.equals(video)).toBe(true);
  });
});

describe("file de publication", () => {
  test("publication complète, puis suivi du traitement", async () => {
    const account = await connectFirst();
    const job = enqueuePublish({ accountId: account.id, source: source(), options: { title: "Mon short", privacy: "unlisted" } });
    expect(job.state).toBe("queued");
    expect(JSON.stringify(job)).not.toContain("resume");
    await runPublishQueue();
    expect(getJob(job.id)).toMatchObject({ state: "processing", result: { externalId: "video-1" }, bytesSent: video.length });
    await checkProcessingJobs();
    expect(getJob(job.id)).toMatchObject({ state: "done" });
    expect(getJob(job.id)?.warning).toBeUndefined();
    const usage = getQuotaUsage(getConnector("youtube")!)!;
    expect(usage.buckets.find((bucket) => bucket.id === "uploads")?.used).toBe(1);
  });

  test("quotaExceeded suspend la file au lieu de réessayer en boucle", async () => {
    const account = await connectFirst();
    google.upload.failOpenWith = "quotaExceeded";
    const first = enqueuePublish({ accountId: account.id, source: source(), options: { privacy: "unlisted" } });
    const second = enqueuePublish({ accountId: account.id, source: source(), options: { privacy: "unlisted" } });
    await runPublishQueue();
    const youtube = getConnector("youtube")!;
    expect(getJob(first.id)).toMatchObject({ state: "waiting-quota" });
    expect(getJob(first.id)?.retryAt).toBeGreaterThan(Date.now());
    // Le second travail n'a même pas été tenté.
    expect(getJob(second.id)).toMatchObject({ state: "waiting-quota" });
    expect(google.calls.filter((call) => call.url.includes("uploadType=resumable"))).toHaveLength(1);
    expect(quotaPausedUntil(youtube)).toBe(getJob(first.id)?.retryAt);
    await runPublishQueue();
    expect(google.calls.filter((call) => call.url.includes("uploadType=resumable"))).toHaveLength(1);

    // « Reprendre » à la main lève la suspension.
    google.upload.failOpenWith = null;
    retryJob(first.id);
    await runPublishQueue();
    expect(getJob(first.id)?.state).toBe("processing");
    expect(listJobs({ accountId: account.id })).toHaveLength(2);
  });

  test("un compte sans la capacité est refusé", async () => {
    const account = await connectFirst();
    expect(() => enqueuePublish({ accountId: account.id, source: { ...source(), kind: "image" }, options: {} })).toThrow(/droit/);
    expect(() => enqueuePublish({ accountId: "acc-inconnu", source: source(), options: {} })).toThrow(/introuvable/);
  });
});

describe("chaîne", () => {
  const png = Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), randomBytes(64)]);

  test("bannière : channels.update renvoie la partie brandingSettings complète", async () => {
    const account = await connectFirst();
    await setProfileImage(account.id, "banner", png);
    expect(google.channelUpdates).toHaveLength(1);
    expect(google.channelUpdates[0]).toEqual({
      id: TEST_CHANNELS.first.id,
      brandingSettings: {
        channel: { title: "Ma chaîne", description: "Description gardée", keywords: "anime jeux" },
        image: { bannerExternalUrl: "https://yt3.fake/banner-new" },
      },
    });
    const usage = getQuotaUsage(getConnector("youtube")!)!;
    // channels.list (profil) 1 + channelBanners.insert 50 + channels.list 1 + channels.update 50.
    expect(usage.buckets.find((bucket) => bucket.id === "general")?.used).toBe(102);
  });

  test("filigrane : watermarks.set en multipart, sur la chaîne du compte", async () => {
    const account = await connectFirst();
    await setProfileImage(account.id, "watermark", png, { type: "offsetFromStart", offsetMs: 2000 });
    const call = google.calls.find((entry) => entry.url.includes("/watermarks/set"))!;
    expect(new URL(call.url).searchParams.get("channelId")).toBe(TEST_CHANNELS.first.id);
    expect(call.headers["content-type"]).toMatch(/^multipart\/related; boundary=/);
    await expect(setProfileImage(account.id, "banner", Buffer.from("pas une image"))).rejects.toThrow(/PNG/);
  });
});
