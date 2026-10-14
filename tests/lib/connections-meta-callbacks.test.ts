/**
 * Rappels de Meta (retrait de l'autorisation, suppression des données) :
 * rien ne se passe sans une demande signée par le secret de l'application.
 */

import { createHmac } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setDataRoot } from "@/lib/connections/store";
import { getAccountSummary } from "@/lib/connections/accounts";
import { findDeletion, handleDataDeletion, handleDeauthorize, readSignedRequest, verifySignedRequest } from "@/lib/connections/meta-callbacks";

const SECRET = "secret-threads-de-test";
let root: string;

const base64Url = (value: Buffer | string) => Buffer.from(value).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

function signed(payload: Record<string, unknown>, secret = SECRET): string {
  const body = base64Url(JSON.stringify(payload));
  return `${base64Url(createHmac("sha256", secret).update(body).digest())}.${body}`;
}

function writeAccounts(accounts: unknown[]) {
  fs.mkdirSync(path.join(root, "data"), { recursive: true });
  fs.writeFileSync(path.join(root, "data", "accounts.json"), JSON.stringify({ accounts }));
}

const account = (id: string, externalId: string) => ({
  id,
  connector: "threads",
  externalId,
  name: id,
  credentials: "illisible",
  scopes: ["threads_basic", "threads_content_publish"],
  capabilities: ["publish.text"],
  status: "connected",
  connectedAt: 1,
  lastCheckedAt: 1,
});

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "meta-callbacks-"));
  setDataRoot(path.join(root, "data"));
  process.env.THREADS_CLIENT_ID = "1234567890";
  process.env.THREADS_CLIENT_SECRET = SECRET;
  process.env.AUTH_SECRET = "secret-de-test-assez-long-pour-hkdf";
  process.env.AUTH_URL = "https://sxm.test";
});

afterEach(() => {
  setDataRoot(null);
  fs.rmSync(root, { recursive: true, force: true });
  delete process.env.THREADS_CLIENT_ID;
  delete process.env.THREADS_CLIENT_SECRET;
});

describe("demande signée", () => {
  it("accepte une signature valide et rend l'identifiant de la personne", () => {
    expect(verifySignedRequest(signed({ algorithm: "HMAC-SHA256", user_id: "17841400000000001" }), SECRET)).toBe("17841400000000001");
    expect(readSignedRequest("threads", signed({ algorithm: "HMAC-SHA256", user_id: 42 }))).toEqual({ ok: true, userId: "42" });
  });

  it("refuse une signature d'un autre secret, des données modifiées ou un autre algorithme", () => {
    expect(verifySignedRequest(signed({ algorithm: "HMAC-SHA256", user_id: "1" }, "autre-secret"), SECRET)).toBeNull();
    const [signature] = signed({ algorithm: "HMAC-SHA256", user_id: "1" }).split(".");
    expect(verifySignedRequest(`${signature}.${base64Url(JSON.stringify({ algorithm: "HMAC-SHA256", user_id: "2" }))}`, SECRET)).toBeNull();
    expect(verifySignedRequest(signed({ algorithm: "none", user_id: "1" }), SECRET)).toBeNull();
    expect(verifySignedRequest("pas-une-demande", SECRET)).toBeNull();
  });

  it("refuse un service qui n'est pas de Meta, ou une demande absente", () => {
    expect(readSignedRequest("youtube", signed({ algorithm: "HMAC-SHA256", user_id: "1" }))).toMatchObject({ ok: false, status: 404 });
    expect(readSignedRequest("threads", undefined)).toMatchObject({ ok: false, status: 400 });
  });
});

describe("rappels", () => {
  it("le retrait de l'autorisation passe le compte « à reconnecter », et seulement lui", () => {
    writeAccounts([account("acc-a", "111"), account("acc-b", "222")]);
    expect(handleDeauthorize("threads", "111")).toBe(1);
    expect(getAccountSummary("acc-a")?.status).toBe("needs-reconnect");
    expect(getAccountSummary("acc-b")?.status).toBe("connected");
  });

  it("la suppression retire le compte et rend un code de suivi consultable", async () => {
    writeAccounts([account("acc-a", "111")]);
    const result = await handleDataDeletion("threads", "111", 1_700_000_000_000);
    expect(result.url).toBe(`https://sxm.test/api/connections/threads/data-deletion?code=${result.confirmation_code}`);
    expect(getAccountSummary("acc-a")).toBeNull();
    expect(findDeletion("threads", result.confirmation_code)).toMatchObject({ accounts: 1, processedAt: 1_700_000_000_000 });
    expect(findDeletion("facebook", result.confirmation_code)).toBeNull();
    expect(findDeletion("threads", "../../etc")).toBeNull();
  });
});
