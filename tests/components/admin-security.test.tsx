// @vitest-environment jsdom

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MotionGlobalConfig } from "framer-motion";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultSecuritySettings, RATE_LIMIT_PRESETS, type SecuritySettings } from "@/lib/security/settings-schema";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/admin/security",
  useSearchParams: () => new URLSearchParams(),
}));

import SecurityPageClient, { resolveTab } from "@/app/(app)/admin/security/page.client";
import { RulesTab } from "@/app/(app)/admin/security/_components/rules-tab";
import { ResourceProvider } from "@/app/(app)/admin/security/_components/resource";
import { sameValues, sectionPatch } from "@/app/(app)/admin/security/_components/settings-form";
import { sessionsError } from "@/app/(app)/admin/security/_components/sessions-tab";
import { apiKeysError, keyFilters } from "@/app/(app)/admin/security/_components/api-keys-tab";
import { checksSummary, describeAlert } from "@/app/(app)/admin/security/_components/overview-tab";
import { issuesMessage } from "@/app/(app)/admin/security/_components/api";

MotionGlobalConfig.skipAnimations = true;
// Radix mesure ses éléments ; jsdom ne connaît ni ResizeObserver ni scrollIntoView.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView ??= function scrollIntoView() {};
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.releasePointerCapture ??= () => {};

const NOW = Date.now();

let stored: SecuritySettings;
const puts: unknown[] = [];

function settingsPayload() {
  return {
    settings: stored,
    defaults: defaultSecuritySettings(),
    authMode: "builtin",
    builtinOnly: ["passwords", "signIn"],
    restartRequired: ["sessions"],
    rateLimitPresets: RATE_LIMIT_PRESETS,
  };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** Serveur simulé : les routes de l'écran, le réglage enregistré gardé en mémoire. */
function fakeServer(url: string, init?: RequestInit): Response {
  const path = url.split("?")[0];
  if (path === "/api/admin/security/settings") {
    if (init?.method === "PUT") {
      const patch = JSON.parse(String(init.body)) as Partial<SecuritySettings>;
      puts.push(patch);
      stored = { ...stored, ...Object.fromEntries(Object.entries(patch).map(([section, values]) => [section, { ...stored[section as keyof SecuritySettings], ...values }])) } as SecuritySettings;
    }
    return json(settingsPayload());
  }
  if (path === "/api/admin/security/checks") {
    return json({
      checkedAt: new Date(NOW).toISOString(),
      checks: [
        { id: "auth-secret", group: "access", status: "ok", title: "Secret d’authentification assez long", detail: "AUTH_SECRET fait au moins 32 caractères." },
        { id: "keys-no-expiry", group: "keys", status: "warning", title: "2 clés sans expiration", detail: "…", action: { label: "Voir les clés", tab: "keys" } },
      ],
    });
  }
  if (path === "/api/admin/security/alerts") return json({ alerts: [], unacknowledged: 0 });
  if (path === "/api/admin/security/sessions") return json({ sessions: [] });
  if (path === "/api/admin/security/api-keys") return json({ keys: [] });
  if (path === "/api/admin/logs") return json([]);
  return json({ error: "inconnu" }, 404);
}

beforeEach(() => {
  stored = defaultSecuritySettings();
  puts.length = 0;
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => fakeServer(String(input), init)) as unknown as typeof fetch;
});

describe("écran Sécurité : onglets", () => {
  it("lit l’onglet dans l’adresse, État par défaut", () => {
    expect(resolveTab(null)).toBe("overview");
    expect(resolveTab("inconnu")).toBe("overview");
    expect(resolveTab("keys")).toBe("keys");
    expect(resolveTab("sign-in")).toBe("sign-in");
  });

  it("ouvre l’onglet de l’adresse et garde le choix dans ?tab=", async () => {
    const user = userEvent.setup();
    const onUrlUpdate = vi.fn();
    render(
      <NuqsTestingAdapter searchParams="?tab=rules" onUrlUpdate={onUrlUpdate} hasMemory>
        <SecurityPageClient />
      </NuqsTestingAdapter>
    );
    expect(screen.getByRole("tab", { name: "Règles" })).toHaveAttribute("data-state", "active");
    // Seules les données de l'onglet ouvert sont lues.
    await waitFor(() => expect(screen.getByRole("region", { name: "Limites de débit" })).toBeTruthy());
    const urls = vi.mocked(globalThis.fetch).mock.calls.map(([url]) => String(url).split("?")[0]);
    expect(urls).not.toContain("/api/admin/security/sessions");
    expect(urls).not.toContain("/api/admin/security/checks");

    await user.click(screen.getByRole("tab", { name: "Sessions" }));
    await waitFor(() => expect(onUrlUpdate).toHaveBeenCalled());
    expect(onUrlUpdate.mock.calls.at(-1)?.[0].searchParams.get("tab")).toBe("sessions");

    // L'onglet par défaut ne laisse rien dans l'adresse.
    await user.click(screen.getByRole("tab", { name: /État/ }));
    await waitFor(() => expect(onUrlUpdate.mock.calls.at(-1)?.[0].searchParams.get("tab")).toBeNull());
  });

  it("un point de contrôle renvoie vers son onglet", async () => {
    const user = userEvent.setup();
    const onUrlUpdate = vi.fn();
    render(
      <NuqsTestingAdapter onUrlUpdate={onUrlUpdate} hasMemory>
        <SecurityPageClient />
      </NuqsTestingAdapter>
    );
    const panel = await screen.findByRole("region", { name: "Points de contrôle" });
    await waitFor(() => expect(within(panel).getByText("2 clés sans expiration")).toBeTruthy());
    expect(within(panel).getByText(/1 point à revoir/)).toBeTruthy();
    await user.click(within(panel).getByRole("button", { name: /Voir les clés/ }));
    await waitFor(() => expect(onUrlUpdate.mock.calls.at(-1)?.[0].searchParams.get("tab")).toBe("keys"));
  });
});

describe("écran Sécurité : réglages", () => {
  it("compare et découpe les sections", () => {
    expect(sameValues({ a: 1, b: true }, { a: 1, b: true })).toBe(true);
    expect(sameValues({ a: 1, b: true }, { a: 1, b: false })).toBe(false);
    expect(sameValues({ a: null }, { a: null })).toBe(true);
    expect(sectionPatch("logs", { retentionDays: 30, imageViews: "off" })).toEqual({ logs: { retentionDays: 30, imageViews: "off" } });
  });

  it("refuse des réglages incohérents avant l’envoi", () => {
    expect(sessionsError({ maxAgeDays: 1, refreshHours: 24 })).toMatch(/plus court/);
    expect(sessionsError({ maxAgeDays: 7, refreshHours: 24 })).toBeNull();
    expect(apiKeysError({ defaultExpiryDays: null, maxExpiryDays: 90 })).toMatch(/Jamais/);
    expect(apiKeysError({ defaultExpiryDays: 365, maxExpiryDays: 90 })).toMatch(/dépasse/);
    expect(apiKeysError({ defaultExpiryDays: null, maxExpiryDays: null })).toBeNull();
    expect(issuesMessage([{ path: "logs.retentionDays", message: "Too small" }])).toMatch(/Conservation/);
  });

  it("n’active « Enregistrer » qu’après un changement, n’envoie que la section, puis se remet au repos", async () => {
    const user = userEvent.setup();
    render(
      <ResourceProvider>
        <RulesTab />
      </ResourceProvider>
    );
    const panel = await screen.findByRole("region", { name: "Alertes" });
    const save = await within(panel).findByRole("button", { name: "Enregistrer" });
    expect(save).toBeDisabled();

    const toggle = within(panel).getByRole("switch", { name: /Nouvelle clé API/ });
    await user.click(toggle);
    expect(save).toBeEnabled();
    // Revenir à la valeur enregistrée : plus rien à envoyer.
    await user.click(toggle);
    expect(save).toBeDisabled();

    await user.click(toggle);
    await user.click(save);
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toEqual({ alerts: { failedSignIns: true, newApiKey: false, adminNewIp: true, fileMadePublic: true } });
    await waitFor(() => expect(within(panel).getByText("Enregistré")).toBeTruthy());
    expect(save).toBeDisabled();
    expect(toggle).not.toBeChecked();
    // Les autres panneaux n'ont rien envoyé.
    expect(within(screen.getByRole("region", { name: "Journaux" })).getByRole("button", { name: "Enregistrer" })).toBeDisabled();
  });

  it("choisit un niveau de débit sur sa carte", async () => {
    const user = userEvent.setup();
    render(
      <ResourceProvider>
        <RulesTab />
      </ResourceProvider>
    );
    const panel = await screen.findByRole("region", { name: "Limites de débit" });
    const strict = await within(panel).findByRole("radio", { name: /Stricte/ });
    expect(within(panel).getByRole("radio", { name: /Normale/ })).toHaveAttribute("aria-checked", "true");
    await user.click(strict);
    expect(strict).toHaveAttribute("aria-checked", "true");
    await user.click(within(panel).getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(puts).toEqual([{ rateLimits: { level: "strict" } }]));
  });
});

describe("écran Sécurité : textes", () => {
  it("résume les points de contrôle", () => {
    const check = (status: "ok" | "warning" | "problem") => ({ id: status, group: "access" as const, status, title: "", detail: "" });
    expect(checksSummary([check("ok")])).toBe("Tout est en ordre.");
    expect(checksSummary([check("warning"), check("problem"), check("problem")])).toBe("3 points à revoir, dont 2 problèmes.");
    expect(checksSummary([check("problem")])).toBe("1 point à revoir, un problème.");
  });

  it("écrit chaque alerte en une phrase", () => {
    expect(describeAlert({ kind: "newApiKey", details: { keyName: "ShareX maison", userEmail: "demo@local.sharex-manager" } })).toBe("Clé « ShareX maison » créée par demo.");
    expect(describeAlert({ kind: "failedSignIns", details: { identifier: "admin", ip: "203.0.113.4", maxAttempts: 5, lockMinutes: 15 } })).toBe(
      "Connexions à « admin » bloquées après 5 échecs depuis 203.0.113.4, pour 15 minutes."
    );
  });

  it("range une clé dans ses filtres", () => {
    const base = { id: "k", name: "k", prefix: "sk_abc", owner: null, permissions: {}, uploadsLastHour: 0 };
    const old = new Date(NOW - 200 * 86_400_000).toISOString();
    expect([...keyFilters({ ...base, status: "orphan", createdAt: old, lastUsedAt: null, expiresAt: null }, NOW)].sort()).toEqual(["inactive", "no-expiry", "orphan"]);
    expect([...keyFilters({ ...base, status: "expired", createdAt: old, lastUsedAt: null, expiresAt: old }, NOW)]).toEqual(["expired"]);
  });
});
