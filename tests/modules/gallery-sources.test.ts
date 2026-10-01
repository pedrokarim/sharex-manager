import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { ModuleConfig } from "@/types/modules";

const MODULES_DIR = path.join(process.cwd(), "modules");

const configs: ModuleConfig[] = fs
  .readdirSync(MODULES_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(MODULES_DIR, entry.name, "module.json")))
  .map((entry) => JSON.parse(fs.readFileSync(path.join(MODULES_DIR, entry.name, "module.json"), "utf8")));

const withSources = configs.filter((config) => config.gallerySources?.length);

describe("sources des modules pour la galerie", () => {
  it("existent pour AI Image Gen et Clip Studio", () => {
    expect(withSources.map((config) => config.name).sort()).toEqual(["ai-image-gen", "clip-studio"]);
  });

  it.each(withSources.map((config) => [config.name, config] as const))(
    "%s déclare et exporte ses deux fonctions, ouvertes aux comptes ordinaires",
    (name, config) => {
      const entry = fs.readFileSync(path.join(MODULES_DIR, name, config.entry), "utf8");
      const ids = new Set<string>();
      for (const source of config.gallerySources ?? []) {
        expect(source.label).toBeTruthy();
        expect(ids.has(source.id)).toBe(false);
        ids.add(source.id);
        for (const functionName of [source.list, source.import]) {
          // Sans le rôle « user », la fenêtre proposerait un onglet qui répond « interdit ».
          expect(config.functions?.[functionName]).toBe("user");
          expect(entry).toMatch(new RegExp(`export async function ${functionName}\\b`));
        }
      }
    }
  );
});
