/**
 * Connecteur Threads (dossier 07c) contre un faux serveur Threads : aucun
 * appel réel. Le faux serveur suit les formes de la documentation de Meta
 * (jetons, conteneurs, états, publications, limites) et vient lire les
 * fichiers par les liens publics de l'instance, comme le ferait Threads.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { setDataRoot } from "@/lib/connections/store";
import { describeConnector, registerConnector } from "@/lib/connections/registry";
import { plannedConnectors } from "@/lib/connections/connectors/planned";
import { accountContext, completeAuthorization, getAccessToken, getAccountSummary, renewDueTokens } from "@/lib/connections/accounts";
import { cancelJob, checkProcessingJobs, configurePublishQueue, enqueuePublish, getJob, listJobs, retryJob, runPublishQueue } from "@/lib/connections/publish-queue";
import { getAccountQuotaUsage } from "@/lib/connections/quota";
import { servePublicMedia } from "@/lib/connections/public-media";
import { threadsConnector } from "@/lib/connections/connectors/threads";
import { countLinks, normalizeThreadsOptions, sanitizeTopic } from "@/lib/connections/connectors/threads/options";
import { convertImageToJpeg } from "@/lib/connections/connectors/threads/publish";
import type { PublishFileSource, PublishSource } from "@/lib/connections/types";
import { authorize } from "./connections-fake-service";

const USER_ID = "17841400000000001";

// Sous Windows, le cache de sharp garde les fichiers ouverts et empêche d'effacer le dossier du test.
sharp.cache(false);
const DAY = 24 * 3600_000;

// ─── Faux serveur Threads ─────────────────────────────────────────

interface FakeContainer {
  id: string;
  params: Record<string, string>;
  /** États rendus aux lectures successives ; le dernier se répète. */
  statuses: string[];
  errorMessage?: string;
  /** Ce que le faux Threads a lu sur le lien public (type, octets). */
  fetched?: { status: number; contentType: string | null; bytes: Buffer };
  publishedId?: string;
}

interface FakeThreads {
  calls: { method: string; path: string; params: Record<string, string> }[];
  /** Portées rendues par `debug_token`. */
  scopes: string[];
  /** Usage rendu par `threads_publishing_limit`. */
  quotaUsage: number;
  containers: FakeContainer[];
  /** États des prochains conteneurs, dans l'ordre de création. */
  nextStatuses: string[][];
  nextErrorMessage?: string;
  /** Le faux Threads lit-il le fichier à la création du conteneur ? */
  downloads: boolean;
  posts: { id: string; media_type: string; text?: string; timestamp: string; topic_tag?: string; permalink?: string; shortcode: string }[];
  /** Prochaine réponse de `threads_publish` : normale, perdue (publiée quand même) ou jeton refusé. */
  publishMode: "ok" | "lost" | "token-refused";
  refreshMode: "ok" | "refused";
  counter: number;
}

function createFakeThreads(): FakeThreads {
  return {
    calls: [],
    scopes: ["threads_basic", "threads_content_publish", "threads_delete"],
    quotaUsage: 0,
    containers: [],
    nextStatuses: [],
    downloads: true,
    posts: [],
    publishMode: "ok",
    refreshMode: "ok",
    counter: 0,
  };
}

const json = (body: unknown, status = 200) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const graphError = (code: number, message: string, status = 400) => json({ error: { message, type: "OAuthException", code } }, status);

function fakeThreadsFetch(fake: FakeThreads): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url);
    const method = (init?.method ?? "GET").toUpperCase();
    const params: Record<string, string> = Object.fromEntries(
      method === "POST" ? new URLSearchParams(String(init?.body ?? "")) : url.searchParams
    );
    fake.calls.push({ method, path: `${url.host}${url.pathname}`, params });

    if (url.host === "graph.threads.com" && url.pathname === "/oauth/access_token") {
      if (params.grant_type !== "authorization_code" || params.client_secret !== "threads-secret") {
        return json({ error_type: "OAuthException", code: 400, error_message: "Matching code was not found or was already used" }, 400);
      }
      // `user_id` en nombre de 17 chiffres, sans `expires_in` ni `scope`, comme la documentation le montre.
      return json(`{"access_token":"short-1","token_type":"bearer","user_id":${USER_ID}}`);
    }
    if (url.host === "graph.threads.net" && url.pathname === "/access_token") {
      if (params.grant_type !== "th_exchange_token" || params.client_secret !== "threads-secret") return graphError(100, "bad exchange");
      return json({ access_token: `long-${params.access_token}`, token_type: "bearer", expires_in: 5183944 });
    }
    if (url.host === "graph.threads.net" && url.pathname === "/refresh_access_token") {
      if (fake.refreshMode === "refused") return graphError(190, "Error validating access token: Session has expired.");
      fake.counter += 1;
      return json({ access_token: `long-r${fake.counter}`, token_type: "bearer", expires_in: 5183944 });
    }

    if (url.host !== "graph.threads.net" || !url.pathname.startsWith("/v1.0/")) return json({ error: "not_found" }, 404);
    if (!params.access_token?.startsWith("long-")) return graphError(190, "Invalid OAuth access token.", 400);
    const route = url.pathname.slice("/v1.0/".length);

    if (route === "debug_token") {
      return json({ data: { type: "USER", is_valid: true, scopes: fake.scopes, user_id: USER_ID, expires_at: 0 } });
    }
    if (route === "me" && method === "GET") {
      return json(`{"id":${USER_ID},"username":"karim.test","name":"Karim Test","threads_profile_picture_url":"https://cdn.example/avatar.jpg"}`);
    }
    if (route === "me/threads_publishing_limit") {
      return json({ data: [{ quota_usage: fake.quotaUsage, config: { quota_total: 250, quota_duration: 86400 } }] });
    }
    if (route === "me/threads" && method === "GET") {
      const since = Number(params.since ?? 0);
      const limit = Number(params.limit ?? 25);
      const all = fake.posts.filter((post) => Date.parse(post.timestamp.replace(/\+0000$/, "Z")) / 1000 >= since);
      const start = params.after ? Number(params.after) : 0;
      const data = all.slice(start, start + limit);
      const more = start + limit < all.length;
      return json({ data, paging: { cursors: { before: "0", ...(more ? { after: String(start + limit) } : {}) } } });
    }
    if (route === `${USER_ID}/threads` && method === "POST") {
      fake.counter += 1;
      const container: FakeContainer = {
        id: `c-${fake.counter}`,
        params,
        statuses: fake.nextStatuses.shift() ?? ["FINISHED"],
        errorMessage: fake.nextErrorMessage,
      };
      fake.nextErrorMessage = undefined;
      const mediaUrl = params.image_url ?? params.video_url;
      if (mediaUrl && fake.downloads) {
        // Threads vient lire le fichier sur le lien public de l'instance.
        const response = servePublicMedia(new Request(mediaUrl), mediaUrl.split("/media/")[1]);
        container.fetched = { status: response.status, contentType: response.headers.get("content-type"), bytes: Buffer.from(await response.arrayBuffer()) };
      }
      fake.containers.push(container);
      return json({ id: container.id });
    }
    if (route === `${USER_ID}/threads_publish` && method === "POST") {
      const container = fake.containers.find((entry) => entry.id === params.creation_id);
      if (!container) return graphError(100, "Unknown container");
      if (fake.publishMode === "token-refused") {
        fake.publishMode = "ok";
        return graphError(190, "Error validating access token: The user has not authorized application.");
      }
      if (container.publishedId) return graphError(100, "Media already published");
      fake.counter += 1;
      const id = `m-${fake.counter}`;
      container.publishedId = id;
      container.statuses = ["PUBLISHED"];
      const type = container.params.media_type === "TEXT" ? "TEXT_POST" : container.params.media_type;
      fake.posts.unshift({
        id,
        media_type: type,
        text: container.params.text,
        topic_tag: container.params.topic_tag,
        timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, "+0000"),
        shortcode: `sc${id}`,
        permalink: `https://www.threads.com/@karim.test/post/sc${id}`,
      });
      if (fake.publishMode === "lost") {
        fake.publishMode = "ok";
        throw new TypeError("fetch failed");
      }
      return json({ id });
    }
    const container = fake.containers.find((entry) => entry.id === route);
    if (container && method === "GET") {
      const status = container.statuses.length > 1 ? container.statuses.shift()! : container.statuses[0];
      return json({ id: container.id, status, ...(status === "ERROR" && container.errorMessage ? { error_message: container.errorMessage } : {}) });
    }
    const post = fake.posts.find((entry) => entry.id === route);
    if (post && method === "GET") return json({ ...post, username: "karim.test" });
    if (post && method === "DELETE") {
      fake.posts = fake.posts.filter((entry) => entry.id !== post.id);
      return json({ success: true, deleted_id: post.id });
    }
    return graphError(100, `Unsupported request ${method} ${route}`);
  }) as typeof fetch;
}

// ─── Préparation ──────────────────────────────────────────────────

const saved = { ...process.env };
const realFetch = globalThis.fetch;
const realNow = Date.now;
let root: string;
let fake: FakeThreads;
let files: Record<string, string>;
let sleeps: number[];

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "connections-threads-"));
  setDataRoot(path.join(root, "data"));
  delete process.env.CONNECTIONS_ENCRYPTION_KEY;
  process.env.AUTH_SECRET = "secret-de-test-assez-long-pour-hkdf";
  process.env.AUTH_URL = "https://sxm.example.org";
  process.env.THREADS_CLIENT_ID = "990602627938098";
  process.env.THREADS_CLIENT_SECRET = "threads-secret";
  fake = createFakeThreads();
  globalThis.fetch = fakeThreadsFetch(fake);
  registerConnector(threadsConnector);
  files = {};
  fs.mkdirSync(path.join(root, "module"), { recursive: true });
  files["clip.mp4"] = path.join(root, "module", "clip.mp4");
  fs.writeFileSync(files["clip.mp4"], randomBytes(4000));
  files["photo.png"] = path.join(root, "module", "photo.png");
  await sharp({ create: { width: 64, height: 48, channels: 3, background: "#3366cc" } }).png().toFile(files["photo.png"]);
  files["capture.webp"] = path.join(root, "module", "capture.webp");
  await sharp({ create: { width: 2000, height: 1000, channels: 4, background: { r: 200, g: 50, b: 50, alpha: 0.5 } } }).webp().toFile(files["capture.webp"]);
  sleeps = [];
  configurePublishQueue({
    autoRun: false,
    resolveSource: async (ref) => {
      if (!ref.file || !files[ref.file]) throw new Error("introuvable");
      return files[ref.file];
    },
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  });
});

afterEach(() => {
  Date.now = realNow;
  configurePublishQueue({ autoRun: true, resolveSource: null, sleep: null });
  globalThis.fetch = realFetch;
  registerConnector(plannedConnectors.find((connector) => connector.id === "threads")!);
  setDataRoot(null);
  fs.rmSync(root, { recursive: true, force: true });
  for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
  Object.assign(process.env, saved);
});

/**
 * Fait tourner la file, puis reprend chaque travail rendu « en traitement »
 * sans attendre son heure, comme le ferait le minuteur ; les délais demandés
 * par le connecteur sont notés dans `sleeps`.
 */
async function settle() {
  await runPublishQueue();
  for (let round = 0; round < 100; round += 1) {
    const waiting = listJobs().filter((job) => job.state === "processing" && !job.result);
    if (waiting.length === 0) return;
    for (const job of waiting) sleeps.push(Math.round((job.checkAt! - job.updatedAt) / 1000) * 1000);
    await checkProcessingJobs({ all: true });
  }
  throw new Error("Les attentes chez Threads ne finissent pas.");
}

async function connect() {
  const { url, transaction } = authorize("threads");
  const { accounts } = await completeAuthorization("threads", "code-1", transaction);
  return { account: accounts[0], url };
}

const text = (value: string): PublishSource => ({ module: "fake-module", id: "txt-1", kind: "text", text: value, bytes: 0 });
const media = (file: string, overrides: Partial<PublishFileSource> = {}): PublishFileSource => ({
  module: "fake-module",
  id: `exp-${file}`,
  kind: file.endsWith(".mp4") ? "video" : "image",
  file,
  bytes: fs.statSync(files[file]).size,
  ...(file.endsWith(".mp4") ? { width: 1080, height: 1920, durationMs: 30_000 } : {}),
  ...overrides,
});
const callsTo = (suffix: string, method?: string) => fake.calls.filter((call) => call.path.endsWith(suffix) && (!method || call.method === method));

// ─── Connexion et jetons ──────────────────────────────────────────

describe("connexion d'un profil Threads", () => {
  test("autorisation sans PKCE, jeton court échangé contre un jeton de 60 jours, portées lues par debug_token", async () => {
    fake.scopes = ["threads_basic", "threads_content_publish"];
    const { account, url } = await connect();

    expect(url.origin + url.pathname).toBe("https://threads.com/oauth/authorize");
    expect(url.searchParams.get("scope")).toBe("threads_basic,threads_content_publish,threads_delete");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("redirect_uri")).toBe("https://sxm.example.org/api/connections/threads/callback");
    expect(url.searchParams.has("code_challenge")).toBe(false);

    const exchange = callsTo("graph.threads.com/oauth/access_token")[0];
    expect(exchange.method).toBe("POST");
    expect(exchange.params).toMatchObject({ client_id: "990602627938098", client_secret: "threads-secret", grant_type: "authorization_code", code: "code-1" });
    expect(exchange.params.code_verifier).toBeUndefined();
    expect(callsTo("graph.threads.net/access_token")[0].params).toMatchObject({ grant_type: "th_exchange_token", access_token: "short-1" });

    // L'identifiant de 17 chiffres reste exact.
    expect(account.externalId).toBe(USER_ID);
    expect(account).toMatchObject({ name: "Karim Test", handle: "@karim.test", url: "https://www.threads.com/@karim.test", tokenRenewal: "automatic" });
    // `threads_delete` décoché chez Threads : la suppression reste grisée.
    expect(account.capabilities.sort()).toEqual(["posts.list", "publish.image", "publish.text", "publish.video"]);
    expect(account.tokenExpiresAt! - Date.now()).toBeGreaterThan(59 * DAY);
  });

  test("description publique : suppression seule, consigne de déconnexion, liens publics", () => {
    const info = describeConnector(threadsConnector);
    expect(info.status).toBe("ready");
    expect(info.postActions).toEqual({ update: false, remove: true });
    expect(info.disconnectHelp).toMatch(/Autorisations des sites web/);
    expect(info.publicMedia).toBe(true);
    expect(info.multipleAccounts).toBeUndefined();
    expect(info.limits?.text).toEqual({ maxLength: 500, count: "emoji-bytes" });
    expect(info.scopeSets.find((set) => set.id === "publish")?.capabilities).not.toContain("posts.manage");
  });

  test("renouvellement : pas avant 24 heures, puis th_refresh_token par la tâche de fond", async () => {
    const { account } = await connect();
    const start = realNow();
    Date.now = () => start + 12 * 3600_000;
    await renewDueTokens();
    expect(callsTo("refresh_access_token")).toHaveLength(0);

    // Dix jours plus tard, il reste moins de 50 jours : le jeton est prolongé de 60 jours.
    Date.now = () => start + 11 * DAY;
    const result = await renewDueTokens();
    expect(result.renewed).toBe(1);
    expect(callsTo("refresh_access_token")[0].params).toMatchObject({ grant_type: "th_refresh_token", access_token: "long-short-1" });
    expect((await getAccessToken(account.id)).value).toBe("long-r1");
    expect(getAccountSummary(account.id)!.tokenExpiresAt! - Date.now()).toBeGreaterThan(59 * DAY);
  });

  test("renouvellement refusé (code 190) : le compte passe « à reconnecter »", async () => {
    const { account } = await connect();
    fake.refreshMode = "refused";
    const start = realNow();
    Date.now = () => start + 11 * DAY;
    await renewDueTokens();
    expect(getAccountSummary(account.id)!.status).toBe("needs-reconnect");
  });
});

// ─── Publication ──────────────────────────────────────────────────

describe("publication par conteneur", () => {
  test("message seul : conteneur TEXT avec sujet et lien, publié, adresse lue, quota du profil compté", async () => {
    const { account } = await connect();
    const job = enqueuePublish({
      accountId: account.id,
      source: text("Nouveau clip en ligne : https://exemple.org/clip"),
      options: { topicTag: "#Clip Studio", linkAttachment: "https://exemple.org/clip", altText: "ignoré" },
    });
    await settle();

    expect(getJob(job.id)).toMatchObject({ state: "done", result: { externalId: "m-2", url: "https://www.threads.com/@karim.test/post/scm-2" } });
    const created = fake.containers[0].params;
    expect(created).toMatchObject({ media_type: "TEXT", text: "Nouveau clip en ligne : https://exemple.org/clip", topic_tag: "Clip Studio", link_attachment: "https://exemple.org/clip" });
    expect(created.alt_text).toBeUndefined();
    // Le jeton voyage dans le corps d'un POST, jamais dans l'adresse.
    expect(callsTo(`${USER_ID}/threads`, "POST")[0].params.access_token).toBe("long-short-1");
    expect(callsTo("threads_publish")[0].params.creation_id).toBe("c-1");
    // Aucun délai de 30 secondes pour un message : rien à traiter.
    expect(sleeps).toEqual([]);
    expect(getAccountQuotaUsage(threadsConnector, account.id)!.buckets.find((bucket) => bucket.id === "posts")!.used).toBe(1);
  });

  test("image WebP : convertie en JPEG, servie à Threads par un lien public fermé une fois le conteneur prêt", async () => {
    const { account } = await connect();
    fake.nextStatuses.push(["IN_PROGRESS", "FINISHED"]);
    const job = enqueuePublish({ accountId: account.id, source: media("capture.webp"), options: { text: "Capture 🎮", altText: "Une capture", spoiler: true } });
    await settle();

    expect(getJob(job.id)!.state).toBe("done");
    const container = fake.containers[0];
    expect(container.params).toMatchObject({ media_type: "IMAGE", text: "Capture 🎮", alt_text: "Une capture", is_spoiler_media: "true" });
    expect(container.params.image_url).toMatch(/^https:\/\/sxm\.example\.org\/api\/connections\/media\/.+\.jpg$/);
    expect(container.fetched).toMatchObject({ status: 200, contentType: "image/jpeg" });
    expect(container.fetched!.bytes.subarray(0, 3).toString("hex")).toBe("ffd8ff");
    const meta = await sharp(container.fetched!.bytes).metadata();
    expect(meta.width).toBe(1440);
    // 30 secondes avant la première lecture, puis une minute entre deux lectures.
    expect(sleeps).toEqual([30_000, 60_000]);
    // Le lien est fermé : une nouvelle lecture échoue.
    const again = servePublicMedia(new Request(container.params.image_url), container.params.image_url.split("/media/")[1]);
    expect(again.status).toBe(404);
  }, 30_000);

  test("image PNG légère : servie telle quelle", async () => {
    const { account } = await connect();
    enqueuePublish({ accountId: account.id, source: media("photo.png"), options: {} });
    await settle();
    expect(fake.containers[0].params.image_url).toMatch(/\.png$/);
    expect(fake.containers[0].fetched).toMatchObject({ status: 200, contentType: "image/png" });
    expect(fake.containers[0].params.text).toBeUndefined();
  });

  test("vidéo jamais lue par Threads : échec qui désigne le proxy, puis nouvel essai depuis le début", async () => {
    const { account } = await connect();
    fake.downloads = false;
    fake.nextStatuses.push(["ERROR"]);
    fake.nextErrorMessage = "FAILED_DOWNLOADING_VIDEO";
    const job = enqueuePublish({ accountId: account.id, source: media("clip.mp4"), options: { text: "Clip" } });
    await settle();
    expect(getJob(job.id)).toMatchObject({ state: "failed" });
    expect(getJob(job.id)!.error).toMatch(/jamais pu lire le fichier.*défi anti-robots/);

    fake.downloads = true;
    retryJob(job.id);
    await settle();
    expect(getJob(job.id)!.state).toBe("done");
    expect(fake.containers).toHaveLength(2);
    expect(fake.containers[1].params).toMatchObject({ media_type: "VIDEO" });
    expect(fake.containers[1].fetched).toMatchObject({ status: 200, contentType: "video/mp4" });
  });

  test("réponse de threads_publish perdue : la reprise relit le conteneur et retrouve la publication sans republier", async () => {
    const { account } = await connect();
    fake.publishMode = "lost";
    const job = enqueuePublish({ accountId: account.id, source: text("Une seule fois"), options: {} });
    await settle();
    expect(getJob(job.id)!.state).toBe("failed");

    retryJob(job.id);
    await settle();
    expect(getJob(job.id)).toMatchObject({ state: "done", result: { externalId: "m-2" } });
    expect(getJob(job.id)!.warning).toMatch(/retrouvée/);
    expect(callsTo("threads_publish")).toHaveLength(1);
    expect(fake.posts).toHaveLength(1);
  });

  test("conteneur expiré entre deux passages : recréé", async () => {
    const { account } = await connect();
    fake.nextStatuses.push(["IN_PROGRESS"]);
    const job = enqueuePublish({ accountId: account.id, source: text("Patience"), options: {} });
    await settle();
    expect(getJob(job.id)!.error).toMatch(/traite encore/);

    fake.containers[0].statuses = ["EXPIRED"];
    retryJob(job.id);
    await settle();
    expect(getJob(job.id)!.state).toBe("done");
    expect(fake.containers).toHaveLength(2);
    expect(callsTo("threads_publish")[0].params.creation_id).toBe("c-2");
  });

  test("vidéo en traitement : la file publie le message suivant, puis reprend la vidéo d'après son état enregistré", async () => {
    const { account } = await connect();
    fake.nextStatuses.push(["IN_PROGRESS", "FINISHED"]);
    const video = enqueuePublish({ accountId: account.id, source: media("clip.mp4"), options: { text: "Clip" } });
    const message = enqueuePublish({ accountId: account.id, source: text("Pendant ce temps"), options: {} });
    await runPublishQueue();

    // La vidéo est partie chez Threads, sans attente dans la file : le message passe.
    expect(getJob(video.id)).toMatchObject({ state: "processing", note: expect.stringMatching(/Threads traite/) });
    expect(getJob(video.id)!.result).toBeUndefined();
    expect(getJob(message.id)!.state).toBe("done");
    expect(sleeps).toEqual([]);
    expect(fake.containers.map((container) => container.params.media_type)).toEqual(["VIDEO", "TEXT"]);

    // Première reprise : encore en cours, une minute de plus ; seconde : prête, publiée.
    await checkProcessingJobs({ all: true });
    const again = getJob(video.id)!;
    expect(again.state).toBe("processing");
    expect(Math.round((again.checkAt! - again.updatedAt) / 1000)).toBe(60);
    await checkProcessingJobs({ all: true });
    expect(getJob(video.id)).toMatchObject({ state: "done", result: { url: expect.stringMatching(/^https:\/\/www\.threads\.com\//) } });
    expect(callsTo("threads_publish").map((call) => call.params.creation_id)).toEqual(["c-2", "c-1"]);
    expect(fake.containers).toHaveLength(2);
  });

  test("annulée pendant le traitement chez Threads : rien n'est publié, le lien public est fermé", async () => {
    const { account } = await connect();
    fake.nextStatuses.push(["IN_PROGRESS"]);
    const job = enqueuePublish({ accountId: account.id, source: media("clip.mp4"), options: {} });
    await runPublishQueue();
    expect(getJob(job.id)!.state).toBe("processing");
    expect(cancelJob(job.id).state).toBe("cancelled");
    await checkProcessingJobs({ all: true });
    expect(callsTo("threads_publish")).toHaveLength(0);
    const url = fake.containers[0].params.video_url;
    expect(servePublicMedia(new Request(url), url.split("/media/")[1]).status).toBe(404);
  });

  test("limite de 250 publications atteinte chez Threads : le compte attend, aucun conteneur créé", async () => {
    const { account } = await connect();
    fake.quotaUsage = 250;
    const job = enqueuePublish({ accountId: account.id, source: text("Trop tôt"), options: {} });
    await settle();
    expect(getJob(job.id)).toMatchObject({ state: "waiting-quota" });
    expect(getJob(job.id)!.retryAt).toBeGreaterThan(Date.now());
    expect(fake.containers).toHaveLength(0);
  });

  test("jeton refusé en pleine publication : compte « à reconnecter », travail gardé en file", async () => {
    const { account } = await connect();
    fake.publishMode = "token-refused";
    const job = enqueuePublish({ accountId: account.id, source: text("Bonjour"), options: {} });
    await settle();
    expect(getJob(job.id)!.state).toBe("queued");
    expect(getAccountSummary(account.id)!.status).toBe("needs-reconnect");
  });
});

// ─── Options et limites ───────────────────────────────────────────

describe("options et limites", () => {
  test("message de plus de 500 caractères, émojis comptés en octets : refusé avant la file", async () => {
    const { account } = await connect();
    expect(() => enqueuePublish({ accountId: account.id, source: text(`${"a".repeat(497)}😀`), options: {} })).toThrow(/501 caractères\s:\s500 au plus/);
    expect(() => enqueuePublish({ accountId: account.id, source: text("a".repeat(500)), options: {} })).not.toThrow();
  });

  test("légende trop longue, plus de cinq liens, carrousel : refusés", () => {
    expect(() => normalizeThreadsOptions({ text: `${"a".repeat(497)}😀` }, media("clip.mp4"))).toThrow(/500 au plus/);
    const links = Array.from({ length: 5 }, (_, index) => `https://exemple.org/${index}`).join(" ");
    expect(() => normalizeThreadsOptions({ linkAttachment: "https://autre.org" }, text(links))).toThrow(/plus de 5 liens/);
    expect(() => normalizeThreadsOptions({ linkAttachment: "https://exemple.org/0" }, text(links))).not.toThrow();
    expect(() => normalizeThreadsOptions({ linkAttachment: "pas une adresse" }, text("Bonjour"))).toThrow(/Lien en aperçu invalide/);
    const carousel: PublishSource = { module: "m", id: "c", kind: "carousel", bytes: 0, items: [] };
    expect(() => normalizeThreadsOptions({}, carousel)).toThrow(/carrousel/);
  });

  test("comptage des liens comme Threads, sujet nettoyé", () => {
    expect(countLinks("www.facebook.com", "https://www.facebook.com")).toBe(1);
    expect(countLinks("www.instagram.com et www.threads.com.", "https://www.facebook.com")).toBe(3);
    expect(countLinks("www.example.com www.example.com www.test.com", "https://www.test.com/")).toBe(2);
    expect(sanitizeTopic("#Jeux.vidéo & co")).toBe("Jeuxvidéo co");
    expect(sanitizeTopic("  ")).toBeUndefined();
    expect(Array.from(sanitizeTopic("x".repeat(80))!)).toHaveLength(49);
  });

  test("champs propres au type de source, options d'un média sans lien en aperçu", () => {
    const options = normalizeThreadsOptions({ text: "Légende", linkAttachment: "https://exemple.org", spoiler: true }, media("photo.png"));
    expect(options).toEqual({ spoiler: true, text: "Légende" });
    const fields = Object.fromEntries(threadsConnector.publishFields!.map((field) => [field.key, field.sourceKinds]));
    expect(fields).toMatchObject({ text: ["image", "video"], linkAttachment: ["text"], altText: ["image", "video"], topicTag: undefined });
  });

  test("vidéo hors limites (plus de 5 minutes, plus de 1 920 px de large) : refusée avant la file", async () => {
    const { account } = await connect();
    expect(() => enqueuePublish({ accountId: account.id, source: media("clip.mp4", { durationMs: 301_000 }), options: {} })).toThrow(/5 min au plus/);
    expect(() => enqueuePublish({ accountId: account.id, source: media("clip.mp4", { width: 3840, height: 2160 }), options: {} })).toThrow(/trop grande/);
  });

  test("conversion JPEG : qualité réduite jusqu'à passer sous le poids demandé", async () => {
    const noisy = path.join(root, "module", "noise.png");
    await sharp(randomBytes(600 * 600 * 3), { raw: { width: 600, height: 600, channels: 3 } }).png().toFile(noisy);
    const output = path.join(root, "module", "noise.jpg");
    const best = await convertImageToJpeg(noisy, output, Number.POSITIVE_INFINITY);
    const size = await convertImageToJpeg(noisy, output, best - 1);
    expect(size).toBeLessThan(best);
    await expect(convertImageToJpeg(noisy, output, 10_000)).rejects.toThrow(/8 Mo au plus/);
  }, 30_000);
});

// ─── Gestion ──────────────────────────────────────────────────────

describe("gestion des publications", () => {
  test("liste paginée sans les republications, suppression comptée dans la limite du profil", async () => {
    const { account } = await connect();
    const stamp = (minutes: number) => new Date(realNow() - minutes * 60_000).toISOString().replace(/\.\d{3}Z$/, "+0000");
    fake.posts = [
      { id: "p1", media_type: "TEXT_POST", text: "Premier message\nsuite", timestamp: stamp(1), topic_tag: "Clips", shortcode: "a1", permalink: "https://www.threads.com/@karim.test/post/a1" },
      { id: "p2", media_type: "REPOST_FACADE", timestamp: stamp(2), shortcode: "a2" },
      ...Array.from({ length: 120 }, (_, index) => ({ id: `v${index}`, media_type: "VIDEO", timestamp: stamp(3 + index), shortcode: `b${index}` })),
    ];
    const { context } = accountContext(account.id);
    const posts = await threadsConnector.posts!.list(context);
    expect(posts).toHaveLength(100);
    expect(posts[0]).toMatchObject({ id: "p1", title: "Premier message", tags: ["Clips"], privacy: "public", url: "https://www.threads.com/@karim.test/post/a1" });
    expect(posts[0].publishedAt).toMatch(/Z$/);
    expect(posts.some((post) => post.id === "p2")).toBe(false);
    expect(posts[1]).toMatchObject({ title: "Vidéo", url: "https://www.threads.com" });

    await threadsConnector.posts!.remove!(context, "p1");
    expect(callsTo("/v1.0/p1", "DELETE")).toHaveLength(1);
    expect(fake.posts.some((post) => post.id === "p1")).toBe(false);
    expect(getAccountQuotaUsage(threadsConnector, account.id)!.buckets.find((bucket) => bucket.id === "deletes")!.used).toBe(1);
  });
});
