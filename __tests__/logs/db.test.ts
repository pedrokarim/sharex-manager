import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { logDb } from "@/lib/utils/db";
import type { LogLevel, LogAction } from "@/lib/types/logs";
import { existsSync, unlinkSync } from "fs";
import { join } from "path";

const TEST_LOG = {
  level: "info" as LogLevel,
  action: "file.download" as LogAction,
  message: "Test message",
  userId: "test_user_id",
  userEmail: "test@example.com",
  metadata: { test: "data" },
  ip: "127.0.0.1",
  userAgent: "Test User Agent",
};

describe("LogDatabase", () => {
  const dbPath = join(process.cwd(), "data", "logs.db");

  // Nettoyer la base de données avant chaque test
  beforeEach(() => {
    logDb.clearLogs();
  });

  // Supprimer la base de données après tous les tests
  afterEach(() => {
    if (existsSync(dbPath)) {
      unlinkSync(dbPath);
    }
  });

  describe("createLog", () => {
    it("devrait créer un nouveau log avec tous les champs", () => {
      const log = logDb.createLog(TEST_LOG);

      expect(log).toBeDefined();
      expect(log.id).toBeTypeOf("number");
      expect(log.timestamp).toBeDefined();
      expect(log.level).toBe(TEST_LOG.level);
      expect(log.action).toBe(TEST_LOG.action);
      expect(log.message).toBe(TEST_LOG.message);
      expect(log.userId).toBe(TEST_LOG.userId);
      expect(log.userEmail).toBe(TEST_LOG.userEmail);
      expect(log.metadata).toEqual(TEST_LOG.metadata);
      expect(log.ip).toBe(TEST_LOG.ip);
      expect(log.userAgent).toBe(TEST_LOG.userAgent);
    });

    it("devrait créer un log avec seulement les champs requis", () => {
      const minimalLog = {
        level: "info" as LogLevel,
        action: "file.download" as LogAction,
        message: "Test minimal",
      };

      const log = logDb.createLog(minimalLog);

      expect(log).toBeDefined();
      expect(log.id).toBeTypeOf("number");
      expect(log.timestamp).toBeDefined();
      expect(log.level).toBe(minimalLog.level);
      expect(log.action).toBe(minimalLog.action);
      expect(log.message).toBe(minimalLog.message);
      expect(log.userId).toBeNull();
      expect(log.userEmail).toBeNull();
      expect(log.metadata).toEqual({});
      expect(log.ip).toBeNull();
      expect(log.userAgent).toBeNull();
    });
  });

  describe("getLogs", () => {
    beforeEach(async () => {
      // Créer quelques logs de test
      for (let i = 0; i < 5; i++) {
        await logDb.createLog({
          ...TEST_LOG,
          message: `Test message ${i}`,
          level: (i % 2 === 0 ? "info" : "error") as LogLevel,
        });
      }
    });

    it("devrait récupérer tous les logs avec la pagination", () => {
      const logs = logDb.getLogs(3, 0);
      expect(logs).toHaveLength(3);
      expect(logs[0].message).toBe("Test message 4");
    });

    it("devrait filtrer les logs par niveau", () => {
      const logs = logDb.getLogs(10, 0, { level: "info" });
      expect(logs.every((log) => log.level === "info")).toBe(true);
    });

    it("devrait filtrer les logs par action", () => {
      const logs = logDb.getLogs(10, 0, { action: "file.download" });
      expect(logs.every((log) => log.action === "file.download")).toBe(true);
    });

    it("devrait filtrer les logs par date", () => {
      const startDate = new Date();
      startDate.setMinutes(startDate.getMinutes() - 1);

      const logs = logDb.getLogs(10, 0, {
        startDate: startDate.toISOString(),
        endDate: new Date().toISOString(),
      });

      expect(logs.length).toBeGreaterThan(0);
      logs.forEach((log) => {
        const logDate = new Date(log.timestamp);
        expect(logDate.getTime()).toBeGreaterThanOrEqual(startDate.getTime());
      });
    });
  });

  describe("getLogsByUser", () => {
    beforeEach(async () => {
      await logDb.createLog({
        ...TEST_LOG,
        userId: "user1",
        message: "User 1 log",
      });
      await logDb.createLog({
        ...TEST_LOG,
        userId: "user2",
        message: "User 2 log",
      });
    });

    it("devrait récupérer les logs d'un utilisateur spécifique", () => {
      const logs = logDb.getLogsByUser("user1");
      expect(logs).toHaveLength(1);
      expect(logs[0].userId).toBe("user1");
      expect(logs[0].message).toBe("User 1 log");
    });
  });

  describe("clearLogs", () => {
    it("devrait supprimer tous les logs", async () => {
      // Créer quelques logs
      await logDb.createLog(TEST_LOG);
      await logDb.createLog(TEST_LOG);

      // Vérifier qu'ils existent
      expect(logDb.getLogs()).toHaveLength(2);

      // Supprimer tous les logs
      logDb.clearLogs();

      // Vérifier qu'ils ont été supprimés
      expect(logDb.getLogs()).toHaveLength(0);
    });
  });
});
