import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { setDataRoot } from "@/lib/connections/store";
import { chargeQuota, getQuotaUsage } from "@/lib/connections/quota";
import { youtubeConnector } from "@/lib/connections/connectors/youtube";
import { cleanHandle, fetchChannelVideos, parseIsoDuration, youtubeChannelCost } from "@/lib/connections/connectors/youtube/research";
import type { ConnectorContext } from "@/lib/connections/types";
import { readTransaction, startAuthorization } from "@/lib/connections/oauth";
import { completeConnection } from "@/lib/connections/accounts";
import { readChannelVideos } from "@/lib/connections";
import { ALL_SCOPES, TEST_CHANNELS, createFakeGoogle } from "./connections-fake-google";

const realFetch = globalThis.fetch;
const saved = { ...process.env };
let root: string;
let requests: URL[];

/** Faux YouTube : une chaîne publique de 70 envois, dont un sur trois dure plus de 3 minutes. */
function fakeYoutube(options: { channelMissing?: boolean } = {}) {
  const ids = Array.from({ length: 70 }, (_, index) => `video${String(index).padStart(4, "0")}`);
  return (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    requests.push(url);
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
    if (url.pathname.endsWith("/channels")) {
      if (options.channelMissing) return json({ items: [] });
      return json({
        items: [
          {
            id: "UCdemo",
            snippet: { title: "Chaîne démo", customUrl: "@chainedemo" },
            contentDetails: { relatedPlaylists: { uploads: "UUdemo" } },
            statistics: { videoCount: "70" },
          },
        ],
      });
    }
    if (url.pathname.endsWith("/playlistItems")) {
      const start = url.searchParams.get("pageToken") ? Number(url.searchParams.get("pageToken")) : 0;
      const page = ids.slice(start, start + 50);
      return json({ items: page.map((videoId) => ({ contentDetails: { videoId } })), ...(start + 50 < ids.length ? { nextPageToken: String(start + 50) } : {}) });
    }
    if (url.pathname.endsWith("/videos")) {
      const wanted = (url.searchParams.get("id") ?? "").split(",");
      return json({
        items: wanted.map((id) => {
          const index = Number(id.slice(5));
          return {
            id,
            snippet: { title: `Vidéo ${index}`, publishedAt: new Date(Date.UTC(2026, 9, 14) - index * 86_400_000).toISOString() },
            contentDetails: { duration: index % 3 === 2 ? "PT4M10S" : "PT45S" },
            statistics: { viewCount: String(1000 + index) },
          };
        }),
      });
    }
    return new Response("{}", { status: 404 });
  }) as typeof fetch;
}

function context(): ConnectorContext {
  return {
    accountId: "acc-yt01",
    externalId: "UCmine",
    getAccessToken: async () => ({ value: "jeton-de-test", expiresAt: Date.now() + 3_600_000 }) as never,
    chargeQuota: (method) => chargeQuota(youtubeConnector, method),
    appSecretProof: () => "",
    appSettings: {},
  };
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "connections-yt-research-"));
  setDataRoot(path.join(root, "data"));
  requests = [];
});

afterEach(() => {
  globalThis.fetch = realFetch;
  for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
  Object.assign(process.env, saved);
  setDataRoot(null);
  fs.rmSync(root, { recursive: true, force: true });
});

describe("lecture publique d'une chaîne", () => {
  test("lit la playlist des envois par @nom, durée et vues, et compte chaque appel", async () => {
    globalThis.fetch = fakeYoutube();
    const result = await fetchChannelVideos(context(), { handle: "@chainedemo" }, { scan: 100, wantShorts: 30, shortMaxSeconds: 180 });
    // Première page : 50 envois, dont 34 courts ; 30 suffisent, pas de seconde page.
    expect(result.calls).toEqual(["channels.list", "playlistItems.list", "videos.list"]);
    expect(result.videos).toHaveLength(50);
    expect(result.channel).toEqual({ id: "UCdemo", title: "Chaîne démo", handle: "@chainedemo", url: "https://www.youtube.com/@chainedemo", videoCount: 70 });
    expect(result.videos[0]).toEqual({ id: "video0000", title: "Vidéo 0", url: "https://www.youtube.com/watch?v=video0000", publishedAt: "2026-10-14T00:00:00.000Z", durationSeconds: 45, views: 1000 });
    expect(requests[0].searchParams.get("forHandle")).toBe("@chainedemo");
    // Jamais la recherche, à 100 unités.
    expect(requests.some((url) => url.pathname.endsWith("/search"))).toBe(false);
    expect(getQuotaUsage(youtubeConnector)?.buckets.find((bucket) => bucket.id === "general")?.used).toBe(3);
  });

  test("lit une seconde page quand la première n'a pas assez de vidéos courtes", async () => {
    globalThis.fetch = fakeYoutube();
    const result = await fetchChannelVideos(context(), { mine: true }, { scan: 100, wantShorts: 40 });
    expect(result.calls).toEqual(["channels.list", "playlistItems.list", "videos.list", "playlistItems.list", "videos.list"]);
    expect(result.videos).toHaveLength(70);
    expect(requests[0].searchParams.get("mine")).toBe("true");
    expect(getQuotaUsage(youtubeConnector)?.buckets.find((bucket) => bucket.id === "general")?.used).toBe(5);
  });

  test("refuse un identifiant invalide avant tout appel, et dit quand la chaîne n'existe pas", async () => {
    globalThis.fetch = fakeYoutube({ channelMissing: true });
    await expect(fetchChannelVideos(context(), { handle: "pas valide !" })).rejects.toThrow(/invalide/);
    expect(requests).toHaveLength(0);
    await expect(fetchChannelVideos(context(), { handle: "@inconnue" })).rejects.toThrow(/introuvable/);
  });

  test("coût annoncé : 3 unités au moins, 5 au plus pour 100 envois", () => {
    expect(youtubeChannelCost({ scan: 100 })).toEqual({ min: 3, max: 5 });
    expect(youtubeChannelCost({ scan: 50 })).toEqual({ min: 3, max: 3 });
    expect(youtubeConnector.research?.costPerChannel({ scan: 100 })).toEqual({ min: 3, max: 5 });
  });

  test("lit les durées ISO 8601 et les identifiants de chaîne", () => {
    expect(parseIsoDuration("PT45S")).toBe(45);
    expect(parseIsoDuration("PT1M5S")).toBe(65);
    expect(parseIsoDuration("PT1H2M3S")).toBe(3723);
    expect(parseIsoDuration("P1DT1S")).toBe(86_401);
    expect(parseIsoDuration("n'importe quoi")).toBe(0);
    expect(cleanHandle("https://www.youtube.com/@ChaineDemo/shorts")).toBe("@ChaineDemo");
    expect(cleanHandle("chaine.demo")).toBe("@chaine.demo");
    expect(cleanHandle("@a")).toBeNull();
  });

  test("passe par un compte connecté : capacité de lecture vérifiée, quota du service compté", async () => {
    delete process.env.CONNECTIONS_ENCRYPTION_KEY;
    process.env.AUTH_SECRET = "secret-de-test-assez-long-pour-hkdf";
    process.env.AUTH_URL = "https://sxm.test";
    process.env.YOUTUBE_CLIENT_ID = "client-id";
    process.env.YOUTUBE_CLIENT_SECRET = "client-secret";
    const google = createFakeGoogle();
    const youtube = fakeYoutube();
    // OAuth par le faux Google ; les lectures de la chaîne étudiée par le faux YouTube.
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const research = url.searchParams.has("forHandle") || url.pathname.endsWith("/playlistItems") || (url.pathname.endsWith("/videos") && url.searchParams.get("part")?.includes("contentDetails"));
      return research ? youtube(input, init) : google.fetch(input, init);
    }) as typeof fetch;
    const { url, cookie } = startAuthorization("youtube", "all");
    google.codes.set("code-1", { channel: TEST_CHANNELS.first, scope: ALL_SCOPES });
    const account = await completeConnection("youtube", "code-1", readTransaction(cookie, "youtube", new URL(url).searchParams.get("state")));
    const before = getQuotaUsage(youtubeConnector)?.buckets.find((bucket) => bucket.id === "general")?.used ?? 0;

    const result = await readChannelVideos(account.id, { handle: "@chainedemo" }, { scan: 50 });
    expect(result.videos).toHaveLength(50);
    const after = getQuotaUsage(youtubeConnector)?.buckets.find((bucket) => bucket.id === "general")?.used ?? 0;
    expect(after - before).toBe(3);
    await expect(readChannelVideos("compte-inconnu", { handle: "@chainedemo" })).rejects.toThrow();
  });
});
