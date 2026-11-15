import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isAutoPickable, type MusicTrack } from "@/modules/clip-studio/lib/music";

const library = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "modules", "clip-studio", "music", "library.json"), "utf-8"),
) as MusicTrack[];

describe("droits des morceaux de la banque", () => {
  it("laisse l'assistant choisir un morceau sans note ou à l'état inconnu", () => {
    expect(isAutoPickable({})).toBe(true);
    expect(isAutoPickable({ rights: { state: "clear" } })).toBe(true);
    expect(isAutoPickable({ rights: { state: "unknown" } })).toBe(true);
  });

  it("écarte du choix automatique un morceau revendiqué, à risque ou retiré", () => {
    expect(isAutoPickable({ rights: { state: "claimed" } })).toBe(false);
    expect(isAutoPickable({ rights: { state: "at-risk" } })).toBe(false);
    expect(isAutoPickable({ rights: { state: "withdrawn" } })).toBe(false);
  });

  it("garde « Epic Hip-Hop » dans la banque, mais hors du choix de l'assistant", () => {
    const track = library.find((entry) => entry.id === "cafeace9-eb96-4459-8705-f4f246658804");
    expect(track?.rights?.state).toBe("claimed");
    expect(isAutoPickable(track!)).toBe(false);
  });

  it("laisse au moins un autre morceau épique au choix de l'assistant", () => {
    expect(library.filter((entry) => entry.mood === "epic" && isAutoPickable(entry)).length).toBeGreaterThan(0);
  });
});
