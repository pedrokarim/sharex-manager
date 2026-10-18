import { describe, expect, it } from "vitest";
import { compareChecks, computeSecurityChecks, summarizeApiKeys, type CheckInput, type SecurityCheck } from "@/lib/security/checks";
import { defaultSecuritySettings } from "@/lib/security/settings-schema";

/**
 * Points de contrôle de l'écran Sécurité : calcul pur, sur un état de
 * l'instance décrit à la main.
 */

const NOW = Date.parse("2026-10-18T12:00:00Z");
const DAY = 86_400_000;

function input(overrides: Partial<CheckInput> = {}): CheckInput {
  return {
    platform: "linux",
    authMode: "builtin",
    authSecretLength: 48,
    authUrl: "https://sharex.example.org",
    ascenciaAdminRoles: null,
    encryptionKeySource: "env",
    admins: 2,
    apiKeys: { total: 3, noExpiry: 0, inactive: 0, orphan: 0, expired: 0 },
    settings: defaultSecuritySettings(),
    unacknowledgedAlerts: 0,
    permissions: { dataDirLoose: false, looseFiles: [] },
    publicFunctions: [],
    ...overrides,
  };
}

const byId = (checks: SecurityCheck[], id: string) => checks.find((check) => check.id === id);

describe("points de contrôle", () => {
  it("une instance bien réglée n’a rien à revoir", () => {
    const checks = computeSecurityChecks(input());
    expect(checks.filter((check) => check.status === "problem" || check.status === "warning")).toEqual([]);
    expect(byId(checks, "auth-secret")?.status).toBe("ok");
    expect(byId(checks, "auth-url")?.status).toBe("ok");
    expect(byId(checks, "auth-mode")?.status).toBe("info");
  });

  it("juge AUTH_SECRET sur sa longueur, sans jamais citer sa valeur", () => {
    expect(byId(computeSecurityChecks(input({ authSecretLength: 0 })), "auth-secret")?.status).toBe("problem");
    const short = byId(computeSecurityChecks(input({ authSecretLength: 12 })), "auth-secret");
    expect(short?.status).toBe("problem");
    expect(short?.detail).not.toMatch(/12/);
    expect(byId(computeSecurityChecks(input({ authSecretLength: 32 })), "auth-secret")?.status).toBe("ok");
  });

  it("exige https, sauf en local", () => {
    expect(byId(computeSecurityChecks(input({ authUrl: "http://sharex.example.org" })), "auth-url")?.status).toBe("problem");
    expect(byId(computeSecurityChecks(input({ authUrl: "http://localhost:3000" })), "auth-url")?.status).toBe("info");
    expect(byId(computeSecurityChecks(input({ authUrl: null })), "auth-url")?.status).toBe("warning");
    expect(byId(computeSecurityChecks(input({ authUrl: "pas une adresse" })), "auth-url")?.status).toBe("warning");
  });

  it("signale zéro administrateur ou plus de cinq", () => {
    expect(byId(computeSecurityChecks(input({ admins: 0 })), "admins")?.status).toBe("warning");
    expect(byId(computeSecurityChecks(input({ admins: 6 })), "admins")?.status).toBe("warning");
    expect(byId(computeSecurityChecks(input({ admins: 5 })), "admins")?.status).toBe("ok");
    expect(byId(computeSecurityChecks(input({ admins: null })), "admins")?.status).toBe("warning");
  });

  it("en mode Ascencia, recommande un rôle d’administration dédié", () => {
    const broad = computeSecurityChecks(input({ authMode: "ascencia", ascenciaAdminRoles: ["superadmin", "authorized"] }));
    expect(byId(broad, "ascencia-admin-roles")?.status).toBe("warning");
    const dedicated = computeSecurityChecks(input({ authMode: "ascencia", ascenciaAdminRoles: ["superadmin"] }));
    expect(byId(dedicated, "ascencia-admin-roles")?.status).toBe("ok");
    expect(byId(computeSecurityChecks(input()), "ascencia-admin-roles")).toBeUndefined();
  });

  it("préfère une clé de chiffrement séparée d’AUTH_SECRET", () => {
    expect(byId(computeSecurityChecks(input({ encryptionKeySource: "auth-secret" })), "encryption-key")?.status).toBe("warning");
    expect(byId(computeSecurityChecks(input({ encryptionKeySource: null })), "encryption-key")?.status).toBe("problem");
  });

  it("ne juge pas les droits des fichiers sous Windows, et liste les fichiers trop ouverts ailleurs", () => {
    const windows = byId(computeSecurityChecks(input({ platform: "win32", permissions: null })), "data-permissions");
    expect(windows?.status).toBe("info");
    expect(windows?.title).toMatch(/Windows/);
    const loose = byId(computeSecurityChecks(input({ permissions: { dataDirLoose: true, looseFiles: ["auth.db"] } })), "data-permissions");
    expect(loose?.status).toBe("warning");
    expect(loose?.detail).toMatch(/auth\.db/);
  });

  it("compte les clés à revoir et renvoie vers l’onglet des clés", () => {
    const checks = computeSecurityChecks(input({ apiKeys: { total: 5, noExpiry: 2, inactive: 1, orphan: 1, expired: 1 } }));
    expect(byId(checks, "keys-orphan")).toMatchObject({ status: "problem", action: { tab: "keys" } });
    expect(byId(checks, "keys-no-expiry")).toMatchObject({ status: "warning", title: "2 clés sans expiration" });
    expect(byId(checks, "keys-inactive")?.status).toBe("warning");
    expect(byId(checks, "keys-expired")?.status).toBe("info");
  });

  it("signale les alertes non vues et liste les fonctions publiques des modules", () => {
    const checks = computeSecurityChecks(input({ unacknowledgedAlerts: 3, publicFunctions: [{ module: "brand-kit", functions: ["getWatermarkImage"] }] }));
    expect(byId(checks, "alerts")).toMatchObject({ status: "warning", title: "3 alertes à voir" });
    expect(byId(checks, "public-functions")?.detail).toMatch(/brand-kit \(getWatermarkImage\)/);
  });

  it("met les problèmes avant ce qui est à revoir, puis l’information et ce qui va bien", () => {
    const statuses = computeSecurityChecks(input({ authSecretLength: 0, admins: 0 }))
      .sort(compareChecks)
      .map((check) => check.status);
    expect(statuses.indexOf("problem")).toBeLessThan(statuses.indexOf("warning"));
    expect(statuses.lastIndexOf("warning")).toBeLessThan(statuses.indexOf("info"));
    expect(statuses.lastIndexOf("info")).toBeLessThan(statuses.indexOf("ok"));
  });

  it("résume les clés : sans expiration, inactives, orphelines, expirées", () => {
    const users = new Set(["u1"]);
    const summary = summarizeApiKeys(
      [
        { id: "a", createdBy: "u1", createdAt: new Date(NOW - 10 * DAY).toISOString(), expiresAt: null, lastUsed: new Date(NOW - DAY).toISOString() },
        { id: "b", createdBy: "u1", createdAt: new Date(NOW - 200 * DAY).toISOString(), expiresAt: new Date(NOW + 30 * DAY).toISOString() },
        { id: "c", createdBy: "gone", createdAt: new Date(NOW - DAY).toISOString(), expiresAt: null },
        { id: "d", createdBy: "gone", createdAt: new Date(NOW - 400 * DAY).toISOString(), expiresAt: new Date(NOW - DAY).toISOString() },
      ],
      users,
      NOW
    );
    // L'expirée ne compte ni comme inactive ni comme orpheline.
    expect(summary).toEqual({ total: 4, noExpiry: 2, inactive: 1, orphan: 1, expired: 1 });
  });
});
