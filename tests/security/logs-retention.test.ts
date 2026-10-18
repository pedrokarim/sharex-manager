import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { IMAGE_VIEW_SAMPLE_RATE, shouldLogImageView } from "@/lib/security/image-view-policy";
import { retentionCutoff } from "@/lib/security/retention";
import { LOG_ACTIONS } from "@/lib/types/logs";

describe("journalisation des affichages d'images", () => {
  it("journalise tout, rien, ou un affichage sur vingt", () => {
    expect(shouldLogImageView("all", { exists: true })).toBe(true);
    expect(shouldLogImageView("off", { exists: true })).toBe(false);
    expect(shouldLogImageView("off", { exists: false })).toBe(false);
    expect(shouldLogImageView("sampled", { exists: true }, () => 0.01)).toBe(true);
    expect(shouldLogImageView("sampled", { exists: true }, () => 0.5)).toBe(false);
  });

  it("garde toujours, en mode échantillonné, les demandes de fichiers inexistants", () => {
    expect(shouldLogImageView("sampled", { exists: false }, () => 0.99)).toBe(true);
  });

  it("garde environ un affichage sur vingt", () => {
    let seed = 42;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    let logged = 0;
    for (let index = 0; index < 20_000; index++) if (shouldLogImageView("sampled", { exists: true }, random)) logged++;
    expect(logged / 20_000).toBeGreaterThan(1 / IMAGE_VIEW_SAMPLE_RATE - 0.01);
    expect(logged / 20_000).toBeLessThan(1 / IMAGE_VIEW_SAMPLE_RATE + 0.01);
  });
});

describe("durée de conservation du journal", () => {
  it("calcule la date limite", () => {
    expect(retentionCutoff(90, new Date("2026-10-18T12:00:00.000Z"))).toBe("2026-07-20T12:00:00.000Z");
  });

  it("liste les actions de connexion et de sécurité", () => {
    for (const action of ["auth.login", "auth.login.failed", "auth.logout", "security.alert", "logs.purge"] as const) {
      expect(LOG_ACTIONS).toContain(action);
    }
  });

  describe("purge (SQLite)", () => {
    let directory = "";

    beforeEach(() => {
      directory = fs.mkdtempSync(path.join(os.tmpdir(), "sxm-logs-"));
    });

    afterEach(() => {
      fs.rmSync(directory, { recursive: true, force: true });
    });

    it("supprime les entrées plus anciennes que la durée réglée", () => {
      const dbPath = path.join(directory, "logs.db");
      const output = execFileSync(
        "bun",
        [
          "-e",
          `
            import { Database } from "bun:sqlite";
            import { logDb } from "./src/lib/utils/db.ts";
            import { setSecuritySettingsPath } from "./src/lib/security/settings.ts";
            import { runSecurityPurge } from "./src/lib/security/maintenance.ts";
            setSecuritySettingsPath(${JSON.stringify(path.join(directory, "security.json"))});
            logDb.createLog({ level: "info", action: "auth.login", message: "récent" });
            const db = new Database(${JSON.stringify(dbPath)});
            db.run("INSERT INTO logs (timestamp, level, action, message) VALUES (?, ?, ?, ?)", ["2020-01-01T00:00:00.000Z", "info", "file.download", "ancien"]);
            db.run("INSERT INTO logs (timestamp, level, action, message) VALUES (?, ?, ?, ?)", ["2020-02-01T00:00:00.000Z", "info", "file.download", "ancien"]);
            const removed = runSecurityPurge(new Date());
            const rows = db.query("SELECT message, action FROM logs ORDER BY id").all();
            console.log(JSON.stringify({ removed, rows }));
          `,
        ],
        {
          cwd: process.cwd(),
          env: { ...process.env, LOGS_DB_PATH: dbPath, SECURITY_DB_PATH: ":memory:" },
          encoding: "utf8",
        }
      );
      const result = JSON.parse(output.trim().split("\n").pop()!) as {
        removed: { logs: number };
        rows: { message: string; action: string }[];
      };
      expect(result.removed.logs).toBe(2);
      expect(result.rows.map((row) => row.message)).toContain("récent");
      expect(result.rows.map((row) => row.message)).not.toContain("ancien");
      // La purge se note elle-même dans le journal.
      expect(result.rows.map((row) => row.action)).toContain("logs.purge");
    });
  });
});
