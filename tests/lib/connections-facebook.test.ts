/**
 * Connecteur Facebook (dossier 07a) contre un faux serveur Graph : aucun appel
 * réel. Connexion (jeton longue durée, Pages, `appsecret_proof`), Reels et
 * vidéos de Page reprenables, photo réencodée, message, gestion, erreurs.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHmac, randomBytes } from "node:crypto";
import sharp from "sharp";
import { afterAll, afterEach, beforeEach, describe, expect, test } from "vitest";
import { setDataRoot } from "@/lib/connections/store";
import { readTransaction, startAuthorization } from "@/lib/connections/oauth";
import { accountContext, completeAuthorization, getAccessToken, getAccountSummary } from "@/lib/connections/accounts";
import { checkProcessingJobs, configurePublishQueue, enqueuePublish, getJob, retryJob, runPublishQueue } from "@/lib/connections/publish-queue";
import { getConnector, registerConnector } from "@/lib/connections/registry";
import { listPosts } from "@/lib/connections/manage";
import { QuotaExceededError } from "@/lib/connections/errors";
import { facebookConnector } from "@/lib/connections/connectors/facebook";
import { chooseFormat, normalizeFacebookOptions } from "@/lib/connections/connectors/facebook/metadata";
import type { AccountSummary, PublishFileSource, PublishSource } from "@/lib/connections/types";

const PAGE_ID = "1001";
const READONLY_PAGE_ID = "1002";
const APP_SECRET = "app-secret";
const saved = { ...process.env };
const realFetch = globalThis.fetch;
// Le connecteur annoncé (« bientôt ») tant que le registre ne branche pas le vrai.
const plannedFacebook = getConnector("facebook");

// ─── Faux serveur Graph ───────────────────────────────────────────

interface Call {
  method: string;
  url: URL;
  params: Record<string, string>;
  files: Record<string, { type: string; size: number }>;
  headers: Record<string, string>;
}

interface ForcedError {
  match: (call: Call) => boolean;
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

interface FakeGraph {
  calls: Call[];
  reels: Map<string, { received: Buffer; finish?: Record<string, string> }>;
  videos: Map<string, { received: Buffer; total: number; videoId: string; finish?: Record<string, string> }>;
  posts: { id: string; message: string; created_time: string; is_published: boolean }[];
  photos: { type: string; size: number; caption?: string }[];
  /** Prochain envoi de Reel : coupé après ce nombre d'octets reçus. */
  cutReelAfter: number | null;
  /** Prochain morceau de vidéo : refusé une fois avec l'erreur 1363037. */
  offsetErrorOnce: boolean;
  /** Prochaine publication de message : créée, puis la réponse se perd. */
  loseFeedResponse: boolean;
  forced: ForcedError[];
  /** L'adresse d'un Reel (`permalink_url`) n'existe qu'une fois la vidéo traitée. */
  latePermalink: boolean;
  counter: number;
}

let graph: FakeGraph;

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

async function readCall(input: RequestInfo | URL, init?: RequestInit): Promise<{ call: Call; bytes?: Buffer }> {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url);
  const method = (init?.method ?? "GET").toUpperCase();
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries((init?.headers as Record<string, string>) ?? {})) headers[key.toLowerCase()] = value;
  const params: Record<string, string> = Object.fromEntries(url.searchParams);
  const files: Call["files"] = {};
  let bytes: Buffer | undefined;
  const body = init?.body;
  if (body instanceof FormData) {
    for (const [key, value] of body.entries()) {
      if (typeof value === "string") params[key] = value;
      else {
        const file = value as unknown as Blob;
        files[key] = { type: file.type, size: file.size };
        bytes = Buffer.from(await file.arrayBuffer());
      }
    }
  } else if (typeof body === "string") {
    Object.assign(params, Object.fromEntries(new URLSearchParams(body)));
  } else if (body) {
    bytes = Buffer.from(await new Response(body as BodyInit).arrayBuffer());
  }
  return { call: { method, url, params, files, headers }, bytes };
}

function createFakeGraph(): FakeGraph {
  return { calls: [], reels: new Map(), videos: new Map(), posts: [], photos: [], cutReelAfter: null, offsetErrorOnce: false, loseFeedResponse: false, forced: [], latePermalink: false, counter: 0 };
}

const graphPath = (url: URL) => url.pathname.replace(/^\/v26\.0\//, "");
const VIDEO_CHUNK = 100_000;

async function graphFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const { call, bytes } = await readCall(input, init);
  graph.calls.push(call);
  const forced = graph.forced.findIndex((entry) => entry.match(call));
  if (forced >= 0) {
    const [entry] = graph.forced.splice(forced, 1);
    return json(entry.body, entry.status, entry.headers);
  }
  const p = call.params;

  if (call.url.hostname === "rupload.facebook.com") {
    const videoId = call.url.pathname.split("/").pop() ?? "";
    const reel = graph.reels.get(videoId);
    if (!reel || !call.headers.authorization?.startsWith("OAuth page-")) return json({ debug_info: { type: "AuthError" } }, 401);
    const offset = Number(call.headers.offset);
    if (offset !== reel.received.length) return json({ debug_info: { type: "OffsetInvalidError", message: "bad offset" } }, 400);
    const data = bytes ?? Buffer.alloc(0);
    if (graph.cutReelAfter !== null) {
      reel.received = Buffer.concat([reel.received, data.subarray(0, graph.cutReelAfter)]);
      graph.cutReelAfter = null;
      throw new TypeError("fetch failed");
    }
    reel.received = Buffer.concat([reel.received, data]);
    return json({ success: true });
  }

  if (call.url.hostname !== "graph.facebook.com") return json({ error: { message: "inconnu" } }, 404);
  const route = graphPath(call.url);

  if (route === "oauth/access_token") {
    if (p.grant_type === "fb_exchange_token") {
      if (p.fb_exchange_token !== "short-1" || p.client_secret !== APP_SECRET) return json({ error: { message: "bad", type: "OAuthException", code: 190 } }, 400);
      return json({ access_token: "long-1", token_type: "bearer", expires_in: 5183944 });
    }
    if (p.code !== "code-1") return json({ error: { message: "code invalide", type: "OAuthException", code: 100 } }, 400);
    return json({ access_token: "short-1", token_type: "bearer", expires_in: 3600 });
  }
  if (route === "debug_token") {
    return json({ data: { app_id: "app-1", is_valid: true, expires_at: 0, scopes: ["pages_show_list", "pages_read_engagement", "pages_manage_posts", "public_profile"] } });
  }
  if (route === "me/accounts") {
    return json({
      data: [
        { id: PAGE_ID, name: "Ma Page", access_token: `page-${PAGE_ID}`, tasks: ["ANALYZE", "ADVERTISE", "MODERATE", "CREATE_CONTENT", "MANAGE"], category: "Jeux vidéo", picture: { data: { url: "https://cdn.fake/p.jpg" } } },
        { id: READONLY_PAGE_ID, name: "Page en lecture", access_token: `page-${READONLY_PAGE_ID}`, tasks: ["ANALYZE"] },
      ],
    });
  }
  // Toute la suite exige un jeton de Page.
  if (!p.access_token?.startsWith("page-")) return json({ error: { message: "jeton", type: "OAuthException", code: 190 } }, 400);

  if (route === `${PAGE_ID}/video_reels` && call.method === "POST") {
    if (p.upload_phase === "start") {
      const videoId = `${++graph.counter}77`;
      graph.reels.set(videoId, { received: Buffer.alloc(0) });
      return json({ video_id: videoId, upload_url: `https://rupload.facebook.com/video-upload/${videoId}` });
    }
    const reel = graph.reels.get(p.video_id);
    if (!reel) return json({ error: { message: "vidéo inconnue", code: 100 } }, 400);
    reel.finish = { ...p };
    return json({ success: true, post_id: `${PAGE_ID}_${p.video_id}` });
  }
  if (route === `${PAGE_ID}/videos` && call.method === "POST") {
    if (p.upload_phase === "start") {
      const sessionId = `s${++graph.counter}`;
      const videoId = `${graph.counter}88`;
      graph.videos.set(sessionId, { received: Buffer.alloc(0), total: Number(p.file_size), videoId });
      return json({ upload_session_id: sessionId, video_id: videoId, start_offset: "0", end_offset: String(Math.min(VIDEO_CHUNK, Number(p.file_size))) });
    }
    const session = graph.videos.get(p.upload_session_id);
    if (!session) return json({ error: { message: "session", code: 6001, error_subcode: 1363041 } }, 400);
    if (p.upload_phase === "transfer") {
      const start = session.received.length;
      if (graph.offsetErrorOnce || Number(p.start_offset) !== start) {
        graph.offsetErrorOnce = false;
        return json({ error: { message: "offset", code: 6001, error_subcode: 1363037, error_data: { start_offset: String(start), end_offset: String(Math.min(start + VIDEO_CHUNK, session.total)) } } }, 400);
      }
      session.received = Buffer.concat([session.received, bytes ?? Buffer.alloc(0)]);
      const next = session.received.length;
      return json({ start_offset: String(next), end_offset: String(Math.min(next + VIDEO_CHUNK, session.total)) });
    }
    session.finish = { ...p };
    return json({ success: true });
  }
  if (route === `${PAGE_ID}/photos` && call.method === "POST") {
    const file = Object.values(call.files)[0];
    graph.photos.push({ type: file?.type ?? "", size: file?.size ?? 0, caption: p.caption });
    const id = `${PAGE_ID}_ph${++graph.counter}`;
    graph.posts.unshift({ id, message: p.caption ?? "", created_time: new Date().toISOString(), is_published: p.published !== "false" });
    return json({ id: `ph${graph.counter}`, post_id: id });
  }
  if (route === `${PAGE_ID}/feed` && call.method === "POST") {
    const id = `${PAGE_ID}_${++graph.counter}`;
    graph.posts.unshift({ id, message: p.message, created_time: new Date().toISOString(), is_published: p.published !== "false" });
    if (graph.loseFeedResponse) {
      graph.loseFeedResponse = false;
      throw new TypeError("fetch failed");
    }
    return json({ id });
  }
  if (route === `${PAGE_ID}/published_posts`) return json({ data: graph.posts.filter((post) => post.is_published) });
  const video = [...graph.reels.keys(), ...[...graph.videos.values()].map((entry) => entry.videoId)].find((id) => id === route);
  if (video && call.method === "GET") {
    if (p.fields === "permalink_url") return json(graph.latePermalink ? { id: video } : { id: video, permalink_url: `/reel/${video}/` });
    const reel = graph.reels.get(video);
    const received = reel ? reel.received.length : 0;
    const finished = reel ? Boolean(reel.finish) : [...graph.videos.values()].some((entry) => entry.videoId === video && entry.finish);
    return json({
      id: video,
      ...(p.fields?.split(",").includes("permalink_url") && finished ? { permalink_url: `/reel/${video}/` } : {}),
      status: {
        video_status: finished ? "ready" : "uploading",
        uploading_phase: { status: finished ? "complete" : "in_progress", bytes_transfered: received },
        processing_phase: { status: finished ? "complete" : "not_started" },
        ...(reel ? { publishing_phase: { status: finished ? "complete" : "not_started", publish_status: reel.finish?.video_state === "DRAFT" ? "draft" : finished ? "published" : undefined } } : {}),
      },
    });
  }
  const post = graph.posts.find((entry) => entry.id === route);
  if (post) {
    if (call.method === "DELETE") {
      graph.posts = graph.posts.filter((entry) => entry !== post);
      return json({ success: true });
    }
    if (call.method === "POST") {
      post.message = p.message;
      return json({ success: true });
    }
    return json(post);
  }
  if (route === PAGE_ID) return json({ id: PAGE_ID, name: "Ma Page renommée", link: "https://www.facebook.com/mapage" });
  return json({ error: { message: `route inconnue ${route}`, code: 100 } }, 400);
}

// ─── Mise en place ────────────────────────────────────────────────

let root: string;
let files: Record<string, string>;
let sleeps: number[];

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "connections-fb-"));
  setDataRoot(path.join(root, "data"));
  delete process.env.CONNECTIONS_ENCRYPTION_KEY;
  process.env.AUTH_SECRET = "secret-de-test-assez-long-pour-hkdf";
  process.env.AUTH_URL = "https://sxm.test";
  process.env.FACEBOOK_CLIENT_ID = "app-1";
  process.env.FACEBOOK_CLIENT_SECRET = APP_SECRET;
  process.env.FACEBOOK_CONFIG_ID = "123456789012345";
  graph = createFakeGraph();
  globalThis.fetch = graphFetch as typeof fetch;
  registerConnector(facebookConnector);
  files = {};
  sleeps = [];
  configurePublishQueue({
    autoRun: false,
    resolveSource: async (ref) => files[ref.id],
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

afterAll(() => {
  if (plannedFacebook) registerConnector(plannedFacebook);
});

async function connect(): Promise<{ page: AccountSummary; readonly: AccountSummary }> {
  const { url, cookie } = startAuthorization("facebook", "all");
  const state = new URL(url).searchParams.get("state");
  const { accounts } = await completeAuthorization("facebook", "code-1", readTransaction(cookie, "facebook", state));
  return { page: accounts.find((account) => account.externalId === PAGE_ID)!, readonly: accounts.find((account) => account.externalId === READONLY_PAGE_ID)! };
}

function videoFile(id: string, size: number): Buffer {
  const data = randomBytes(size);
  files[id] = path.join(root, `${id}.mp4`);
  fs.writeFileSync(files[id], data);
  return data;
}

const videoSource = (id: string, bytes: number, width: number, height: number, durationMs: number): PublishFileSource => ({
  module: "clip-studio",
  id,
  file: `${id}.mp4`,
  bytes,
  kind: "video",
  width,
  height,
  durationMs,
  name: "Mon clip",
});

async function runAll() {
  await runPublishQueue();
  await checkProcessingJobs();
}

// ─── Tests ────────────────────────────────────────────────────────

describe("connexion", () => {
  test("dialogue avec config_id, portées séparées par des virgules, sans PKCE", () => {
    const { url } = startAuthorization("facebook", "all");
    const params = new URL(url).searchParams;
    expect(url.startsWith("https://www.facebook.com/v26.0/dialog/oauth?")).toBe(true);
    expect(params.get("config_id")).toBe("123456789012345");
    expect(params.get("scope")).toBe("pages_show_list,pages_read_engagement,pages_manage_posts");
    expect(params.get("code_challenge")).toBeNull();
    expect(params.get("redirect_uri")).toBe("https://sxm.test/api/connections/facebook/callback");
  });

  test("sans identifiant de configuration, la connexion ne démarre pas", () => {
    delete process.env.FACEBOOK_CONFIG_ID;
    expect(() => startAuthorization("facebook", "all")).toThrow(/configurée/);
  });

  test("code → jeton longue durée → une Page par compte, chacune avec son jeton de Page qui n'expire pas", async () => {
    const { page, readonly } = await connect();
    const exchange = graph.calls.filter((call) => call.url.pathname.endsWith("/oauth/access_token"));
    expect(exchange.map((call) => call.method)).toEqual(["GET", "GET"]);
    expect(exchange[1].params.grant_type).toBe("fb_exchange_token");
    expect(page.capabilities).toEqual(expect.arrayContaining(["publish.video", "publish.image", "publish.text", "posts.list", "posts.manage"]));
    expect(page.tokenRenewal).toBe("none");
    expect(page.url).toBe(`https://www.facebook.com/${PAGE_ID}`);
    expect(readonly.capabilities).toEqual(["posts.list"]);
    expect((await getAccessToken(page.id)).value).toBe(`page-${PAGE_ID}`);
    // La lecture des Pages est signée : HMAC-SHA256 du jeton par le secret.
    const accounts = graph.calls.find((call) => call.url.pathname.endsWith("/me/accounts"))!;
    expect(accounts.params.appsecret_proof).toBe(createHmac("sha256", APP_SECRET).update("long-1").digest("hex"));
  });
});

describe("format et options", () => {
  const vertical = videoSource("v", 10, 1080, 1920, 30_000);
  const horizontal = videoSource("h", 10, 1920, 1080, 30_000);

  test("automatique : Reel pour une vidéo verticale de 3 à 90 s, vidéo de la Page sinon", () => {
    expect(chooseFormat("auto", vertical)).toBe("reel");
    expect(chooseFormat("auto", horizontal)).toBe("video");
    expect(chooseFormat("auto", { ...vertical, durationMs: 120_000 })).toBe("video");
    expect(() => normalizeFacebookOptions({ format: "reel" }, { ...vertical, durationMs: 120_000 })).toThrow(/90 secondes/);
  });

  test("programmation de 10 minutes à 29 jours, jamais en brouillon", () => {
    const now = Date.now();
    expect(() => normalizeFacebookOptions({ scheduledAt: new Date(now + 5 * 60_000).toISOString() }, vertical, now)).toThrow(/10 minutes/);
    expect(() => normalizeFacebookOptions({ scheduledAt: new Date(now + 40 * 86_400_000).toISOString() }, vertical, now)).toThrow(/29 jours/);
    expect(() => normalizeFacebookOptions({ privacy: "private", scheduledAt: new Date(now + 86_400_000).toISOString() }, vertical, now)).toThrow(/brouillon/);
    expect(normalizeFacebookOptions({ scheduledAt: new Date(now + 86_400_000).toISOString() }, vertical, now).scheduledAt).toBeTruthy();
  });

  test("un carrousel est refusé clairement", () => {
    const carousel: PublishSource = { module: "m", id: "c", kind: "carousel", bytes: 2, items: [] };
    expect(() => normalizeFacebookOptions({}, carousel)).toThrow(/plusieurs fichiers/);
  });
});

describe("Reel de Page", () => {
  test("envoi, publication et suivi du traitement", async () => {
    const { page } = await connect();
    const data = videoFile("reel-1", 300_000);
    const job = enqueuePublish({ accountId: page.id, source: videoSource("reel-1", data.length, 1080, 1920, 20_000), options: { title: "Titre", description: "Desc #jeu", aiGenerated: true } });
    await runAll();
    const done = getJob(job.id)!;
    expect(done.state).toBe("done");
    const [videoId, reel] = [...graph.reels.entries()][0];
    expect(reel.received.equals(data)).toBe(true);
    expect(reel.finish).toMatchObject({ upload_phase: "finish", video_state: "PUBLISHED", description: "Desc #jeu", title: "Titre", is_ai_generated: "true" });
    expect(done.result).toEqual({ externalId: videoId, url: `https://www.facebook.com/reel/${videoId}/` });
  });

  test("adresse définitive connue seulement après le traitement : rendue par le suivi, sans bloquer l'envoi", async () => {
    const { page } = await connect();
    graph.latePermalink = true;
    const data = videoFile("reel-5", 1000);
    const job = enqueuePublish({ accountId: page.id, source: videoSource("reel-5", data.length, 1080, 1920, 20_000), options: {} });
    await runPublishQueue();
    const videoId = [...graph.reels.keys()][0];
    // L'envoi est fini : le suivi se fait à côté, avec l'adresse provisoire de la publication.
    expect(getJob(job.id)).toMatchObject({ state: "processing", result: { externalId: videoId, url: expect.not.stringContaining("/reel/") } });
    await checkProcessingJobs();
    expect(getJob(job.id)).toMatchObject({ state: "done", result: { externalId: videoId, url: `https://www.facebook.com/reel/${videoId}/` } });
  });

  test("coupure au milieu de l'envoi : reprise à bytes_transfered, sans renvoyer le début", async () => {
    const { page } = await connect();
    const data = videoFile("reel-2", 500_000);
    graph.cutReelAfter = 123_456;
    const job = enqueuePublish({ accountId: page.id, source: videoSource("reel-2", data.length, 1080, 1920, 20_000), options: {} });
    await runAll();
    expect(getJob(job.id)!.state).toBe("done");
    const reel = [...graph.reels.values()][0];
    expect(reel.received.equals(data)).toBe(true);
    const uploads = graph.calls.filter((call) => call.url.hostname === "rupload.facebook.com");
    expect(uploads.map((call) => call.headers.offset)).toEqual(["0", "123456"]);
    expect(sleeps).toEqual([1000]);
    // Une seule session ouverte.
    expect(graph.reels.size).toBe(1);
  });

  test("brouillon et programmation passent dans video_state", async () => {
    const { page } = await connect();
    const data = videoFile("reel-3", 1000);
    const at = Date.now() + 2 * 86_400_000;
    enqueuePublish({ accountId: page.id, source: videoSource("reel-3", data.length, 1080, 1920, 20_000), options: { scheduledAt: new Date(at).toISOString() } });
    await runAll();
    const finish = [...graph.reels.values()][0].finish!;
    expect(finish.video_state).toBe("SCHEDULED");
    expect(Number(finish.scheduled_publish_time)).toBe(Math.floor(at / 1000));
  });

  test("30 Reels par Page sur 24 h : le 31e attend, sans rien envoyer", async () => {
    const { page } = await connect();
    const { context } = accountContext(page.id);
    for (let index = 0; index < 30; index += 1) context.chargeQuota("video_reels.publish");
    expect(() => context.chargeQuota("video_reels.publish")).toThrow(QuotaExceededError);
    const data = videoFile("reel-4", 1000);
    const job = enqueuePublish({ accountId: page.id, source: videoSource("reel-4", data.length, 1080, 1920, 20_000), options: {} });
    await runPublishQueue();
    expect(getJob(job.id)!.state).toBe("waiting-quota");
    expect(graph.reels.size).toBe(0);
  });
});

describe("vidéo de Page", () => {
  test("envoi par morceaux avec le jeton de Page, recalage sur l'erreur 1363037", async () => {
    const { page } = await connect();
    const data = videoFile("vid-1", 350_000);
    graph.offsetErrorOnce = true;
    const job = enqueuePublish({
      accountId: page.id,
      source: videoSource("vid-1", data.length, 1920, 1080, 120_000),
      options: { title: "Long format", description: "Description", privacy: "private" },
    });
    await runAll();
    expect(getJob(job.id)!.state).toBe("done");
    const session = [...graph.videos.values()][0];
    expect(session.received.equals(data)).toBe(true);
    expect(session.finish).toMatchObject({ upload_phase: "finish", title: "Long format", description: "Description", published: "false", unpublished_content_type: "DRAFT" });
    const transfers = graph.calls.filter((call) => call.params.upload_phase === "transfer");
    expect(transfers.every((call) => call.params.access_token === `page-${PAGE_ID}` && call.files.video_file_chunk)).toBe(true);
    // Quatre morceaux de 100 000 octets au plus, plus le morceau refusé une fois.
    expect(transfers).toHaveLength(5);
  });
});

describe("photo et message", () => {
  test("une capture de plus de 4 Mo est réencodée en JPEG avant l'envoi", async () => {
    const { page } = await connect();
    const width = 1200;
    const png = await sharp(randomBytes(width * width * 3), { raw: { width, height: width, channels: 3 } }).png({ compressionLevel: 0 }).toBuffer();
    expect(png.length).toBeGreaterThan(4 * 1024 * 1024);
    files.cap = path.join(root, "capture.png");
    fs.writeFileSync(files.cap, png);
    const job = enqueuePublish({
      accountId: page.id,
      source: { module: "gallery", id: "cap", file: "capture.png", bytes: png.length, kind: "image", width, height: width },
      options: { description: "Ma capture" },
    });
    await runAll();
    const done = getJob(job.id)!;
    expect(done.state).toBe("done");
    expect(graph.photos[0]).toMatchObject({ type: "image/jpeg", caption: "Ma capture" });
    expect(graph.photos[0].size).toBeLessThanOrEqual(4 * 1024 * 1024);
    expect(done.result?.url).toMatch(new RegExp(`^https://www.facebook.com/${PAGE_ID}_ph`));
  }, 30_000);

  test("message avec lien, et réponse perdue retrouvée sans doublon", async () => {
    const { page } = await connect();
    graph.loseFeedResponse = true;
    const job = enqueuePublish({ accountId: page.id, source: { module: "m", id: "t1", kind: "text", text: "Bonjour la Page", bytes: 0 }, options: { link: "https://ascencia.re" } });
    await runPublishQueue();
    expect(getJob(job.id)!.state).toBe("failed");
    retryJob(job.id);
    // Avant le suivi du traitement, qui efface la remarque (comportement du cœur).
    await runPublishQueue();
    expect(getJob(job.id)!.warning).toMatch(/retrouvée/);
    await checkProcessingJobs();
    expect(getJob(job.id)!.state).toBe("done");
    expect(graph.posts).toHaveLength(1);
    expect(graph.calls.find((call) => call.url.pathname.endsWith("/feed"))!.params.link).toBe("https://ascencia.re/");
  });
});

describe("erreurs et gestion", () => {
  test("jeton de Page refusé (mot de passe changé) : compte « à reconnecter », travail gardé", async () => {
    const { page } = await connect();
    graph.forced.push({ match: (call) => call.url.pathname.endsWith("/feed"), status: 400, body: { error: { message: "Error validating access token", type: "OAuthException", code: 190, error_subcode: 460 } } });
    const job = enqueuePublish({ accountId: page.id, source: { module: "m", id: "t2", kind: "text", text: "Coucou", bytes: 0 }, options: {} });
    await runPublishQueue();
    expect(getJob(job.id)!.state).toBe("queued");
    const account = getAccountSummary(page.id)!;
    expect(account.status).toBe("needs-reconnect");
    expect(account.statusReason).toMatch(/mot de passe/);
  });

  test("limite de débit de la Page : seul ce compte attend le délai annoncé par Meta", async () => {
    const { page } = await connect();
    graph.forced.push({
      match: (call) => call.url.pathname.endsWith("/feed"),
      status: 400,
      body: { error: { message: "too many calls", code: 80001 } },
      headers: { "X-Business-Use-Case-Usage": JSON.stringify({ [PAGE_ID]: [{ type: "pages", call_count: 100, estimated_time_to_regain_access: 15 }] }) },
    });
    const before = Date.now();
    const job = enqueuePublish({ accountId: page.id, source: { module: "m", id: "t3", kind: "text", text: "Encore", bytes: 0 }, options: {} });
    await runPublishQueue();
    const waiting = getJob(job.id)!;
    expect(waiting.state).toBe("waiting-quota");
    expect(waiting.retryAt! - before).toBeGreaterThanOrEqual(15 * 60_000 - 1000);
    expect(waiting.retryAt! - before).toBeLessThan(16 * 60_000);
  });

  test("lister, modifier le texte, supprimer ; la visibilité n'est pas modifiable", async () => {
    const { page } = await connect();
    graph.posts.push({ id: `${PAGE_ID}_9`, message: "Première ligne\nsuite", created_time: "2026-10-01T10:00:00+0000", is_published: true });
    const { posts } = await listPosts(page.id, { refresh: true });
    expect(posts[0]).toMatchObject({ id: `${PAGE_ID}_9`, title: "Première ligne", privacy: "public" });
    const { context } = accountContext(page.id);
    const updated = await facebookConnector.posts!.update!(context, `${PAGE_ID}_9`, { description: "Nouveau texte" });
    expect(updated.description).toBe("Nouveau texte");
    await expect(facebookConnector.posts!.update!(context, `${PAGE_ID}_9`, { privacy: "private" })).rejects.toThrow(/visibilité/);
    await facebookConnector.posts!.remove!(context, `${PAGE_ID}_9`);
    expect(graph.posts).toHaveLength(0);
  });
});
