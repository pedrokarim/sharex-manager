import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { setDataRoot } from "@/lib/connections/store";
import { startAuthorization, readTransaction, pkceChallenge, TRANSACTION_TTL_SECONDS } from "@/lib/connections/oauth";
import {
  completeConnection,
  disconnectAccount,
  getAccessToken,
  getAccountSummary,
  listAccounts,
  renameAccount,
} from "@/lib/connections/accounts";
import { getAppStatus, saveAppConfig } from "@/lib/connections/apps";
import { getConnector } from "@/lib/connections/registry";
import { ReconnectRequiredError } from "@/lib/connections/errors";
import { ALL_SCOPES, TEST_CHANNELS, UPLOAD_SCOPES, createFakeGoogle, type FakeChannel, type FakeGoogle } from "./connections-fake-google";

const saved = { ...process.env };
const realFetch = globalThis.fetch;
let root: string;
let google: FakeGoogle;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "connections-"));
  setDataRoot(root);
  delete process.env.CONNECTIONS_ENCRYPTION_KEY;
  process.env.AUTH_SECRET = "secret-de-test-assez-long-pour-hkdf";
  process.env.AUTH_URL = "https://sxm.test/";
  process.env.YOUTUBE_CLIENT_ID = "client-id.apps.googleusercontent.com";
  process.env.YOUTUBE_CLIENT_SECRET = "client-secret";
  google = createFakeGoogle();
  globalThis.fetch = google.fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  setDataRoot(null);
  fs.rmSync(root, { recursive: true, force: true });
  for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
  Object.assign(process.env, saved);
});

let codeCounter = 0;
async function connect(channel: FakeChannel, scope = ALL_SCOPES, scopeSet = "all") {
  const { url, cookie } = startAuthorization("youtube", scopeSet);
  const state = new URL(url).searchParams.get("state");
  const code = `code-${++codeCounter}`;
  google.codes.set(code, { channel, scope });
  return completeConnection("youtube", code, readTransaction(cookie, "youtube", state));
}

/** Tout ce qui a été écrit sur le disque, pour y chercher un jeton. */
const disk = () =>
  fs
    .readdirSync(root)
    .map((file) => fs.readFileSync(path.join(root, file), "utf-8"))
    .join("\n");

describe("connexion OAuth", () => {
  test("adresse d'autorisation : PKCE S256, accès hors ligne, URI tirée d'AUTH_URL", () => {
    const { url, cookie } = startAuthorization("youtube", "upload");
    const params = new URL(url).searchParams;
    expect(url.startsWith("https://accounts.google.com/o/oauth2/v2/auth?")).toBe(true);
    expect(params.get("redirect_uri")).toBe("https://sxm.test/api/connections/youtube/callback");
    expect(params.get("access_type")).toBe("offline");
    expect(params.get("prompt")).toBe("consent");
    expect(params.get("include_granted_scopes")).toBe("true");
    expect(params.get("code_challenge_method")).toBe("S256");
    expect(params.get("scope")).toBe(UPLOAD_SCOPES);
    const transaction = readTransaction(cookie, "youtube", params.get("state"));
    expect(pkceChallenge(transaction.verifier!)).toBe(params.get("code_challenge"));
  });

  test("state invalide, cookie altéré ou expiré : refus", () => {
    const { url, cookie } = startAuthorization("youtube", "all");
    const state = new URL(url).searchParams.get("state");
    expect(() => readTransaction(cookie, "youtube", "autre")).toThrow(/invalide/);
    expect(() => readTransaction(cookie, "facebook", state)).toThrow();
    expect(() => readTransaction(`${cookie}x`, "youtube", state)).toThrow();
    expect(() => readTransaction(undefined, "youtube", state)).toThrow();
    expect(() => readTransaction(cookie, "youtube", state, Date.now() + (TRANSACTION_TTL_SECONDS + 1) * 1000)).toThrow();
  });

  test("un connecteur « bientôt » ne se connecte pas", () => {
    expect(() => startAuthorization("x", null)).toThrow(/pas encore/);
  });

  test("application saisie dans l'interface quand l'environnement ne la donne pas, secret chiffré", () => {
    delete process.env.YOUTUBE_CLIENT_ID;
    delete process.env.YOUTUBE_CLIENT_SECRET;
    const youtube = getConnector("youtube")!;
    expect(getAppStatus(youtube).configured).toBe(false);
    expect(() => startAuthorization("youtube", "all")).toThrow(/configurée/);
    saveAppConfig("youtube", { clientId: "id-saisi", clientSecret: "secret-saisi" });
    const status = getAppStatus(youtube);
    expect(status).toMatchObject({ configured: true, source: "file", clientId: "id-saisi" });
    expect(disk()).not.toContain("secret-saisi");
    expect(fs.statSync(path.join(root, "apps.json")).isFile()).toBe(true);
    expect(new URL(startAuthorization("youtube", "all").url).searchParams.get("client_id")).toBe("id-saisi");
    process.env.YOUTUBE_CLIENT_ID = "env-id";
    process.env.YOUTUBE_CLIENT_SECRET = "env-secret";
    expect(getAppStatus(youtube).source).toBe("env");
    expect(() => saveAppConfig("youtube", { clientId: "x", clientSecret: "y" })).toThrow(/environnement/);
  });
});

describe("comptes", () => {
  test("deux chaînes côte à côte, filtrées par capacité, sans jeton", async () => {
    const first = await connect(TEST_CHANNELS.first);
    const second = await connect(TEST_CHANNELS.second, UPLOAD_SCOPES, "upload");
    expect(first.id).not.toBe(second.id);
    expect(first).toMatchObject({ connector: "youtube", externalId: TEST_CHANNELS.first.id, name: "Première chaîne", status: "connected" });
    expect(first.url).toBe("https://www.youtube.com/@premiere");

    expect(listAccounts().map((account) => account.id)).toEqual([first.id, second.id]);
    expect(listAccounts({ capability: "publish.video" })).toHaveLength(2);
    expect(listAccounts({ capability: "posts.manage" }).map((account) => account.id)).toEqual([first.id]);
    expect(listAccounts({ capability: "publish.image" })).toHaveLength(0);

    const serialized = JSON.stringify(listAccounts());
    expect(serialized).not.toMatch(/access-|refresh-|credentials/);
    // Sur le disque non plus, les jetons n'apparaissent jamais en clair.
    expect(disk()).not.toMatch(/access-\d|refresh-UC/);
    if (process.platform !== "win32") {
      expect(fs.statSync(path.join(root, "accounts.json")).mode & 0o777).toBe(0o600);
      expect(fs.statSync(root).mode & 0o777).toBe(0o700);
    }
  });

  test("reconnecter la même chaîne met à jour le compte au lieu d'en créer un second", async () => {
    const first = await connect(TEST_CHANNELS.first, UPLOAD_SCOPES, "upload");
    renameAccount(first.id, "Chaîne principale");
    expect(first.capabilities).not.toContain("posts.manage");
    const again = await connect(TEST_CHANNELS.first, ALL_SCOPES, "all");
    expect(again.id).toBe(first.id);
    expect(again.capabilities).toContain("posts.manage");
    expect(again.displayName).toBe("Chaîne principale");
    expect(listAccounts()).toHaveLength(1);
  });

  test("jeton renouvelé une minute avant expiration, une seule fois pour deux appels simultanés", async () => {
    const account = await connect(TEST_CHANNELS.first);
    const token = await getAccessToken(account.id);
    expect(token.value).toMatch(/^access-/);
    expect(google.tokenCalls.filter((call) => call.grant_type === "refresh_token")).toHaveLength(0);

    // On vieillit le jeton : il expire dans trente secondes.
    const realNow = Date.now;
    Date.now = () => realNow() + 3599_000 - 30_000;
    try {
      const [a, b] = await Promise.all([getAccessToken(account.id), getAccessToken(account.id)]);
      expect(a.value).toBe(b.value);
      expect(a.value).not.toBe(token.value);
      expect(google.tokenCalls.filter((call) => call.grant_type === "refresh_token")).toHaveLength(1);
    } finally {
      Date.now = realNow;
    }
  });

  test("invalid_grant passe le compte « à reconnecter »", async () => {
    const account = await connect(TEST_CHANNELS.first);
    // Un seul appel jusqu'ici : l'échange du code.
    expect(google.tokenCalls).toHaveLength(1);
    // Le jeton d'actualisation émis est révoqué chez Google.
    google.revokedRefreshTokens.add(`refresh-${TEST_CHANNELS.first.id}-1`);
    const realNow = Date.now;
    Date.now = () => realNow() + 2 * 3600_000;
    try {
      await expect(getAccessToken(account.id)).rejects.toBeInstanceOf(ReconnectRequiredError);
    } finally {
      Date.now = realNow;
    }
    expect(getAccountSummary(account.id)?.status).toBe("needs-reconnect");
    expect(listAccounts({ capability: "publish.video" })[0].status).toBe("needs-reconnect");
    // Reconnecter rétablit le compte.
    const again = await connect(TEST_CHANNELS.first);
    expect(again.id).toBe(account.id);
    expect(again.status).toBe("connected");
  });

  test("déconnecter révoque le jeton chez le service puis efface le compte", async () => {
    const account = await connect(TEST_CHANNELS.first);
    const result = await disconnectAccount(account.id);
    expect(result.revoked).toBe(true);
    expect(google.revokeCalls).toEqual([`refresh-${TEST_CHANNELS.first.id}-1`]);
    expect(listAccounts()).toHaveLength(0);
  });
});
