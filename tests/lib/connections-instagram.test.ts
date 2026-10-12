import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { setDataRoot } from "@/lib/connections/store";
import { getConnector, registerConnector } from "@/lib/connections/registry";
import { accountContext, completeAuthorization, getAccessToken, getAccountSummary, renewDueTokens } from "@/lib/connections/accounts";
import { cancelJob, checkProcessingJobs, configurePublishQueue, enqueuePublish, getJob, listJobs, retryJob, runPublishQueue } from "@/lib/connections/publish-queue";
import { getAccountQuotaUsage } from "@/lib/connections/quota";
import { servePublicMedia } from "@/lib/connections/public-media";
import type { Connector, PublishFileSource, PublishSource } from "@/lib/connections/types";
import { instagramConnector } from "@/lib/connections/connectors/instagram";
import { buildCaption, normalizeInstagramOptions, thumbOffsetFor } from "@/lib/connections/connectors/instagram/metadata";
import { MAX_WAIT_MS } from "@/lib/connections/connectors/instagram/publish";
import { authorize } from "./connections-fake-service";

/**
 * Faux Instagram : serveur OAuth (`api.instagram.com`), jetons longue durée
 * et API Graph (`graph.instagram.com`). Il « télécharge » les fichiers aux
 * adresses publiques de l'instance comme le ferait Meta. Aucun appel réel.
 */

const IG_ID = "17841400000000001";
const DAY = 24 * 3600_000;
const saved = { ...process.env };
const realFetch = globalThis.fetch;
const realNow = Date.now;
const planned = getConnector("instagram");

interface Container {
  id: string;
  form: Record<string, string>;
  /** États rendus aux lectures successives ; le dernier reste. */
  statuses: string[];
  published?: string;
}

interface FakeInstagram {
  calls: { method: string; path: string; query: Record<string, string>; form?: Record<string, string>; authorization?: string }[];
  permissions: string;
  refreshMode: "ok" | "refuse";
  usage: number;
  /** États des prochains conteneurs, dans l'ordre de création (sinon « FINISHED »). */
  nextStatuses: string[][];
  containers: Container[];
  media: { id: string; caption?: string; timestamp: string; permalink: string; container: string }[];
  /** Comportement de `media_publish` aux prochains appels. */
  publishModes: ("ok" | "limit" | "lost" | "crash" | "not-ready")[];
  /** Téléchargements faits aux adresses publiques : statut, type, octets. */
  downloads: { url: string; status: number; type: string | null; bytes: number; head: Buffer }[];
  rejectProductType: boolean;
  revoked: boolean;
  counter: number;
}

let root: string;
let ig: FakeInstagram;
let files: Record<string, string>;
let sleeps: number[];

const json = (body: unknown, status = 200) => new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const graphError = (code: number, subcode?: number, message = "Erreur simulée") =>
  json({ error: { message, type: "OAuthException", code, ...(subcode ? { error_subcode: subcode } : {}), fbtrace_id: "x" } }, 400);

/** Meta vient lire le fichier à l'adresse publique, comme `cURL`. */
async function download(url: string) {
  const token = url.split("/api/connections/media/")[1];
  const response = servePublicMedia(new Request(url), token ?? "");
  const body = Buffer.from(await response.arrayBuffer());
  ig.downloads.push({ url, status: response.status, type: response.headers.get("content-type"), bytes: body.length, head: body.subarray(0, 4) });
  return response.status;
}

function fakeInstagram(): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url);
    const method = (init?.method ?? "GET").toUpperCase();
    const authorization = new Headers(init?.headers).get("authorization") ?? undefined;
    const form = init?.body ? Object.fromEntries(new URLSearchParams(String(init.body))) : undefined;
    const query = Object.fromEntries(url.searchParams);
    ig.calls.push({ method, path: `${url.host}${url.pathname}`, query, form, authorization });

    if (url.host === "api.instagram.com" && url.pathname === "/oauth/access_token") {
      if (form?.code === "bad") return json({ error_type: "OAuthException", code: 400, error_message: "Matching code was not found or was already used" }, 400);
      // Identifiant de 17 chiffres rendu en nombre, dans un tableau `data`.
      return json(`{"data":[{"access_token":"short-1","user_id":${IG_ID},"permissions":"${ig.permissions}"}]}`);
    }
    if (url.host !== "graph.instagram.com") return json({ error: "not_found" }, 404);
    if (url.pathname === "/access_token") {
      return query.grant_type === "ig_exchange_token" && query.client_secret === "ig-secret"
        ? json({ access_token: `long-${query.access_token}`, token_type: "bearer", expires_in: 5183944 })
        : graphError(100);
    }
    if (url.pathname === "/refresh_access_token") {
      if (ig.refreshMode === "refuse") return graphError(190, undefined, "Error validating access token");
      ig.counter += 1;
      return json({ access_token: `long-r${ig.counter}`, token_type: "bearer", expires_in: 5183944 });
    }
    if (ig.revoked) return graphError(190, 463, "Session has expired");
    const parts = url.pathname.replace(/^\/v25\.0\//, "").split("/");

    if (parts[0] === "me") {
      // Rendu dans un tableau `data`, comme l'exemple de la documentation, `user_id` en nombre.
      return json(`{"data":[{"user_id":${IG_ID},"id":"999","username":"karim.clips","name":"Karim","account_type":"Media_Creator","profile_picture_url":"https://cdn.example/p.jpg"}]}`);
    }
    if (parts[0] === IG_ID && parts[1] === "content_publishing_limit") {
      return json({ data: [{ quota_usage: ig.usage, config: { quota_total: 50, quota_duration: 86400 } }] });
    }
    if (parts[0] === IG_ID && parts[1] === "media" && method === "POST") {
      ig.counter += 1;
      const id = `1789${String(ig.counter).padStart(13, "0")}`;
      const container: Container = { id, form: form ?? {}, statuses: ig.nextStatuses.shift() ?? ["FINISHED"] };
      ig.containers.push(container);
      for (const key of ["video_url", "image_url", "cover_url"]) if (form?.[key]) await download(form[key]);
      return json(`{"id":${id}}`);
    }
    if (parts[0] === IG_ID && parts[1] === "media") {
      if (ig.rejectProductType && query.fields?.includes("media_product_type")) return graphError(100, undefined, "Tried accessing nonexisting field (media_product_type)");
      const sorted = [...ig.media].reverse();
      const start = query.after ? Number(query.after) : 0;
      const page = sorted.slice(start, start + Number(query.limit ?? 25));
      const next = start + page.length < sorted.length;
      return json({
        data: page.map((entry) => ({
          id: entry.id,
          ...(query.fields?.includes("caption") && entry.caption !== undefined ? { caption: entry.caption } : {}),
          timestamp: entry.timestamp,
          permalink: entry.permalink,
          media_type: "VIDEO",
          ...(query.fields?.includes("media_product_type") ? { media_product_type: "REELS" } : {}),
          thumbnail_url: "https://cdn.example/t.jpg",
          like_count: 3,
          comments_count: 1,
        })),
        paging: { cursors: { after: String(start + page.length) }, ...(next ? { next: "https://graph.instagram.com/next" } : {}) },
      });
    }
    if (parts[0] === IG_ID && parts[1] === "media_publish") {
      const container = ig.containers.find((entry) => entry.id === form?.creation_id);
      if (!container) return graphError(24, 2207008);
      const mode = ig.publishModes.shift() ?? "ok";
      if (mode === "limit") return graphError(9, 2207042);
      if (mode === "not-ready") return graphError(9007, 2207027);
      ig.counter += 1;
      const id = `1792${String(ig.counter).padStart(13, "0")}`;
      container.published = id;
      container.statuses = ["PUBLISHED"];
      ig.media.push({ id, caption: container.form.caption ?? "", timestamp: new Date(Date.now()).toISOString().replace(/\.\d{3}Z$/, "+0000"), permalink: `https://www.instagram.com/reel/R${ig.counter}/`, container: container.id });
      if (mode === "lost") throw new TypeError("fetch failed");
      if (mode === "crash") return graphError(1, undefined, "Une erreur inattendue s’est produite.");
      return json(`{"id":${id}}`);
    }
    const container = ig.containers.find((entry) => entry.id === parts[0]);
    if (container && parts.length === 1) {
      const status = container.statuses.length > 1 ? container.statuses.shift()! : container.statuses[0];
      const [code, subcode] = status.split(":");
      return json({ id: container.id, status_code: code, ...(subcode ? { status: `Error: ${subcode}` } : {}) });
    }
    const media = ig.media.find((entry) => entry.id === parts[0]);
    if (media) return json({ id: media.id, permalink: media.permalink, shortcode: "R" });
    return graphError(100, 33, "Unsupported get request");
  }) as typeof fetch;
}

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "connections-ig-"));
  setDataRoot(path.join(root, "data"));
  delete process.env.CONNECTIONS_ENCRYPTION_KEY;
  process.env.AUTH_SECRET = "secret-de-test-assez-long-pour-hkdf";
  process.env.AUTH_URL = "https://sxm.example.org";
  process.env.INSTAGRAM_CLIENT_ID = "990602627938098";
  process.env.INSTAGRAM_CLIENT_SECRET = "ig-secret";
  ig = {
    calls: [],
    permissions: "instagram_business_basic,instagram_business_content_publish",
    refreshMode: "ok",
    usage: 0,
    nextStatuses: [],
    containers: [],
    media: [],
    publishModes: [],
    downloads: [],
    rejectProductType: false,
    revoked: false,
    counter: 0,
  };
  globalThis.fetch = fakeInstagram();
  registerConnector(instagramConnector);
  files = {};
  const dir = path.join(root, "module");
  fs.mkdirSync(dir, { recursive: true });
  files["clip.mp4"] = path.join(dir, "clip.mp4");
  fs.writeFileSync(files["clip.mp4"], randomBytes(4000));
  files["photo.png"] = path.join(dir, "photo.png");
  await sharp({ create: { width: 1080, height: 1350, channels: 4, background: { r: 200, g: 40, b: 90, alpha: 0.5 } } }).png().toFile(files["photo.png"]);
  files["wide.png"] = path.join(dir, "wide.png");
  await sharp({ create: { width: 2400, height: 1000, channels: 3, background: "#204080" } }).png().toFile(files["wide.png"]);
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
  if (planned) registerConnector(planned);
  setDataRoot(null);
  fs.rmSync(root, { recursive: true, force: true });
  for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
  Object.assign(process.env, saved);
});

const travel = (ms: number) => {
  const base = realNow();
  Date.now = () => base + ms;
};

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
  throw new Error("Les attentes chez Instagram ne finissent pas.");
}

async function connect() {
  const { accounts } = await completeAuthorization("instagram", "code-1", authorize("instagram").transaction);
  return accounts[0];
}

const reel = (overrides: Partial<PublishFileSource> = {}): PublishFileSource => ({
  module: "clip-studio",
  id: "exp-1",
  kind: "video",
  file: "clip.mp4",
  bytes: 4000,
  width: 1080,
  height: 1920,
  durationMs: 30_000,
  ...overrides,
});

const photo = (overrides: Partial<PublishFileSource> = {}): PublishFileSource => ({
  module: "gallery",
  id: "img-1",
  kind: "image",
  file: "photo.png",
  bytes: fs.statSync(files["photo.png"]).size,
  width: 1080,
  height: 1350,
  ...overrides,
});

const callsTo = (suffix: string, method?: string) => ig.calls.filter((call) => call.path.endsWith(suffix) && (!method || call.method === method));

describe("connexion d'un compte Instagram", () => {
  test("adresse d'autorisation : portées en virgules, `force_reauth`, sans PKCE", () => {
    const { url } = authorize("instagram");
    expect(url.origin + url.pathname).toBe("https://www.instagram.com/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("990602627938098");
    expect(url.searchParams.get("scope")).toBe("instagram_business_basic,instagram_business_content_publish");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("force_reauth")).toBe("true");
    expect(url.searchParams.get("redirect_uri")).toBe("https://sxm.example.org/api/connections/instagram/callback");
    expect(url.searchParams.has("code_challenge")).toBe(false);
  });

  test("code, puis jeton longue durée, identité lue sans perte sur l'identifiant de 17 chiffres", async () => {
    const account = await connect();
    const exchange = callsTo("api.instagram.com/oauth/access_token")[0];
    expect(exchange.method).toBe("POST");
    expect(exchange.form).toMatchObject({ grant_type: "authorization_code", code: "code-1", client_id: "990602627938098", client_secret: "ig-secret" });
    expect(exchange.form).not.toHaveProperty("code_verifier");
    const longLived = callsTo("graph.instagram.com/access_token")[0];
    expect(longLived.query).toMatchObject({ grant_type: "ig_exchange_token", access_token: "short-1" });
    expect(account).toMatchObject({
      externalId: IG_ID,
      name: "Karim",
      handle: "@karim.clips",
      url: "https://www.instagram.com/karim.clips/",
      tokenRenewal: "automatic",
      tokenState: "ok",
    });
    expect(account.capabilities.sort()).toEqual(["posts.list", "publish.image", "publish.video"]);
    expect(account.tokenExpiresAt! - Date.now()).toBeGreaterThan(59 * DAY);
    expect((await getAccessToken(account.id)).value).toBe("long-short-1");
    expect(callsTo("/v25.0/me")[0].authorization).toBe("Bearer long-short-1");
  });

  test("lecture seule : la publication reste grisée ; erreur d'échange lisible", async () => {
    ig.permissions = "instagram_business_basic";
    const account = await connect();
    expect(account.capabilities).toEqual(["posts.list"]);
    expect(() => enqueuePublish({ accountId: account.id, source: reel(), options: {} })).toThrow(/pas le droit/);
    await expect(completeAuthorization("instagram", "bad", authorize("instagram").transaction)).rejects.toThrow(/Matching code was not found/);
  });

  test("jeton prolongé par la tâche de fond à 30 jours de l'échéance, jamais avant 24 heures ; refus : à reconnecter", async () => {
    const account = await connect();
    travel(3600_000);
    await renewDueTokens();
    expect(callsTo("refresh_access_token")).toHaveLength(0);
    travel(31 * DAY);
    const result = await renewDueTokens();
    expect(result.renewed).toBe(1);
    expect(callsTo("refresh_access_token")[0].query).toMatchObject({ grant_type: "ig_refresh_token", access_token: "long-short-1" });
    expect((await getAccessToken(account.id)).value).toBe("long-r1");
    expect(getAccountSummary(account.id)!.tokenExpiresAt! - Date.now()).toBeGreaterThan(59 * DAY);
    // Deux mois plus tard sans instance démarrée : le jeton a expiré, Instagram refuse.
    ig.refreshMode = "refuse";
    travel(95 * DAY);
    await renewDueTokens();
    expect(getAccountSummary(account.id)).toMatchObject({ status: "needs-reconnect" });
  });

  test("description publique : pas de gestion, liens publics, une connexion = un compte", () => {
    const connector = getConnector("instagram") as Connector;
    expect(connector.status).toBe("ready");
    expect(connector.posts?.update).toBeUndefined();
    expect(connector.posts?.remove).toBeUndefined();
    expect(connector.fetchAccounts).toBeUndefined();
    expect(connector.app.disconnectHelp).toMatch(/applications et sites web/);
  });
});

describe("légende et options", () => {
  test("hashtags de la marque ajoutés en fin, sans doublon, comptés dans les 30", () => {
    expect(buildCaption("Nouveau clip #minecraft", ["Minecraft", "#survie", "jeu vidéo", ""])).toBe("Nouveau clip #minecraft\n\n#survie #jeuvidéo");
    const many = Array.from({ length: 40 }, (_, index) => `tag${index}`);
    expect((buildCaption("Texte #a #b", many).match(/#/g) ?? []).length).toBe(30);
    expect(() => buildCaption(Array.from({ length: 31 }, (_, index) => `#t${index}`).join(" "), [])).toThrow(/31 hashtags/);
    expect(() => buildCaption(Array.from({ length: 21 }, (_, index) => `@u${index}`).join(" "), [])).toThrow(/21 mentions/);
  });

  test("légende trop longue : texte coupé avant les hashtags, jamais au milieu d'un hashtag", () => {
    const caption = buildCaption(`${"a".repeat(2190)} #coupe`, ["fin"]);
    expect(Array.from(caption).length).toBeLessThanOrEqual(2200);
    expect(caption.endsWith("#fin")).toBe(true);
    expect(caption).not.toMatch(/#co…/);
  });

  test("couverture bornée à la durée ; champs ignorés selon le type ; normalisation stable", () => {
    expect(thumbOffsetFor("start", 30_000)).toBe(0);
    expect(thumbOffsetFor("middle", 30_000)).toBe(15_000);
    expect(thumbOffsetFor("end", 30_000)).toBe(29_000);
    expect(thumbOffsetFor("end", 500)).toBe(0);
    const options = normalizeInstagramOptions({ caption: "Salut", hashtags: ["clip"], cover: "custom", altText: "x", trial: "manual" }, reel());
    expect(options).toMatchObject({ caption: "Salut\n\n#clip", cover: "start", thumbOffsetMs: 0, trial: "manual", shareToFeed: true });
    expect(options.altText).toBeUndefined();
    expect(normalizeInstagramOptions(options, reel())).toEqual(options);
    const image = normalizeInstagramOptions({ caption: "Photo", altText: "Un  chat\nnoir", trial: "auto", shareToFeed: true }, photo());
    expect(image).toMatchObject({ altText: "Un chat noir", trial: "none", shareToFeed: false });
  });
});

describe("publication d'un Reel", () => {
  test("limite relue, conteneur avec lien public, attente du traitement, publication, liens fermés", async () => {
    const account = await connect();
    ig.nextStatuses = [["IN_PROGRESS", "IN_PROGRESS", "FINISHED"]];
    const job = enqueuePublish({ accountId: account.id, source: reel(), options: { caption: "Mon clip", hashtags: ["minecraft"], aiGenerated: true, trial: "auto" } });
    await settle();
    expect(getJob(job.id)).toMatchObject({ state: "done", result: { externalId: expect.stringMatching(/^1792\d{13}$/), url: expect.stringMatching(/^https:\/\/www\.instagram\.com\/reel\//) } });
    expect(callsTo("content_publishing_limit")).toHaveLength(1);
    const [container] = ig.containers;
    expect(container.form).toMatchObject({
      media_type: "REELS",
      caption: "Mon clip\n\n#minecraft",
      share_to_feed: "true",
      thumb_offset: "0",
      is_ai_generated: "true",
      trial_params: JSON.stringify({ graduation_strategy: "SS_PERFORMANCE" }),
    });
    expect(container.form.video_url).toMatch(/^https:\/\/sxm\.example\.org\/api\/connections\/media\/[A-Za-z0-9_-]+\.mp4$/);
    expect(ig.downloads[0]).toMatchObject({ status: 200, type: "video/mp4", bytes: 4000 });
    expect(sleeps).toEqual([30_000, 60_000]);
    expect(callsTo("media_publish")[0].form).toEqual({ creation_id: container.id });
    expect(getJob(job.id)!.bytesSent).toBe(4000);
    // Le lien est fermé : Meta ne peut plus lire le fichier.
    expect(await download(container.form.video_url)).toBe(404);
    const usage = getAccountQuotaUsage(instagramConnector, account.id)!;
    expect(Object.fromEntries(usage.buckets.map((bucket) => [bucket.id, bucket.used]))).toEqual({ posts: 1, containers: 1 });
  });

  test("traitement chez Instagram : la file rend la main, publie le suivant, puis reprend à l'heure dite", async () => {
    const account = await connect();
    ig.nextStatuses = [["IN_PROGRESS", "IN_PROGRESS", "FINISHED"]];
    const first = enqueuePublish({ accountId: account.id, source: reel(), options: { caption: "Premier" } });
    const second = enqueuePublish({ accountId: account.id, source: photo(), options: { caption: "Second" } });
    await runPublishQueue();

    // Le Reel attend chez Instagram, sans résultat ni attente dans la file ; l'image passe.
    const waiting = getJob(first.id)!;
    expect(waiting).toMatchObject({ state: "processing", note: expect.stringMatching(/Instagram traite/) });
    expect(waiting.result).toBeUndefined();
    expect(Math.round((waiting.checkAt! - waiting.updatedAt) / 1000)).toBe(30);
    expect(getJob(second.id)).toMatchObject({ state: "done", result: { url: expect.stringMatching(/^https:\/\/www\.instagram\.com\//) } });
    expect(sleeps).toEqual([]);
    const container = ig.containers[0];
    const reads = () => callsTo(container.id, "GET").length;
    expect(reads()).toBe(1);

    // Pas encore l'heure : rien ne bouge.
    await checkProcessingJobs();
    expect(reads()).toBe(1);

    // À l'heure : nouvelle lecture, encore en cours, prochaine dans une minute.
    travel(31_000);
    await checkProcessingJobs();
    expect(reads()).toBe(2);
    const again = getJob(first.id)!;
    expect(again.state).toBe("processing");
    expect(Math.round((again.checkAt! - again.updatedAt) / 1000)).toBe(60);

    travel(92_000);
    await checkProcessingJobs();
    expect(getJob(first.id)).toMatchObject({ state: "done", result: { url: expect.stringMatching(/^https:\/\/www\.instagram\.com\/reel\//) } });
    expect(callsTo("media_publish")).toHaveLength(2);
    expect(await download(container.form.video_url)).toBe(404);
  });

  test("annulé pendant le traitement chez Instagram : rien n'est publié, le lien public est fermé", async () => {
    const account = await connect();
    ig.nextStatuses = [["IN_PROGRESS"]];
    const job = enqueuePublish({ accountId: account.id, source: reel(), options: {} });
    await runPublishQueue();
    expect(getJob(job.id)!.state).toBe("processing");
    expect(cancelJob(job.id).state).toBe("cancelled");
    await checkProcessingJobs({ all: true });
    expect(getJob(job.id)!.state).toBe("cancelled");
    expect(callsTo("media_publish")).toHaveLength(0);
    expect(await download(ig.containers[0].form.video_url)).toBe(404);
  });

  test("couverture : ses propres limites (JPEG 9:16, 8 Mio), pas celles d'une image publiée", async () => {
    const account = await connect();
    const cover = (overrides: Record<string, unknown> = {}) =>
      reel({ cover: { id: "cov-1", kind: "image", file: "cover.jpg", bytes: 200_000, width: 1080, height: 1920, ...overrides } });
    // Hors du 4:5 à 1,91:1 d'une image, mais attendue d'une couverture de Reel.
    expect(() => enqueuePublish({ accountId: account.id, source: cover(), options: { cover: "custom" } })).not.toThrow();
    expect(() => enqueuePublish({ accountId: account.id, source: cover({ width: 1080, height: 1350 }), options: {} })).toThrow(/Couverture.*format accepté 9:16/);
    // PNG et WebP sont convertis en JPEG avant l'envoi : acceptés ; un GIF ne l'est pas.
    expect(() => enqueuePublish({ accountId: account.id, source: cover({ file: "cover.png" }), options: {} })).not.toThrow();
    expect(() => enqueuePublish({ accountId: account.id, source: cover({ file: "cover.gif" }), options: {} })).toThrow(/Couverture/);
    expect(() => enqueuePublish({ accountId: account.id, source: cover({ bytes: 40 * 1024 * 1024 }), options: {} })).toThrow(/Couverture.*Mo au plus/);
  });

  test("hors limites : refusé avant d'entrer dans la file", async () => {
    const account = await connect();
    expect(() => enqueuePublish({ accountId: account.id, source: reel({ durationMs: 2000 }), options: {} })).toThrow(/3 s au moins/);
    expect(() => enqueuePublish({ accountId: account.id, source: reel({ durationMs: 16 * 60_000 }), options: {} })).toThrow(/15 min au plus/);
    expect(() => enqueuePublish({ accountId: account.id, source: reel({ file: "clip.webm" }), options: {} })).toThrow(/WebM/);
  });

  test("erreur passagère (téléchargement impossible) : nouveau conteneur ; erreur de format : échec expliqué", async () => {
    const account = await connect();
    ig.nextStatuses = [["ERROR:2207052"], ["FINISHED"]];
    const first = enqueuePublish({ accountId: account.id, source: reel(), options: {} });
    await settle();
    expect(getJob(first.id)?.state).toBe("done");
    expect(ig.containers).toHaveLength(2);
    expect(ig.downloads.map((entry) => entry.status)).toEqual([200, 200]);

    ig.nextStatuses = [["ERROR:2207026"]];
    const second = enqueuePublish({ accountId: account.id, source: reel(), options: {} });
    await settle();
    expect(getJob(second.id)).toMatchObject({ state: "failed", error: expect.stringMatching(/Format vidéo refusé/) });
  });

  test("limite du compte : lue chez Instagram avant tout conteneur, ou annoncée par `media_publish`", async () => {
    const account = await connect();
    ig.usage = 50;
    const blocked = enqueuePublish({ accountId: account.id, source: reel(), options: {} });
    await settle();
    expect(getJob(blocked.id)).toMatchObject({ state: "waiting-quota", error: expect.stringMatching(/50\/50/) });
    expect(ig.containers).toHaveLength(0);

    ig.usage = 0;
    ig.publishModes = ["limit"];
    travel(2 * 3600_000);
    await settle();
    expect(getJob(blocked.id)).toMatchObject({ state: "waiting-quota", error: expect.stringMatching(/limite de publications/) });
  });

  test("réponse de `media_publish` perdue : l'état relu, le média retrouvé, rien n'est republié", async () => {
    const account = await connect();
    ig.publishModes = ["lost"];
    const job = enqueuePublish({ accountId: account.id, source: reel(), options: { caption: "Une seule fois" } });
    await settle();
    expect(getJob(job.id)).toMatchObject({ state: "done", result: { externalId: ig.media[0].id, url: ig.media[0].permalink } });
    expect(callsTo("media_publish")).toHaveLength(1);
    expect(ig.media).toHaveLength(1);
  });

  test("échec après publication : au passage suivant, `findExisting` retrouve le média sans republier", async () => {
    const account = await connect();
    ig.publishModes = ["crash"];
    const job = enqueuePublish({ accountId: account.id, source: reel(), options: { caption: "Retrouvée" } });
    await settle();
    expect(getJob(job.id)?.state).toBe("failed");
    retryJob(job.id);
    await settle();
    expect(getJob(job.id)).toMatchObject({ state: "done", attempts: 2, result: { externalId: ig.media[0].id }, warning: expect.stringMatching(/retrouvée/) });
    expect(callsTo("media_publish")).toHaveLength(1);
  });

  test("« pas encore prêt » : attente puis publication du même conteneur", async () => {
    const account = await connect();
    ig.publishModes = ["not-ready", "ok"];
    const job = enqueuePublish({ accountId: account.id, source: reel(), options: {} });
    await settle();
    expect(getJob(job.id)?.state).toBe("done");
    expect(ig.containers).toHaveLength(1);
    expect(callsTo("media_publish")).toHaveLength(2);
  });

  test("traitement trop long : échec sans perdre le conteneur ; « Réessayer » publie le même", async () => {
    const account = await connect();
    ig.nextStatuses = [["IN_PROGRESS"]];
    const job = enqueuePublish({ accountId: account.id, source: reel(), options: {} });
    await settle();
    expect(getJob(job.id)).toMatchObject({ state: "failed", error: expect.stringMatching(/Réessayer/) });
    expect(sleeps.reduce((sum, ms) => sum + ms, 0)).toBeGreaterThanOrEqual(MAX_WAIT_MS);
    ig.containers[0].statuses = ["FINISHED"];
    retryJob(job.id);
    await settle();
    expect(getJob(job.id)?.state).toBe("done");
    expect(ig.containers).toHaveLength(1);
  });

  test("jeton refusé en pleine publication : compte « à reconnecter », travail suspendu", async () => {
    const account = await connect();
    ig.revoked = true;
    const job = enqueuePublish({ accountId: account.id, source: reel(), options: {} });
    await settle();
    expect(getAccountSummary(account.id)).toMatchObject({ status: "needs-reconnect", statusReason: expect.stringMatching(/code 190/) });
    expect(getJob(job.id)?.state).toBe("queued");
  });
});

describe("publication d'une image et d'un carrousel", () => {
  test("PNG converti en JPEG, servi par son propre lien, texte alternatif envoyé", async () => {
    const account = await connect();
    const job = enqueuePublish({ accountId: account.id, source: photo(), options: { caption: "Une capture", altText: "Une capture d’écran" } });
    await settle();
    expect(getJob(job.id)?.state).toBe("done");
    const [container] = ig.containers;
    expect(container.form).toMatchObject({ caption: "Une capture", alt_text: "Une capture d’écran" });
    expect(container.form.image_url).toMatch(/\.jpg$/);
    expect(container.form).not.toHaveProperty("media_type");
    expect(ig.downloads[0]).toMatchObject({ status: 200, type: "image/jpeg" });
    expect([...ig.downloads[0].head.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
  });

  test("rapport hors de 4:5 à 1,91:1 : refusé dans la file, ou par la conversion si les dimensions manquent", async () => {
    const account = await connect();
    const wide = photo({ file: "wide.png", bytes: fs.statSync(files["wide.png"]).size, width: 2400, height: 1000 });
    expect(() => enqueuePublish({ accountId: account.id, source: wide, options: {} })).toThrow(/2400 × 1000/);
    const job = enqueuePublish({ accountId: account.id, source: { ...wide, width: undefined, height: undefined }, options: {} });
    await settle();
    expect(getJob(job.id)).toMatchObject({ state: "failed", error: expect.stringMatching(/de 4:5 à 1,91:1/) });
    expect(ig.containers).toHaveLength(0);
  });

  test("carrousel : un conteneur par élément, légende sur le parent seulement", async () => {
    const account = await connect();
    const source: PublishSource = {
      module: "gallery",
      id: "car-1",
      kind: "carousel",
      bytes: 8000,
      items: [
        { id: "img-1", kind: "image", file: "photo.png", bytes: 4000, width: 1080, height: 1350 },
        { id: "exp-1", kind: "video", file: "clip.mp4", bytes: 4000, width: 1080, height: 1920, durationMs: 10_000 },
      ],
    };
    const job = enqueuePublish({ accountId: account.id, source, options: { caption: "Deux en un", aiGenerated: true } });
    await settle();
    expect(getJob(job.id)?.state).toBe("done");
    const [image, video, parent] = ig.containers;
    expect(image.form).toMatchObject({ is_carousel_item: "true" });
    expect(image.form.image_url).toMatch(/\.jpg$/);
    expect(video.form).toMatchObject({ media_type: "VIDEO", is_carousel_item: "true" });
    expect(image.form).not.toHaveProperty("caption");
    expect(parent.form).toEqual({ media_type: "CAROUSEL", children: `${image.id},${video.id}`, caption: "Deux en un", is_ai_generated: "true" });
  });
});

describe("liste des publications", () => {
  test("correspondance, pages par curseur, repli quand un champ est refusé", async () => {
    const account = await connect();
    for (let index = 1; index <= 60; index += 1) {
      ig.media.push({ id: `1792000000000${String(index).padStart(4, "0")}`, caption: `Clip ${index}\nsuite #mc`, timestamp: "2026-10-12T08:00:00+0000", permalink: `https://www.instagram.com/reel/P${index}/`, container: "" });
    }
    ig.rejectProductType = true;
    const posts = await instagramConnector.posts!.list(accountContext(account.id).context);
    expect(posts).toHaveLength(60);
    expect(posts[0]).toMatchObject({
      id: "17920000000000060",
      title: "Clip 60",
      description: "Clip 60\nsuite #mc",
      tags: ["mc"],
      url: "https://www.instagram.com/reel/P60/",
      privacy: "public",
      publishedAt: "2026-10-12T08:00:00.000Z",
      thumbnailUrl: "https://cdn.example/t.jpg",
    });
    expect(callsTo(`${IG_ID}/media`, "GET").map((call) => call.query.after ?? "")).toEqual(["", "", "50"]);
  });
});
