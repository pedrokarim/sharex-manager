import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { setDataRoot } from "@/lib/connections/store";
import { registerConnector, unregisterConnector } from "@/lib/connections/registry";
import { completeAuthorization, getAccessToken, getAccountSummary, listAccounts, renewDueTokens } from "@/lib/connections/accounts";
import { ReconnectRequiredError } from "@/lib/connections/errors";
import type { Connector } from "@/lib/connections/types";
import { authorize, createFakeState, fakeConnector, fakeFetch, type FakeServiceState } from "./connections-fake-service";

const DAY = 24 * 3600_000;
const saved = { ...process.env };
const realFetch = globalThis.fetch;
const realNow = Date.now;
let root: string;
let fake: FakeServiceState;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "connections-tokens-"));
  setDataRoot(root);
  delete process.env.CONNECTIONS_ENCRYPTION_KEY;
  process.env.AUTH_SECRET = "secret-de-test-assez-long-pour-hkdf";
  process.env.AUTH_URL = "https://sxm.example.org";
  process.env.FAKESVC_CLIENT_ID = "fake-client";
  process.env.FAKESVC_CLIENT_SECRET = "fake-secret";
  fake = createFakeState();
  globalThis.fetch = fakeFetch(fake);
});

afterEach(() => {
  Date.now = realNow;
  globalThis.fetch = realFetch;
  unregisterConnector("fakesvc");
  setDataRoot(null);
  fs.rmSync(root, { recursive: true, force: true });
  for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
  Object.assign(process.env, saved);
});

/** Avance l'horloge de `ms`. */
const travel = (ms: number) => {
  const base = realNow();
  Date.now = () => base + ms;
};

/** Un compte seul (sans `fetchAccounts`), avec le faux connecteur modifié par `overrides`. */
async function connectSingle(overrides: Partial<Connector> = {}) {
  registerConnector({ ...fakeConnector(fake), fetchAccounts: undefined, ...overrides });
  const { accounts } = await completeAuthorization("fakesvc", "code-1", authorize("fakesvc").transaction);
  return accounts[0];
}

describe("jetons longue durée prolongés par le connecteur", () => {
  test("échange longue durée juste après le code ; renouvellement automatique déclaré", async () => {
    const account = await connectSingle();
    expect(fake.exchangeCalls).toBe(1);
    expect(account.tokenRenewal).toBe("automatic");
    expect(account.tokenState).toBe("ok");
    expect((await getAccessToken(account.id)).value).toBe("long-short-1");
    expect(fake.refreshCalls).toBe(0);
  });

  test("dans la fenêtre de renouvellement : prolongé une seule fois pour deux appels simultanés", async () => {
    const account = await connectSingle();
    travel(31 * DAY); // reste 29 jours, fenêtre de 30 jours
    const [a, b] = await Promise.all([getAccessToken(account.id), getAccessToken(account.id)]);
    expect(a.value).toBe("long-short-1+");
    expect(b.value).toBe(a.value);
    expect(fake.refreshCalls).toBe(1);
    expect(getAccountSummary(account.id)?.tokenExpiresAt).toBeGreaterThan(Date.now() + 59 * DAY);
  });

  test("« pas avant » : un jeton trop jeune n'est pas prolongé", async () => {
    const account = await connectSingle({ tokenLifetime: { renewBeforeMs: 61 * DAY, minAgeMs: DAY } });
    await getAccessToken(account.id);
    expect(fake.refreshCalls).toBe(0);
    travel(DAY + 1000);
    await getAccessToken(account.id);
    expect(fake.refreshCalls).toBe(1);
  });

  test("panne passagère : le jeton encore valable sert, l'administration voit « expire bientôt »", async () => {
    const account = await connectSingle();
    fake.refreshMode = "fail";
    travel(31 * DAY);
    expect((await getAccessToken(account.id)).value).toBe("long-short-1");
    const summary = getAccountSummary(account.id)!;
    expect(summary.status).toBe("connected");
    expect(summary.tokenState).toBe("expiring-soon");
    expect(summary.tokenStateReason).toMatch(/indisponible/);
    fake.refreshMode = "ok";
    await getAccessToken(account.id);
    expect(getAccountSummary(account.id)?.tokenState).toBe("ok");
  });

  test("refus du service : le compte passe « à reconnecter »", async () => {
    const account = await connectSingle();
    fake.refreshMode = "refuse";
    travel(31 * DAY);
    await expect(getAccessToken(account.id)).rejects.toBeInstanceOf(ReconnectRequiredError);
    expect(getAccountSummary(account.id)?.status).toBe("needs-reconnect");
  });

  test("tâche de fond : prolonge sans publication, une seule fois", async () => {
    const account = await connectSingle();
    expect((await renewDueTokens()).renewed).toBe(0);
    travel(31 * DAY);
    expect(await renewDueTokens()).toEqual({ renewed: 1, failed: 0, expired: 0 });
    expect(await renewDueTokens()).toEqual({ renewed: 0, failed: 0, expired: 0 });
    expect(getAccountSummary(account.id)?.tokenState).toBe("ok");
  });

  test("« à l'usage seulement » : la tâche de fond ne renouvelle que pour l'entretien", async () => {
    const account = await connectSingle({ tokenLifetime: { renewBeforeMs: 30 * DAY, schedule: "on-use", maintenanceAfterMs: 50 * DAY } });
    travel(31 * DAY);
    expect((await renewDueTokens()).renewed).toBe(0);
    expect(fake.refreshCalls).toBe(0);
    travel(51 * DAY);
    expect((await renewDueTokens()).renewed).toBe(1);
    expect(getAccountSummary(account.id)?.tokenExpiresAt).toBeGreaterThan(Date.now() + 59 * DAY);
  });
});

describe("jetons qui ne se prolongent pas", () => {
  test("« expire bientôt » une semaine avant, puis « à reconnecter » par la tâche de fond", async () => {
    const account = await connectSingle({ refreshToken: undefined, tokenLifetime: undefined });
    expect(account.tokenRenewal).toBe("manual");
    travel(54 * DAY);
    expect(getAccountSummary(account.id)?.tokenState).toBe("expiring-soon");
    expect((await getAccessToken(account.id)).value).toBe("long-short-1");
    travel(61 * DAY);
    expect(getAccountSummary(account.id)?.tokenState).toBe("expired");
    expect((await renewDueTokens()).expired).toBe(1);
    expect(getAccountSummary(account.id)?.status).toBe("needs-reconnect");
  });

  test("jeton qui n'expire pas : jamais signalé", async () => {
    fake.pages = [{ id: "p1", name: "Page une" }];
    registerConnector(fakeConnector(fake));
    const { accounts } = await completeAuthorization("fakesvc", "code-1", authorize("fakesvc").transaction);
    travel(400 * DAY);
    expect(getAccountSummary(accounts[0].id)?.tokenState).toBe("ok");
    expect(getAccountSummary(accounts[0].id)?.tokenExpiresAt).toBeUndefined();
  });
});

describe("jeton partagé par plusieurs comptes", () => {
  test("renouvelé une fois, recopié dans tous les comptes de l'autorisation", async () => {
    fake.pages = [
      { id: "p1", name: "Page une" },
      { id: "p2", name: "Page deux" },
    ];
    // Les comptes n'ont pas de jeton propre : ils partagent celui de l'autorisation.
    const base = fakeConnector(fake);
    registerConnector({
      ...base,
      fetchAccounts: async (token, charge) => (await base.fetchAccounts!(token, charge)).map(({ token: _token, ...account }) => account),
    });
    const { accounts } = await completeAuthorization("fakesvc", "code-1", authorize("fakesvc").transaction);
    travel(31 * DAY);
    const [a, b] = await Promise.all([getAccessToken(accounts[0].id), getAccessToken(accounts[1].id)]);
    expect(a.value).toBe("long-short-1+");
    expect(b.value).toBe("long-short-1+");
    expect(fake.refreshCalls).toBe(1);
    expect(listAccounts().every((account) => account.tokenState === "ok")).toBe(true);
  });
});
