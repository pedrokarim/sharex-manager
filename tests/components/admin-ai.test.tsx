// @vitest-environment jsdom

import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MotionGlobalConfig } from "framer-motion";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AiDailyUsage, AiLimit, AiProviderOverview, AiUsageOverview } from "@/lib/ai-usage/types";

// Les actions serveur de l'écran sont remplacées : l'écran ne parle qu'à elles.
const actions = vi.hoisted(() => ({
  aiUsageOverviewAction: vi.fn(),
  readRemoteLimitsAction: vi.fn(),
}));
vi.mock("@/app/(app)/admin/ai/actions", () => actions);
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/admin/ai",
  useSearchParams: () => new URLSearchParams(),
}));

import { AiUsagePageClient } from "@/app/(app)/admin/ai/page.client";
import { sortedLimits } from "@/app/(app)/admin/ai/_components/limits-panel";
import { formatRemaining, mergeLimits } from "@/app/(app)/admin/ai/_components/format";

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
const DAY = 86_400_000;
/** Testing Library ramène toute suite d'espaces (insécables comprises) à une espace simple. */
const norm = (text: string) => text.replace(/\s+/g, " ");
const fr = (value: number) => norm(value.toLocaleString("fr-FR"));

function days(calls = 0, failures = 0): AiDailyUsage[] {
  return Array.from({ length: 30 }, (_, index) => {
    const date = new Date(NOW - (29 - index) * DAY);
    return {
      day: date.toISOString().slice(0, 10),
      calls: index === 29 ? calls : 0,
      failures: index === 29 ? failures : 0,
      amount: {},
    };
  });
}

function limit(overrides: Partial<AiLimit> & Pick<AiLimit, "id" | "label" | "used" | "limit">): AiLimit {
  return { unit: "calls", period: "month", source: "local", ...overrides };
}

function provider(overrides: Partial<AiProviderOverview> & Pick<AiProviderOverview, "id" | "label">): AiProviderOverview {
  return {
    kind: "api",
    access: "key",
    usedBy: [],
    limits: [],
    remoteReadable: false,
    month: { calls: 0, failures: 0, amount: {} },
    daily: days(),
    byFeature: [],
    ...overrides,
  };
}

function overview(): AiUsageOverview {
  return {
    generatedAt: NOW,
    providers: [
      provider({
        id: "deepl",
        label: "DeepL",
        brand: "deepl",
        remoteReadable: true,
        usedBy: ["scan-studio"],
        settingsHref: "/admin/system",
        limits: [limit({ id: "deepl-month", label: "Caractères traduits", unit: "characters", used: 412_000, limit: 500_000, resetsAt: NOW + 12 * DAY })],
        month: { calls: 40, failures: 1, amount: { characters: 412_000 } },
        daily: days(40, 1),
        byFeature: [{ module: "scan-studio", feature: "Traduction de page", calls: 40, failures: 1, amount: { characters: 412_000 }, lastAt: NOW - 60_000 }],
        lastCall: { at: NOW - 60_000, ok: true, module: "scan-studio", feature: "Traduction de page" },
      }),
      provider({
        id: "openai",
        label: "OpenAI",
        brand: "openai",
        access: "env",
        usedBy: ["ai-image-gen"],
        limits: [limit({ id: "openai-images", label: "Images générées", unit: "images", period: "day", used: 30, limit: 100 })],
        month: { calls: 30, failures: 0, amount: { images: 30 } },
      }),
      provider({
        id: "elevenlabs",
        label: "ElevenLabs",
        brand: "elevenlabs",
        usedBy: ["clip-studio"],
        limits: [limit({ id: "elevenlabs-chars", label: "Caractères de voix", unit: "characters", used: 9_000, limit: 10_000, source: "remote", blockedUntil: NOW + 3 * DAY })],
        month: { calls: 12, failures: 2, amount: { characters: 9_000 } },
      }),
      provider({
        id: "tracemoe",
        label: "trace.moe",
        brand: "tracemoe",
        kind: "free",
        access: "open",
        usedBy: ["reverse-search"],
        limits: [limit({ id: "tracemoe-month", label: "Recherches du mois", used: 900, limit: 1_000, source: "plan" })],
        month: { calls: 900, failures: 0, amount: { calls: 900 } },
      }),
      provider({ id: "libretranslate", label: "LibreTranslate", brand: "libretranslate", kind: "self-hosted", access: "none", usedBy: ["scan-studio"] }),
    ],
    recent: [
      { provider: "deepl", module: "scan-studio", feature: "Traduction de page", unit: "characters", amount: 1_200, ok: true, at: NOW - 60_000 },
      { provider: "elevenlabs", module: "clip-studio", feature: "Voix off", model: "eleven_multilingual_v2", unit: "characters", amount: 800, ok: false, error: "Quota épuisé chez le service.", at: NOW - 120_000 },
    ],
  };
}

/** Libellés des limites dans l'ordre du panneau. */
function limitLabels() {
  const panel = screen.getByRole("region", { name: "Limites" });
  return Array.from(panel.querySelectorAll("[data-slot=limit-row]")).map((row) => row.querySelector("span")?.textContent);
}

/** Noms des fournisseurs dans l'ordre du tableau. */
function providerNames() {
  const table = screen.getByRole("region", { name: "Fournisseurs" });
  return within(table)
    .queryAllByRole("button")
    .map((button) => button.textContent)
    .filter((name) => ["DeepL", "OpenAI", "ElevenLabs", "trace.moe", "LibreTranslate"].includes(name ?? ""));
}

describe("écran Intelligence artificielle", () => {
  beforeEach(() => {
    actions.aiUsageOverviewAction.mockResolvedValue({ ok: true, data: overview() });
    actions.readRemoteLimitsAction.mockResolvedValue({ ok: false, error: "non simulé" });
  });

  it("trie les limites : la limite refusée d’abord, puis la plus entamée", () => {
    render(<AiUsagePageClient initial={overview()} />);
    // Les limites tendues se montrent toutes ; la plus large attend « Afficher ».
    expect(limitLabels()).toEqual(["Caractères de voix", "Recherches du mois", "Caractères traduits"]);
    const panel = screen.getByRole("region", { name: "Limites" });
    expect(within(panel).getByRole("button", { name: "Afficher l’autre limite" })).toBeTruthy();
    expect(within(panel).getByText(/ElevenLabs refuse les appels/)).toBeTruthy();
    expect(within(panel).getByText(norm(`${fr(88_000)} caractères restants`))).toBeTruthy();
    expect(within(panel).getByText("1 refusée par le service")).toBeTruthy();
  });

  it("trie aussi sans rendu, et une lecture du solde remplace la limite de même identifiant", () => {
    const sorted = sortedLimits(overview().providers, NOW).map((entry) => entry.limit.id);
    expect(sorted).toEqual(["elevenlabs-chars", "tracemoe-month", "deepl-month", "openai-images"]);
    const merged = mergeLimits(overview().providers[0].limits, [limit({ id: "deepl-month", label: "Caractères traduits", unit: "characters", used: 450_000, limit: 500_000, source: "remote" })]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ used: 450_000, source: "remote" });
    expect(formatRemaining(3, "images")).toBe("3 images restantes");
  });

  it("n’affiche qu’une fois un plafond commun à plusieurs fournisseurs", () => {
    const shared = limit({ id: "module-ai-month", label: "Plafond mensuel des appels d’IA", used: 12, limit: 60 });
    const providers = overview().providers.map((entry) => (entry.id === "openai" || entry.id === "deepl" ? { ...entry, limits: [shared] } : { ...entry, limits: [] }));
    const sorted = sortedLimits(providers, NOW);
    expect(sorted).toHaveLength(1);
    expect([sorted[0].provider.id, ...sorted[0].sharedWith.map((entry) => entry.id)].sort()).toEqual(["deepl", "openai"]);
  });

  it("filtre les fournisseurs avec des compteurs", async () => {
    const user = userEvent.setup();
    render(<AiUsagePageClient initial={overview()} />);
    const filters = screen.getByRole("radiogroup", { name: "Filtrer les fournisseurs" });
    expect(within(filters).getByRole("radio", { name: /Tous\s*5/ })).toBeTruthy();
    expect(within(filters).getByRole("radio", { name: /Utilisés ce mois\s*4/ })).toBeTruthy();
    expect(within(filters).getByRole("radio", { name: /À surveiller\s*3/ })).toBeTruthy();
    expect(within(filters).getByRole("radio", { name: /Non configurés\s*1/ })).toBeTruthy();

    // Tous : les plus utilisés ce mois-ci d'abord.
    expect(providerNames()).toEqual(["trace.moe", "DeepL", "OpenAI", "ElevenLabs", "LibreTranslate"]);

    await user.click(within(filters).getByRole("radio", { name: /À surveiller/ }));
    await waitFor(() => expect(providerNames()).toEqual(["trace.moe", "DeepL", "ElevenLabs"]));

    await user.click(within(filters).getByRole("radio", { name: /Non configurés/ }));
    await waitFor(() => expect(providerNames()).toEqual(["LibreTranslate"]));

    await user.click(within(filters).getByRole("radio", { name: /Tous/ }));
    await user.type(screen.getByRole("textbox", { name: "Chercher un fournisseur" }), "clip");
    await waitFor(() => expect(providerNames()).toEqual(["ElevenLabs"]));
  });

  it("ouvre le tiroir d’un fournisseur et lit son solde chez lui", async () => {
    const user = userEvent.setup();
    actions.readRemoteLimitsAction.mockResolvedValueOnce({ ok: false, error: "Clé refusée par DeepL." });
    actions.readRemoteLimitsAction.mockResolvedValueOnce({
      ok: true,
      data: [limit({ id: "deepl-month", label: "Caractères traduits", unit: "characters", used: 450_000, limit: 500_000, source: "remote" })],
    });
    render(<AiUsagePageClient initial={overview()} />);

    await user.click(within(screen.getByRole("region", { name: "Fournisseurs" })).getByRole("button", { name: "DeepL" }));
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByRole("heading", { name: "DeepL" })).toBeTruthy();
    expect(within(sheet).getByText("Clé configurée")).toBeTruthy();
    expect(within(sheet).getByRole("link", { name: /Régler/ }).getAttribute("href")).toBe("/admin/system");
    expect(within(sheet).getByText("Trente derniers jours")).toBeTruthy();
    expect(within(sheet).getAllByText("Traduction de page").length).toBeGreaterThan(0);
    expect(within(sheet).getByText(fr(412_000))).toBeTruthy();

    // Un échec s'affiche à côté du bouton, pas dans un toast.
    const read = within(sheet).getByRole("button", { name: "Lire le solde chez DeepL" });
    await user.click(read);
    expect(await within(sheet).findByRole("alert")).toHaveProperty("textContent", "Clé refusée par DeepL.");
    expect(actions.readRemoteLimitsAction).toHaveBeenCalledWith("deepl");

    // Une lecture réussie remplace la jauge, ici et dans le panneau des limites.
    await user.click(read);
    expect(await within(sheet).findByText("Solde lu chez DeepL")).toBeTruthy();
    expect(within(sheet).getByText(fr(450_000))).toBeTruthy();
    expect(within(sheet).getByText("Lu chez DeepL")).toBeTruthy();
    expect(actions.readRemoteLimitsAction).toHaveBeenCalledTimes(2);
  });

  it("montre les derniers appels et leurs erreurs en entier", async () => {
    const user = userEvent.setup();
    render(<AiUsagePageClient initial={overview()} />);
    await user.click(screen.getByRole("tab", { name: /Derniers appels/ }));
    const table = await screen.findByRole("table", { name: "Derniers appels" });
    expect(within(table).getByText("Quota épuisé chez le service.")).toBeTruthy();
    await user.click(screen.getByRole("radio", { name: /Échecs/ }));
    await waitFor(() => expect(within(table).queryByText("Traduction de page")).toBeNull());
    expect(within(table).getByText("Voix off")).toBeTruthy();
  });

  it("actualise l’aperçu et le dit à côté du bouton", async () => {
    const user = userEvent.setup();
    render(<AiUsagePageClient initial={overview()} />);
    await user.click(screen.getByRole("button", { name: "Actualiser" }));
    expect(await screen.findByText("À jour")).toBeTruthy();
    expect(actions.aiUsageOverviewAction).toHaveBeenCalledTimes(1);
  });

  it("dit proprement qu’aucune limite n’est connue", () => {
    const empty = overview();
    empty.providers = empty.providers.map((entry) => ({ ...entry, limits: [] }));
    render(<AiUsagePageClient initial={empty} />);
    expect(screen.getByText("Aucune limite connue")).toBeTruthy();
  });
});
