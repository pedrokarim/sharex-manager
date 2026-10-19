import { describe, expect, it } from "vitest";
import type { AiProviderOverview, AiUsageEvent } from "@/lib/ai-usage/types";
import { buildAiUsageOverview } from "@/lib/ai-usage";
import { emptyUsage, applyEvents } from "@/lib/ai-usage/store";
import { ERROR_KIND_LABELS, errorKindOf, explainFailure, formatDuration, formatRelativeShort, inferErrorKind } from "@/app/(app)/admin/services/_components/explain";
import { filterCalls } from "@/app/(app)/admin/services/_components/recent-calls";

type Facts = Pick<AiProviderOverview, "id" | "label" | "kind"> & { settingsHref?: string };

const codex: Facts = { id: "codex", label: "Codex CLI", kind: "cli" };
const edge: Facts = { id: "edge-tts", label: "Microsoft Edge (lecture à voix haute)", kind: "free" };
const openai: Facts = { id: "openai", label: "OpenAI", kind: "api", settingsHref: "/m/ai-image-gen/settings" };
const deepl: Facts = { id: "deepl", label: "DeepL", kind: "api", settingsHref: "/admin/system" };
const libre: Facts = { id: "libretranslate", label: "LibreTranslate", kind: "self-hosted" };

const failed = (error: string, extra: Partial<AiUsageEvent> = {}) => ({ ok: false, error, ...extra });

describe("famille d’un échec déduite du message (appels notés sans elle)", () => {
  it("reconnaît les échecs relevés en production", () => {
    expect(inferErrorKind("exceeded retry limit, last status: 429 Too Many Requests")).toBe("rate-limit");
    expect(inferErrorKind("Edge : connexion refusée par tous les hôtes")).toBe("network");
    expect(inferErrorKind("Error code: 400 - credit_balance_exhausted")).toBe("quota");
    expect(inferErrorKind("You exceeded your current quota (insufficient_quota)")).toBe("quota");
  });

  it("range chaque famille", () => {
    expect(inferErrorKind("connect ECONNREFUSED 127.0.0.1:5000")).toBe("network");
    expect(inferErrorKind("ETIMEDOUT")).toBe("network");
    expect(inferErrorKind("TypeError: fetch failed")).toBe("network");
    expect(inferErrorKind("401 Unauthorized")).toBe("auth");
    expect(inferErrorKind("403 Forbidden")).toBe("auth");
    expect(inferErrorKind("Invalid API key provided")).toBe("auth");
    expect(inferErrorKind("Annulé ou délai dépassé.")).toBe("timeout");
    expect(inferErrorKind("request timed out")).toBe("timeout");
    expect(inferErrorKind("503 Service Unavailable")).toBe("provider");
    expect(inferErrorKind("400 Bad Request: content_policy_violation")).toBe("input");
    expect(inferErrorKind("quelque chose d’inattendu")).toBe("unknown");
    expect(inferErrorKind(undefined)).toBe("unknown");
  });

  it("préfère la famille notée, et lit le détail quand le message ne dit rien", () => {
    expect(errorKindOf({ ok: true })).toBeNull();
    expect(errorKindOf(failed("429 Too Many Requests", { errorKind: "provider" }))).toBe("provider");
    expect(errorKindOf(failed("Codex a échoué.", { detail: "stream disconnected before completion" }))).toBe("network");
    expect(errorKindOf(failed("Codex a échoué."))).toBe("unknown");
    // Une famille inconnue du registre ne passe pas : elle est déduite.
    expect(errorKindOf(failed("401", { errorKind: "nimporte" as never }))).toBe("auth");
  });
});

describe("explication d’un échec", () => {
  it("dit ce qui s’est passé et quoi faire, propre au service quand c’est utile", () => {
    const codexLimit = explainFailure(failed("exceeded retry limit, last status: 429 Too Many Requests", { errorKind: "rate-limit" }), codex)!;
    expect(codexLimit.label).toBe("Trop de demandes");
    expect(codexLimit.summary).toBe("L’abonnement ChatGPT de Codex a refusé des demandes trop rapprochées.");
    expect(codexLimit.advice).toMatch(/réduisez les créations lancées en même temps/);
    expect(codexLimit.settingsHref).toBeUndefined();

    const edgeDown = explainFailure(failed("connexion refusée par tous les hôtes"), edge)!;
    expect(edgeDown.kind).toBe("network");
    expect(edgeDown.summary).toBe("Le service n’a pas répondu ou a refusé la connexion.");
    expect(edgeDown.advice).toMatch(/choisissez une autre voix/);

    const credit = explainFailure(failed("credit_balance_exhausted"), openai)!;
    expect(credit.label).toBe("Crédit épuisé");
    expect(credit.summary).toBe("Crédit épuisé chez OpenAI.");
    expect(credit.advice).toMatch(/Rechargez le compte de la clé/);
    expect(credit.settingsHref).toBe("/m/ai-image-gen/settings");

    expect(explainFailure(failed("403 Forbidden"), deepl)!.settingsHref).toBe("/admin/system");
    expect(explainFailure(failed("fetch failed"), deepl)!.settingsHref).toBeUndefined();
    expect(explainFailure(failed("ECONNREFUSED"), libre)!.advice).toMatch(/Vérifiez qu’il tourne/);
    expect(explainFailure(failed("You've hit your usage limit"), codex)!.summary).toMatch(/limite d’usage/);
    expect(explainFailure({ ok: true }, deepl)).toBeNull();
  });

  it("a un nom et une explication pour chaque famille", () => {
    for (const kind of Object.keys(ERROR_KIND_LABELS) as (keyof typeof ERROR_KIND_LABELS)[]) {
      for (const provider of [codex, edge, openai, libre]) {
        const explanation = explainFailure(failed("x", { errorKind: kind }), provider)!;
        expect(explanation.label).toBe(ERROR_KIND_LABELS[kind]);
        expect(explanation.summary.length).toBeGreaterThan(10);
        expect(explanation.advice.length).toBeGreaterThan(10);
        // Typographie française : pas de tiret cadratin, espace insécable avant « : » et « ; ».
        expect(`${explanation.summary} ${explanation.advice}`).not.toMatch(/—| [:;]/);
      }
    }
  });

  it("écrit les durées en français", () => {
    expect(formatDuration(undefined)).toBeNull();
    expect(formatDuration(850)).toBe("850 ms");
    expect(formatDuration(4_200)).toBe("4,2 s");
    expect(formatDuration(72_000)).toBe("1 min 12 s");
    const now = Date.now();
    expect(formatRelativeShort(now - 10_000, now)).toBe("à l’instant");
    expect(formatRelativeShort(now - 14 * 60_000, now)).toBe("il y a 14 min");
    expect(formatRelativeShort(now - 3 * 3_600_000, now)).toBe("il y a 3 h");
    expect(formatRelativeShort(now - 2 * 86_400_000, now)).toBe("il y a 2 j");
  });
});

describe("journal et aperçu", () => {
  const NOW = new Date(2026, 9, 19, 12).getTime();
  const events: AiUsageEvent[] = [
    { provider: "codex", module: "clip-studio", feature: "Script", unit: "calls", amount: 1, ok: false, error: "429 Too Many Requests", errorKind: "rate-limit", detail: "dernières lignes", attempts: 3, durationMs: 9_000, at: NOW - 1_000 },
    { provider: "codex", module: "clip-studio", feature: "Titre", unit: "calls", amount: 1, ok: true, at: NOW - 2_000 },
  ];

  it("filtre par issue et par fonctionnalité", () => {
    expect(filterCalls(events, "failures").map((event) => event.feature)).toEqual(["Script"]);
    expect(filterCalls(events, "all", { module: "clip-studio", feature: "Titre" }).map((event) => event.feature)).toEqual(["Titre"]);
    expect(filterCalls(events, "failures", { module: "clip-studio", feature: "Titre" })).toEqual([]);
  });

  it("transmet à l’écran la famille, le détail, la durée et les essais", () => {
    const usage = applyEvents(emptyUsage(), [...events].reverse(), NOW);
    const overview = buildAiUsageOverview(usage, [], NOW);
    expect(overview.recent[0]).toMatchObject({ errorKind: "rate-limit", detail: "dernières lignes", attempts: 3, durationMs: 9_000 });
    const codexOverview = overview.providers.find((entry) => entry.id === "codex")!;
    expect(codexOverview.lastCall).toMatchObject({ ok: false, errorKind: "rate-limit", detail: "dernières lignes", attempts: 3, durationMs: 9_000, unit: "calls", amount: 1 });
  });
});
