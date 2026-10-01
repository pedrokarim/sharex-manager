import { describe, expect, it } from "vitest";
import { execFileSync } from "child_process";
import { MAX_PREFERENCE_BYTES, isPreferenceScope, parsePreferenceValue } from "@/lib/user-preferences-rules";
import { pickComposerPreference, touchesComposerPreference } from "@/modules/ai-image-gen/lib/composer-preference";

/**
 * La base passe par `bun:sqlite`, absent de Node : comme pour le thème, le
 * scénario tourne dans un sous-processus Bun, sur une base en mémoire.
 */
function runWithDatabase<T>(script: string): T {
  const output = execFileSync(
    "bun",
    [
      "-e",
      [
        'import * as prefs from "./src/lib/user-preferences.ts";',
        `const out = (() => { ${script} })();`,
        "console.log(JSON.stringify(out));",
      ].join("\n"),
    ],
    { cwd: process.cwd(), env: { ...process.env, PREFERENCES_DB_PATH: ":memory:" }, encoding: "utf8" }
  );
  // La dernière ligne : un module chargé au passage peut écrire avant.
  return JSON.parse(output.trim().split("\n").pop()!) as T;
}

describe("préférences du compte", () => {
  it("garde une préférence par compte et par portée", () => {
    const result = runWithDatabase<unknown[]>(`
      prefs.setUserPreference("alice", "ai-image-gen.composer", { model: "codex/gpt-image-2", count: 2 });
      prefs.setUserPreference("bob", "ai-image-gen.composer", { model: "dall-e-3" });
      return [
        prefs.getUserPreference("alice", "ai-image-gen.composer"),
        prefs.getUserPreference("bob", "ai-image-gen.composer"),
        prefs.getUserPreference("alice", "clip-studio.voice"),
      ];
    `);
    expect(result).toEqual([{ model: "codex/gpt-image-2", count: 2 }, { model: "dall-e-3" }, null]);
  });

  it("remplace la valeur précédente et sait l'effacer", () => {
    const result = runWithDatabase<unknown[]>(`
      prefs.setUserPreference("alice", "x.y", { a: 1 });
      prefs.setUserPreference("alice", "x.y", { a: 2 });
      const replaced = prefs.getUserPreference("alice", "x.y");
      prefs.deleteUserPreference("alice", "x.y");
      return [replaced, prefs.getUserPreference("alice", "x.y")];
    `);
    expect(result).toEqual([{ a: 2 }, null]);
  });

  it("limite le nombre de portées d'un compte", () => {
    const result = runWithDatabase<boolean[]>(`
      let all = true;
      for (let index = 0; index < 100; index++) all = prefs.setUserPreference("alice", "p." + index, { index }) && all;
      // La 101e est refusée ; mettre à jour une portée existante reste possible.
      return [all, prefs.setUserPreference("alice", "p.de-trop", {}), prefs.setUserPreference("alice", "p.0", { index: -1 })];
    `);
    expect(result).toEqual([true, false, true]);
  });

  it("n'accepte que des portées simples", () => {
    expect(isPreferenceScope("ai-image-gen.composer")).toBe(true);
    expect(isPreferenceScope("../secrets")).toBe(false);
    expect(isPreferenceScope("Avec Espace")).toBe(false);
    expect(isPreferenceScope("")).toBe(false);
  });

  it("refuse ce qui n'est pas un petit objet", () => {
    expect(parsePreferenceValue({ a: 1 })).toEqual({ a: 1 });
    expect(parsePreferenceValue([1, 2])).toBeNull();
    expect(parsePreferenceValue("texte")).toBeNull();
    expect(parsePreferenceValue({ big: "x".repeat(MAX_PREFERENCE_BYTES) })).toBeNull();
  });
});

describe("réglages retenus du compositeur", () => {
  it("ne retient ni le prompt, ni les images, ni la graine", () => {
    expect(
      pickComposerPreference({ prompt: "un chat", seed: "42", references: [1], model: "dall-e-3", size: "1024x1024", count: 2 })
    ).toEqual({ model: "dall-e-3", size: "1024x1024", count: 2 });
    expect(touchesComposerPreference({ prompt: "un chat" })).toBe(false);
    expect(touchesComposerPreference({ quality: "high" })).toBe(true);
  });

  it("écarte les valeurs aberrantes", () => {
    expect(pickComposerPreference({ model: 12, count: 400, notes: "ok" })).toEqual({ notes: "ok" });
  });
});
