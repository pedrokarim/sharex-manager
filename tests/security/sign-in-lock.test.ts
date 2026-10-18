import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import {
  attemptKey,
  IP_THRESHOLD_FACTOR,
  lockRemainingMs,
  registerFailure,
  thresholdFor,
  type AttemptState,
} from "@/lib/security/sign-in-lock";

const policy = { maxAttempts: 5, lockMinutes: 15 };
const MINUTE = 60_000;

describe("verrouillage après des échecs de connexion", () => {
  it("bloque au cinquième échec, et à lui seul", () => {
    let state: AttemptState | null = null;
    const locks: boolean[] = [];
    for (let attempt = 0; attempt < 6; attempt++) {
      const result = registerFailure(state, 1000 + attempt, policy);
      state = result.state;
      locks.push(result.lockedNow);
    }
    expect(locks).toEqual([false, false, false, false, true, false]);
    expect(lockRemainingMs(state, 1010)).toBeGreaterThan(14 * MINUTE);
  });

  it("repart de zéro après la fenêtre ou la fin du blocage", () => {
    let state: AttemptState | null = null;
    for (let attempt = 0; attempt < 4; attempt++) state = registerFailure(state, attempt, policy).state;
    expect(state!.failures).toBe(4);
    state = registerFailure(state, 16 * MINUTE, policy).state;
    expect(state.failures).toBe(1);

    for (let attempt = 0; attempt < 4; attempt++) state = registerFailure(state, 16 * MINUTE + attempt, policy).state;
    expect(state.lockedUntil).not.toBeNull();
    const afterLock = state.lockedUntil! + 1;
    expect(lockRemainingMs(state, afterLock)).toBe(0);
    expect(registerFailure(state, afterLock, policy).state.failures).toBe(1);
  });

  it("tolère plus d'échecs par adresse que par identifiant", () => {
    expect(thresholdFor("user", policy)).toBe(5);
    expect(thresholdFor("ip", policy)).toBe(5 * IP_THRESHOLD_FACTOR);
    expect(attemptKey("user", "  Karim ")).toBe("user:karim");
  });
});

/**
 * La base passe par `bun:sqlite`, absent de Node : comme pour le thème, le
 * scénario tourne dans un sous-processus Bun, sur une base en mémoire. Le
 * journal et les réglages vont dans un dossier temporaire, jamais dans data/.
 */
describe("compteurs persistants et alertes (SQLite)", () => {
  let directory = "";

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "sxm-sign-in-"));
  });

  afterEach(() => {
    fs.rmSync(directory, { recursive: true, force: true });
  });

  function run<T>(script: string): T {
    const output = execFileSync(
      "bun",
      [
        "-e",
        [
          'import * as settings from "./src/lib/security/settings.ts";',
          'import * as attempts from "./src/lib/security/sign-in-attempts.ts";',
          'import * as alerting from "./src/lib/security/alerts.ts";',
          'import * as alerts from "./src/lib/security/alerts-store.ts";',
          `settings.setSecuritySettingsPath(${JSON.stringify(path.join(directory, "security.json"))});`,
          `const out = await (async () => { ${script} })();`,
          "console.log(JSON.stringify(out));",
        ].join("\n"),
      ],
      {
        cwd: process.cwd(),
        env: { ...process.env, SECURITY_DB_PATH: ":memory:", LOGS_DB_PATH: path.join(directory, "logs.db") },
        encoding: "utf8",
      }
    );
    return JSON.parse(output.trim().split("\n").pop()!) as T;
  }

  it("bloque l'identifiant, garde le compteur de l'IP après un succès, et lève une alerte", () => {
    const result = run<{
      locks: string[][];
      locked: { locked: boolean; scope: string | null };
      otherUser: boolean;
      afterSuccess: boolean;
      unknownIp: boolean;
      alertCount: number;
      acknowledged: boolean;
      remaining: number;
    }>(`
      const locks = [];
      for (let i = 0; i < 5; i++) locks.push(attempts.recordSignInFailure("karim", "203.0.113.7", 1000 + i).lockedScopes);
      const locked = attempts.getSignInLock("karim", "198.51.100.1", 2000);
      const otherUser = attempts.getSignInLock("autre", "203.0.113.7", 2000).locked;
      attempts.recordSignInSuccess("karim");
      const afterSuccess = attempts.getSignInLock("karim", "198.51.100.1", 2000).locked;
      for (let i = 0; i < 30; i++) attempts.recordSignInFailure("x" + i, "unknown", 3000);
      const unknownIp = attempts.getSignInLock("nouveau", "unknown", 3000).locked;
      await alerting.raiseAlert("failedSignIns", { identifier: "karim", ip: "203.0.113.7" });
      await alerting.raiseAlert("newApiKey", { userId: "u1", keyName: "ShareX" });
      const listed = alerts.listAlerts();
      const acknowledged = alerts.acknowledgeAlert(listed.alerts[0].id, "admin");
      return { locks, locked, otherUser, afterSuccess, unknownIp, alertCount: listed.alerts.length, acknowledged, remaining: alerts.listAlerts().unacknowledged };
    `);
    expect(result.locks).toEqual([[], [], [], [], ["user"]]);
    expect(result.locked).toMatchObject({ locked: true, scope: "user" });
    expect(result.otherUser).toBe(false);
    expect(result.afterSuccess).toBe(false);
    expect(result.unknownIp).toBe(false);
    expect(result.alertCount).toBe(2);
    expect(result.acknowledged).toBe(true);
    expect(result.remaining).toBe(1);
  });

  it("n'enregistre pas une alerte désactivée, et repère une nouvelle adresse d'administrateur", () => {
    const result = run<{ disabled: number | null; first: boolean; same: boolean; other: boolean }>(`
      settings.updateSecuritySettings({ alerts: { newApiKey: false } });
      const disabled = await alerting.raiseAlert("newApiKey", { userId: "u1" });
      const first = alerts.noteAdminSignIn("admin-1", "203.0.113.7").isNew;
      const same = alerts.noteAdminSignIn("admin-1", "203.0.113.7").isNew;
      const other = alerts.noteAdminSignIn("admin-1", "198.51.100.2").isNew;
      return { disabled, first, same, other };
    `);
    expect(result).toEqual({ disabled: null, first: false, same: false, other: true });
  });
});
