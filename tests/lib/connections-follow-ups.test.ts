/**
 * Suites de publication (premier commentaire, sous-titres, couverture),
 * rôles de champ, filtre par source et connexion incrémentale (dossier 01 ter,
 * § 6 ; dossier 07, § 8.9). Faux connecteur et `fetch` simulé : aucun appel
 * réel.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { dataRoot, setDataRoot } from "@/lib/connections/store";
import { describeConnector, getConnector, incrementalScopes, registerConnector, unregisterConnector } from "@/lib/connections/registry";
import { completeAuthorization, getAccountSummary } from "@/lib/connections/accounts";
import {
  cancelFollowUp,
  cancelJob,
  checkProcessingJobs,
  configurePublishQueue,
  enqueuePublish,
  getJob,
  listJobs,
  retryFollowUp,
  runFollowUps,
  runPublishQueue,
} from "@/lib/connections/publish-queue";
import { AppNotConfiguredError, readTransaction, startAuthorization } from "@/lib/connections/oauth";
import { ServiceError } from "@/lib/connections/errors";
import { postYoutubeComment, setYoutubeThumbnail, uploadYoutubeSubtitles } from "@/lib/connections/connectors/youtube/follow-ups";
import { facebookLocale, postFacebookComment, uploadFacebookSubtitles } from "@/lib/connections/connectors/facebook/follow-ups";
import { postInstagramComment } from "@/lib/connections/connectors/instagram/follow-ups";
import { postThreadsReply } from "@/lib/connections/connectors/threads/follow-ups";
import { youtubeCost } from "@/lib/connections/connectors/youtube/quota";
import type { Connector, FollowUpContext, FollowUpOutcome, PublishFileSource, PublishJob } from "@/lib/connections/types";
import { FAKE_SCOPES, authorize, createFakeState, fakeConnector, fakeFetch, type FakeServiceState } from "./connections-fake-service";

const COMMENT_SCOPE = "fake.comment";
const saved = { ...process.env };
const realFetch = globalThis.fetch;
const realNow = Date.now;
let root: string;
let fake: FakeServiceState;
let files: Record<string, string>;
let resolved: { id: string; file?: string; purpose?: string }[];

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "connections-followups-"));
  setDataRoot(path.join(root, "data"));
  delete process.env.CONNECTIONS_ENCRYPTION_KEY;
  process.env.AUTH_SECRET = "secret-de-test-assez-long-pour-hkdf";
  process.env.AUTH_URL = "https://sxm.example.org";
  process.env.FAKESVC_CLIENT_ID = "fake-client";
  process.env.FAKESVC_CLIENT_SECRET = "fake-secret";
  fake = createFakeState();
  fake.tokenScope = `${FAKE_SCOPES.read} ${FAKE_SCOPES.write} ${FAKE_SCOPES.media} ${COMMENT_SCOPE}`;
  globalThis.fetch = fakeFetch(fake);
  files = {};
  resolved = [];
  for (const name of ["clip.mp4", "clip.fr.srt", "cover.png"]) {
    files[name] = path.join(root, "module", name);
    fs.mkdirSync(path.dirname(files[name]), { recursive: true });
    fs.writeFileSync(files[name], randomBytes(500));
  }
  configurePublishQueue({
    autoRun: false,
    resolveSource: async (ref) => {
      resolved.push({ id: ref.id, file: ref.file, purpose: ref.purpose });
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

const video = (overrides: Partial<PublishFileSource> = {}): PublishFileSource => ({
  module: "fake-module",
  id: "exp-1",
  kind: "video",
  file: "clip.mp4",
  bytes: 500,
  width: 1080,
  height: 1920,
  durationMs: 30_000,
  ...overrides,
});

/** Appels reçus par les suites du faux connecteur. */
interface Calls {
  comments: { context: FollowUpContext; text: string }[];
  subtitles: { path: string; language: string }[];
  covers: { path: string }[];
}

/** Faux connecteur avec suites ; `comment` décide de la réponse de chaque passage. */
function followUpConnector(calls: Calls, comment: (context: FollowUpContext, text: string) => Promise<FollowUpOutcome> | FollowUpOutcome, overrides: Partial<Connector> = {}): Connector {
  const base = fakeConnector(fake, { fetchAccounts: undefined });
  return {
    ...base,
    capabilities: [
      ...base.capabilities,
      { capability: "comment.create", scopes: [COMMENT_SCOPE] },
      { capability: "captions.upload", scopes: [FAKE_SCOPES.write] },
      { capability: "cover.set", scopes: [FAKE_SCOPES.write] },
    ],
    followUps: {
      comment: { maxLength: 20, documented: true },
      subtitles: { formats: ["srt"], sourceKinds: ["video"] },
      cover: { mode: "after", sourceKinds: ["video"] },
    },
    postComment: async (context, text) => {
      calls.comments.push({ context, text });
      return comment(context, text);
    },
    uploadSubtitles: async (_context, subtitles) => {
      calls.subtitles.push(subtitles);
      return { externalId: "track-1" };
    },
    setCover: async (_context, cover) => {
      calls.covers.push(cover);
      return {};
    },
    ...overrides,
  };
}

async function connect(connector: Connector) {
  registerConnector(connector);
  const { accounts } = await completeAuthorization("fakesvc", "code-1", authorize("fakesvc").transaction);
  return accounts[0];
}

const newCalls = (): Calls => ({ comments: [], subtitles: [], covers: [] });

function storedJobs(): PublishJob[] {
  return (JSON.parse(fs.readFileSync(path.join(dataRoot(), "publish-jobs.json"), "utf-8")) as { jobs: PublishJob[] }).jobs;
}

describe("suites de publication dans la file", () => {
  test("posées après la publication, jamais avant ; résultat et essais exposés", async () => {
    const calls = newCalls();
    let processed = false;
    const account = await connect(
      followUpConnector(calls, () => ({ externalId: "c-1", url: "https://fake.test/p/post-1#c-1", note: "Épinglez-le à la main." }), {
        // Le service traite encore la vidéo : la publication n'est pas « faite ».
        checkProcessing: async () => ({ done: processed }),
      })
    );
    const job = enqueuePublish({
      accountId: account.id,
      source: video(),
      options: {},
      followUps: { comment: "  Premier !  ", subtitles: { file: "clip.fr.srt", language: "fr" }, cover: { file: "cover.png" } },
    });
    expect(job.followUps?.map((entry) => [entry.kind, entry.state])).toEqual([
      ["comment", "waiting"],
      ["subtitles", "waiting"],
      ["cover", "waiting"],
    ]);
    await runPublishQueue();
    expect(getJob(job.id)?.state).toBe("processing");
    await runFollowUps({ all: true });
    expect(calls.comments).toHaveLength(0);

    processed = true;
    // La fin du suivi enchaîne les suites dans le même passage.
    await checkProcessingJobs({ all: true });
    const done = getJob(job.id)!;
    expect(done.state).toBe("done");
    expect(calls.comments.map((call) => call.text)).toEqual(["Premier !"]);
    expect(calls.comments[0].context.result).toEqual({ externalId: "post-1", url: "https://fake.test/p/post-1" });
    expect(calls.subtitles).toEqual([{ path: files["clip.fr.srt"], language: "fr" }]);
    expect(calls.covers).toEqual([{ path: files["cover.png"], mimeType: "image/png" }]);
    // Les fichiers des suites sont demandés au module, avec leur rôle.
    expect(resolved).toEqual(expect.arrayContaining([{ id: "exp-1", file: "clip.fr.srt", purpose: "subtitles" }, { id: "exp-1", file: "cover.png", purpose: "cover" }]));
    const comment = done.followUps!.find((entry) => entry.kind === "comment")!;
    expect(comment).toMatchObject({ state: "done", attempts: 1, result: { externalId: "c-1", url: "https://fake.test/p/post-1#c-1" }, note: "Épinglez-le à la main." });
    expect(done.followUps!.every((entry) => entry.state === "done")).toBe(true);
    expect(done.warning).toBeUndefined();
    // Rien ne repart au passage suivant.
    await runFollowUps({ all: true });
    expect(calls.comments).toHaveLength(1);
  });

  test("ce que le service ne permet pas, ou que le compte n'a pas autorisé, est rangé sans bloquer la publication", async () => {
    fake.tokenScope = `${FAKE_SCOPES.read} ${FAKE_SCOPES.write} ${FAKE_SCOPES.media}`;
    const calls = newCalls();
    const account = await connect(followUpConnector(calls, () => ({})));
    expect(getAccountSummary(account.id)?.requestableCapabilities).toEqual(["comment.create"]);
    const job = enqueuePublish({ accountId: account.id, source: video(), options: {}, followUps: { comment: "Salut" } });
    expect(job.followUps?.[0]).toMatchObject({ kind: "comment", state: "skipped", skipCode: "unauthorized" });
    expect(job.followUps?.[0].note).toMatch(/Autoriser les commentaires/);
    await runPublishQueue();
    await runFollowUps({ all: true });
    expect(getJob(job.id)?.state).toBe("done");
    expect(calls.comments).toHaveLength(0);

    // Un service sans sous-titres pour une image : « unsupported ».
    const image = enqueuePublish({
      accountId: account.id,
      source: { module: "fake-module", id: "img-1", kind: "image", file: "cover.png", bytes: 500 },
      options: {},
      followUps: { subtitles: { file: "clip.fr.srt", language: "fr" } },
    });
    expect(image.followUps?.[0]).toMatchObject({ state: "skipped", skipCode: "unsupported" });
  });

  test("commentaire trop long, format ou langue refusés : rien n'entre dans la file", async () => {
    const account = await connect(followUpConnector(newCalls(), () => ({})));
    expect(() => enqueuePublish({ accountId: account.id, source: video(), options: {}, followUps: { comment: "x".repeat(21) } })).toThrow(/21 caractères, 20 au plus/);
    expect(() => enqueuePublish({ accountId: account.id, source: video(), options: {}, followUps: { subtitles: { file: "clip.vtt", language: "fr" } } })).toThrow(/\.srt/);
    expect(() => enqueuePublish({ accountId: account.id, source: video(), options: {}, followUps: { subtitles: { file: "clip.fr.srt", language: "français" } } })).toThrow(/Langue/);
    expect(() => enqueuePublish({ accountId: account.id, source: video(), options: {}, followUps: { cover: { file: "../secret.png" } } })).toThrow(/couverture invalide/i);
    expect(listJobs()).toHaveLength(0);
  });

  test("une vidéo privée ou programmée fait attendre le commentaire, jusqu'à la date annoncée", async () => {
    const calls = newCalls();
    let visible = false;
    const publishAt = realNow() + 3 * 24 * 3600_000;
    const account = await connect(
      followUpConnector(calls, () =>
        visible ? { externalId: "c-9" } : { pending: true, retryAt: publishAt, note: "Vidéo programmée : le commentaire sera posé à sa mise en ligne." }
      )
    );
    const job = enqueuePublish({ accountId: account.id, source: video(), options: {}, followUps: { comment: "Bienvenue" } });
    await runPublishQueue();
    await runFollowUps();
    let comment = getJob(job.id)!.followUps![0];
    expect(comment).toMatchObject({ state: "waiting", checkAt: publishAt, note: "Vidéo programmée : le commentaire sera posé à sa mise en ligne." });
    expect(getJob(job.id)!.state).toBe("done");

    // Avant l'heure, rien ne repart.
    await runFollowUps();
    expect(calls.comments).toHaveLength(1);

    visible = true;
    Date.now = () => publishAt + 1000;
    await runFollowUps();
    comment = getJob(job.id)!.followUps![0];
    expect(comment).toMatchObject({ state: "done", attempts: 2, result: { externalId: "c-9" } });
    expect(comment.checkAt).toBeUndefined();
  });

  test("une vidéo restée privée trente jours : la suite est abandonnée sans faire échouer la publication", async () => {
    const calls = newCalls();
    const account = await connect(followUpConnector(calls, () => ({ pending: true, retryAfterMs: 6 * 3600_000, note: "Vidéo privée." })));
    const job = enqueuePublish({ accountId: account.id, source: video(), options: {}, followUps: { comment: "Coucou" } });
    await runPublishQueue();
    await runFollowUps();
    const start = realNow();
    expect(getJob(job.id)!.followUps![0].checkAt).toBeGreaterThan(start + 5 * 3600_000);
    Date.now = () => start + 31 * 24 * 3600_000;
    await runFollowUps();
    const summary = getJob(job.id)!;
    expect(summary.state).toBe("done");
    expect(summary.followUps![0]).toMatchObject({ state: "skipped", skipCode: "expired" });
  });

  test("une erreur réseau fait réessayer plus tard ; un succès ensuite efface l'erreur", async () => {
    const calls = newCalls();
    let failures = 2;
    const account = await connect(
      followUpConnector(calls, () => {
        if (failures-- > 0) throw new TypeError("fetch failed");
        return { externalId: "c-2" };
      })
    );
    const job = enqueuePublish({ accountId: account.id, source: video(), options: {}, followUps: { comment: "Réessaie" } });
    await runPublishQueue();
    await runFollowUps();
    let comment = getJob(job.id)!.followUps![0];
    expect(comment).toMatchObject({ state: "waiting", errorCount: 1, error: "fetch failed" });
    expect(comment.checkAt).toBeGreaterThanOrEqual(realNow() + 50_000);
    // Pas avant l'heure du nouvel essai.
    await runFollowUps();
    expect(calls.comments).toHaveLength(1);
    await runFollowUps({ all: true });
    await runFollowUps({ all: true });
    comment = getJob(job.id)!.followUps![0];
    expect(comment).toMatchObject({ state: "done", attempts: 3, result: { externalId: "c-2" } });
    expect(comment.error).toBeUndefined();
    // Au-delà du premier passage, le connecteur sait que la réponse a pu se perdre.
    expect(calls.comments.map((call) => call.context.attempt)).toEqual([1, 2, 3]);
  });

  test("un échec définitif de la suite laisse la publication faite, avec un avertissement ; « Réessayer » la relance", async () => {
    const calls = newCalls();
    let refuse = true;
    const account = await connect(
      followUpConnector(calls, () => {
        if (refuse) throw new ServiceError(403, "Les commentaires sont désactivés sur cette vidéo.", "commentsDisabled");
        return { externalId: "c-3" };
      })
    );
    const job = enqueuePublish({ accountId: account.id, source: video(), options: {}, followUps: { comment: "Hop" } });
    await runPublishQueue();
    await runFollowUps({ all: true });
    let summary = getJob(job.id)!;
    expect(summary.state).toBe("done");
    expect(summary.result).toEqual({ externalId: "post-1", url: "https://fake.test/p/post-1" });
    expect(summary.followUps![0]).toMatchObject({ state: "failed", error: "Les commentaires sont désactivés sur cette vidéo." });
    expect(summary.warning).toMatch(/Premier commentaire non posé\s:\sLes commentaires sont désactivés/);

    refuse = false;
    expect(retryFollowUp(job.id, "comment").followUps![0].state).toBe("waiting");
    await runFollowUps();
    summary = getJob(job.id)!;
    expect(summary.followUps![0]).toMatchObject({ state: "done", result: { externalId: "c-3" } });
    expect(summary.warning).toBeUndefined();
  });

  test("trop d'erreurs passagères : la suite échoue, la publication reste faite", async () => {
    const account = await connect(
      followUpConnector(newCalls(), () => {
        throw new ServiceError(503, "Service indisponible.");
      })
    );
    const job = enqueuePublish({ accountId: account.id, source: video(), options: {}, followUps: { comment: "Encore" } });
    await runPublishQueue();
    for (let pass = 0; pass < 8; pass += 1) await runFollowUps({ all: true });
    const summary = getJob(job.id)!;
    expect(summary.state).toBe("done");
    expect(summary.followUps![0]).toMatchObject({ state: "failed", errorCount: 8, attempts: 8 });
  });

  test("reprise après redémarrage : les suites et leur état de reprise sont sur le disque", async () => {
    const calls = newCalls();
    const account = await connect(
      followUpConnector(calls, (context) => {
        // Premier passage : un conteneur est créé chez le service, la publication attend.
        if (!context.resume) {
          context.saveProgress({ containerId: "box-1" });
          return { pending: true, retryAfterMs: 5000, note: "Le service prépare la réponse." };
        }
        return { externalId: `reply-of-${String(context.resume.containerId)}` };
      })
    );
    const job = enqueuePublish({ accountId: account.id, source: video(), options: {}, followUps: { comment: "Persistant" } });
    await runPublishQueue();
    await runFollowUps();
    const onDisk = storedJobs().find((entry) => entry.id === job.id)!;
    expect(onDisk.followUps![0]).toMatchObject({ kind: "comment", state: "waiting", resume: { containerId: "box-1" }, attempts: 1 });
    // L'état de reprise ne sort jamais vers l'interface.
    expect(getJob(job.id)!.followUps![0]).not.toHaveProperty("resume");

    // « Redémarrage » : la file repart de ce qui est sur le disque.
    configurePublishQueue({ autoRun: false, resolveSource: async (ref) => files[ref.file ?? ""] });
    Date.now = () => realNow() + 10_000;
    await runFollowUps();
    expect(getJob(job.id)!.followUps![0]).toMatchObject({ state: "done", result: { externalId: "reply-of-box-1" } });
    expect(storedJobs()[0].followUps![0].resume).toBeUndefined();
  });

  test("annuler la publication annule ses suites ; annuler une suite seule", async () => {
    const calls = newCalls();
    const account = await connect(followUpConnector(calls, () => ({ pending: true, retryAfterMs: 3600_000, note: "Vidéo privée." })));
    const first = enqueuePublish({ accountId: account.id, source: video(), options: {}, followUps: { comment: "A" } });
    expect(cancelJob(first.id).followUps![0]).toMatchObject({ state: "skipped", skipCode: "cancelled" });

    const second = enqueuePublish({ accountId: account.id, source: video({ id: "exp-2" }), options: {}, followUps: { comment: "B" } });
    await runPublishQueue();
    await runFollowUps();
    expect(cancelFollowUp(second.id, "comment").followUps![0]).toMatchObject({ state: "skipped", skipCode: "cancelled" });
    await runFollowUps({ all: true });
    expect(calls.comments).toHaveLength(1);
  });

  test("sans suite, un travail reste tel qu'avant (compatibilité)", async () => {
    const account = await connect(followUpConnector(newCalls(), () => ({})));
    const job = enqueuePublish({ accountId: account.id, source: video(), options: {} });
    expect(job).not.toHaveProperty("followUps");
    await runPublishQueue();
    expect(getJob(job.id)).toMatchObject({ state: "done" });
    expect(storedJobs()[0]).not.toHaveProperty("followUps");
  });
});

describe("couverture prise à la publication", () => {
  test("elle devient la couverture de la source et fixe l'option du connecteur", async () => {
    const account = await connect(
      followUpConnector(newCalls(), () => ({}), {
        followUps: { cover: { mode: "publish", option: { key: "cover", value: "custom" }, sourceKinds: ["video"] } },
        setCover: undefined,
        normalizeOptions: (options) => ({ ...(options as Record<string, unknown>) }),
      })
    );
    const job = enqueuePublish({ accountId: account.id, source: video(), options: { cover: "start" }, followUps: { cover: { file: "cover.png", width: 1080, height: 1920 } } });
    expect(job.source.kind === "video" && job.source.cover).toMatchObject({ id: "exp-1", kind: "image", file: "cover.png", width: 1080, height: 1920 });
    expect(job.options.cover).toBe("custom");
    expect(job.followUps?.[0]).toMatchObject({ kind: "cover", state: "waiting", atPublish: true });
    await runPublishQueue();
    expect(fake.published[0].coverPath).toBe(files["cover.png"]);
    await runFollowUps();
    expect(getJob(job.id)!.followUps![0]).toMatchObject({ state: "done", note: "Couverture envoyée avec la publication." });
  });
});

describe("filtre par source", () => {
  test("listJobs({ sourceModule, sourceId }) rend les publications d'un export", async () => {
    const account = await connect(followUpConnector(newCalls(), () => ({})));
    const a = enqueuePublish({ accountId: account.id, source: video({ id: "exp-1" }), options: {} });
    const b = enqueuePublish({ accountId: account.id, source: video({ id: "exp-2" }), options: {} });
    const c = enqueuePublish({ accountId: account.id, source: video({ id: "exp-1", module: "other-module" }), options: {} });
    expect(listJobs({ sourceModule: "fake-module", sourceId: "exp-1" }).map((job) => job.id)).toEqual([a.id]);
    expect(listJobs({ sourceId: "exp-1" }).map((job) => job.id).sort()).toEqual([a.id, c.id].sort());
    expect(listJobs({ sourceModule: "fake-module" }).map((job) => job.id).sort()).toEqual([a.id, b.id].sort());
    expect(listJobs({ sourceModule: "fake-module", sourceId: "exp-3" })).toEqual([]);
  });
});

describe("rôles de champ et description des connecteurs", () => {
  test("légende Instagram, texte Threads et message Facebook passent au rôle « caption », hashtags Instagram à « hashtags »", () => {
    const role = (connector: string, key: string) => getConnector(connector)!.publishFields!.find((field) => field.key === key)?.role;
    expect(role("instagram", "caption")).toBe("caption");
    expect(role("instagram", "hashtags")).toBe("hashtags");
    expect(role("instagram", "cover")).toBe("cover");
    expect(role("threads", "text")).toBe("caption");
    expect(role("facebook", "description")).toBe("caption");
    expect(role("facebook", "title")).toBe("title");
    expect(role("youtube", "description")).toBe("description");
    expect(role("youtube", "tags")).toBe("tags");
  });

  test("les mêmes clés d'options sont toujours acceptées", () => {
    const instagram = getConnector("instagram")!;
    const options = instagram.normalizeOptions!({ caption: "Salut", hashtags: ["clip"] }, video());
    expect(options.caption).toBe("Salut\n\n#clip");
    const threads = getConnector("threads")!;
    expect(threads.normalizeOptions!({ text: "Coucou" }, video()).text).toBe("Coucou");
  });

  test("listConnectors expose suites, limites, capacités à la demande et portées", () => {
    const youtube = describeConnector(getConnector("youtube")!);
    expect(youtube.followUps?.comment).toMatchObject({ maxLength: 10_000, capability: "comment.create", documented: false });
    expect(youtube.followUps?.subtitles).toMatchObject({ formats: expect.arrayContaining(["srt"]), capability: "captions.upload" });
    expect(youtube.followUps?.cover).toMatchObject({ mode: "after", capability: "cover.set" });
    expect(youtube.onDemandCapabilities?.sort()).toEqual(["captions.upload", "comment.create"]);
    expect(youtube.capabilityScopes?.["comment.create"]).toEqual(["https://www.googleapis.com/auth/youtube.force-ssl"]);

    const instagram = describeConnector(getConnector("instagram")!);
    expect(instagram.followUps?.comment?.maxLength).toBe(2200);
    expect(instagram.followUps?.cover).toMatchObject({ mode: "publish", option: { key: "cover", value: "custom" } });
    expect(instagram.followUps?.subtitles).toBeUndefined();
    expect(instagram.capabilityScopes?.["comment.create"]).toEqual(["instagram_business_manage_comments", "instagram_business_basic"]);

    const threads = describeConnector(getConnector("threads")!);
    expect(threads.followUps?.comment).toMatchObject({ maxLength: 500, count: "emoji-bytes" });
    expect(threads.followUps?.cover).toBeUndefined();
    expect(threads.capabilityScopes?.["comment.create"]).toEqual(["threads_manage_replies", "threads_content_publish"]);

    const facebook = describeConnector(getConnector("facebook")!);
    expect(facebook.followUps?.comment?.maxLength).toBe(8000);
    expect(facebook.followUps?.subtitles?.formats).toEqual(["srt"]);
    expect(facebook.onDemandCapabilities?.sort()).toEqual(["comment.create", "cover.set", "profile.details"]);
    expect(facebook.incrementalHelp).toMatch(/seconde configuration/);
  });
});

describe("connexion incrémentale", () => {
  test("les portées en plus ne sont demandées qu'à la demande, en gardant celles du compte", async () => {
    fake.tokenScope = `${FAKE_SCOPES.read} ${FAKE_SCOPES.write} ${FAKE_SCOPES.media}`;
    const connector = followUpConnector(newCalls(), () => ({}));
    registerConnector(connector);
    const first = authorize("fakesvc");
    // La première connexion reste limitée au jeu choisi.
    expect(first.url.searchParams.get("scope")).not.toContain(COMMENT_SCOPE);
    const account = await connect(connector);
    expect(account.capabilities).not.toContain("comment.create");
    expect(account.requestableCapabilities).toEqual(["comment.create"]);

    const scopes = incrementalScopes(connector, account.scopes, ["comment.create"])!;
    expect(scopes).toEqual([FAKE_SCOPES.read, FAKE_SCOPES.write, FAKE_SCOPES.media, COMMENT_SCOPE]);
    expect(incrementalScopes(connector, scopes, ["comment.create"])).toBeNull();
    expect(() => incrementalScopes(connector, scopes, ["profile.banner"])).toThrow(/n’offre pas/);

    const { url, cookie } = startAuthorization("fakesvc", "all", Date.now(), { scopes });
    const state = new URL(url).searchParams.get("state");
    expect(new URL(url).searchParams.get("scope")).toBe(scopes.join(" "));
    const transaction = readTransaction(cookie, "fakesvc", state);
    expect(transaction.scopes).toEqual(scopes);
    // Le service ne rend pas les portées : celles demandées valent.
    fake.tokenScope = undefined;
    const { accounts } = await completeAuthorization("fakesvc", "code-2", transaction);
    expect(accounts[0].id).toBe(account.id);
    expect(accounts[0].capabilities).toContain("comment.create");
    expect(getAccountSummary(account.id)?.requestableCapabilities).toEqual([]);
  });

  test("YouTube garde include_granted_scopes et n'ajoute force-ssl qu'à la demande", () => {
    process.env.YOUTUBE_CLIENT_ID = "client-id";
    process.env.YOUTUBE_CLIENT_SECRET = "client-secret";
    const youtube = getConnector("youtube")!;
    const base = new URL(startAuthorization("youtube", "upload").url);
    expect(base.searchParams.get("scope")).not.toMatch(/force-ssl/);
    expect(base.searchParams.get("include_granted_scopes")).toBe("true");
    const scopes = incrementalScopes(youtube, youtube.oauth.scopeSets[1].scopes, ["comment.create", "captions.upload"])!;
    expect(scopes.filter((scope) => scope.endsWith("force-ssl"))).toHaveLength(1);
    const upgraded = new URL(startAuthorization("youtube", "upload", Date.now(), { scopes }).url);
    expect(upgraded.searchParams.get("scope")?.split(" ")).toEqual(scopes);
    expect(upgraded.searchParams.get("include_granted_scopes")).toBe("true");
  });

  test("Facebook : la connexion incrémentale passe par la seconde configuration, exigée", () => {
    process.env.FACEBOOK_CLIENT_ID = "fb-client";
    process.env.FACEBOOK_CLIENT_SECRET = "fb-secret";
    process.env.FACEBOOK_CONFIG_ID = "111111";
    const facebook = getConnector("facebook")!;
    const scopes = incrementalScopes(facebook, facebook.oauth.scopeSets[0].scopes, ["comment.create"])!;
    expect(scopes).toContain("pages_manage_engagement");
    expect(new URL(startAuthorization("facebook", "all").url).searchParams.get("config_id")).toBe("111111");
    expect(() => startAuthorization("facebook", "all", Date.now(), { scopes })).toThrow(AppNotConfiguredError);
    process.env.FACEBOOK_EXTENDED_CONFIG_ID = "222222";
    expect(new URL(startAuthorization("facebook", "all", Date.now(), { scopes }).url).searchParams.get("config_id")).toBe("222222");
  });
});

// ─── Connecteurs réels, `fetch` simulé ────────────────────────────

type Handler = (url: URL, init: RequestInit & { method: string }) => Response | Promise<Response>;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** `fetch` simulé : chaque appel est noté, puis confié au gestionnaire. */
function mockFetch(handler: Handler) {
  const calls: { method: string; url: URL; body: unknown }[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url);
    const method = (init.method ?? "GET").toUpperCase();
    calls.push({ method, url, body: init.body });
    return handler(url, { ...init, method });
  }) as typeof fetch;
  return calls;
}

/** Contexte de suite sans compte enregistré : jeton fixe, quotas notés. */
function followUpContext(overrides: Partial<FollowUpContext> = {}): FollowUpContext & { charges: string[]; progress: unknown[] } {
  const charges: string[] = [];
  const progress: unknown[] = [];
  const context: FollowUpContext = {
    accountId: "acc-1",
    externalId: "UC-chaine",
    getAccessToken: async () => ({ value: "jeton", expiresAt: realNow() + 3600_000 }),
    chargeQuota: (method) => void charges.push(method),
    appSecretProof: () => "preuve",
    appSettings: {},
    result: { externalId: "vid-1", url: "https://www.youtube.com/watch?v=vid-1" },
    source: video(),
    options: {},
    attempt: 1,
    saveProgress: (resume) => void progress.push(resume),
    ...overrides,
  };
  return Object.assign(context, { charges, progress });
}

describe("YouTube", () => {
  test("commentaire : attend une vidéo privée, reprend à la date programmée, pose sinon (50 unités)", async () => {
    let status: Record<string, unknown> = { privacyStatus: "private" };
    let inserted: unknown = null;
    mockFetch(async (url, init) => {
      if (url.pathname === "/youtube/v3/videos") return json({ items: [{ id: "vid-1", status }] });
      if (url.pathname === "/youtube/v3/commentThreads" && init.method === "POST") {
        inserted = JSON.parse(String(init.body));
        return json({ id: "thread-1", snippet: { topLevelComment: { id: "comment-1" } } });
      }
      return json({ error: { code: 404, errors: [{ reason: "notFound" }] } }, 404);
    });
    const context = followUpContext();
    expect(await postYoutubeComment(context, "Salut")).toMatchObject({ pending: true, retryAfterMs: 6 * 3600_000 });
    const publishAt = new Date(realNow() + 2 * 24 * 3600_000).toISOString();
    status = { privacyStatus: "private", publishAt };
    expect(await postYoutubeComment(context, "Salut")).toMatchObject({ pending: true, retryAt: Date.parse(publishAt) + 2 * 60_000 });
    expect(inserted).toBeNull();

    status = { privacyStatus: "unlisted" };
    const outcome = await postYoutubeComment(context, "Salut");
    expect(outcome).toMatchObject({ externalId: "comment-1", url: "https://www.youtube.com/watch?v=vid-1&lc=comment-1" });
    expect((outcome as { note?: string }).note).toMatch(/épingler/);
    expect(inserted).toEqual({ snippet: { channelId: "UC-chaine", videoId: "vid-1", topLevelComment: { snippet: { textOriginal: "Salut" } } } });
    expect(context.charges.filter((method) => method === "commentThreads.insert")).toHaveLength(1);
    expect(youtubeCost("commentThreads.insert")).toEqual({ bucket: "general", units: 50 });
    expect(youtubeCost("captions.insert")).toEqual({ bucket: "general", units: 400 });
    expect(youtubeCost("thumbnails.set")).toEqual({ bucket: "general", units: 50 });
  });

  test("commentaire réessayé : retrouvé chez YouTube au lieu d'être posté deux fois", async () => {
    const calls = mockFetch(async (url) => {
      if (url.pathname === "/youtube/v3/videos") return json({ items: [{ id: "vid-1", status: { privacyStatus: "public" } }] });
      if (url.pathname === "/youtube/v3/commentThreads") {
        return json({ items: [{ id: "t-7", snippet: { topLevelComment: { id: "c-7", snippet: { textOriginal: "Salut", authorChannelId: { value: "UC-chaine" } } } } }] });
      }
      return json({}, 404);
    });
    expect(await postYoutubeComment(followUpContext({ attempt: 2 }), "Salut")).toMatchObject({ externalId: "c-7" });
    expect(calls.some((call) => call.method === "POST")).toBe(false);
  });

  test("commentaires désactivés : suite abandonnée sans erreur", async () => {
    mockFetch(async (url) => {
      if (url.pathname === "/youtube/v3/videos") return json({ items: [{ id: "vid-1", status: { privacyStatus: "public" } }] });
      return json({ error: { code: 403, message: "disabled", errors: [{ reason: "commentsDisabled" }] } }, 403);
    });
    expect(await postYoutubeComment(followUpContext(), "Salut")).toMatchObject({ skipped: true });
  });

  test("sous-titres (captions.insert, multipart) et miniature refusée pour une chaîne non validée", async () => {
    const srt = path.join(root, "piste.srt");
    fs.writeFileSync(srt, "1\n00:00:00,000 --> 00:00:01,000\nBonjour\n");
    const calls = mockFetch(async (url) => {
      if (url.pathname === "/upload/youtube/v3/captions") return json({ id: "track-1" });
      if (url.pathname === "/upload/youtube/v3/thumbnails/set") return json({ error: { code: 403, message: "no", errors: [{ reason: "forbidden" }] } }, 403);
      return json({}, 404);
    });
    const context = followUpContext();
    expect(await uploadYoutubeSubtitles(context, { path: srt, language: "fr" })).toMatchObject({ externalId: "track-1" });
    const upload = calls.find((call) => call.url.pathname === "/upload/youtube/v3/captions")!;
    expect(upload.url.searchParams.get("uploadType")).toBe("multipart");
    const body = Buffer.from(upload.body as Uint8Array).toString("utf-8");
    expect(body).toContain('"videoId":"vid-1"');
    expect(body).toContain('"language":"fr"');
    expect(body).toContain('"name":"Français"');
    expect(body).toContain("Bonjour");
    expect(context.charges).toContain("captions.insert");

    await expect(setYoutubeThumbnail(context, { path: files["cover.png"], mimeType: "image/png" })).rejects.toThrow(/youtube\.com\/verify/);
    await expect(setYoutubeThumbnail(context, { path: files["cover.png"], mimeType: "image/webp" })).rejects.toThrow(/JPEG ou PNG/);
  });
});

describe("Facebook", () => {
  test("commentaire : attend la date programmée, puis POST /{id}/comments", async () => {
    const calls = mockFetch(async (url) => {
      if (url.pathname.endsWith("/comments")) return json({ id: "post_comment-1" });
      return json({}, 404);
    });
    const scheduled = new Date(realNow() + 3600_000).toISOString();
    const context = followUpContext({ externalId: "123", result: { externalId: "998877", url: "https://www.facebook.com/reel/998877" }, options: { scheduledAt: scheduled } });
    expect(await postFacebookComment(context, "Merci")).toMatchObject({ pending: true, retryAt: Date.parse(scheduled) + 2 * 60_000 });
    expect(await postFacebookComment({ ...context, options: { privacy: "private" } } as FollowUpContext, "Merci")).toMatchObject({ pending: true });
    const done = await postFacebookComment({ ...context, options: {} } as FollowUpContext, "Merci");
    expect(done).toMatchObject({ externalId: "post_comment-1", url: "https://www.facebook.com/reel/998877" });
    const post = calls.find((call) => call.method === "POST")!;
    expect(post.url.pathname).toMatch(/\/998877\/comments$/);
    expect(new URLSearchParams(String(post.body)).get("message")).toBe("Merci");
  });

  test("sous-titres : fichier nommé avec la locale ; une publication sans vidéo est ignorée", async () => {
    const srt = path.join(root, "piste.srt");
    fs.writeFileSync(srt, "1\n00:00:00,000 --> 00:00:01,000\nBonjour\n");
    const calls = mockFetch(async () => json({ success: true }));
    expect(facebookLocale("fr")).toBe("fr_FR");
    expect(facebookLocale("en-GB")).toBe("en_GB");
    const context = followUpContext({ externalId: "123", result: { externalId: "998877", url: "https://www.facebook.com/998877" } });
    await uploadFacebookSubtitles(context, { path: srt, language: "fr" });
    const form = calls[0].body as FormData;
    expect((form.get("captions_file") as File).name).toBe("subtitles.fr_FR.srt");
    expect(await uploadFacebookSubtitles({ ...context, result: { externalId: "123_456", url: "https://www.facebook.com/123_456" } } as FollowUpContext, { path: srt, language: "fr" })).toMatchObject({
      skipped: true,
    });
  });
});

describe("Instagram et Threads", () => {
  test("Instagram : POST /{ig-media-id}/comments avec message", async () => {
    const calls = mockFetch(async () => json({ id: "17870913679156914" }));
    const context = followUpContext({ externalId: "17841400000000001", result: { externalId: "17895695668004550", url: "https://www.instagram.com/reel/abc/" } });
    expect(await postInstagramComment(context, "#clip #montage")).toMatchObject({ externalId: "17870913679156914", url: "https://www.instagram.com/reel/abc/" });
    expect(calls[0].url.host).toBe("graph.instagram.com");
    expect(calls[0].url.pathname).toMatch(/\/17895695668004550\/comments$/);
    expect(new URLSearchParams(String(calls[0].body)).get("message")).toBe("#clip #montage");
  });

  test("Threads : réponse à sa propre publication, conteneur repris sans doublon", async () => {
    let status = "IN_PROGRESS";
    const calls = mockFetch(async (url, init) => {
      if (url.pathname === "/v1.0/me/threads" && init.method === "POST") return json({ id: "box-1" });
      if (url.pathname === "/v1.0/box-1") return json({ id: "box-1", status });
      if (url.pathname.endsWith("/threads_publish")) return json({ id: "reply-1" });
      if (url.pathname === "/v1.0/reply-1") return json({ id: "reply-1", permalink: "https://www.threads.com/@moi/post/xyz" });
      return json({}, 404);
    });
    const context = followUpContext({ externalId: "17841400000000001", result: { externalId: "post-9", url: "https://www.threads.com/@moi/post/abc" } });
    const first = await postThreadsReply(context, "Et la suite");
    expect(first).toMatchObject({ pending: true });
    const created = calls.find((call) => call.method === "POST")!;
    expect(Object.fromEntries(new URLSearchParams(String(created.body)))).toMatchObject({ media_type: "TEXT", text: "Et la suite", reply_to_id: "post-9" });
    expect(context.progress.at(-1)).toMatchObject({ containerId: "box-1" });

    status = "FINISHED";
    const resumed = await postThreadsReply({ ...context, resume: context.progress.at(-1) as Record<string, unknown>, attempt: 2 } as FollowUpContext, "Et la suite");
    expect(resumed).toMatchObject({ externalId: "reply-1", url: "https://www.threads.com/@moi/post/xyz" });
    expect(calls.filter((call) => call.method === "POST" && call.url.pathname === "/v1.0/me/threads")).toHaveLength(1);
    expect(context.charges).toContain("threads_reply");
  });
});
