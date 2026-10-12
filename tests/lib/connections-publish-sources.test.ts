import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { setDataRoot } from "@/lib/connections/store";
import { registerConnector, unregisterConnector } from "@/lib/connections/registry";
import { completeAuthorization, getAccountSummary, upsertAccounts } from "@/lib/connections/accounts";
import { configurePublishQueue, enqueuePublish, getJob, listJobs, retryJob, runPublishQueue } from "@/lib/connections/publish-queue";
import { getBillingStatus } from "@/lib/connections/billing";
import { getAccountQuotaUsage } from "@/lib/connections/quota";
import { servePublicMedia } from "@/lib/connections/public-media";
import { checkPublishLimits, countText, describeMediaLimits, estimatePublishCost, measureText } from "@/lib/connections/limits";
import type { Connector, PublishFileSource, PublishLimits, PublishSource } from "@/lib/connections/types";
import { authorize, createFakeState, fakeConnector, fakeFetch, type FakeServiceState } from "./connections-fake-service";

const saved = { ...process.env };
const realFetch = globalThis.fetch;
const realNow = Date.now;
let root: string;
let fake: FakeServiceState;
let files: Record<string, string>;

const LIMITS: PublishLimits = {
  video: { maxDurationMs: 90_000, maxBytes: 50_000, aspectRatio: { min: 0.5625, max: 0.5625 }, mimeTypes: ["video/mp4"] },
  image: { mimeTypes: ["image/jpeg", "image/png"] },
  text: { maxLength: 20 },
  carousel: { minItems: 2, maxItems: 3 },
};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "connections-sources-"));
  setDataRoot(path.join(root, "data"));
  delete process.env.CONNECTIONS_ENCRYPTION_KEY;
  process.env.AUTH_SECRET = "secret-de-test-assez-long-pour-hkdf";
  process.env.AUTH_URL = "https://sxm.example.org";
  process.env.FAKESVC_CLIENT_ID = "fake-client";
  process.env.FAKESVC_CLIENT_SECRET = "fake-secret";
  fake = createFakeState();
  globalThis.fetch = fakeFetch(fake);
  files = {};
  for (const name of ["clip.mp4", "a.jpg", "b.png", "cover.jpg"]) {
    files[name] = path.join(root, "module", name);
    fs.mkdirSync(path.dirname(files[name]), { recursive: true });
    fs.writeFileSync(files[name], randomBytes(2000));
  }
  configurePublishQueue({
    autoRun: false,
    resolveSource: async (ref) => {
      if (!ref.file || !files[ref.file]) throw new Error("introuvable");
      return files[ref.file];
    },
    sleep: async () => undefined,
  });
});

afterEach(() => {
  Date.now = realNow;
  configurePublishQueue({ autoRun: true, resolveSource: null, sleep: null });
  globalThis.fetch = realFetch;
  unregisterConnector("fakesvc");
  setDataRoot(null);
  fs.rmSync(root, { recursive: true, force: true });
  for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
  Object.assign(process.env, saved);
});

async function connect(overrides: Partial<Connector> = {}) {
  registerConnector({ ...fakeConnector(fake), fetchAccounts: undefined, limits: LIMITS, ...overrides });
  const { accounts } = await completeAuthorization("fakesvc", "code-1", authorize("fakesvc").transaction);
  return accounts[0];
}

const text = (value: string): PublishSource => ({ module: "fake-module", id: "txt-1", kind: "text", text: value, bytes: 0 });
const video = (overrides: Partial<PublishFileSource> = {}): PublishFileSource => ({
  module: "fake-module",
  id: "exp-1",
  kind: "video",
  file: "clip.mp4",
  bytes: 2000,
  width: 1080,
  height: 1920,
  durationMs: 30_000,
  ...overrides,
});

describe("publication sans fichier ou avec plusieurs fichiers", () => {
  test("texte seul : aucun fichier, aucun lien public, travail terminé", async () => {
    const account = await connect();
    const job = enqueuePublish({ accountId: account.id, source: text("Bonjour à tous"), options: {} });
    expect(job.title).toBe("Bonjour à tous");
    await runPublishQueue();
    const context = fake.published[0];
    expect(context.filePath).toBe("");
    expect(context.filePaths).toEqual([]);
    expect(() => context.publicUrl()).toThrow(/pas de fichier/);
    expect(getJob(job.id)).toMatchObject({ state: "done", bytesSent: 0, result: { externalId: "post-1" } });
  });

  test("texte trop long ou vide : refusé avant d'entrer dans la file", async () => {
    const account = await connect();
    expect(() => enqueuePublish({ accountId: account.id, source: text("x".repeat(21)), options: {} })).toThrow(/21 caractères\s:\s20 au plus/);
    expect(() => enqueuePublish({ accountId: account.id, source: text("   "), options: {} })).toThrow(/vide/);
    expect(listJobs()).toHaveLength(0);
  });

  test("carrousel : chaque élément résolu par le module, servi par son propre lien", async () => {
    const account = await connect();
    const source: PublishSource = {
      module: "fake-module",
      id: "car-1",
      kind: "carousel",
      bytes: 4000,
      items: [
        { id: "img-a", kind: "image", file: "a.jpg", bytes: 2000 },
        { id: "img-b", kind: "image", file: "b.png", bytes: 2000 },
      ],
    };
    enqueuePublish({ accountId: account.id, source, options: {} });
    await runPublishQueue();
    const context = fake.published[0];
    expect(context.filePaths).toEqual([files["a.jpg"], files["b.png"]]);
    expect(context.publicUrl(undefined, { item: 1 })).toMatch(/\.png$/);
    expect(() => enqueuePublish({ accountId: account.id, source: { ...source, items: source.items.slice(0, 1) }, options: {} })).toThrow(/2 éléments au moins/);
  });

  test("vidéo avec couverture : le connecteur obtient un lien vers chacune, fermés à la fin du travail", async () => {
    const urls: string[] = [];
    const account = await connect({
      publicMedia: { ttlMs: 2 * 3600_000 },
      publish: async (context) => {
        urls.push(context.publicUrl(), context.publicUrl(undefined, { item: "cover" }));
        // Le service vient lire le fichier pendant la publication.
        const token = urls[0].split("/media/")[1];
        const response = servePublicMedia(new Request(urls[0]), token);
        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toBe("video/mp4");
        expect(context.coverPath).toBe(files["cover.jpg"]);
        return { externalId: "v-1", url: "https://fake.test/p/v-1" };
      },
    });
    enqueuePublish({ accountId: account.id, source: video({ cover: { id: "cov-1", kind: "image", file: "cover.jpg", bytes: 2000 } }), options: {} });
    await runPublishQueue();
    expect(urls).toHaveLength(2);
    expect(urls[1]).toMatch(/\.jpg$/);
    for (const url of urls) expect(servePublicMedia(new Request(url), url.split("/media/")[1]).status).toBe(404);
  });
});

describe("limites déclarées par le connecteur", () => {
  test("rapport, durée, poids et format vérifiés avant l'envoi", async () => {
    const account = await connect();
    expect(() => enqueuePublish({ accountId: account.id, source: video({ width: 1920, height: 1080 }), options: {} })).toThrow(/1920 × 1080/);
    expect(() => enqueuePublish({ accountId: account.id, source: video({ durationMs: 120_000 }), options: {} })).toThrow(/2 min/);
    expect(() => enqueuePublish({ accountId: account.id, source: video({ bytes: 60_000 }), options: {} })).toThrow(/au plus/);
    expect(() => enqueuePublish({ accountId: account.id, source: video({ file: "clip.webm" }), options: {} })).toThrow(/WebM/);
    expect(enqueuePublish({ accountId: account.id, source: video(), options: {} }).state).toBe("queued");
  });

  test("tolérance d'arrondi sur le rapport ; description lisible", () => {
    expect(checkPublishLimits({ video: { aspectRatio: { min: 0.8, max: 1.91 } } }, video({ width: 1080, height: 1350 }))).toEqual([]);
    expect(checkPublishLimits({ video: { aspectRatio: { min: 0.8, max: 1.91 } } }, video({ width: 1080, height: 1920 }))[0]).toMatch(/9:16/);
    expect(describeMediaLimits(LIMITS.video)).toBe("1 min 30 au plus · format 9:16 · 49 Ko au plus · MP4");
  });

  test("limites propres au compte, lues dans ses données", async () => {
    fake.pages = [{ id: "p1", name: "Page une" }];
    const account = await connect({
      limitsFor: (entry) => (entry.data?.kind === "page" ? { ...LIMITS, video: { ...LIMITS.video, maxDurationMs: 10_000 } } : null),
    });
    void account;
    const connector = fakeConnector(fake);
    const [page] = upsertAccounts({ ...connector, limits: LIMITS }, [{ externalId: "p9", name: "Page", data: { kind: "page" } }], { accessToken: "t", expiresAt: Date.now() + 3600_000 }, ["fake.write", "fake.media"]);
    expect(getAccountSummary(page.id)?.limits?.video?.maxDurationMs).toBe(10_000);
    expect(() => enqueuePublish({ accountId: page.id, source: video(), options: {} })).toThrow(/10 s au plus/);
  });

  test("mesures du texte : points de code, émojis en octets, pondérée avec adresses à 23", () => {
    expect(countText("Salut 👋")).toBe(7);
    expect(countText("Salut 👋", "emoji-bytes")).toBe(10);
    expect(countText("Salut 👨‍👩‍👧", "emoji-bytes")).toBe(6 + 18);
    expect(countText("voir https://exemple.org/une/adresse/tres/longue", "weighted")).toBe(5 + 23);
    expect(countText("日本", "weighted")).toBe(4);
    expect(countText("é ok 👋", "weighted")).toBe(5 + 2);
    expect(measureText("x".repeat(30), { maxLength: 280, count: "weighted" })).toEqual({ used: 30, max: 280 });
  });
});

describe("file : comptes à reconnecter, quotas, crédits, date, reprise", () => {
  test("accès refusé pendant la publication : compte « à reconnecter », travail suspendu puis repris", async () => {
    const account = await connect();
    fake.publishMode = "reconnect";
    const job = enqueuePublish({ accountId: account.id, source: text("Message"), options: {} });
    await runPublishQueue();
    expect(getAccountSummary(account.id)).toMatchObject({ status: "needs-reconnect", statusReason: expect.stringMatching(/code 190/) });
    expect(getJob(job.id)).toMatchObject({ state: "queued", error: expect.stringMatching(/190/) });
    await runPublishQueue();
    expect(fake.published).toHaveLength(1);
    // Reconnexion : le travail repart.
    await completeAuthorization("fakesvc", "code-2", authorize("fakesvc").transaction);
    await runPublishQueue();
    expect(getJob(job.id)?.state).toBe("done");
  });

  test("quota du compte sur fenêtre glissante : seul ce compte attend", async () => {
    const account = await connect({
      accountQuota: { windowMs: 24 * 3600_000, buckets: [{ id: "posts", label: "Publications", limit: 2 }], cost: (method) => (method === "publish" ? { bucket: "posts", units: 1 } : null) },
      publish: async (context) => {
        context.chargeQuota("publish");
        return { externalId: "x", url: "https://fake.test/p/x" };
      },
    });
    const jobs = [1, 2, 3].map((index) => enqueuePublish({ accountId: account.id, source: text(`Message ${index}`), options: {} }));
    await runPublishQueue();
    expect(jobs.map((job) => getJob(job.id)?.state)).toEqual(["done", "done", "waiting-quota"]);
    const third = getJob(jobs[2].id)!;
    expect(third.retryAt).toBeGreaterThan(Date.now() + 23 * 3600_000);
    expect(getAccountQuotaUsage(fakeConnector(fake, { accountQuota: { windowMs: 24 * 3600_000, buckets: [{ id: "posts", label: "Publications", limit: 2 }], cost: () => null } }), account.id)?.buckets[0].used).toBe(2);
    // Le lendemain, la fenêtre a glissé.
    const base = realNow();
    Date.now = () => base + 25 * 3600_000;
    await runPublishQueue();
    expect(getJob(jobs[2].id)?.state).toBe("done");
  });

  test("limite du compte annoncée par le service : attente du seul compte", async () => {
    const account = await connect();
    fake.publishMode = "quota-account";
    const job = enqueuePublish({ accountId: account.id, source: text("Message"), options: {} });
    await runPublishQueue();
    expect(getJob(job.id)).toMatchObject({ state: "waiting-quota", error: "Limite du compte atteinte." });
  });

  test("crédits épuisés : tous les envois du service attendent une reprise à la main", async () => {
    const account = await connect();
    fake.publishMode = "credits";
    const first = enqueuePublish({ accountId: account.id, source: text("Un"), options: {} });
    const second = enqueuePublish({ accountId: account.id, source: text("Deux"), options: {} });
    await runPublishQueue();
    expect(getJob(first.id)?.state).toBe("waiting-credits");
    expect(getJob(second.id)?.state).toBe("waiting-credits");
    expect(fake.published).toHaveLength(1);
    retryJob(first.id);
    retryJob(second.id);
    await runPublishQueue();
    expect([getJob(first.id)?.state, getJob(second.id)?.state]).toEqual(["done", "done"]);
  });

  test("budget mensuel : coût estimé, refus clair au-delà, dépense comptée à la publication", async () => {
    process.env.FAKESVC_MONTHLY_BUDGET = "0.02";
    const pricing = { currency: "USD", asOf: "2026-10-01", perPublish: { text: 0.01 }, linkSurcharge: 0.2 };
    const account = await connect({ pricing });
    expect(estimatePublishCost(pricing, "text", "voir https://exemple.org")).toMatchObject({ amount: 0.21, withLink: true });
    expect(() => enqueuePublish({ accountId: account.id, source: text("https://exemple.org"), options: {} })).toThrow(/Budget mensuel atteint/);
    const job = enqueuePublish({ accountId: account.id, source: text("Sans adresse"), options: {} });
    expect(job.cost).toEqual({ amount: 0.01, currency: "USD" });
    await runPublishQueue();
    expect(getBillingStatus(fakeConnector(fake, { pricing }))).toMatchObject({ spent: 0.01, budget: 0.02, budgetSource: "env" });
  });

  test("publication différée tenue par la file", async () => {
    const account = await connect();
    const at = Date.now() + 3600_000;
    const job = enqueuePublish({ accountId: account.id, source: text("Plus tard"), options: {}, publishAt: at });
    await runPublishQueue();
    expect(getJob(job.id)).toMatchObject({ state: "queued", publishAt: at });
    const base = realNow();
    Date.now = () => base + 3601_000;
    await runPublishQueue();
    expect(getJob(job.id)?.state).toBe("done");
  });

  test("réponse perdue : au passage suivant, la publication retrouvée n'est pas republiée", async () => {
    const account = await connect();
    fake.publishMode = "lost-response";
    const job = enqueuePublish({ accountId: account.id, source: text("Une seule fois"), options: {} });
    await runPublishQueue();
    expect(getJob(job.id)?.state).toBe("failed");
    retryJob(job.id);
    await runPublishQueue();
    expect(getJob(job.id)).toMatchObject({ state: "done", attempts: 2, result: { externalId: "post-1" }, warning: expect.stringMatching(/retrouvée/) });
    expect(fake.posts).toHaveLength(1);
    expect(fake.published).toHaveLength(1);
  });
});
