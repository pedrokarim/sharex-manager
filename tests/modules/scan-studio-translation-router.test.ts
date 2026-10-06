import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EngineError, type EngineErrorKind, type TranslationEngine } from "@/modules/scan-studio/lib/server/translation/engines";
import { recordMemory } from "@/modules/scan-studio/lib/server/translation/memory";
import {
  TIMINGS,
  TranslationRouter,
  type Clock,
  type TranslationRequest,
} from "@/modules/scan-studio/lib/server/translation/router";
import { applySettingsPatch } from "@/modules/scan-studio/lib/server/translation/settings";
import { setDataRoot } from "@/modules/scan-studio/lib/store";
import type { GlossaryEntry, TranslationEngineId } from "@/modules/scan-studio/lib/types";

// Aucun service réel ici : de faux moteurs qui comptent leurs appels, et une
// fausse horloge dont `sleep` avance le temps au lieu d'attendre.

const FOLDER = "aaaaaaaaaaaa";
const START = Date.UTC(2026, 9, 6, 12, 0, 0);

let root = "";

class FakeClock implements Clock {
  time = START;
  sleeps: number[] = [];
  now = () => this.time;
  sleep = async (milliseconds: number) => {
    this.sleeps.push(milliseconds);
    this.time += milliseconds;
  };
  advance(milliseconds: number) {
    this.time += milliseconds;
  }
}

type Behaviour = (texts: string[], call: number) => string[];

/** Un faux moteur : il « traduit » en préfixant, ou suit le comportement qu'on lui donne. */
class FakeEngine implements TranslationEngine {
  calls: string[][] = [];
  behaviour: Behaviour | null = null;
  constructor(readonly id: TranslationEngineId) {}

  get sent(): string[] {
    return this.calls.flat();
  }

  async translate(texts: string[]): Promise<string[]> {
    this.calls.push([...texts]);
    if (this.behaviour) return this.behaviour(texts, this.calls.length);
    return texts.map((text) => `${this.id}:${text}`);
  }

  failWith(kind: EngineErrorKind, retryAfterMs?: number) {
    this.behaviour = () => {
      throw new EngineError(kind, `panne simulée (${kind})`, retryAfterMs);
    };
  }

  recover() {
    this.behaviour = null;
  }
}

interface Bench {
  clock: FakeClock;
  deepl: FakeEngine;
  libre: FakeEngine;
  router: TranslationRouter;
}

function bench(configured: { deepl?: boolean; libre?: boolean } = {}, clock = new FakeClock()): Bench {
  const deepl = new FakeEngine("deepl");
  const libre = new FakeEngine("libretranslate");
  const router = new TranslationRouter({
    clock,
    resolve: (id) => {
      // Ces essais portent sur les deux moteurs à clé : le troisième y est tenu pour absent.
      if (id === "mymemory") return { fingerprint: "empreinte-mymemory", reason: "non configuré" };
      const engine = id === "deepl" ? deepl : libre;
      const enabled = id === "deepl" ? configured.deepl !== false : configured.libre !== false;
      return enabled ? { engine, fingerprint: `empreinte-${id}` } : { fingerprint: `empreinte-${id}`, reason: "non configuré" };
    },
  });
  return { clock, deepl, libre, router };
}

function request(texts: string[], extra: Partial<TranslationRequest> = {}): TranslationRequest {
  return {
    items: texts.map((text, index) => ({ id: `zone-${index}`, text })),
    source: "en",
    target: "fr",
    glossary: [],
    folderId: FOLDER,
    ...extra,
  };
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "scan-studio-translation-"));
  setDataRoot(path.join(root, "data"));
});

afterEach(() => {
  setDataRoot(null);
  fs.rmSync(root, { recursive: true, force: true });
});

describe("routeur : un lot, une requête", () => {
  it("envoie toutes les phrases d'une page en une seule requête, au moteur principal", async () => {
    const { router, deepl, libre } = bench();
    const batch = await router.translate(request(["One.", "Two.", "Three.", "Four.", "Five."]));

    expect(deepl.calls).toEqual([["One.", "Two.", "Three.", "Four.", "Five."]]);
    expect(libre.calls).toEqual([]);
    expect(batch.failed).toEqual([]);
    expect(batch.fallback).toBeUndefined();
    expect(batch.sentCharacters).toBe(24);
    expect(batch.results[0]).toEqual({ id: "zone-0", text: "deepl:One.", source: "engine", engine: "deepl" });
    expect(batch.results.map((result) => result.id)).toEqual(["zone-0", "zone-1", "zone-2", "zone-3", "zone-4"]);
  });

  it("ne compte qu'une fois les phrases identiques d'un lot", async () => {
    const { router, deepl } = bench();
    const batch = await router.translate(request(["…", "Hey!", "…", "  Hey!  ", "…", "Run!"]));

    expect(deepl.calls).toEqual([["…", "Hey!", "Run!"]]);
    expect(batch.results).toHaveLength(6);
    expect(batch.results[3]).toEqual({ id: "zone-3", text: "deepl:Hey!", source: "engine", engine: "deepl" });
    expect(batch.sentCharacters).toBe(9);
  });

  it("découpe un lot qui dépasse ce qu'une requête emporte, en respectant le délai entre deux", async () => {
    const { router, deepl, clock } = bench();
    const texts = Array.from({ length: TIMINGS.maxTextsPerRequest + 5 }, (_, index) => `Line ${index}`);
    const batch = await router.translate(request(texts));

    expect(deepl.calls.map((call) => call.length)).toEqual([TIMINGS.maxTextsPerRequest, 5]);
    expect(clock.sleeps).toEqual([TIMINGS.minDelayMs]);
    expect(batch.results).toHaveLength(texts.length);
  });

  it("met une phrase vide de côté sans rien envoyer", async () => {
    const { router, deepl } = bench();
    const batch = await router.translate(request(["   ", "Hi"]));
    expect(deepl.calls).toEqual([["Hi"]]);
    expect(batch.failed).toEqual([{ id: "zone-0", error: "Rien à traduire." }]);
  });
});

describe("routeur : ce qui est connu ne repart jamais", () => {
  it("répond depuis le cache sans aucun appel, même après un redémarrage", async () => {
    const first = bench();
    await first.router.translate(request(["Hello there.", "Bye."]));
    expect(first.deepl.calls).toHaveLength(1);

    const again = await first.router.translate(request(["Hello there.", "Bye."]));
    expect(first.deepl.calls).toHaveLength(1);
    expect(again.sentCharacters).toBe(0);
    expect(again.results).toEqual([
      { id: "zone-0", text: "deepl:Hello there.", source: "cache", engine: "deepl" },
      { id: "zone-1", text: "deepl:Bye.", source: "cache", engine: "deepl" },
    ]);

    // Un autre routeur, comme après un redémarrage : le cache est sur le disque.
    const restarted = bench();
    const batch = await restarted.router.translate(request(["Bye.", "Hello there."]));
    expect(restarted.deepl.calls).toEqual([]);
    expect(restarted.libre.calls).toEqual([]);
    expect(batch.results.every((result) => result.source === "cache")).toBe(true);
  });

  it("n'envoie que les phrases nouvelles d'un lot en partie connu", async () => {
    const { router, deepl } = bench();
    await router.translate(request(["Known one.", "Known two."]));
    await router.translate(request(["Known two.", "Brand new.", "Known one."]));

    expect(deepl.calls).toEqual([["Known one.", "Known two."], ["Brand new."]]);
    // Le juge : aucune phrase n'est partie deux fois.
    expect(new Set(deepl.sent).size).toBe(deepl.sent.length);
  });

  it("distingue les langues et les moteurs dans le cache", async () => {
    const { router, deepl } = bench();
    await router.translate(request(["Hello."]));
    await router.translate(request(["Hello."], { target: "es" }));
    await router.translate(request(["Hello."], { source: "auto" }));
    expect(deepl.calls).toHaveLength(3);
    await router.translate(request(["Hello."], { target: "es" }));
    expect(deepl.calls).toHaveLength(3);
  });

  it("reprend une phrase validée dans la mémoire du dossier, sans appel", async () => {
    recordMemory(FOLDER, "fr", [{ source: "I'm home.", translation: "Je suis rentré." }]);
    const { router, deepl, libre } = bench();
    const batch = await router.translate(request(["I'm   home.", "Welcome back."]));

    expect(batch.results[0]).toEqual({ id: "zone-0", text: "Je suis rentré.", source: "memory" });
    expect(deepl.calls).toEqual([["Welcome back."]]);
    expect(libre.calls).toEqual([]);

    // La mémoire est celle d'un dossier et d'une langue.
    const elsewhere = await router.translate(request(["I'm home."], { folderId: "bbbbbbbbbbbb" }));
    expect(elsewhere.results[0].source).toBe("engine");
  });

  it("ne redemande pas ce qu'un lot voisin vient d'obtenir", async () => {
    const { router, deepl } = bench();
    const [first, second] = await Promise.all([
      router.translate(request(["Shared line.", "Only first."])),
      router.translate(request(["Shared line.", "Only second."])),
    ]);

    expect(deepl.calls).toEqual([["Shared line.", "Only first."], ["Only second."]]);
    expect(first.failed).toEqual([]);
    expect(second.results[0]).toEqual({ id: "zone-0", text: "deepl:Shared line.", source: "cache", engine: "deepl" });
  });

  it("redemande une traduction quand on le force, et seulement alors", async () => {
    const { router, deepl } = bench();
    await router.translate(request(["Again."]));
    await router.translate(request(["Again."]));
    expect(deepl.calls).toHaveLength(1);
    const forced = await router.translate(request(["Again."], { force: true }));
    expect(deepl.calls).toHaveLength(2);
    expect(forced.results[0].source).toBe("engine");
  });
});

describe("routeur : glossaire", () => {
  const glossary: GlossaryEntry[] = [
    { source: "Luffy", target: "Rufy" },
    { source: "Zoro", target: "Zoro", keep: true },
    { source: "Gum-Gum Pistol", target: "Gum Gum Pistolet" },
  ];

  it("répond à un terme exact sans moteur", async () => {
    const { router, deepl, libre } = bench();
    const batch = await router.translate(request(["GUM-GUM PISTOL", "Luffy!!"], { glossary }));
    expect(deepl.calls).toEqual([]);
    expect(libre.calls).toEqual([]);
    expect(batch.results).toEqual([
      { id: "zone-0", text: "Gum Gum Pistolet", source: "glossary" },
      { id: "zone-1", text: "Rufy!!", source: "glossary" },
    ]);
  });

  it("protège les termes à l'envoi et les rétablit au retour", async () => {
    const { router, deepl } = bench();
    deepl.behaviour = (texts) => texts.map((text) => text.replace("is here", "est là"));
    const batch = await router.translate(request(["Luffy is here"], { glossary }));

    expect(deepl.calls).toEqual([["⟦0⟧ is here"]]);
    expect(batch.results[0]).toEqual({ id: "zone-0", text: "Rufy est là", source: "engine", engine: "deepl" });
  });

  it("n'envoie qu'une fois deux phrases qui ne diffèrent que par un terme", async () => {
    const { router, deepl } = bench();
    deepl.behaviour = (texts) => texts.map((text) => text.replace("runs", "court"));
    const batch = await router.translate(request(["Luffy runs", "Zoro runs"], { glossary }));

    expect(deepl.calls).toEqual([["⟦0⟧ runs"]]);
    expect(batch.results.map((result) => result.text)).toEqual(["Rufy court", "Zoro court"]);
  });

  it("applique un terme corrigé à une phrase du cache, sans rien redemander", async () => {
    const { router, deepl } = bench();
    await router.translate(request(["Luffy is here"], { glossary }));
    const corrected = await router.translate(request(["Luffy is here"], { glossary: [{ source: "Luffy", target: "Luffy au chapeau" }] }));

    expect(deepl.calls).toHaveLength(1);
    expect(corrected.results[0]).toEqual({ id: "zone-0", text: "deepl:Luffy au chapeau is here", source: "cache", engine: "deepl" });
  });
});

describe("routeur : bascule sur le secours", () => {
  const cases: { kind: EngineErrorKind; calls: number; sleeps: number[] }[] = [
    { kind: "rate-limited", calls: 3, sleeps: [2000, 4000] },
    { kind: "unavailable", calls: 2, sleeps: [2000] },
    { kind: "quota-exceeded", calls: 1, sleeps: [] },
    { kind: "unauthorized", calls: 1, sleeps: [] },
    { kind: "invalid-request", calls: 1, sleeps: [] },
  ];

  for (const { kind, calls, sleeps } of cases) {
    it(`« ${kind} » : ${calls} requête(s) au principal, puis le secours traduit`, async () => {
      const { router, deepl, libre, clock } = bench();
      deepl.failWith(kind);
      const batch = await router.translate(request(["Help me.", "Now."]));

      expect(deepl.calls).toHaveLength(calls);
      expect(clock.sleeps).toEqual(sleeps);
      expect(libre.calls).toEqual([["Help me.", "Now."]]);
      expect(batch.failed).toEqual([]);
      expect(batch.results[0]).toEqual({ id: "zone-0", text: "libretranslate:Help me.", source: "engine", engine: "libretranslate" });
      expect(batch.fallback).toEqual({ from: "deepl", to: "libretranslate", reason: `panne simulée (${kind})` });
    });
  }

  it("respecte le délai indiqué par le service quand il est plus long que le sien", async () => {
    const { router, deepl, libre, clock } = bench();
    deepl.behaviour = (texts, call) => {
      if (call < 3) throw new EngineError("rate-limited", "doucement", 10_000);
      return texts.map((text) => `deepl:${text}`);
    };
    const batch = await router.translate(request(["Wait."]));

    expect(clock.sleeps).toEqual([10_000, 10_000]);
    expect(deepl.calls).toHaveLength(3);
    expect(libre.calls).toEqual([]);
    expect(batch.fallback).toBeUndefined();
    expect(batch.results[0].engine).toBe("deepl");
  });

  it("n'attend pas un service qui demande trop : il bascule et le laisse tranquille jusque-là", async () => {
    const { router, deepl, libre, clock } = bench();
    deepl.failWith("rate-limited", 10 * 60_000);
    await router.translate(request(["First."]));
    expect(deepl.calls).toHaveLength(1);
    expect(clock.sleeps).toEqual([]);

    await router.translate(request(["Second."]));
    expect(deepl.calls).toHaveLength(1);
    expect(libre.sent).toEqual(["First.", "Second."]);
    expect(router.status("deepl").pausedUntil).toBe(START + 10 * 60_000);
  });

  it("ne rappelle jamais un moteur dont la clé est refusée, ni après redémarrage", async () => {
    const { router, deepl, libre, clock } = bench();
    deepl.failWith("unauthorized");
    await router.translate(request(["One."]));
    deepl.recover();
    await router.translate(request(["Two."]));
    clock.advance(40 * 24 * 3600_000);
    await router.translate(request(["Three."]));

    expect(deepl.calls).toEqual([["One."]]);
    expect(libre.sent).toEqual(["One.", "Two.", "Three."]);
    expect(router.status("deepl")).toMatchObject({ configured: true, available: false });
    expect(router.status("deepl").reason).toContain("clé refusée");

    const restarted = bench({}, clock);
    await restarted.router.translate(request(["Four."]));
    expect(restarted.deepl.calls).toEqual([]);
  });

  it("rend un moteur à la clé corrigée : l'empreinte a changé", async () => {
    const first = bench();
    first.deepl.failWith("unauthorized");
    await first.router.translate(request(["One."]));

    const deepl = new FakeEngine("deepl");
    const router = new TranslationRouter({ clock: first.clock, resolve: () => ({ engine: deepl, fingerprint: "nouvelle-clé" }) });
    await router.translate(request(["Two."], { engine: "deepl" }));
    expect(deepl.calls).toEqual([["Two."]]);
  });

  it("met de côté jusqu'au lendemain un moteur au quota épuisé", async () => {
    const { router, deepl, libre, clock } = bench();
    deepl.failWith("quota-exceeded");
    await router.translate(request(["One."]));
    deepl.recover();
    await router.translate(request(["Two."]));
    expect(deepl.calls).toHaveLength(1);
    expect(router.status("deepl").reason).toContain("quota épuisé");

    clock.advance(12 * 3600_000 + 1);
    await router.translate(request(["Three."]));
    expect(deepl.calls).toEqual([["One."], ["Three."]]);
    expect(libre.sent).toEqual(["One.", "Two."]);
    expect(router.status("deepl").available).toBe(true);
  });

  it("garde la traduction du secours au lieu de redemander au principal revenu", async () => {
    const { router, deepl, libre } = bench();
    deepl.failWith("invalid-request");
    await router.translate(request(["Stay."]));
    deepl.recover();
    const batch = await router.translate(request(["Stay."]));

    expect(deepl.calls).toHaveLength(1);
    expect(libre.calls).toHaveLength(1);
    expect(batch.results[0]).toEqual({ id: "zone-0", text: "libretranslate:Stay.", source: "cache", engine: "libretranslate" });

    // Redemander au principal est un geste : le moteur est alors imposé.
    const asked = await router.translate(request(["Stay."], { engine: "deepl" }));
    expect(deepl.calls).toHaveLength(2);
    expect(asked.results[0]).toEqual({ id: "zone-0", text: "deepl:Stay.", source: "engine", engine: "deepl" });
  });

  it("saute sans bruit un moteur qui n'est pas configuré", async () => {
    const { router, deepl, libre } = bench({ deepl: false });
    const batch = await router.translate(request(["Hi."]));
    expect(deepl.calls).toEqual([]);
    expect(libre.calls).toEqual([["Hi."]]);
    expect(batch.fallback).toBeUndefined();
    expect(router.status("deepl")).toMatchObject({ configured: false, available: false, reason: "non configuré" });
  });

  it("n'appelle que le moteur imposé, sans secours", async () => {
    const { router, deepl, libre } = bench();
    await router.translate(request(["Local."], { engine: "libretranslate" }));
    expect(deepl.calls).toEqual([]);
    expect(libre.calls).toEqual([["Local."]]);

    libre.failWith("unavailable");
    const batch = await router.translate(request(["Other."], { engine: "libretranslate" }));
    expect(deepl.calls).toEqual([]);
    expect(batch.results).toEqual([]);
    expect(batch.failed).toHaveLength(1);
  });

  it("suit l'ordre réglé : LibreTranslate d'abord si on le demande", async () => {
    applySettingsPatch({ order: ["libretranslate"] });
    const { router, deepl, libre } = bench();
    await router.translate(request(["Hi."]));
    expect(libre.calls).toHaveLength(1);
    expect(deepl.calls).toEqual([]);
    expect(router.catalogue().order).toEqual(["libretranslate", "deepl", "mymemory"]);
  });

  it("prend pour une panne une réponse qui n'a pas le bon nombre de traductions", async () => {
    const { router, deepl, libre } = bench();
    deepl.behaviour = () => ["une seule"];
    const batch = await router.translate(request(["A.", "B."]));
    expect(deepl.calls).toHaveLength(2);
    expect(libre.calls).toEqual([["A.", "B."]]);
    expect(batch.results.every((result) => result.engine === "libretranslate")).toBe(true);
  });

  it("retire les caractères de contrôle d'une traduction rendue par un service", async () => {
    const { router, deepl } = bench();
    deepl.behaviour = () => ["Bon\u0000jour\u001b[31m\nvous"];
    const batch = await router.translate(request(["Hello you"]));
    expect(batch.results[0].text).toBe("Bon jour [31m\nvous");
  });
});

describe("routeur : disjoncteur", () => {
  it("s'ouvre après trois échecs de suite, puis une seule requête d'essai décide", async () => {
    const { router, deepl, libre, clock } = bench();
    deepl.failWith("unavailable");

    await router.translate(request(["One."]));
    expect(deepl.calls).toHaveLength(2);
    expect(router.status("deepl").available).toBe(true);

    // Troisième échec : le disjoncteur s'ouvre, sans nouvelle tentative.
    await router.translate(request(["Two."]));
    expect(deepl.calls).toHaveLength(3);
    const status = router.status("deepl");
    expect(status.available).toBe(false);
    expect(status.pausedUntil).toBe(clock.now() + TIMINGS.breakerPauseMs);
    expect(status.reason).toContain("mis de côté");

    // Pendant la pause : plus aucun appel au moteur.
    await router.translate(request(["Three."]));
    clock.advance(TIMINGS.breakerPauseMs - 5000);
    await router.translate(request(["Four."]));
    expect(deepl.calls).toHaveLength(3);
    expect(libre.sent).toEqual(["One.", "Two.", "Three.", "Four."]);

    // La pause est finie : un essai, un seul, qui échoue et rouvre pour cinq minutes.
    clock.advance(10_000);
    await router.translate(request(["Five."]));
    expect(deepl.calls).toHaveLength(4);
    expect(router.status("deepl").pausedUntil).toBe(clock.now() + TIMINGS.breakerPauseMs);
    await router.translate(request(["Six."]));
    expect(deepl.calls).toHaveLength(4);

    // Nouvel essai, réussi : le moteur reprend du service.
    clock.advance(TIMINGS.breakerPauseMs + 1);
    deepl.recover();
    const batch = await router.translate(request(["Seven."]));
    expect(deepl.calls).toHaveLength(5);
    expect(batch.results[0].engine).toBe("deepl");
    expect(batch.fallback).toBeUndefined();
    expect(router.status("deepl")).toMatchObject({ available: true });
    expect(router.status("deepl").pausedUntil).toBeUndefined();
  });

  it("repart de zéro après une réponse correcte", async () => {
    const { router, deepl, libre } = bench();
    // Une panne, une réussite, et ainsi de suite : jamais trois échecs de suite.
    deepl.behaviour = (texts, call) => {
      if (call % 2 === 1) throw new EngineError("unavailable", "panne");
      return texts.map((text) => `deepl:${text}`);
    };
    for (const text of ["One.", "Two.", "Three.", "Four."]) await router.translate(request([text]));

    expect(deepl.calls).toHaveLength(8);
    expect(libre.calls).toEqual([]);
    expect(router.status("deepl").available).toBe(true);
  });

  it("ne compte pas une demande refusée comme une panne", async () => {
    const { router, deepl } = bench();
    deepl.failWith("invalid-request");
    for (const text of ["One.", "Two.", "Three.", "Four."]) await router.translate(request([text]));
    expect(deepl.calls).toHaveLength(4);
    expect(router.status("deepl").available).toBe(true);
  });

  it("s'ouvre au bout des trois requêtes d'un « trop de requêtes »", async () => {
    const { router, deepl } = bench();
    deepl.failWith("rate-limited");
    await router.translate(request(["One."]));
    expect(deepl.calls).toHaveLength(3);
    expect(router.status("deepl").available).toBe(false);
  });
});

describe("routeur : les deux moteurs indisponibles", () => {
  it("rend ce qui a été obtenu et la liste de ce qui manque, sans boucler", async () => {
    const { router, deepl, libre, clock } = bench();
    await router.translate(request(["Already known."]));
    deepl.failWith("unavailable");
    libre.failWith("unavailable");

    const batch = await router.translate(request(["Already known.", "Lost one.", "Lost two."]));
    expect(deepl.calls).toHaveLength(1 + 2);
    expect(libre.calls).toHaveLength(2);
    expect(clock.sleeps).toEqual([TIMINGS.minDelayMs, 2000, 2000]);
    expect(batch.results).toEqual([{ id: "zone-0", text: "deepl:Already known.", source: "cache", engine: "deepl" }]);
    expect(batch.failed.map((entry) => entry.id)).toEqual(["zone-1", "zone-2"]);
    expect(batch.failed[0].error).toContain("DeepL");
    expect(batch.failed[0].error).toContain("LibreTranslate");
    expect(batch.fallback).toBeUndefined();
    expect(batch.sentCharacters).toBe(0);
  });

  it("dit pourquoi quand aucun moteur n'est configuré, sans rien appeler", async () => {
    const { router, deepl, libre } = bench({ deepl: false, libre: false });
    const batch = await router.translate(request(["Hi."]));
    expect(deepl.calls).toEqual([]);
    expect(libre.calls).toEqual([]);
    expect(batch.failed).toEqual([{ id: "zone-0", error: "DeepL : non configuré ; LibreTranslate : non configuré ; MyMemory : non configuré" }]);
  });

  it("garde ce que le principal a traduit avant de tomber au milieu d'un lot", async () => {
    const { router, deepl, libre } = bench();
    const texts = Array.from({ length: TIMINGS.maxTextsPerRequest + 2 }, (_, index) => `Line ${index}`);
    deepl.behaviour = (sent, call) => {
      if (call > 1) throw new EngineError("quota-exceeded", "quota");
      return sent.map((text) => `deepl:${text}`);
    };
    const batch = await router.translate(request(texts));

    expect(deepl.calls).toHaveLength(2);
    expect(libre.calls).toEqual([[`Line ${TIMINGS.maxTextsPerRequest}`, `Line ${TIMINGS.maxTextsPerRequest + 1}`]]);
    expect(batch.results.filter((result) => result.engine === "deepl")).toHaveLength(TIMINGS.maxTextsPerRequest);
    expect(batch.fallback).toMatchObject({ from: "deepl", to: "libretranslate" });
  });

  it("ne touche à aucun moteur quand le niveau du chapitre l'interdit", async () => {
    recordMemory(FOLDER, "fr", [{ source: "Known.", translation: "Connu." }]);
    const { router, deepl, libre } = bench();
    const batch = await router.translate(request(["Known.", "Unknown."], { allowEngines: false }));
    expect(deepl.calls).toEqual([]);
    expect(libre.calls).toEqual([]);
    expect(batch.results).toEqual([{ id: "zone-0", text: "Connu.", source: "memory" }]);
    expect(batch.failed[0].error).toContain("niveau d'automatisation");
  });
});

describe("routeur : budget", () => {
  it("compte les caractères envoyés, par jour et par mois", async () => {
    const { router, clock } = bench();
    await router.translate(request(["12345", "123"]));
    expect(router.status("deepl").usage).toEqual({ day: 8, month: 8 });

    clock.advance(24 * 3600_000);
    await router.translate(request(["12"]));
    expect(router.status("deepl").usage).toEqual({ day: 2, month: 10 });

    clock.advance(31 * 24 * 3600_000);
    expect(router.status("deepl").usage).toEqual({ day: 0, month: 0 });
  });

  it("ne compte ni les phrases connues ni les requêtes échouées", async () => {
    const { router, deepl } = bench();
    await router.translate(request(["12345"]));
    await router.translate(request(["12345"]));
    deepl.failWith("unavailable");
    await router.translate(request(["abc"]));
    expect(router.status("deepl").usage.month).toBe(5);
    expect(router.status("libretranslate").usage.month).toBe(3);
  });

  it("ne dépasse jamais le plafond : ce qui n'y tient pas va au secours", async () => {
    applySettingsPatch({ monthlyLimits: { deepl: 20 } });
    const { router, deepl, libre } = bench();
    const batch = await router.translate(request(["123456789012345", "1234567890"]));

    expect(deepl.calls).toEqual([["123456789012345"]]);
    expect(libre.calls).toEqual([["1234567890"]]);
    expect(batch.fallback).toEqual({ from: "deepl", to: "libretranslate", reason: "plafond mensuel atteint" });
    expect(router.status("deepl")).toMatchObject({ available: true, monthlyLimit: 20, usage: { day: 15, month: 15 } });
    expect(router.status("deepl").reason).toBeUndefined();
  });

  it("prévient à 80 % du plafond, et met le moteur de côté au plafond", async () => {
    applySettingsPatch({ monthlyLimits: { deepl: 20 } });
    const { router, deepl, libre, clock } = bench();
    await router.translate(request(["1234567890123456"]));
    expect(router.status("deepl")).toMatchObject({ available: true, reason: "80 % du plafond mensuel consommés" });

    await router.translate(request(["abcd"]));
    const status = router.status("deepl");
    expect(status.available).toBe(false);
    expect(status.reason).toContain("plafond mensuel atteint");

    await router.translate(request(["More."]));
    expect(deepl.calls).toHaveLength(2);
    expect(libre.calls).toEqual([["More."]]);

    // Le mois suivant, le compteur repart.
    clock.advance(31 * 24 * 3600_000);
    expect(router.status("deepl").available).toBe(true);
    await router.translate(request(["Next."]));
    expect(deepl.calls).toHaveLength(3);
  });

  it("estime un lot sans rien envoyer", async () => {
    recordMemory(FOLDER, "fr", [{ source: "In memory.", translation: "En mémoire." }]);
    const { router, deepl, libre } = bench();
    await router.translate(request(["Cached."]));
    const calls = deepl.calls.length;

    const estimate = router.estimate({
      texts: ["Cached.", "In memory.", "Luffy", "New one.", "New one.", "Also new."],
      source: "en",
      target: "fr",
      glossary: [{ source: "Luffy", target: "Rufy" }],
      folderId: FOLDER,
    });
    expect(estimate).toEqual({ characters: 47, known: 30, toSend: 17, engine: "deepl" });
    expect(deepl.calls).toHaveLength(calls);
    expect(libre.calls).toEqual([]);

    deepl.failWith("unauthorized");
    await router.translate(request(["Trigger."]));
    expect(router.estimate({ texts: ["X"], source: "en", target: "fr", glossary: [], folderId: FOLDER }).engine).toBe("libretranslate");
  });
});

describe("routeur : file et essai", () => {
  it("fait attendre le délai minimal entre deux requêtes au même moteur", async () => {
    const { router, clock } = bench();
    await router.translate(request(["One."]));
    await router.translate(request(["Two."]));
    expect(clock.sleeps).toEqual([TIMINGS.minDelayMs]);

    clock.advance(TIMINGS.minDelayMs);
    await router.translate(request(["Three."]));
    expect(clock.sleeps).toEqual([TIMINGS.minDelayMs]);
  });

  it("ne lance jamais deux requêtes à la fois vers le même moteur", async () => {
    const { router, deepl } = bench();
    let running = 0;
    let peak = 0;
    deepl.behaviour = (texts) => texts.map((text) => `deepl:${text}`);
    const original = deepl.translate.bind(deepl);
    deepl.translate = async (texts: string[]) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running--;
      return original(texts);
    };
    await Promise.all(["A.", "B.", "C.", "D."].map((text) => router.translate(request([text]))));
    expect(peak).toBe(1);
    expect(deepl.calls).toHaveLength(4);
  });

  it("essaie un moteur en une seule requête, même mis de côté, et le remet en service", async () => {
    const { router, deepl } = bench();
    deepl.failWith("unauthorized");
    await router.translate(request(["One."]));
    expect(router.status("deepl").available).toBe(false);

    const refused = await router.test("deepl");
    expect(refused.ok).toBe(false);
    expect(deepl.calls).toHaveLength(2);

    deepl.recover();
    const accepted = await router.test("deepl");
    expect(accepted).toEqual({ ok: true, message: "DeepL répond : « Hello » donne « deepl:Hello »." });
    expect(deepl.calls).toHaveLength(3);
    expect(deepl.calls[2]).toEqual(["Hello"]);
    expect(router.status("deepl").available).toBe(true);
  });

  it("ne teste pas un moteur qui n'est pas configuré", async () => {
    const { router, libre } = bench({ libre: false });
    expect(await router.test("libretranslate")).toEqual({ ok: false, message: "LibreTranslate : non configuré." });
    expect(libre.calls).toEqual([]);
  });
});

// ─── Un moteur qui ne prend qu'une phrase par requête, avec un quota par jour ───

describe("routeur : un service à une phrase par requête", () => {
  /** Un banc où seul le troisième moteur existe, comme sur une instance où rien n'est réglé. */
  function single(dailyLimit: number, clock = new FakeClock()) {
    const engine = new FakeEngine("mymemory");
    (engine as unknown as { maxTextsPerRequest: number }).maxTextsPerRequest = 1;
    const router = new TranslationRouter({
      clock,
      resolve: (id) => (id === "mymemory" ? { engine, fingerprint: "empreinte-mymemory", dailyLimit } : { fingerprint: `empreinte-${id}`, reason: "non configuré" }),
    });
    return { engine, router, clock };
  }

  it("envoie les phrases une à une, à la suite, avec le délai entre deux", async () => {
    const { engine, router, clock } = single(5000);
    const batch = await router.translate(request(["One.", "Two.", "Three."]));
    expect(engine.calls).toEqual([["One."], ["Two."], ["Three."]]);
    expect(batch.results.map((result) => result.engine)).toEqual(["mymemory", "mymemory", "mymemory"]);
    expect(batch.failed).toEqual([]);
    // Deux attentes d'au moins le délai minimal, entre la première et la deuxième puis la troisième.
    expect(clock.sleeps.filter((duration) => duration >= TIMINGS.minDelayMs - 50)).toHaveLength(2);
  });

  it("s'arrête au quota du jour : ce qui dépasse n'est pas envoyé", async () => {
    const { engine, router } = single(10);
    const batch = await router.translate(request(["Hello.", "Again", "Too long for today"]));
    expect(engine.calls).toEqual([["Hello."]]);
    expect(batch.results).toHaveLength(1);
    expect(batch.failed.map((entry) => entry.id)).toEqual(["zone-1", "zone-2"]);
    expect(batch.failed[0].error).toContain("quota du jour");
    expect(router.catalogue().engines.find((entry) => entry.id === "mymemory")).toMatchObject({ dailyLimit: 10 });
  });
});
