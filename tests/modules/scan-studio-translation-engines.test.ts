import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDeeplEngine, deeplHost, deeplSourceLanguage, deeplTargetLanguage } from "@/modules/scan-studio/lib/server/translation/deepl";
import { EngineError, parseRetryAfter, type EngineErrorKind } from "@/modules/scan-studio/lib/server/translation/engines";
import {
  createLibreTranslateEngine,
  libreTargetLanguage,
  normalizeLibreUrl,
} from "@/modules/scan-studio/lib/server/translation/libretranslate";
import { TranslationRouter } from "@/modules/scan-studio/lib/server/translation/router";
import { applySettingsPatch, keyHint, readCredentials, readSettings } from "@/modules/scan-studio/lib/server/translation/settings";
import { setDataRoot } from "@/modules/scan-studio/lib/store";

// Aucun service réel : `fetch` est remplacé, et chaque test regarde ce qui
// serait parti.

interface Sent {
  url: string;
  init: RequestInit;
  body: Record<string, unknown>;
}

let root = "";
let sent: Sent[] = [];

/** Remplace `fetch` par une réponse fixe (ou une panne de réseau) et note chaque requête. */
function stubFetch(reply: { status?: number; body?: unknown; headers?: Record<string, string> } | Error) {
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    sent.push({ url, init, body: JSON.parse(String(init.body)) });
    if (reply instanceof Error) throw reply;
    const body = typeof reply.body === "string" ? reply.body : JSON.stringify(reply.body ?? {});
    return new Response(body, { status: reply.status ?? 200, headers: reply.headers });
  });
}

const signal = () => new AbortController().signal;

async function kindOf(promise: Promise<unknown>): Promise<EngineErrorKind | "aucune erreur"> {
  try {
    await promise;
    return "aucune erreur";
  } catch (error) {
    expect(error).toBeInstanceOf(EngineError);
    return (error as EngineError).kind;
  }
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "scan-studio-engines-"));
  setDataRoot(path.join(root, "data"));
  sent = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
  setDataRoot(null);
  fs.rmSync(root, { recursive: true, force: true });
});

describe("DeepL", () => {
  it("choisit l'hôte d'après la clé", () => {
    expect(deeplHost("abc:fx")).toBe("https://api-free.deepl.com");
    expect(deeplHost("abc")).toBe("https://api.deepl.com");
  });

  it("convertit les codes de langue", () => {
    expect(deeplSourceLanguage("en")).toBe("EN");
    expect(deeplSourceLanguage("ja")).toBe("JA");
    expect(deeplSourceLanguage("ko")).toBe("KO");
    expect(deeplSourceLanguage("zh-Hans")).toBe("ZH");
    expect(deeplSourceLanguage("zh-Hant")).toBe("ZH");
    expect(deeplSourceLanguage("auto")).toBeUndefined();

    expect(deeplTargetLanguage("fr")).toBe("FR");
    expect(deeplTargetLanguage("en")).toBe("EN-US");
    expect(deeplTargetLanguage("en-GB")).toBe("EN-GB");
    expect(deeplTargetLanguage("pt-BR")).toBe("PT-BR");
    expect(deeplTargetLanguage("pt")).toBe("PT-PT");
    expect(deeplTargetLanguage("zh-Hant")).toBe("ZH-HANT");
    expect(deeplTargetLanguage("zh-Hans")).toBe("ZH-HANS");
    expect(deeplTargetLanguage("fr-CA")).toBe("FR");
  });

  it("envoie tous les textes en une requête, la clé dans l'en-tête seulement", async () => {
    stubFetch({ body: { translations: [{ text: "Bonjour" }, { text: "Au revoir" }] } });
    const translated = await createDeeplEngine("secret-key:fx").translate(["Hello", "Bye"], "en", "fr", signal());

    expect(translated).toEqual(["Bonjour", "Au revoir"]);
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe("https://api-free.deepl.com/v2/translate");
    expect(sent[0].init.method).toBe("POST");
    expect((sent[0].init.headers as Record<string, string>).Authorization).toBe("DeepL-Auth-Key secret-key:fx");
    expect(sent[0].body).toEqual({ text: ["Hello", "Bye"], target_lang: "FR", source_lang: "EN" });
    expect(sent[0].url).not.toContain("secret");
    expect(String(sent[0].init.body)).not.toContain("secret");
  });

  it("laisse le service détecter la langue quand elle est « auto »", async () => {
    stubFetch({ body: { translations: [{ text: "Bonjour" }] } });
    await createDeeplEngine("pro-key").translate(["Hello"], "auto", "fr", signal());
    expect(sent[0].url).toBe("https://api.deepl.com/v2/translate");
    expect(sent[0].body).toEqual({ text: ["Hello"], target_lang: "FR" });
  });

  it("garde un texte hostile comme une donnée", async () => {
    stubFetch({ body: { translations: [{ text: "x" }] } });
    const hostile = '"}],"target_lang":"DE"}\n<script>${process.exit()}</script>';
    await createDeeplEngine("k").translate([hostile], "en", "fr", signal());
    expect(sent[0].body).toEqual({ text: [hostile], target_lang: "FR", source_lang: "EN" });
  });

  it("classe chaque réponse d'erreur", async () => {
    const cases: [number, EngineErrorKind][] = [
      [429, "rate-limited"],
      [529, "rate-limited"],
      [456, "quota-exceeded"],
      [401, "unauthorized"],
      [403, "unauthorized"],
      [500, "unavailable"],
      [503, "unavailable"],
      [400, "invalid-request"],
      [413, "invalid-request"],
    ];
    for (const [status, kind] of cases) {
      stubFetch({ status, body: { message: "non" } });
      expect(await kindOf(createDeeplEngine("k").translate(["Hello"], "en", "fr", signal()))).toBe(kind);
    }
  });

  it("rend le délai demandé par le service", async () => {
    stubFetch({ status: 429, headers: { "Retry-After": "7" } });
    const error = await createDeeplEngine("k")
      .translate(["Hello"], "en", "fr", signal())
      .catch((caught) => caught as EngineError);
    expect(error).toMatchObject({ kind: "rate-limited", retryAfterMs: 7000 });
  });

  it("prend pour une panne un réseau coupé ou une réponse qui n'est pas celle attendue", async () => {
    stubFetch(new TypeError("fetch failed"));
    expect(await kindOf(createDeeplEngine("k").translate(["Hello"], "en", "fr", signal()))).toBe("unavailable");
    stubFetch({ body: "<html>proxy</html>" });
    expect(await kindOf(createDeeplEngine("k").translate(["Hello"], "en", "fr", signal()))).toBe("unavailable");
    stubFetch({ body: { translations: [{ text: "une seule" }] } });
    expect(await kindOf(createDeeplEngine("k").translate(["Hello", "Bye"], "en", "fr", signal()))).toBe("unavailable");
  });
});

describe("LibreTranslate", () => {
  it("envoie un tableau de textes à l'adresse réglée, avec la clé si elle existe", async () => {
    stubFetch({ body: { translatedText: ["Bonjour", "Au revoir"] } });
    const engine = createLibreTranslateEngine("http://libretranslate:5000/", "cle-locale");
    expect(await engine.translate(["Hello", "Bye"], "en", "fr", signal())).toEqual(["Bonjour", "Au revoir"]);

    expect(sent[0].url).toBe("http://libretranslate:5000/translate");
    expect(sent[0].body).toEqual({ q: ["Hello", "Bye"], source: "en", target: "fr", format: "text", api_key: "cle-locale" });
  });

  it("envoie un texte seul comme une chaîne, sans clé si aucune n'est réglée", async () => {
    stubFetch({ body: { translatedText: "Bonjour" } });
    const engine = createLibreTranslateEngine("http://localhost:5000");
    expect(await engine.translate(["Hello"], "auto", "pt-BR", signal())).toEqual(["Bonjour"]);
    expect(sent[0].body).toEqual({ q: "Hello", source: "auto", target: "pt-BR", format: "text" });
  });

  it("convertit les langues cibles", () => {
    expect(libreTargetLanguage("fr")).toBe("fr");
    expect(libreTargetLanguage("fr-CA")).toBe("fr");
    expect(libreTargetLanguage("zh-Hant")).toBe("zh-Hant");
    expect(libreTargetLanguage("zh")).toBe("zh-Hans");
  });

  it("classe chaque réponse d'erreur", async () => {
    const cases: [number, EngineErrorKind][] = [
      [429, "rate-limited"],
      [403, "unauthorized"],
      [500, "unavailable"],
      [400, "invalid-request"],
    ];
    for (const [status, kind] of cases) {
      stubFetch({ status, body: { error: "non" } });
      expect(await kindOf(createLibreTranslateEngine("http://localhost:5000").translate(["Hello"], "en", "fr", signal()))).toBe(kind);
    }
    stubFetch(new TypeError("ECONNREFUSED"));
    expect(await kindOf(createLibreTranslateEngine("http://localhost:5000").translate(["Hello"], "en", "fr", signal()))).toBe("unavailable");
  });

  it("refuse un service trop ancien pour les lots plutôt que d'envoyer une requête par phrase", async () => {
    stubFetch({ body: { translatedText: "Bonjour" } });
    const engine = createLibreTranslateEngine("http://localhost:5000");
    expect(await kindOf(engine.translate(["Hello", "Bye"], "en", "fr", signal()))).toBe("invalid-request");
    expect(sent).toHaveLength(1);
  });

  it("n'accepte qu'une adresse http ou https, sans identifiants", () => {
    expect(normalizeLibreUrl(" http://localhost:5000/ ")).toBe("http://localhost:5000");
    expect(normalizeLibreUrl("https://translate.example.org/api/")).toBe("https://translate.example.org/api");
    expect(normalizeLibreUrl("ftp://localhost")).toBeNull();
    expect(normalizeLibreUrl("file:///etc/passwd")).toBeNull();
    expect(normalizeLibreUrl("http://user:pass@localhost:5000")).toBeNull();
    expect(normalizeLibreUrl("http://localhost:5000/?next=1")).toBeNull();
    expect(normalizeLibreUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeLibreUrl("pas une adresse")).toBeNull();
  });
});

describe("délai demandé par un service", () => {
  it("lit des secondes ou une date", () => {
    expect(parseRetryAfter("3")).toBe(3000);
    expect(parseRetryAfter("Wed, 07 Oct 2026 00:00:10 GMT", Date.UTC(2026, 9, 7))).toBe(10_000);
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter("bientôt")).toBeUndefined();
  });
});

describe("réglages et clés", () => {
  const DEEPL_KEY = "0123abcd-4567-89ef-0123-456789abWXYZ:fx";

  it("part de DeepL puis LibreTranslate, rien de configuré", () => {
    expect(readSettings().order).toEqual(["deepl", "libretranslate"]);
    const catalogue = new TranslationRouter().catalogue();
    expect(catalogue.order).toEqual(["deepl", "libretranslate"]);
    expect(catalogue.engines.map((engine) => [engine.id, engine.configured, engine.available])).toEqual([
      ["deepl", false, false],
      ["libretranslate", false, false],
    ]);
    expect(catalogue.engines[0].reason).toContain("aucune clé");
    expect(catalogue.engines[1].reason).toContain("aucune adresse");
  });

  it("enregistre les clés sans jamais les rendre", () => {
    applySettingsPatch({ deeplKey: ` ${DEEPL_KEY} `, libreTranslateUrl: "http://localhost:5000/", libreTranslateKey: "local-secret-key-9876" });
    expect(readCredentials()).toEqual({
      deeplKey: DEEPL_KEY,
      libreTranslateUrl: "http://localhost:5000",
      libreTranslateKey: "local-secret-key-9876",
    });

    const catalogue = new TranslationRouter().catalogue();
    const serialized = JSON.stringify(catalogue);
    expect(serialized).not.toContain(DEEPL_KEY);
    expect(serialized).not.toContain("local-secret-key");
    expect(catalogue.engines[0]).toMatchObject({ id: "deepl", label: "DeepL", configured: true, available: true, keyHint: "Z:fx" });
    expect(catalogue.engines[1]).toMatchObject({ configured: true, available: true, keyHint: "9876", url: "http://localhost:5000" });

    // Les clés vivent dans leur propre fichier, à part des réglages.
    const directory = path.join(root, "data", "translation");
    expect(fs.readFileSync(path.join(directory, "settings.json"), "utf-8")).not.toContain("secret");
    expect(JSON.parse(fs.readFileSync(path.join(directory, "secrets.json"), "utf-8"))).toEqual({
      deeplKey: DEEPL_KEY,
      libreTranslateKey: "local-secret-key-9876",
    });
  });

  it("ne touche pas à ce qui est absent, et efface ce qui est vide", () => {
    applySettingsPatch({ deeplKey: DEEPL_KEY, libreTranslateUrl: "http://localhost:5000" });
    applySettingsPatch({ monthlyLimits: { libretranslate: 1000 }, order: ["libretranslate", "deepl"] });
    expect(readCredentials().deeplKey).toBe(DEEPL_KEY);
    expect(readCredentials().libreTranslateUrl).toBe("http://localhost:5000");
    expect(readSettings()).toEqual({ order: ["libretranslate", "deepl"], monthlyLimits: { deepl: 500_000, libretranslate: 1000 } });

    applySettingsPatch({ deeplKey: "", libreTranslateUrl: "" });
    expect(readCredentials()).toEqual({ deeplKey: undefined, libreTranslateUrl: undefined, libreTranslateKey: undefined });
    expect(readSettings().order).toEqual(["libretranslate", "deepl"]);
  });

  it("refuse des réglages mal formés sans rien écrire", () => {
    const refused: unknown[] = [
      null,
      { order: ["google"] },
      { order: ["deepl", "deepl"] },
      { order: [] },
      { monthlyLimits: { deepl: -1 } },
      { monthlyLimits: { deepl: 1.5 } },
      { monthlyLimits: { deepl: "beaucoup" } },
      { libreTranslateUrl: "file:///etc/passwd" },
      { deeplKey: "x".repeat(301) },
      { deeplKey: "clé\nsur deux lignes" },
      { deeplKey: 42 },
      { order: ["libretranslate"], deeplKey: 42 },
    ];
    for (const patch of refused) expect(() => applySettingsPatch(patch)).toThrow();
    expect(fs.existsSync(path.join(root, "data", "translation"))).toBe(false);
  });

  it("ne donne pas d'indice sur une clé trop courte", () => {
    expect(keyHint("abcd")).toBeUndefined();
    expect(keyHint(undefined)).toBeUndefined();
    expect(keyHint("abcdefghijkl")).toBe("ijkl");
  });
});
