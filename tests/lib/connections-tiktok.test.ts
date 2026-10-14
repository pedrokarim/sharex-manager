/**
 * Connecteur TikTok (dossier 07e) contre un faux serveur TikTok : aucun
 * appel réel. Le faux serveur suit les formes de la documentation (Login
 * Kit pour le Web, jetons, Content Posting API, transfert en morceaux,
 * statut, erreurs `{ data, error: { code } }`).
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { setDataRoot } from "@/lib/connections/store";
import { describeConnector, registerConnector } from "@/lib/connections/registry";
import { accountContext, completeAuthorization, disconnectAccount, getAccessToken, renewDueTokens } from "@/lib/connections/accounts";
import { getAppStatus, saveAppConfig } from "@/lib/connections/apps";
import { checkProcessingJobs, configurePublishQueue, enqueuePublish, getJob, listJobs, runPublishQueue } from "@/lib/connections/publish-queue";
import { accountPublishForm } from "@/lib/connections/manage";
import { QuotaExceededError } from "@/lib/connections/errors";
import { tiktokConnector } from "@/lib/connections/connectors/tiktok";
import { INBOX_NOTE } from "@/lib/connections/connectors/tiktok/options";
import { CHUNK_BYTES, chunkRange, planChunks } from "@/lib/connections/connectors/tiktok/publish";
import { defaultFieldValue, fieldProblem, ruleProblems, visibleValues } from "@/components/connections/publish-field-input";
import type { PublishField, PublishFileSource } from "@/lib/connections/types";
import { authorize } from "./connections-fake-service";

const MB = 1024 * 1024;
const OPEN_ID = "-000OZcoWbYt0LTwlLNHVM7zCTNn-pPnIAvy";
const UPLOAD_HOST = "open-upload.tiktokapis.com";

// ─── Faux serveur TikTok ──────────────────────────────────────────

interface FakeUpload {
  publishId: string;
  kind: "inbox" | "direct";
  body: Record<string, unknown>;
  /** Morceaux reçus, dans l'ordre (`Content-Range`, taille du corps). */
  chunks: { range: string; length: number; contentLength: string | null; contentType: string | null }[];
  received: number;
  total: number;
  /** États rendus aux lectures successives ; le dernier se répète. */
  statuses: { status: string; fail_reason?: string; publicaly_available_post_id?: string[] }[];
}

interface FakeTiktok {
  calls: { method: string; path: string; params: Record<string, string>; json?: Record<string, unknown> }[];
  /** Portées rendues par l'échange du code. */
  scope: string;
  /** Les champs de `user.info.profile` sont-ils accordés ? */
  profileGranted: boolean;
  creatorInfo: Record<string, unknown>;
  /** Code d'erreur rendu par la prochaine initialisation (avec son statut HTTP). */
  nextInitError?: { status: number; code: string };
  /** États des prochains envois. */
  nextStatuses: FakeUpload["statuses"][];
  uploads: FakeUpload[];
  revoked: Record<string, string>[];
  counter: number;
}

function createFake(): FakeTiktok {
  return {
    calls: [],
    scope: "user.info.basic,user.info.profile,video.upload,video.publish,video.list",
    profileGranted: true,
    creatorInfo: {
      creator_avatar_url: "https://p16.tiktokcdn.example/avatar.jpeg",
      creator_username: "karim.test",
      creator_nickname: "Karim Test",
      privacy_level_options: ["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "SELF_ONLY"],
      comment_disabled: false,
      duet_disabled: true,
      stitch_disabled: false,
      max_video_post_duration_sec: 300,
    },
    nextStatuses: [],
    uploads: [],
    revoked: [],
    counter: 0,
  };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
// Les grands identifiants (int64) partent en nombres, comme chez TikTok : `__ID__` est remplacé par ses chiffres.
const ok = (data: unknown) =>
  new Response(JSON.stringify({ data, error: { code: "ok", message: "", log_id: "log-1" } }).replace(/"__ID__(\d+)"/g, "$1"), { status: 200, headers: { "Content-Type": "application/json" } });
const apiError = (status: number, code: string, message = "") => json({ data: {}, error: { code, message, log_id: "log-2" } }, status);

function fakeTiktokFetch(fake: FakeTiktok): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url);
    const method = (init?.method ?? "GET").toUpperCase();
    const headers = new Headers(init?.headers);
    const form = headers.get("content-type")?.startsWith("application/x-www-form-urlencoded");
    const params: Record<string, string> = Object.fromEntries(form ? new URLSearchParams(String(init?.body ?? "")) : url.searchParams);
    const body = headers.get("content-type")?.startsWith("application/json") && typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : undefined;
    fake.calls.push({ method, path: `${url.host}${url.pathname}`, params, ...(body ? { json: body } : {}) });

    if (url.host === UPLOAD_HOST) {
      const upload = fake.uploads.find((entry) => entry.publishId === url.searchParams.get("upload_id"));
      if (!upload) return new Response(null, { status: 404 });
      const range = headers.get("content-range") ?? "";
      const match = range.match(/^bytes (\d+)-(\d+)\/(\d+)$/);
      const length = (init?.body as Uint8Array).byteLength;
      if (!match || Number(match[1]) !== upload.received || Number(match[2]) - Number(match[1]) + 1 !== length) return new Response(null, { status: 416 });
      upload.chunks.push({ range, length, contentLength: headers.get("content-length"), contentType: headers.get("content-type") });
      upload.received += length;
      return new Response(null, { status: upload.received >= upload.total ? 201 : 206 });
    }
    if (url.host !== "open.tiktokapis.com") return json({ error: "not_found" }, 404);

    if (url.pathname === "/v2/oauth/token/") {
      if (params.client_key !== "tiktok-key" || params.client_secret !== "tiktok-secret") return json({ error: "invalid_client", error_description: "Client key or secret is incorrect.", log_id: "l" }, 401);
      fake.counter += 1;
      if (params.grant_type === "authorization_code") {
        if (params.code !== "code-1") return json({ error: "invalid_grant", error_description: "Authorization code is expired.", log_id: "l" }, 400);
        return json({ access_token: "act.1", expires_in: 86400, open_id: OPEN_ID, refresh_expires_in: 31536000, refresh_token: "rft.1", scope: fake.scope, token_type: "Bearer" });
      }
      if (params.grant_type === "refresh_token") {
        if (!params.refresh_token?.startsWith("rft.")) return json({ error: "invalid_grant", error_description: "Refresh token is invalid.", log_id: "l" }, 400);
        return json({ access_token: `act.r${fake.counter}`, expires_in: 86400, open_id: OPEN_ID, refresh_expires_in: 31536000, refresh_token: `rft.r${fake.counter}`, scope: fake.scope, token_type: "Bearer" });
      }
    }
    if (url.pathname === "/v2/oauth/revoke/") {
      fake.revoked.push(params);
      return new Response(null, { status: 200 });
    }

    const auth = headers.get("authorization") ?? "";
    if (!auth.startsWith("Bearer act.")) return apiError(401, "access_token_invalid", "The access token is invalid or not found in the request.");

    if (url.pathname === "/v2/user/info/" && method === "GET") {
      const fields = (params.fields ?? "").split(",");
      if (fields.includes("username") && !fake.profileGranted) return apiError(401, "scope_not_authorized", "The user did not authorize the scope required for completing this request.");
      const user: Record<string, unknown> = { open_id: OPEN_ID, union_id: "union-1", avatar_url: "https://p16.tiktokcdn.example/a.jpeg", display_name: "Karim Test", username: "karim.test", bio_description: "Des clips", profile_deep_link: "https://vm.tiktok.example/x" };
      return ok({ user: Object.fromEntries(Object.entries(user).filter(([key]) => fields.includes(key))) });
    }
    if (url.pathname === "/v2/post/publish/creator_info/query/") return ok(fake.creatorInfo);
    if (url.pathname === "/v2/post/publish/inbox/video/init/" || url.pathname === "/v2/post/publish/video/init/") {
      if (fake.nextInitError) {
        const error = fake.nextInitError;
        fake.nextInitError = undefined;
        return apiError(error.status, error.code);
      }
      fake.counter += 1;
      const source = (body?.source_info ?? {}) as Record<string, number>;
      const publishId = `v_inbox_file~v2.${fake.counter}`;
      fake.uploads.push({
        publishId,
        kind: url.pathname.includes("inbox") ? "inbox" : "direct",
        body: body ?? {},
        chunks: [],
        received: 0,
        total: source.video_size,
        statuses: fake.nextStatuses.shift() ?? [{ status: url.pathname.includes("inbox") ? "SEND_TO_USER_INBOX" : "PUBLISH_COMPLETE" }],
      });
      return ok({ publish_id: publishId, upload_url: `https://${UPLOAD_HOST}/upload/?upload_id=${encodeURIComponent(publishId)}&upload_token=tok` });
    }
    if (url.pathname === "/v2/post/publish/status/fetch/") {
      const upload = fake.uploads.find((entry) => entry.publishId === body?.publish_id);
      if (!upload) return apiError(400, "invalid_publish_id");
      const status = upload.statuses.length > 1 ? upload.statuses.shift()! : upload.statuses[0];
      return ok({ ...status, uploaded_bytes: upload.received });
    }
    if (url.pathname === "/v2/video/list/") {
      return ok({
        videos: [{ id: "__ID__7300000000000000001", title: "", video_description: "Premier clip #montage\nsuite", cover_image_url: "https://p16.tiktokcdn.example/c.jpeg", share_url: "https://www.tiktok.com/@karim.test/video/7300000000000000001", create_time: 1_790_000_000, view_count: 42, like_count: 3, comment_count: 1 }],
        cursor: 0,
        has_more: false,
      });
    }
    return apiError(404, "not_found");
  }) as typeof fetch;
}

// ─── Préparation ──────────────────────────────────────────────────

const saved = { ...process.env };
const realFetch = globalThis.fetch;
const realNow = Date.now;
let root: string;
let fake: FakeTiktok;
let files: Record<string, string>;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "connections-tiktok-"));
  setDataRoot(path.join(root, "data"));
  delete process.env.CONNECTIONS_ENCRYPTION_KEY;
  process.env.AUTH_SECRET = "secret-de-test-assez-long-pour-hkdf";
  process.env.AUTH_URL = "https://sxm.example.org";
  process.env.TIKTOK_CLIENT_KEY = "tiktok-key";
  process.env.TIKTOK_CLIENT_SECRET = "tiktok-secret";
  fake = createFake();
  globalThis.fetch = fakeTiktokFetch(fake);
  registerConnector(tiktokConnector);
  files = {};
  fs.mkdirSync(path.join(root, "module"), { recursive: true });
  // Petit fichier : un seul morceau. Gros fichier : deux morceaux, le dernier gardant le reste.
  files["small.mp4"] = path.join(root, "module", "small.mp4");
  fs.writeFileSync(files["small.mp4"], Buffer.alloc(3 * MB, 1));
  files["big.mp4"] = path.join(root, "module", "big.mp4");
  fs.writeFileSync(files["big.mp4"], Buffer.alloc(CHUNK_BYTES * 2 + 3 * MB, 2));
  configurePublishQueue({
    autoRun: false,
    resolveSource: async (ref) => {
      if (!ref.file || !files[ref.file]) throw new Error("introuvable");
      return files[ref.file];
    },
    sleep: async () => {},
  });
});

afterEach(() => {
  Date.now = realNow;
  configurePublishQueue({ autoRun: true, resolveSource: null, sleep: null });
  globalThis.fetch = realFetch;
  setDataRoot(null);
  fs.rmSync(root, { recursive: true, force: true });
  for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
  Object.assign(process.env, saved);
});

/** Fait tourner la file, puis reprend chaque travail « en traitement » sans attendre son heure. */
async function settle() {
  await runPublishQueue();
  for (let round = 0; round < 100; round += 1) {
    if (listJobs().every((job) => !(job.state === "processing" && !job.result))) return;
    await checkProcessingJobs({ all: true });
  }
  throw new Error("Les attentes chez TikTok ne finissent pas.");
}

async function connect() {
  const { url, transaction } = authorize("tiktok");
  const { accounts } = await completeAuthorization("tiktok", "code-1", transaction);
  return { account: accounts[0], url };
}

const video = (file: string, overrides: Partial<PublishFileSource> = {}): PublishFileSource => ({
  module: "fake-module",
  id: `exp-${file}`,
  kind: "video",
  file,
  bytes: fs.statSync(files[file]).size,
  width: 1080,
  height: 1920,
  durationMs: 30_000,
  mimeType: "video/mp4",
  ...overrides,
});
const callsTo = (suffix: string) => fake.calls.filter((call) => call.path.endsWith(suffix));
const audit = () => saveAppConfig("tiktok", { settings: { audited: "true" } });
const directOptions = { mode: "direct", privacy: "PUBLIC_TO_EVERYONE", consent: true, caption: "Nouveau clip #montage", allowComment: true, allowDuet: true };

// ─── Connexion et jetons ──────────────────────────────────────────

describe("connexion d'un compte TikTok", () => {
  test("Login Kit pour le Web : client_key, portées séparées par des virgules, sans PKCE ; échange du code et profil", async () => {
    const { account, url } = await connect();
    expect(url.origin + url.pathname).toBe("https://www.tiktok.com/v2/auth/authorize/");
    expect(url.searchParams.get("client_key")).toBe("tiktok-key");
    expect(url.searchParams.has("client_id")).toBe(false);
    expect(url.searchParams.get("scope")).toBe("user.info.basic,user.info.profile,video.upload,video.publish,video.list");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("redirect_uri")).toBe("https://sxm.example.org/api/connections/tiktok/callback");
    expect(url.searchParams.has("code_challenge")).toBe(false);

    const exchange = callsTo("/v2/oauth/token/")[0];
    expect(exchange.method).toBe("POST");
    expect(exchange.params).toEqual({
      grant_type: "authorization_code",
      code: "code-1",
      redirect_uri: "https://sxm.example.org/api/connections/tiktok/callback",
      client_key: "tiktok-key",
      client_secret: "tiktok-secret",
    });
    expect(account).toMatchObject({
      externalId: OPEN_ID,
      name: "Karim Test",
      handle: "@karim.test",
      url: "https://www.tiktok.com/@karim.test",
      avatarUrl: "https://p16.tiktokcdn.example/a.jpeg",
      tokenRenewal: "automatic",
    });
    expect(account.capabilities.sort()).toEqual(["posts.list", "publish.video"]);
    expect(account.tokenExpiresAt! - Date.now()).toBeGreaterThan(23 * 3600_000);
  });

  test("profil sans user.info.profile : la connexion passe, sans pseudo", async () => {
    fake.profileGranted = false;
    fake.scope = "user.info.basic,video.upload";
    const { account } = await connect();
    expect(account).toMatchObject({ externalId: OPEN_ID, name: "Karim Test", capabilities: ["publish.video"] });
    expect(account.handle).toBeUndefined();
  });

  test("renouvellement par le jeton d'actualisation (qui change), puis révocation à la déconnexion", async () => {
    const { account } = await connect();
    const start = realNow();
    Date.now = () => start + 23 * 3600_000;
    expect((await renewDueTokens()).renewed).toBe(1);
    const refresh = callsTo("/v2/oauth/token/").find((call) => call.params.grant_type === "refresh_token")!;
    expect(refresh.params).toMatchObject({ client_key: "tiktok-key", client_secret: "tiktok-secret", refresh_token: "rft.1" });
    expect((await getAccessToken(account.id)).value).toBe("act.r2");

    Date.now = () => start + 46 * 3600_000;
    await renewDueTokens();
    // Le nouveau jeton d'actualisation rendu par TikTok a remplacé l'ancien.
    expect(callsTo("/v2/oauth/token/").filter((call) => call.params.grant_type === "refresh_token")[1].params.refresh_token).toBe("rft.r2");

    const result = await disconnectAccount(account.id);
    expect(result.revoked).toBe(true);
    expect(fake.revoked[0]).toEqual({ client_key: "tiktok-key", client_secret: "tiktok-secret", token: "act.r3" });
  });

  test("description publique, variables TIKTOK_CLIENT_KEY et réglage « Application auditée »", () => {
    const info = describeConnector(tiktokConnector);
    expect(info).toMatchObject({ status: "ready", logo: "tiktok", livePublishForm: true, postActions: { update: false, remove: false } });
    expect(info.profileFields?.every((field) => !field.editable && field.manual)).toBe(true);
    const app = getAppStatus(tiktokConnector);
    expect(app).toMatchObject({ configured: true, source: "env", envNames: { clientId: "TIKTOK_CLIENT_KEY", clientSecret: "TIKTOK_CLIENT_SECRET" }, credentialLabels: { clientId: "Client key" } });
    expect(app.settings).toEqual([expect.objectContaining({ key: "audited", kind: "toggle", source: null })]);
    expect(audit().settings[0]).toMatchObject({ value: "true", source: "file" });
    expect(saveAppConfig("tiktok", { settings: { audited: "" } }).settings[0].source).toBeNull();
  });
});

// ─── Envoi en morceaux ────────────────────────────────────────────

describe("découpage en morceaux", () => {
  test("un seul morceau jusqu'à la taille choisie, sinon des morceaux égaux et un dernier plus grand", () => {
    expect(planChunks(3 * MB)).toEqual({ chunkSize: 3 * MB, count: 1 });
    expect(planChunks(CHUNK_BYTES)).toEqual({ chunkSize: CHUNK_BYTES, count: 1 });
    const plan = planChunks(CHUNK_BYTES * 2 + 3 * MB);
    expect(plan).toEqual({ chunkSize: CHUNK_BYTES, count: 2 });
    expect(chunkRange(plan, CHUNK_BYTES * 2 + 3 * MB, 1)).toEqual({ start: CHUNK_BYTES, end: CHUNK_BYTES * 2 + 3 * MB - 1 });
    // Bornes de TikTok : 5 à 64 Mo par morceau, le dernier sous 128 Mo, 1 000 morceaux au plus.
    expect(planChunks(500 * MB, 1 * MB).chunkSize).toBe(5 * MB);
    const large = planChunks(4000 * MB, 200 * MB);
    expect(large.chunkSize).toBe(64 * MB);
    expect(4000 * MB - (large.count - 1) * large.chunkSize).toBeLessThan(128 * MB);
    expect(() => planChunks(0)).toThrow(/vide/);
  });
});

// ─── Brouillon (mode par défaut) ──────────────────────────────────

describe("envoi en brouillon", () => {
  test("morceaux envoyés dans l'ordre, statut suivi, travail fini avec la note de la boîte de réception", async () => {
    const { account } = await connect();
    fake.nextStatuses.push([{ status: "PROCESSING_UPLOAD" }, { status: "PROCESSING_UPLOAD" }, { status: "SEND_TO_USER_INBOX" }]);
    const job = enqueuePublish({ accountId: account.id, source: video("big.mp4"), options: { caption: "Ignoré en brouillon", privacy: "PUBLIC_TO_EVERYONE" } });
    expect(job.options).toMatchObject({ mode: "inbox" });
    await settle();

    const upload = fake.uploads[0];
    const total = CHUNK_BYTES * 2 + 3 * MB;
    expect(upload.kind).toBe("inbox");
    // Seul `source_info` part : l'API du brouillon ne prend ni texte ni visibilité.
    expect(upload.body).toEqual({ source_info: { source: "FILE_UPLOAD", video_size: total, chunk_size: CHUNK_BYTES, total_chunk_count: 2 } });
    expect(upload.chunks).toEqual([
      { range: `bytes 0-${CHUNK_BYTES - 1}/${total}`, length: CHUNK_BYTES, contentLength: String(CHUNK_BYTES), contentType: "video/mp4" },
      { range: `bytes ${CHUNK_BYTES}-${total - 1}/${total}`, length: CHUNK_BYTES + 3 * MB, contentLength: String(CHUNK_BYTES + 3 * MB), contentType: "video/mp4" },
    ]);
    expect(callsTo("/v2/post/publish/status/fetch/")).toHaveLength(3);
    expect(callsTo("/v2/post/publish/creator_info/query/")).toHaveLength(0);
    expect(getJob(job.id)).toMatchObject({ state: "done", result: { externalId: upload.publishId, url: "" }, note: INBOX_NOTE, bytesSent: total });
  });

  test("petit fichier : un seul morceau de la taille du fichier", async () => {
    const { account } = await connect();
    enqueuePublish({ accountId: account.id, source: video("small.mp4"), options: {} });
    await settle();
    expect(fake.uploads[0].body.source_info).toMatchObject({ video_size: 3 * MB, chunk_size: 3 * MB, total_chunk_count: 1 });
    expect(fake.uploads[0].chunks).toHaveLength(1);
  });

  test("échec au traitement : raison traduite", async () => {
    const { account } = await connect();
    fake.nextStatuses.push([{ status: "FAILED", fail_reason: "frame_rate_check_failed" }]);
    const job = enqueuePublish({ accountId: account.id, source: video("small.mp4"), options: {} });
    await settle();
    expect(getJob(job.id)).toMatchObject({ state: "failed", error: expect.stringMatching(/entre 23 et 60 images par seconde/) });
  });

  test("cinq brouillons en attente : le compte attend au lieu d'échouer", async () => {
    const { account } = await connect();
    fake.nextInitError = { status: 403, code: "spam_risk_too_many_pending_share" };
    const job = enqueuePublish({ accountId: account.id, source: video("small.mp4"), options: {} });
    await settle();
    expect(getJob(job.id)).toMatchObject({ state: "waiting-quota", error: expect.stringMatching(/cinq brouillons/) });
  });
});

// ─── Publication directe ──────────────────────────────────────────

describe("publication directe", () => {
  test("refusée tant que l'application n'est pas déclarée auditée", async () => {
    const { account } = await connect();
    expect(() => enqueuePublish({ accountId: account.id, source: video("small.mp4"), options: directOptions })).toThrow(/application auditée/);

    const form = await accountPublishForm(account.id, { kind: "video", durationMs: 30_000 });
    expect(form?.fields).toEqual([]);
    expect(form?.identity).toMatchObject({ name: "Karim Test", handle: "@karim.test" });
    expect(form?.notices?.join(" ")).toMatch(/boîte de réception/);
    expect(callsTo("/v2/post/publish/creator_info/query/")).toHaveLength(0);
  });

  test("application auditée : creator_info à l'affichage, visibilité sans valeur d'avance et exigée", async () => {
    const { account } = await connect();
    audit();
    const form = (await accountPublishForm(account.id, { kind: "video", durationMs: 30_000 }))!;
    expect(callsTo("/v2/post/publish/creator_info/query/")).toHaveLength(1);
    expect(form.identity).toEqual({ name: "Karim Test", handle: "@karim.test", avatarUrl: "https://p16.tiktokcdn.example/avatar.jpeg" });
    expect(form.limits?.video?.maxDurationMs).toBe(300_000);

    const field = (key: string) => form.fields.find((entry) => entry.key === key)! as PublishField;
    const privacy = field("privacy");
    expect(privacy).toMatchObject({ kind: "select", noDefault: true, required: true, showWhen: { key: "mode", values: ["direct"] } });
    expect(privacy.kind === "select" && privacy.choices.map((choice) => choice.value)).toEqual(["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "SELF_ONLY"]);
    expect(defaultFieldValue(privacy)).toBe("");
    expect(fieldProblem(privacy, "")).toMatch(/choisissez/);
    expect(fieldProblem(privacy, "SELF_ONLY")).toBeNull();
    // Interactions décochées d'avance, le duo grisé (coupé par le compte).
    expect(defaultFieldValue(field("allowComment"))).toBe(false);
    expect(field("allowDuet")).toMatchObject({ disabled: true });
    expect(fieldProblem(field("consent"), false)).toMatch(/à cocher/);

    // Brouillon choisi : les réglages directs sont masqués et ne comptent pas.
    const values = { mode: "inbox", commercial: true, brandContent: true, privacy: "SELF_ONLY" };
    expect(Object.keys(visibleValues(form.fields, values))).toEqual(["mode"]);
    expect(ruleProblems(form.rules, visibleValues(form.fields, values))).toEqual([]);
    const direct = { ...values, mode: "direct", brandContent: false };
    expect(ruleProblems(form.rules, visibleValues(form.fields, direct))).toEqual([expect.stringMatching(/Votre marque/)]);
    expect(ruleProblems(form.rules, visibleValues(form.fields, { ...direct, brandContent: true }))).toEqual([expect.stringMatching(/visible de vous seul/)]);

    // Sans visibilité, le serveur refuse aussi.
    expect(() => enqueuePublish({ accountId: account.id, source: video("small.mp4"), options: { ...directOptions, privacy: undefined } })).toThrow(/Choisissez qui peut voir/);
    expect(() => enqueuePublish({ accountId: account.id, source: video("small.mp4"), options: { ...directOptions, consent: false } })).toThrow(/consentement/);
  });

  test("publication faite : creator_info relu, post_info envoyé, adresse publique après la modération", async () => {
    const { account } = await connect();
    audit();
    fake.nextStatuses.push([{ status: "PROCESSING_UPLOAD" }, { status: "PUBLISH_COMPLETE" }, { status: "PUBLISH_COMPLETE", publicaly_available_post_id: ["__ID__7300000000000000002"] }]);
    const job = enqueuePublish({ accountId: account.id, source: video("small.mp4"), options: { ...directOptions, aigc: true } });
    await settle();

    const upload = fake.uploads[0];
    expect(upload.kind).toBe("direct");
    expect(upload.body.post_info).toEqual({
      title: "Nouveau clip #montage",
      privacy_level: "PUBLIC_TO_EVERYONE",
      disable_comment: false,
      // Le duo, coupé par le compte, reste coupé malgré l'option.
      disable_duet: true,
      disable_stitch: true,
      brand_content_toggle: false,
      brand_organic_toggle: false,
      is_aigc: true,
    });
    expect(callsTo("/v2/post/publish/creator_info/query/")).toHaveLength(1);
    expect(getJob(job.id)).toMatchObject({
      state: "done",
      result: { externalId: "7300000000000000002", url: "https://www.tiktok.com/@karim.test/video/7300000000000000002" },
    });
  });

  test("client non audité chez TikTok : l'erreur est traduite en message clair", async () => {
    const { account } = await connect();
    audit();
    fake.nextInitError = { status: 403, code: "unaudited_client_can_only_post_to_private_accounts" };
    const job = enqueuePublish({ accountId: account.id, source: video("small.mp4"), options: directOptions });
    await settle();
    expect(getJob(job.id)).toMatchObject({ state: "failed", error: expect.stringMatching(/compte privé, en «.Moi uniquement.»/) });
  });

  test("quinze publications directes par compte sur 24 heures, cinq brouillons", async () => {
    const { account } = await connect();
    const { context } = accountContext(account.id);
    for (let index = 0; index < 15; index += 1) context.chargeQuota("tiktok.direct");
    expect(() => context.chargeQuota("tiktok.direct")).toThrow(QuotaExceededError);
    for (let index = 0; index < 5; index += 1) context.chargeQuota("tiktok.inbox");
    expect(() => context.chargeQuota("tiktok.inbox")).toThrow(/Brouillons envoyés, 5\/5/);
  });
});

// ─── Gestion ──────────────────────────────────────────────────────

describe("vidéos du compte", () => {
  test("liste par video.list, publique seulement", async () => {
    const { account } = await connect();
    const { context } = accountContext(account.id);
    const posts = await tiktokConnector.posts!.list(context);
    expect(posts).toEqual([
      expect.objectContaining({
        id: "7300000000000000001",
        title: "Premier clip #montage",
        tags: ["montage"],
        privacy: "public",
        views: 42,
        url: "https://www.tiktok.com/@karim.test/video/7300000000000000001",
      }),
    ]);
    expect(callsTo("/v2/video/list/")[0].json).toEqual({ max_count: 20 });
  });
});
