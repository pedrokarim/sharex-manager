/**
 * Un compte connecté avant l'arrivée d'une capacité (gestion du profil…) la
 * reçoit si ses portées la couvrent ; une Page Facebook garde les droits que
 * son rôle lui donnait à la connexion.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { setDataRoot } from "@/lib/connections/store";
import { getAccountSummary, listAccounts } from "@/lib/connections/accounts";

let root: string;

function writeAccounts(accounts: unknown[]) {
  const dir = path.join(root, "data");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "accounts.json"), JSON.stringify({ accounts }));
}

const legacy = (id: string, connector: string, scopes: string[], capabilities: string[]) => ({
  id,
  connector,
  externalId: `ext-${id}`,
  name: id,
  credentials: "illisible",
  scopes,
  capabilities,
  status: "connected",
  connectedAt: 1,
  lastCheckedAt: 1,
});

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "connections-capabilities-"));
  setDataRoot(path.join(root, "data"));
});

afterEach(() => {
  setDataRoot(null);
  fs.rmSync(root, { recursive: true, force: true });
});

test("une chaîne YouTube connectée avant la gestion du profil la reçoit par ses portées", () => {
  writeAccounts([legacy("acc-yt", "youtube", ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube"], ["publish.video", "profile.banner"])]);
  const summary = getAccountSummary("acc-yt")!;
  expect(summary.capabilities).toContain("profile.details");
  expect(summary.capabilities).toContain("profile.banner");
  expect(listAccounts({ capability: "profile.details" }).map((account) => account.id)).toEqual(["acc-yt"]);
});

test("une capacité que les portées ne couvrent pas n'apparaît pas", () => {
  writeAccounts([legacy("acc-yt", "youtube", ["https://www.googleapis.com/auth/youtube.upload"], ["publish.video"])]);
  expect(getAccountSummary("acc-yt")!.capabilities).not.toContain("profile.details");
});

test("une Page Facebook garde les droits retenus à la connexion (selon son rôle)", () => {
  writeAccounts([legacy("acc-fb", "facebook", ["pages_show_list", "pages_manage_posts", "pages_read_engagement"], ["publish.video"])]);
  expect(getAccountSummary("acc-fb")!.capabilities).toEqual(["publish.video"]);
});
