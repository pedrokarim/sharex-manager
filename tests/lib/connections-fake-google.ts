/**
 * Faux serveur Google pour les tests des comptes connectés : OAuth, API
 * YouTube Data v3 et envoi reprenable. Remplace `fetch` le temps d'un test ;
 * aucun appel réel ne part.
 */

export interface FakeChannel {
  id: string;
  title: string;
  handle?: string;
}

export interface FakeGoogle {
  fetch: typeof fetch;
  /** Code d'autorisation → chaîne et portées accordées. */
  codes: Map<string, { channel: FakeChannel; scope: string }>;
  /** Jetons d'actualisation refusés (« invalid_grant »). */
  revokedRefreshTokens: Set<string>;
  revokeCalls: string[];
  tokenCalls: Record<string, string>[];
  /** Requêtes reçues : méthode, chemin, requête. */
  calls: { method: string; url: string; headers: Record<string, string> }[];
  /** Branding existant de la chaîne et corps reçus par channels.update. */
  branding: Record<string, unknown>;
  channelUpdates: unknown[];
  upload: {
    /** Octets reçus par la session, dans l'ordre. */
    received: Buffer;
    total: number;
    sessions: number;
    /** Coupe le prochain bloc après ce nombre d'octets (puis lève une erreur réseau). */
    cutNextChunkAfter: number | null;
    /** Débuts des blocs reçus (Content-Range). */
    chunkStarts: number[];
    metadata: unknown;
    /** Raison d'erreur renvoyée à l'ouverture de session (« quotaExceeded »…). */
    failOpenWith: string | null;
    /** La session répond 404 à la prochaine requête. */
    expireNext: boolean;
  };
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

const googleError = (status: number, reason: string) => json({ error: { code: status, message: reason, errors: [{ reason }] } }, status);

async function bodyBytes(body: BodyInit | null | undefined): Promise<Buffer> {
  if (!body) return Buffer.alloc(0);
  if (typeof body === "string") return Buffer.from(body);
  if (body instanceof Uint8Array) return Buffer.from(body.buffer, body.byteOffset, body.byteLength);
  if (body instanceof ArrayBuffer) return Buffer.from(body);
  return Buffer.from(await new Response(body).arrayBuffer());
}

export function createFakeGoogle(): FakeGoogle {
  let tokenCounter = 0;
  const accessTokens = new Map<string, FakeChannel>();
  const refreshTokens = new Map<string, FakeChannel>();

  const fake: FakeGoogle = {
    fetch: undefined as unknown as typeof fetch,
    codes: new Map(),
    revokedRefreshTokens: new Set(),
    revokeCalls: [],
    tokenCalls: [],
    calls: [],
    branding: { channel: { title: "Ma chaîne", description: "Description gardée", keywords: "anime jeux" }, image: { bannerExternalUrl: "https://old" } },
    channelUpdates: [],
    upload: { received: Buffer.alloc(0), total: 0, sessions: 0, cutNextChunkAfter: null, chunkStarts: [], metadata: null, failOpenWith: null, expireNext: false },
  };

  const channelFor = (headers: Record<string, string>) => {
    const token = (headers.authorization ?? "").replace(/^Bearer /, "");
    return accessTokens.get(token) ?? null;
  };

  const issue = (channel: FakeChannel) => {
    tokenCounter += 1;
    const access = `access-${tokenCounter}`;
    accessTokens.set(access, channel);
    return access;
  };

  fake.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url);
    const method = (init.method ?? "GET").toUpperCase();
    const headers: Record<string, string> = {};
    new Headers(init.headers).forEach((value, key) => (headers[key.toLowerCase()] = value));
    fake.calls.push({ method, url: url.toString(), headers });

    // ─── OAuth ───
    if (url.host === "oauth2.googleapis.com" && url.pathname === "/token") {
      const params = Object.fromEntries(new URLSearchParams(String(init.body)));
      fake.tokenCalls.push(params);
      if (params.grant_type === "authorization_code") {
        const entry = fake.codes.get(params.code);
        if (!entry || !params.code_verifier) return json({ error: "invalid_grant" }, 400);
        const refresh = `refresh-${entry.channel.id}-${tokenCounter + 1}`;
        refreshTokens.set(refresh, entry.channel);
        return json({ access_token: issue(entry.channel), refresh_token: refresh, expires_in: 3599, scope: entry.scope, token_type: "Bearer" });
      }
      if (params.grant_type === "refresh_token") {
        const channel = refreshTokens.get(params.refresh_token);
        if (!channel || fake.revokedRefreshTokens.has(params.refresh_token)) return json({ error: "invalid_grant", error_description: "Token has been expired or revoked." }, 400);
        return json({ access_token: issue(channel), expires_in: 3599, token_type: "Bearer" });
      }
      return json({ error: "unsupported_grant_type" }, 400);
    }
    if (url.host === "oauth2.googleapis.com" && url.pathname === "/revoke") {
      fake.revokeCalls.push(new URLSearchParams(String(init.body)).get("token") ?? "");
      return new Response("", { status: 200 });
    }

    // ─── Envoi reprenable ───
    if (url.host === "upload.fake") {
      if (fake.upload.expireNext) {
        fake.upload.expireNext = false;
        return new Response("", { status: 404 });
      }
      const range = headers["content-range"] ?? "";
      const total = fake.upload.total;
      const statusResponse = () =>
        fake.upload.received.length >= total
          ? json({ id: "video-1", status: { privacyStatus: "unlisted" } }, 200)
          : new Response("", { status: 308, headers: fake.upload.received.length > 0 ? { Range: `bytes=0-${fake.upload.received.length - 1}` } : {} });
      if (range.startsWith("bytes */")) return statusResponse();
      const match = range.match(/^bytes (\d+)-(\d+)\/(\d+)$/);
      if (!match) return new Response("", { status: 400 });
      const start = Number(match[1]);
      fake.upload.chunkStarts.push(start);
      if (start !== fake.upload.received.length) return new Response("", { status: 400 });
      const bytes = await bodyBytes(init.body as BodyInit);
      if (fake.upload.cutNextChunkAfter !== null) {
        const keep = fake.upload.cutNextChunkAfter;
        fake.upload.cutNextChunkAfter = null;
        fake.upload.received = Buffer.concat([fake.upload.received, bytes.subarray(0, keep)]);
        throw new TypeError("fetch failed");
      }
      fake.upload.received = Buffer.concat([fake.upload.received, bytes]);
      return statusResponse();
    }

    if (url.host !== "www.googleapis.com") return new Response("not found", { status: 404 });
    const channel = channelFor(headers);
    if (!channel) return googleError(401, "authError");

    if (url.pathname === "/upload/youtube/v3/videos" && method === "POST") {
      if (fake.upload.failOpenWith) return googleError(403, fake.upload.failOpenWith);
      fake.upload.sessions += 1;
      fake.upload.total = Number(headers["x-upload-content-length"]);
      fake.upload.received = Buffer.alloc(0);
      fake.upload.metadata = JSON.parse(String(init.body));
      return new Response("", { status: 200, headers: { Location: `https://upload.fake/session/${fake.upload.sessions}` } });
    }
    if (url.pathname === "/youtube/v3/channels" && method === "GET") {
      const part = url.searchParams.get("part");
      const item: Record<string, unknown> = { id: channel.id };
      if (part?.includes("snippet")) item.snippet = { title: channel.title, customUrl: channel.handle, thumbnails: { default: { url: `https://yt3.fake/${channel.id}.jpg` } } };
      if (part?.includes("contentDetails")) item.contentDetails = { relatedPlaylists: { uploads: `UU${channel.id}` } };
      if (part?.includes("brandingSettings")) item.brandingSettings = structuredClone(fake.branding);
      return json({ items: [item] });
    }
    if (url.pathname === "/youtube/v3/channels" && method === "PUT") {
      const body = JSON.parse(String(init.body));
      fake.channelUpdates.push(body);
      fake.branding = body.brandingSettings;
      return json(body);
    }
    if (url.pathname === "/upload/youtube/v3/channelBanners/insert") return json({ url: "https://yt3.fake/banner-new" });
    if (url.pathname === "/upload/youtube/v3/watermarks/set") return new Response(null, { status: 204 });
    if (url.pathname === "/youtube/v3/videos" && method === "GET") {
      return json({ items: [{ id: url.searchParams.get("id"), processingDetails: { processingStatus: "succeeded" }, status: { uploadStatus: "processed", privacyStatus: "unlisted" } }] });
    }
    return googleError(404, "notFound");
  }) as typeof fetch;

  return fake;
}

export const TEST_CHANNELS: Record<string, FakeChannel> = {
  first: { id: "UCfirst000000000000000001", title: "Première chaîne", handle: "@premiere" },
  second: { id: "UCsecond00000000000000002", title: "Seconde chaîne", handle: "@seconde" },
};

export const ALL_SCOPES = "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube";
export const UPLOAD_SCOPES = "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly";
