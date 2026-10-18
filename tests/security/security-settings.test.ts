import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import {
  apiKeyExpiry,
  defaultSecuritySettings,
  getRateLimits,
  getSecuritySettings,
  mergeSecuritySettings,
  normalizeSecuritySettings,
  RATE_LIMIT_PRESETS,
  SecuritySettingsError,
  sessionDurations,
  setSecuritySettingsPath,
  updateSecuritySettings,
} from "@/lib/security/settings";

let directory = "";
let file = "";

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "sxm-security-settings-"));
  file = path.join(directory, "security.json");
  setSecuritySettingsPath(file);
});

afterEach(() => {
  setSecuritySettingsPath(null);
  fs.rmSync(directory, { recursive: true, force: true });
});

describe("réglages de sécurité", () => {
  it("donne des valeurs par défaut sûres sans fichier", () => {
    expect(getSecuritySettings()).toEqual({
      passwords: { minLength: 12, rejectCommon: true },
      sessions: { maxAgeDays: 7, refreshHours: 24 },
      signIn: { maxAttempts: 5, lockMinutes: 15 },
      apiKeys: { defaultExpiryDays: 90, maxExpiryDays: 365, uploadsPerHour: 120 },
      rateLimits: { level: "normal" },
      logs: { retentionDays: 90, imageViews: "all" },
      alerts: { failedSignIns: true, newApiKey: true, adminNewIp: true, fileMadePublic: true },
    });
    expect(fs.existsSync(file)).toBe(false);
  });

  it("enregistre une modification partielle sans toucher au reste", () => {
    const updated = updateSecuritySettings({ sessions: { maxAgeDays: 14 }, logs: { imageViews: "sampled" } });
    expect(updated.sessions).toEqual({ maxAgeDays: 14, refreshHours: 24 });
    expect(updated.logs).toEqual({ retentionDays: 90, imageViews: "sampled" });
    expect(updated.passwords).toEqual(defaultSecuritySettings().passwords);

    const stored = JSON.parse(fs.readFileSync(file, "utf-8"));
    expect(stored.sessions.maxAgeDays).toBe(14);
    expect(getSecuritySettings().sessions.maxAgeDays).toBe(14);
    if (process.platform !== "win32") {
      expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    }
  });

  it("refuse une valeur hors bornes sans rien écrire", () => {
    updateSecuritySettings({ signIn: { maxAttempts: 8 } });
    const before = fs.readFileSync(file, "utf-8");
    expect(() => updateSecuritySettings({ passwords: { minLength: 4 } })).toThrow(SecuritySettingsError);
    expect(() => updateSecuritySettings({ rateLimits: { level: "extreme" } })).toThrow(SecuritySettingsError);
    expect(() => updateSecuritySettings({ sessions: { maxAgeDays: 1, refreshHours: 48 } })).toThrow(/renouvellement/);
    expect(fs.readFileSync(file, "utf-8")).toBe(before);
  });

  it("exige une durée par défaut des clés API compatible avec la durée maximale", () => {
    expect(() => updateSecuritySettings({ apiKeys: { defaultExpiryDays: 400 } })).toThrow(SecuritySettingsError);
    expect(() => updateSecuritySettings({ apiKeys: { defaultExpiryDays: null } })).toThrow(SecuritySettingsError);
    const settings = updateSecuritySettings({ apiKeys: { defaultExpiryDays: null, maxExpiryDays: null } });
    expect(settings.apiKeys).toEqual({ defaultExpiryDays: null, maxExpiryDays: null, uploadsPerHour: 120 });
  });

  it("ignore les sections et champs inconnus", () => {
    const merged = mergeSecuritySettings(defaultSecuritySettings(), { unknown: { a: 1 }, logs: { retentionDays: 30, extra: true } });
    expect(merged).not.toHaveProperty("unknown");
    expect(merged.logs).toEqual({ retentionDays: 30, imageViews: "all" });
  });

  it("garde les sections valides d'un fichier abîmé à la main", () => {
    fs.writeFileSync(file, JSON.stringify({ passwords: { minLength: 2 }, logs: { retentionDays: 30 } }));
    const settings = getSecuritySettings();
    expect(settings.passwords).toEqual({ minLength: 12, rejectCommon: true });
    expect(settings.logs.retentionDays).toBe(30);

    fs.writeFileSync(file, "{ pas du json");
    // Nouvelle date de modification : le cache est relu.
    fs.utimesSync(file, new Date(), new Date(Date.now() + 5000));
    expect(getSecuritySettings()).toEqual(defaultSecuritySettings());
    expect(normalizeSecuritySettings(null)).toEqual(defaultSecuritySettings());
  });

  it("traduit le niveau de limitation en limites concrètes", () => {
    expect(getRateLimits()).toEqual({ ...RATE_LIMIT_PRESETS.normal, uploadsPerKeyPerHour: 120 });
    updateSecuritySettings({ rateLimits: { level: "strict" } });
    expect(getRateLimits().uploadsPerKeyPerHour).toBe(RATE_LIMIT_PRESETS.strict.uploadsPerKeyPerHour);
    expect(RATE_LIMIT_PRESETS.relaxed.imageViewsPerIpPerMinute).toBeGreaterThan(RATE_LIMIT_PRESETS.strict.imageViewsPerIpPerMinute);
  });

  it("calcule les durées de session et l'expiration des clés API", () => {
    expect(sessionDurations()).toEqual({ expiresIn: 7 * 86400, updateAge: 24 * 3600 });
    const now = new Date("2026-10-18T00:00:00.000Z");
    expect(apiKeyExpiry(undefined, now)?.toISOString()).toBe("2027-01-16T00:00:00.000Z");
    expect(apiKeyExpiry(1000, now)?.toISOString()).toBe(new Date(now.getTime() + 365 * 86400000).toISOString());
    expect(apiKeyExpiry(null, now)?.toISOString()).toBe(new Date(now.getTime() + 365 * 86400000).toISOString());
    updateSecuritySettings({ apiKeys: { defaultExpiryDays: 30, maxExpiryDays: null } });
    expect(apiKeyExpiry(null, now)).toBeNull();
  });
});
