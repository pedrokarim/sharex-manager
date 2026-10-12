import fs from "node:fs";
import { createHmac } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { setDataRoot } from "@/lib/connections/store";
import { registerConnector, unregisterConnector, capabilitiesForScopes, getConnector } from "@/lib/connections/registry";
import { completeAuthorization, disconnectAccount, getAccessToken, getAccountSummary, listAccounts, renameAccount, verifyAccount } from "@/lib/connections/accounts";
import { cancelPendingAuthorization, finalizePendingAuthorization, readPendingAuthorization, receiveAuthorization } from "@/lib/connections/pending";
import { safeReturnPath, startAuthorization } from "@/lib/connections/oauth";
import { appSecretProof, getAppSettings, getAppStatus, saveAppConfig } from "@/lib/connections/apps";
import { parseJsonKeepingIds } from "@/lib/connections/json";
import { FAKE_SCOPES, authorize, createFakeState, fakeConnector, fakeFetch, type FakeServiceState } from "./connections-fake-service";

const saved = { ...process.env };
const realFetch = globalThis.fetch;
let root: string;
let fake: FakeServiceState;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "connections-multi-"));
  setDataRoot(root);
  delete process.env.CONNECTIONS_ENCRYPTION_KEY;
  process.env.AUTH_SECRET = "secret-de-test-assez-long-pour-hkdf";
  process.env.AUTH_URL = "https://sxm.example.org";
  process.env.FAKESVC_CLIENT_ID = "fake-client";
  process.env.FAKESVC_CLIENT_SECRET = "fake-secret";
  fake = createFakeState();
  globalThis.fetch = fakeFetch(fake);
  registerConnector(fakeConnector(fake));
});

afterEach(() => {
  globalThis.fetch = realFetch;
  unregisterConnector("fakesvc");
  setDataRoot(null);
  fs.rmSync(root, { recursive: true, force: true });
  for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
  Object.assign(process.env, saved);
});

const disk = () =>
  fs
    .readdirSync(root)
    .filter((name) => name.endsWith(".json"))
    .map((file) => fs.readFileSync(path.join(root, file), "utf-8"))
    .join("\n");

const PAGES = [
  { id: "p1", name: "Page une" },
  { id: "p2", name: "Page deux" },
  { id: "p3ro", name: "Page en lecture" },
];

describe("plusieurs comptes par autorisation", () => {
  test("les comptes trouvés attendent le choix, sans jeton visible, liés à l'administrateur", async () => {
    fake.pages = PAGES;
    const { transaction } = authorize("fakesvc");
    const outcome = await receiveAuthorization("fakesvc", "code-1", transaction, "admin-1");
    expect(outcome).toMatchObject({ kind: "pending", count: 3 });
    if (outcome.kind !== "pending") throw new Error("attendu : en attente");
    expect(listAccounts()).toHaveLength(0);
    expect(readPendingAuthorization(outcome.pendingId, "admin-2")).toBeNull();
    const view = readPendingAuthorization(outcome.pendingId, "admin-1")!;
    expect(view.accounts.map((account) => account.externalId)).toEqual(["p1", "p2", "p3ro"]);
    expect(view.accounts[2].capabilities).toEqual(["posts.list"]);
    expect(JSON.stringify(view)).not.toMatch(/page-token|long-short/);
    expect(disk()).not.toMatch(/page-token|long-short/);
  });

  test("seuls les comptes cochés sont enregistrés, chacun avec son jeton, sous la même autorisation", async () => {
    fake.pages = PAGES;
    const outcome = await receiveAuthorization("fakesvc", "code-1", authorize("fakesvc").transaction, "admin-1");
    if (outcome.kind !== "pending") throw new Error("attendu : en attente");
    expect(() => finalizePendingAuthorization(outcome.pendingId, "admin-2", ["p1"])).toThrow(/expiré/);
    const { grantId, accounts } = finalizePendingAuthorization(outcome.pendingId, "admin-1", ["p1", "p2", "inconnu"]);
    expect(accounts.map((account) => account.externalId)).toEqual(["p1", "p2"]);
    expect(accounts.every((account) => account.grantId === grantId)).toBe(true);
    expect(accounts[0].tokenRenewal).toBe("none");
    expect((await getAccessToken(accounts[0].id)).value).toBe("page-token-p1-long-short-1");
    // La même autorisation ne se finalise qu'une fois.
    expect(() => finalizePendingAuthorization(outcome.pendingId, "admin-1", ["p3ro"])).toThrow(/expiré/);
  });

  test("abandonner le choix n'enregistre rien et ne révoque rien", async () => {
    fake.pages = PAGES;
    const outcome = await receiveAuthorization("fakesvc", "code-1", authorize("fakesvc").transaction, "admin-1");
    if (outcome.kind !== "pending") throw new Error("attendu : en attente");
    cancelPendingAuthorization(outcome.pendingId, "admin-1");
    expect(readPendingAuthorization(outcome.pendingId, "admin-1")).toBeNull();
    expect(fake.revokeCalls).toHaveLength(0);
  });

  test("un compte unique est enregistré directement ; reconnecter met à jour le même compte", async () => {
    fake.pages = [{ id: "p1", name: "Page une" }];
    const first = await receiveAuthorization("fakesvc", "code-1", authorize("fakesvc").transaction, "admin-1");
    expect(first.kind).toBe("connected");
    if (first.kind !== "connected") throw new Error("attendu : connecté");
    renameAccount(first.accounts[0].id, "Ma page");
    const again = await completeAuthorization("fakesvc", "code-2", authorize("fakesvc").transaction);
    expect(again.accounts[0].id).toBe(first.accounts[0].id);
    expect(again.accounts[0].displayName).toBe("Ma page");
    expect(listAccounts()).toHaveLength(1);
  });

  test("déconnecter un compte ne casse pas les autres de la même autorisation ; le dernier révoque", async () => {
    fake.pages = PAGES.slice(0, 2);
    const { accounts } = await completeAuthorization("fakesvc", "code-1", authorize("fakesvc").transaction);
    const [one, two] = accounts;
    expect(await disconnectAccount(one.id)).toEqual({ revoked: false, remaining: 1 });
    expect(fake.revokeCalls).toHaveLength(0);
    expect((await getAccessToken(two.id)).value).toBe("page-token-p2-long-short-1");
    const last = await disconnectAccount(two.id);
    expect(last).toEqual({ revoked: true, remaining: 0 });
    // C'est le jeton de l'autorisation qui est révoqué, pas celui de la page.
    expect(fake.revokeCalls[0].accessToken).toBe("long-short-1");
  });

  test("sans révocation possible, la déconnexion rend la consigne du connecteur", async () => {
    fake.pages = [{ id: "p1", name: "Page une" }];
    fake.revokeResult = false;
    const { accounts } = await completeAuthorization("fakesvc", "code-1", authorize("fakesvc").transaction);
    const result = await disconnectAccount(accounts[0].id);
    expect(result.revoked).toBe(false);
    expect(result.help).toMatch(/réglages du faux service/);
    expect(getAccountSummary(accounts[0].id)).toBeNull();
  });
});

describe("autorisation : variantes des services", () => {
  test("sans PKCE : ni défi dans l'adresse, ni vérificateur à l'échange ; échange en GET", async () => {
    unregisterConnector("fakesvc");
    const base = fakeConnector(fake);
    registerConnector({ ...base, fetchAccounts: undefined, oauth: { ...base.oauth, tokenMethod: "GET", scopeSeparator: "," } });
    const { url, transaction } = authorize("fakesvc");
    expect(url.searchParams.get("code_challenge")).toBeNull();
    expect(url.searchParams.get("scope")).toBe(`${FAKE_SCOPES.read},${FAKE_SCOPES.write},${FAKE_SCOPES.media}`);
    const { accounts } = await completeAuthorization("fakesvc", "code-1", transaction);
    expect(fake.tokenCalls[0].method).toBe("GET");
    expect(fake.tokenCalls[0].params.code_verifier).toBeUndefined();
    expect(fake.tokenCalls[0].params.client_secret).toBe("fake-secret");
    expect(fake.exchangeCalls).toBe(1);
    expect(accounts[0].capabilities).toEqual(["posts.list", "publish.text", "publish.image", "publish.video"]);
  });

  test("authentification Basic du client : le secret ne passe pas dans le corps", async () => {
    unregisterConnector("fakesvc");
    const base = fakeConnector(fake);
    registerConnector({ ...base, fetchAccounts: undefined, oauth: { ...base.oauth, clientAuth: "basic" } });
    await completeAuthorization("fakesvc", "code-1", authorize("fakesvc").transaction);
    expect(fake.tokenCalls[0].params.client_secret).toBeUndefined();
    expect(fake.tokenCalls[0].authorization).toBe(`Basic ${Buffer.from("fake-client:fake-secret").toString("base64")}`);
  });

  test("réponse en tableau `data` avec `permissions`, identifiants longs gardés en chaînes", async () => {
    unregisterConnector("fakesvc");
    registerConnector({ ...fakeConnector(fake), fetchAccounts: undefined });
    fake.tokenFormat = "data-array";
    const { accounts } = await completeAuthorization("fakesvc", "code-1", authorize("fakesvc").transaction);
    // `permissions` n'accorde pas `fake.media` : ni image ni vidéo.
    expect(accounts[0].capabilities).toEqual(["posts.list", "publish.text"]);
    expect(parseJsonKeepingIds('{"user_id":17841400000000001,"n":12,"s":"17841400000000002"}')).toEqual({
      user_id: "17841400000000001",
      n: 12,
      s: "17841400000000002",
    });
  });

  test("sans portées dans la réponse : le connecteur les lit, sinon celles demandées", async () => {
    unregisterConnector("fakesvc");
    fake.tokenScope = undefined;
    registerConnector({ ...fakeConnector(fake), fetchAccounts: undefined, fetchGrantedScopes: async () => [FAKE_SCOPES.read] });
    const { accounts } = await completeAuthorization("fakesvc", "code-1", authorize("fakesvc").transaction);
    expect(accounts[0].capabilities).toEqual(["posts.list"]);
  });

  test("lecture des comptes à la connexion : la preuve dérivée du secret est fournie, jamais le secret", async () => {
    unregisterConnector("fakesvc");
    const base = fakeConnector(fake);
    fake.pages = PAGES;
    const seen: { token: string; proof?: string; context: string }[] = [];
    registerConnector({
      ...base,
      fetchAccounts: async (token, charge, context) => {
        seen.push({ token: token.value, proof: context?.appSecretProof(token.value), context: JSON.stringify(context) });
        return base.fetchAccounts!(token, charge);
      },
    });
    await completeAuthorization("fakesvc", "code-1", authorize("fakesvc").transaction);
    expect(seen).toHaveLength(1);
    expect(seen[0].proof).toBe(createHmac("sha256", "fake-secret").update(seen[0].token).digest("hex"));
    expect(seen[0].context).not.toContain("fake-secret");
  });

  test("identité lue à la connexion et à la vérification : preuve fournie à `fetchProfile`", async () => {
    unregisterConnector("fakesvc");
    const base = fakeConnector(fake);
    const seen: { token: string; proof?: string; context: string }[] = [];
    registerConnector({
      ...base,
      fetchAccounts: undefined,
      fetchProfile: async (token, charge, account, context) => {
        seen.push({ token: token.value, proof: context?.appSecretProof(token.value), context: JSON.stringify(context) });
        return base.fetchProfile!(token, charge, account);
      },
    });
    const { accounts } = await completeAuthorization("fakesvc", "code-1", authorize("fakesvc").transaction);
    await verifyAccount(accounts[0].id);
    expect(seen).toHaveLength(2);
    for (const entry of seen) {
      expect(entry.proof).toBe(createHmac("sha256", "fake-secret").update(entry.token).digest("hex"));
      expect(entry.context).not.toContain("fake-secret");
    }
  });

  test("erreur au format `{ error_type, error_message }` : code et message lisibles", async () => {
    fake.tokenFormat = "error-type";
    await expect(completeAuthorization("fakesvc", "code-1", authorize("fakesvc").transaction)).rejects.toMatchObject({
      name: "OAuthError",
      code: "OAuthException",
      message: expect.stringMatching(/Invalid verification code format/),
    });
  });

  test("capacités : `allOf` exige toutes les portées", () => {
    const connector = fakeConnector(fake);
    expect(capabilitiesForScopes(connector, [FAKE_SCOPES.write])).toEqual(["publish.text"]);
    expect(capabilitiesForScopes(connector, [FAKE_SCOPES.write, FAKE_SCOPES.media])).toEqual(["publish.text", "publish.image", "publish.video"]);
  });

  test("mode popup et chemin de retour voyagent dans le cookie signé ; une adresse externe est ignorée", () => {
    expect(authorize("fakesvc", { mode: "popup", returnTo: "/m/clip-studio?export=1" }).transaction).toMatchObject({
      mode: "popup",
      returnTo: "/m/clip-studio?export=1",
    });
    for (const bad of ["https://evil.example", "//evil.example/x", "/\\evil.example", "javascript:alert(1)", "relative", "/a\nb"]) {
      expect(safeReturnPath(bad)).toBeUndefined();
      expect(authorize("fakesvc", { returnTo: bad }).transaction.returnTo).toBeUndefined();
    }
  });
});

describe("réglages propres au connecteur", () => {
  test("réglage obligatoire : saisi, ajouté à l'adresse d'autorisation ; secret chiffré et jamais réaffiché", () => {
    unregisterConnector("fakesvc");
    const base = fakeConnector(fake);
    registerConnector({
      ...base,
      app: {
        ...base.app,
        settings: [
          { key: "config_id", label: "Identifiant de configuration", required: true, authorizeParam: true, pattern: "[0-9]+" },
          { key: "webhook_secret", label: "Secret du webhook", secret: true },
        ],
      },
    });
    expect(getAppStatus(registerless()).missingSettings).toEqual(["Identifiant de configuration"]);
    expect(() => startAuthorization("fakesvc", "all")).toThrow(/configurée/);
    expect(() => saveAppConfig("fakesvc", { settings: { config_id: "abc" } })).toThrow(/forme/);
    saveAppConfig("fakesvc", { settings: { config_id: "123456", webhook_secret: "chut-tres-secret" } });
    const url = new URL(startAuthorization("fakesvc", "all").url);
    expect(url.searchParams.get("config_id")).toBe("123456");
    const status = getAppStatus(registerless());
    expect(status.configured).toBe(true);
    expect(JSON.stringify(status)).not.toContain("chut-tres-secret");
    expect(disk()).not.toContain("chut-tres-secret");
    expect(getAppSettings(registerless())).toEqual({ config_id: "123456" });
    expect(getAppSettings(registerless(), { includeSecret: true }).webhook_secret).toBe("chut-tres-secret");
  });

  test("preuve dérivée du secret, sans le secret", async () => {
    fake.pages = [{ id: "p1", name: "Page une" }];
    const { accounts } = await completeAuthorization("fakesvc", "code-1", authorize("fakesvc").transaction);
    const { accountContext } = await import("@/lib/connections/accounts");
    const { context } = accountContext(accounts[0].id);
    const { createHmac } = await import("node:crypto");
    expect(context.appSecretProof("jeton")).toBe(createHmac("sha256", "fake-secret").update("jeton").digest("hex"));
    expect(JSON.stringify(context)).not.toContain("fake-secret");
    expect(appSecretProof(registerless(), "x")).toHaveLength(64);
  });
});

/** Le connecteur inscrit, tel que le registre le rend. */
const registerless = () => getConnector("fakesvc")!;
