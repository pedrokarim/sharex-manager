import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Registre de consommation des IA : agrégats, trente jours, rotation,
 * écritures simultanées, fournisseurs jamais appelés, limites fusionnées des
 * modules et soldes lus chez les services (avec un faux `fetch`).
 */

// Faux gestionnaire de modules : de simples fonctions (la configuration de Vitest réinitialise les `vi.fn`).
const fake = vi.hoisted(() => ({
  modules: [] as { name: string; enabled: boolean; loaded: boolean; aiUsage?: { limits?: string; remote?: string }; exports: Record<string, (...args: any[]) => any> }[],
}));

vi.mock("@/lib/modules/module-manager.api", () => ({
  apiModuleManager: {
    ensureInitialized: async () => undefined,
    getModules: async () => fake.modules.map((entry) => ({ name: entry.name, enabled: entry.enabled, aiUsage: entry.aiUsage })),
    getLoadedModule: (name: string) => {
      const entry = fake.modules.find((module) => module.name === name);
      return entry ? { status: entry.loaded ? "loaded" : "error" } : undefined;
    },
    callModuleFunction: async (name: string, fn: string, ...args: unknown[]) => {
      const entry = fake.modules.find((module) => module.name === name);
      return entry?.exports[fn] ? entry.exports[fn](...args) : null;
    },
  },
}));

import {
  buildAiUsageOverview,
  cleanReport,
  collectModuleReports,
  flushAiUsage,
  getAiUsageOverview,
  readRemoteLimits,
  recordAiUsage,
  setAiUsageDataRoot,
} from "@/lib/ai-usage";
import { AI_PROVIDERS } from "@/lib/ai-usage/catalog";
import { applyEvents, dayKey, emptyUsage, lastDays, normalizeEvent, readStoredUsage, RECENT_LIMIT, RETENTION_DAYS } from "@/lib/ai-usage/store";
import { deeplUsageLimits, readElevenLabsLimits, readSerpApiLimits, readTraceMoeLimits } from "@/lib/ai-usage/remote";
import type { AiUsageEvent, AiUsageInput } from "@/lib/ai-usage/types";

const SECRET = "sk-test-0123456789abcdefghijklmnopqrstuvwxyz";

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "sxm-ai-usage-"));
  setAiUsageDataRoot(root);
  fake.modules = [];
});

afterEach(() => {
  flushAiUsage();
  setAiUsageDataRoot(null);
  fs.rmSync(root, { recursive: true, force: true });
});

const call = (input: Partial<AiUsageInput> = {}): AiUsageInput => ({
  provider: "openai",
  module: "clip-studio",
  feature: "Voix off",
  unit: "characters",
  amount: 100,
  ok: true,
  ...input,
});

const event = (input: Partial<AiUsageInput> = {}, at = Date.now()) => normalizeEvent(call({ ...input, at }))!;

describe("recordAiUsage", () => {
  it("agrège par jour, fournisseur, module et usage, et garde le dernier appel", () => {
    const now = Date.now();
    recordAiUsage(call({ at: now - 2000 }));
    recordAiUsage(call({ at: now - 1000, amount: 50 }));
    recordAiUsage(call({ at: now, ok: false, amount: 0, error: "Refus du service" }));
    recordAiUsage(call({ feature: "Script", provider: "codex", unit: "calls", amount: 1, extra: { tokens: 1200 }, at: now }));
    flushAiUsage();

    const stored = readStoredUsage();
    const voice = stored.days[dayKey(now)]?.openai?.["clip-studio"]?.["Voix off"];
    expect(voice).toMatchObject({ calls: 3, failures: 1, amount: { characters: 150 } });
    expect(stored.days[dayKey(now)]?.codex?.["clip-studio"]?.Script).toMatchObject({ calls: 1, amount: { calls: 1, tokens: 1200 } });
    expect(stored.last.openai).toMatchObject({ ok: false, error: "Refus du service" });
    expect(stored.recent).toHaveLength(4);
    expect(stored.recent[0].at).toBeGreaterThanOrEqual(stored.recent[3].at);
  });

  it("ne lève jamais et ignore une entrée inexploitable", () => {
    expect(() => recordAiUsage(null as unknown as AiUsageInput)).not.toThrow();
    expect(() => recordAiUsage(call({ provider: "inconnu" as never }))).not.toThrow();
    expect(() => recordAiUsage(call({ unit: "litres" as never }))).not.toThrow();
    flushAiUsage();
    expect(readStoredUsage().recent).toHaveLength(0);
  });

  it("n’écrit rien sur le chemin de l’appelant : la file attend le versement", () => {
    recordAiUsage(call());
    expect(fs.existsSync(path.join(root, "usage.json"))).toBe(false);
    flushAiUsage();
    expect(fs.existsSync(path.join(root, "usage.json"))).toBe(true);
  });

  it("masque ce qui ressemble à une clé dans un message d’erreur", () => {
    recordAiUsage(call({ ok: false, error: `HTTP 401 : Bearer ${SECRET} refusée ?api_key=${SECRET}` }));
    flushAiUsage();
    const raw = fs.readFileSync(path.join(root, "usage.json"), "utf-8");
    expect(raw).not.toContain(SECRET);
    expect(readStoredUsage().recent[0].error).toContain("HTTP 401");
  });

  it("garde tous les appels simultanés et ce qu’un autre processus a déjà écrit", async () => {
    // Un autre processus a déjà versé un appel.
    const before = applyEvents(emptyUsage(), [event({ feature: "Image générée", provider: "stability", unit: "images", amount: 2 })]);
    fs.writeFileSync(path.join(root, "usage.json"), JSON.stringify(before));

    await Promise.all(Array.from({ length: 300 }, (_, index) => Promise.resolve().then(() => recordAiUsage(call({ amount: 1, at: Date.now() - index })))));
    flushAiUsage();

    const stored = readStoredUsage();
    const today = dayKey(Date.now());
    const calls = Object.values(stored.days)
      .flatMap((day) => Object.values(day.openai?.["clip-studio"] ?? {}))
      .reduce((sum, aggregate) => sum + aggregate.calls, 0);
    expect(calls).toBe(300);
    expect(stored.days[today]?.stability?.["clip-studio"]?.["Image générée"]?.amount.images).toBe(2);
  });
});

describe("rotation", () => {
  it("garde les 500 derniers appels et environ treize mois d’agrégats", () => {
    const now = Date.now();
    const old = new Date(now);
    old.setDate(old.getDate() - (RETENTION_DAYS + 5));
    const events: AiUsageEvent[] = [event({}, old.getTime()), ...Array.from({ length: RECENT_LIMIT + 20 }, (_, index) => event({}, now - index))];
    const usage = applyEvents(emptyUsage(), events, now);

    expect(usage.recent).toHaveLength(RECENT_LIMIT);
    expect(usage.recent[0].at).toBe(now);
    expect(usage.days[dayKey(old.getTime())]).toBeUndefined();
    expect(usage.days[dayKey(now)]?.openai?.["clip-studio"]?.["Voix off"]?.calls).toBe(RECENT_LIMIT + 20);
  });
});

describe("aperçu", () => {
  it("couvre tous les fournisseurs, même jamais appelés, sur trente jours jours vides compris", () => {
    const now = new Date(2026, 9, 18, 15).getTime();
    const threeDaysAgo = new Date(2026, 9, 15, 10).getTime();
    const lastMonth = new Date(2026, 8, 30, 10).getTime();
    const usage = applyEvents(
      emptyUsage(),
      [
        event({ feature: "Voix off" }, now),
        event({ feature: "Voix off", amount: 40 }, threeDaysAgo),
        event({ feature: "Écoute d'une voix", amount: 10 }, threeDaysAgo),
        event({ feature: "Voix off", amount: 5 }, lastMonth),
      ],
      now
    );
    const overview = buildAiUsageOverview(usage, [], now);

    expect(overview.providers.map((provider) => provider.id)).toEqual(AI_PROVIDERS.map((provider) => provider.id));
    const openai = overview.providers.find((provider) => provider.id === "openai")!;
    expect(openai.daily).toHaveLength(30);
    expect(openai.daily[29].day).toBe("2026-10-18");
    expect(openai.daily[0].day).toBe(lastDays(now, 30)[0]);
    expect(openai.daily.filter((day) => day.calls === 0)).toHaveLength(27);
    expect(openai.daily.find((day) => day.day === "2026-10-15")).toMatchObject({ calls: 2, amount: { characters: 50 } });
    // Le mois en cours ne compte pas septembre.
    expect(openai.month).toMatchObject({ calls: 3, failures: 0, amount: { characters: 150 } });
    expect(openai.byFeature[0]).toMatchObject({ module: "clip-studio", feature: "Voix off", calls: 3 });
    expect(openai.lastCall).toMatchObject({ at: now, ok: true, feature: "Voix off" });
    expect(openai.usedBy).toEqual(["clip-studio"]);

    const deepl = overview.providers.find((provider) => provider.id === "deepl")!;
    expect(deepl).toMatchObject({ access: "none", usedBy: [], limits: [], remoteReadable: false, month: { calls: 0 } });
    expect(deepl.daily.every((day) => day.calls === 0)).toBe(true);
    expect(deepl.lastCall).toBeUndefined();
    // Un service gratuit sans clé est ouvert tant qu'aucun module ne dit le contraire.
    expect(overview.providers.find((provider) => provider.id === "mymemory")!.access).toBe("open");
    expect(overview.recent).toHaveLength(4);
  });

  it("fusionne les limites et l’accès rapportés par plusieurs modules", () => {
    const now = Date.now();
    const overview = buildAiUsageOverview(
      emptyUsage(),
      [
        {
          module: "ai-image-gen",
          report: { openai: { access: "key", settingsHref: "/m/ai-image-gen/settings" }, codex: { access: "cli" } },
        },
        {
          module: "scan-studio",
          report: cleanReport({
            openai: { limits: [{ id: "ai", label: "Plafond des appels", unit: "calls", period: "month", used: 10, limit: 60, source: "local" }] },
            deepl: {
              access: "env",
              remoteReadable: true,
              limits: [
                { id: "month", label: "Plafond mensuel", unit: "characters", period: "month", used: 100, limit: 500_000, source: "local" },
                { id: "blocked", label: "Quota", unit: "characters", period: "month", used: 1, limit: 1000, source: "local", blockedUntil: now + 60_000 },
                { id: "tight", label: "Presque plein", unit: "characters", period: "day", used: 900, limit: 1000, source: "local" },
              ],
            },
          }),
        },
        { module: "clip-studio", report: { openai: { access: "env" }, elevenlabs: { access: "none", remoteReadable: true } } },
      ],
      now
    );

    const openai = overview.providers.find((provider) => provider.id === "openai")!;
    expect(openai.access).toBe("env");
    expect(openai.usedBy).toEqual(["ai-image-gen", "clip-studio", "scan-studio"]);
    expect(openai.limits.map((limit) => limit.id)).toEqual(["ai"]);
    expect(openai.settingsHref).toBe("/m/ai-image-gen/settings");
    // OpenAI ne publie pas son solde : un module ne peut pas le prétendre.
    expect(openai.remoteReadable).toBe(false);

    const deepl = overview.providers.find((provider) => provider.id === "deepl")!;
    expect(deepl.limits.map((limit) => limit.id)).toEqual(["blocked", "tight", "month"]);
    expect(deepl.remoteReadable).toBe(true);
    expect(overview.providers.find((provider) => provider.id === "codex")!.access).toBe("cli");
  });

  it("écarte ce qu’un module rend de travers", () => {
    const report = cleanReport({
      inconnu: { access: "key" },
      openai: { access: "partout", settingsHref: "https://ailleurs.example/vol", limits: [{ id: "x", label: "Sans unité", used: 1, limit: 2 }] },
      deepl: { settingsHref: "/m/scan-studio/engines" },
    });
    expect(report).toEqual({ openai: {}, deepl: { settingsHref: "/m/scan-studio/engines" } });
  });

  it("interroge les modules activés et chargés seulement, et passe un module en échec", async () => {
    fake.modules = [
      { name: "scan-studio", enabled: true, loaded: true, aiUsage: { limits: "getAiLimits" }, exports: { getAiLimits: () => ({ mymemory: { access: "open" } }) } },
      { name: "coupe", enabled: false, loaded: true, aiUsage: { limits: "getAiLimits" }, exports: { getAiLimits: () => ({ openai: { access: "key" } }) } },
      { name: "casse", enabled: true, loaded: true, aiUsage: { limits: "getAiLimits" }, exports: { getAiLimits: () => { throw new Error("panne"); } } },
      { name: "sans-ia", enabled: true, loaded: true, exports: {} },
    ];
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const reports = await collectModuleReports();
    expect(reports).toEqual([{ module: "scan-studio", report: { mymemory: { access: "open" } } }]);
    errors.mockRestore();

    recordAiUsage(call({ provider: "mymemory", module: "scan-studio", feature: "Traduction de bulle" }));
    const overview = await getAiUsageOverview();
    const mymemory = overview.providers.find((provider) => provider.id === "mymemory")!;
    expect(mymemory.usedBy).toEqual(["scan-studio"]);
    expect(mymemory.month.calls).toBe(1);
  });
});

describe("soldes chez les services", () => {
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  it("ElevenLabs : clé en en-tête, jamais dans l’adresse", async () => {
    const seen: { url: string; headers: Record<string, string> }[] = [];
    const fetchStub = (async (url: string, init?: RequestInit) => {
      seen.push({ url, headers: init?.headers as Record<string, string> });
      return json({ tier: "starter", character_count: 1200, character_limit: 30000, next_character_count_reset_unix: 1_800_000_000 });
    }) as typeof fetch;
    const limits = await readElevenLabsLimits(SECRET, fetchStub);
    expect(seen[0].url).toBe("https://api.elevenlabs.io/v1/user/subscription");
    expect(seen[0].url).not.toContain(SECRET);
    expect(seen[0].headers["xi-api-key"]).toBe(SECRET);
    expect(limits).toEqual([expect.objectContaining({ unit: "characters", used: 1200, limit: 30000, resetsAt: 1_800_000_000_000, source: "remote" })]);
  });

  it("trace.moe : quota quotidien, adresse du compte jamais reprise", async () => {
    const fetchStub = (async () => json({ id: "203.0.113.7", priority: 0, concurrency: 1, quota: 100, quotaUsed: "7" })) as unknown as typeof fetch;
    const limits = await readTraceMoeLimits(undefined, fetchStub);
    expect(limits).toEqual([expect.objectContaining({ unit: "calls", period: "day", used: 7, limit: 100 })]);
    expect(JSON.stringify(limits)).not.toContain("203.0.113.7");
  });

  it("SerpApi : recherches du mois, et une erreur qui ne cite pas la clé", async () => {
    const ok = (async () => json({ searches_per_month: 250, this_month_usage: 12, plan_searches_left: 238, plan_name: "Free Plan", plan_renewal_date: "2026-11-01" })) as unknown as typeof fetch;
    expect(await readSerpApiLimits(SECRET, ok)).toEqual([expect.objectContaining({ id: "serpapi-searches", used: 12, limit: 250, period: "month" })]);

    const refused = (async () => json({ error: "Invalid API key." }, 401)) as unknown as typeof fetch;
    const error = await readSerpApiLimits(SECRET, refused).catch((failure: Error) => failure);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain(SECRET);
    expect((error as Error).message).toContain("SerpApi");
  });

  it("DeepL : un compte sans plafond ne donne aucune limite", () => {
    expect(deeplUsageLimits({ used: 10, limit: 1_000_000_000_000 })).toEqual([]);
    expect(deeplUsageLimits({ used: 10, limit: 500_000 })).toEqual([expect.objectContaining({ used: 10, limit: 500_000, source: "remote" })]);
  });

  it("readRemoteLimits passe par le module qui tient la clé", async () => {
    fake.modules = [
      { name: "clip-studio", enabled: true, loaded: true, aiUsage: { remote: "readAiRemoteLimits" }, exports: { readAiRemoteLimits: () => null } },
      {
        name: "reverse-search",
        enabled: true,
        loaded: true,
        aiUsage: { remote: "readAiRemoteLimits" },
        exports: {
          readAiRemoteLimits: (provider: string) =>
            provider === "tracemoe" ? [{ id: "tracemoe-searches", label: "Recherches", unit: "calls", period: "day", used: 3, limit: 100, source: "remote" }] : null,
        },
      },
    ];
    expect(await readRemoteLimits("tracemoe")).toEqual([expect.objectContaining({ used: 3, limit: 100 })]);
    await expect(readRemoteLimits("openai")).rejects.toThrow(/ne publie pas son solde/);
    await expect(readRemoteLimits("elevenlabs")).rejects.toThrow(/Aucun module activé/);
  });
});
