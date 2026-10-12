/**
 * Faux service pour les tests des extensions génériques des comptes
 * connectés : un connecteur inventé (« fakesvc »), son serveur OAuth et son
 * API, sans rien de réel. Remplace `fetch` le temps d'un test.
 */

import { OAuthError, ReconnectRequiredError } from "@/lib/connections/errors";
import { readTransaction, startAuthorization } from "@/lib/connections/oauth";
import type { Connector, DiscoveredAccount, PublishContext, TokenSet } from "@/lib/connections/types";

export const FAKE_SCOPES = { read: "fake.read", write: "fake.write", media: "fake.media" };

export interface FakeServiceState {
  /** Requêtes reçues par le serveur OAuth (méthode, adresse, corps, en-têtes). */
  tokenCalls: { method: string; url: string; params: Record<string, string>; authorization?: string }[];
  /** Forme de la réponse d'échange : normée, en tableau `data`, ou erreur non normée. */
  tokenFormat: "standard" | "data-array" | "error-type";
  /** Portées rendues par la réponse d'échange (absentes : `undefined`). */
  tokenScope?: string;
  /** Comptes rendus par `fetchAccounts` (vide : le connecteur seul rend son profil). */
  pages: { id: string; name: string }[];
  exchangeCalls: number;
  refreshCalls: number;
  /** Prochaine réponse du renouvellement : jeton neuf, refus définitif ou panne passagère. */
  refreshMode: "ok" | "refuse" | "fail";
  revokeCalls: TokenSet[];
  revokeResult: boolean;
  /** Ce que `publish()` a reçu, un appel par passage. */
  published: PublishContext[];
  /** Comportement de `publish()` au prochain passage. */
  publishMode: "ok" | "reconnect" | "lost-response" | "quota-account" | "credits";
  /** Publications « faites » chez le service (pour `findExisting`). */
  posts: { id: string; text: string }[];
  counter: number;
}

export function createFakeState(): FakeServiceState {
  return {
    tokenCalls: [],
    tokenFormat: "standard",
    tokenScope: `${FAKE_SCOPES.read} ${FAKE_SCOPES.write} ${FAKE_SCOPES.media}`,
    pages: [],
    exchangeCalls: 0,
    refreshCalls: 0,
    refreshMode: "ok",
    revokeCalls: [],
    revokeResult: true,
    published: [],
    publishMode: "ok",
    posts: [],
    counter: 0,
  };
}

const json = (body: unknown, status = 200) => new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** Serveur OAuth du faux service. */
export function fakeFetch(state: FakeServiceState): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url);
    const method = (init?.method ?? "GET").toUpperCase();
    const headers = new Headers(init?.headers);
    if (url.origin === "https://fake.test" && url.pathname === "/oauth/token") {
      const params = Object.fromEntries(method === "GET" ? url.searchParams : new URLSearchParams(String(init?.body ?? "")));
      state.tokenCalls.push({ method, url: url.toString(), params, authorization: headers.get("authorization") ?? undefined });
      if (state.tokenFormat === "error-type") {
        return json({ error_type: "OAuthException", code: 400, error_message: "Invalid verification code format." }, 400);
      }
      state.counter += 1;
      if (params.grant_type === "refresh_token") {
        if (params.refresh_token?.startsWith("dead")) return json({ error: "invalid_grant" }, 400);
        return json({ access_token: `access-r${state.counter}`, refresh_token: `refresh-r${state.counter}`, expires_in: 7200, token_type: "bearer" });
      }
      if (state.tokenFormat === "data-array") {
        // Identifiant de 17 chiffres rendu en nombre : il doit rester exact.
        return json(`{"data":[{"access_token":"short-${state.counter}","user_id":17841400000000001,"permissions":"${FAKE_SCOPES.read},${FAKE_SCOPES.write}"}]}`);
      }
      return json({ access_token: `short-${state.counter}`, token_type: "bearer", ...(state.tokenScope ? { scope: state.tokenScope } : {}) });
    }
    return json({ error: "not_found" }, 404);
  }) as typeof fetch;
}

/** Le faux connecteur ; `overrides` change une partie de sa description. */
export function fakeConnector(state: FakeServiceState, overrides: Partial<Connector> = {}): Connector {
  const connector: Connector = {
    id: "fakesvc",
    label: "Faux service",
    logo: "fakesvc",
    accountNoun: { one: "page", many: "pages" },
    status: "ready",
    capabilities: [
      { capability: "posts.list", scopes: [FAKE_SCOPES.read] },
      { capability: "publish.text", scopes: [FAKE_SCOPES.write] },
      { capability: "publish.image", scopes: [FAKE_SCOPES.write], allOf: [FAKE_SCOPES.media] },
      { capability: "publish.video", scopes: [FAKE_SCOPES.write], allOf: [FAKE_SCOPES.media] },
    ],
    app: {
      envPrefix: "FAKESVC",
      consoleUrl: "https://fake.test/console",
      setupSteps: [],
      disconnectHelp: "Retirez l’application dans les réglages du faux service.",
    },
    oauth: {
      authorizeUrl: "https://fake.test/oauth/authorize",
      tokenUrl: "https://fake.test/oauth/token",
      pkce: false,
      scopeSets: [{ id: "all", label: "Tout", scopes: [FAKE_SCOPES.read, FAKE_SCOPES.write, FAKE_SCOPES.media] }],
    },
    tokenLifetime: { renewBeforeMs: 30 * 24 * 3600_000, minAgeMs: 24 * 3600_000 },
    async exchangeToken(tokens, context) {
      state.exchangeCalls += 1;
      if (!context.app.clientSecret) throw new Error("secret manquant");
      return { accessToken: `long-${tokens.accessToken}`, expiresAt: Date.now() + 60 * 24 * 3600_000, tokenType: "bearer" };
    },
    async refreshToken(_account, tokens) {
      state.refreshCalls += 1;
      if (state.refreshMode === "refuse") throw new OAuthError("invalid_grant", "Jeton refusé par le faux service.");
      if (state.refreshMode === "fail") throw new Error("Faux service indisponible.");
      return { accessToken: `${tokens.accessToken}+`, expiresAt: Date.now() + 60 * 24 * 3600_000 };
    },
    async fetchProfile(token, _charge, account) {
      return { externalId: account?.externalId ?? "user-1", name: `Profil ${token.value.slice(0, 12)}`, url: "https://fake.test/u/1" };
    },
    async fetchAccounts(token): Promise<DiscoveredAccount[]> {
      return state.pages.map((page) => ({
        externalId: page.id,
        name: page.name,
        avatarUrl: `https://fake.test/a/${page.id}.png`,
        token: { accessToken: `page-token-${page.id}-${token.value}` },
        data: { kind: "page" },
        ...(page.id.endsWith("ro") ? { capabilities: ["posts.list" as const] } : {}),
      }));
    },
    async revokeAccess(tokens) {
      state.revokeCalls.push(tokens);
      return state.revokeResult;
    },
    async publish(context) {
      state.published.push(context);
      const mode = state.publishMode;
      state.publishMode = "ok";
      if (mode === "reconnect") throw new ReconnectRequiredError("Jeton refusé par le faux service (code 190).");
      if (mode === "quota-account") {
        const { QuotaExceededError } = await import("@/lib/connections/errors");
        throw new QuotaExceededError("Limite du compte atteinte.", Date.now() + 3600_000, "posts", "account");
      }
      if (mode === "credits") {
        const { CreditsExhaustedError } = await import("@/lib/connections/errors");
        throw new CreditsExhaustedError("Crédits épuisés chez le faux service.");
      }
      const id = `post-${state.posts.length + 1}`;
      state.posts.push({ id, text: context.source.kind === "text" ? context.source.text : String(context.options.caption ?? "") });
      // La publication est faite, mais la réponse se perd.
      if (mode === "lost-response") throw new TypeError("fetch failed");
      return { externalId: id, url: `https://fake.test/p/${id}` };
    },
    async findExisting(context) {
      const text = context.source.kind === "text" ? context.source.text : String(context.options.caption ?? "");
      const post = state.posts.find((entry) => entry.text === text);
      return post ? { externalId: post.id, url: `https://fake.test/p/${post.id}` } : null;
    },
    ...overrides,
  };
  return connector;
}

/** Parcours complet jusqu'au retour du service : adresse, cookie, transaction relue. */
export function authorize(connectorId: string, options: { mode?: "popup" | "redirect"; returnTo?: string } = {}) {
  const { url, cookie } = startAuthorization(connectorId, "all", Date.now(), options);
  const state = new URL(url).searchParams.get("state");
  return { url: new URL(url), cookie, transaction: readTransaction(cookie, connectorId, state) };
}
