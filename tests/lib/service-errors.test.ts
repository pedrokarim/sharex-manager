import { describe, expect, it } from "vitest";
import { classifyCodexError, codexEventError } from "@/modules/ai-image-gen/lib/codex-text";
import { ttsErrorKind } from "@/modules/clip-studio/lib/cloud-tts";
import { EdgeAccessError, EdgeUnavailableError } from "@/modules/clip-studio/lib/edge-tts";
import { normalizeEvent } from "@/lib/ai-usage/store";

describe("erreurs de Codex", () => {
  it("lit la cause dans le flux JSON, là où la sortie d'erreur ne dit rien", () => {
    // Message relevé en prod le 19/10/2026, dans un journal de session de Codex.
    const said = "exceeded retry limit, last status: 429 Too Many Requests";
    expect(codexEventError(JSON.stringify({ type: "turn.failed", error: { message: said } }))).toBe(said);
    expect(codexEventError(JSON.stringify({ type: "error", message: said }))).toBe(said);
    expect(codexEventError(JSON.stringify({ type: "turn.completed", usage: { input_tokens: 1 } }))).toBeNull();
    expect(codexEventError("Reading prompt from stdin...")).toBeNull();
  });

  it("range chaque échec dans sa famille", () => {
    expect(classifyCodexError("exceeded retry limit, last status: 429 Too Many Requests")).toBe("rate-limit");
    expect(classifyCodexError("You've hit your usage limit")).toBe("quota");
    expect(classifyCodexError("401 Unauthorized")).toBe("auth");
    expect(classifyCodexError("stream disconnected before completion")).toBe("network");
    expect(classifyCodexError("request timed out")).toBe("timeout");
    expect(classifyCodexError("quelque chose d'inattendu")).toBe("unknown");
  });
});

describe("erreurs des voix", () => {
  it("distingue un refus passager d'Edge d'un vrai changement d'accès", () => {
    expect(ttsErrorKind(new EdgeUnavailableError(4, "connexion refusée par tous les hôtes"))).toBe("network");
    expect(ttsErrorKind(new EdgeAccessError("liste des voix, erreur 403"))).toBe("provider");
    expect(ttsErrorKind(new Error("OpenAI : 429 Too Many Requests"))).toBe("rate-limit");
    expect(ttsErrorKind(new Error("insufficient_quota"))).toBe("quota");
    expect(ttsErrorKind(new Error("fetch failed"))).toBe("network");
  });
});

describe("registre des services", () => {
  it("garde la famille, le détail, la durée et les essais d'un échec", () => {
    const event = normalizeEvent({
      provider: "codex",
      module: "clip-studio",
      feature: "Recherche d'images",
      unit: "calls",
      amount: 1,
      ok: false,
      error: "Codex : trop de demandes rapprochées",
      errorKind: "rate-limit",
      detail: "exceeded retry limit, last status: 429 Too Many Requests",
      durationMs: 61234.4,
      attempts: 3,
    });
    expect(event).toMatchObject({ errorKind: "rate-limit", durationMs: 61234, attempts: 3 });
    expect(event?.detail).toContain("429");
  });

  it("ignore une famille inconnue et ne garde pas de détail pour une réussite", () => {
    const failed = normalizeEvent({ provider: "codex", module: "core", feature: "x", unit: "calls", amount: 1, ok: false, errorKind: "pirate" as never });
    expect(failed?.errorKind).toBeUndefined();
    const ok = normalizeEvent({ provider: "codex", module: "core", feature: "x", unit: "calls", amount: 1, ok: true, detail: "rien", durationMs: 12 });
    expect(ok?.detail).toBeUndefined();
    expect(ok?.durationMs).toBe(12);
  });
});
