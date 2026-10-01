import { beforeEach, describe, expect, it } from "vitest";
import {
  MAX_PREFERENCE_BYTES,
  deleteUserPreference,
  getUserPreference,
  isPreferenceScope,
  parsePreferenceValue,
  resetPreferencesConnection,
  setUserPreference,
} from "@/lib/user-preferences";
import { pickComposerPreference, touchesComposerPreference } from "@/modules/ai-image-gen/lib/composer-preference";

describe("préférences du compte", () => {
  beforeEach(() => {
    process.env.PREFERENCES_DB_PATH = ":memory:";
    resetPreferencesConnection();
  });

  it("garde une préférence par compte et par portée", () => {
    setUserPreference("alice", "ai-image-gen.composer", { model: "codex/gpt-image-2", count: 2 });
    setUserPreference("bob", "ai-image-gen.composer", { model: "dall-e-3" });
    expect(getUserPreference("alice", "ai-image-gen.composer")).toEqual({ model: "codex/gpt-image-2", count: 2 });
    expect(getUserPreference("bob", "ai-image-gen.composer")).toEqual({ model: "dall-e-3" });
    expect(getUserPreference("alice", "clip-studio.voice")).toBeNull();
  });

  it("remplace la valeur précédente et sait l'effacer", () => {
    setUserPreference("alice", "x.y", { a: 1 });
    setUserPreference("alice", "x.y", { a: 2 });
    expect(getUserPreference("alice", "x.y")).toEqual({ a: 2 });
    deleteUserPreference("alice", "x.y");
    expect(getUserPreference("alice", "x.y")).toBeNull();
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

  it("limite le nombre de portées d'un compte", () => {
    for (let index = 0; index < 100; index++) expect(setUserPreference("alice", `p.${index}`, { index })).toBe(true);
    expect(setUserPreference("alice", "p.de-trop", {})).toBe(false);
    // Mettre à jour une portée existante reste possible.
    expect(setUserPreference("alice", "p.0", { index: -1 })).toBe(true);
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
