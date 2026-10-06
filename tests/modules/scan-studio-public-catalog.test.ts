import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CATALOG_SECTION_ID, catalogSectionMediaUrl, catalogSectionPath } from "@/lib/catalog-section-paths";
import { resolveCatalogSections, resolveSectionMediaFile } from "@/lib/modules/catalog-sections";
import * as scanStudio from "@/modules/scan-studio/index.process";
import { PUBLIC_SECTION_ID } from "@/modules/scan-studio/lib/server/visibility";
import type { ModuleCatalogSection, ModuleConfig } from "@/types/modules";

const MODULES_DIR = path.join(process.cwd(), "modules");

const configs: ModuleConfig[] = fs
  .readdirSync(MODULES_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(MODULES_DIR, entry.name, "module.json")))
  .map((entry) => JSON.parse(fs.readFileSync(path.join(MODULES_DIR, entry.name, "module.json"), "utf8")));

const SECTION: ModuleCatalogSection = { id: "albums-photo", label: "Photos", kind: "reader", list: "a", collection: "b", item: "c", media: "d" };
const OPEN = { a: "public", b: "public", c: "public", d: "public" } as const;

function moduleWith(overrides: Partial<ModuleConfig>): ModuleConfig {
  return { name: "invented", version: "1.0.0", description: "", author: "", enabled: true, entry: "index.process.ts", supportedFileTypes: [], hasUI: false, ...overrides };
}

describe("sections de catalogue : registre", () => {
  it("ne garde que les sections des modules activés dont les quatre fonctions sont publiques", () => {
    const resolved = resolveCatalogSections([
      moduleWith({ name: "open", catalogSections: [SECTION], functions: { ...OPEN } }),
      moduleWith({ name: "disabled", enabled: false, catalogSections: [{ ...SECTION, id: "coupee" }], functions: { ...OPEN } }),
      // Une fonction réservée aux comptes connectés ne se sert pas sans compte.
      moduleWith({ name: "signed-in", catalogSections: [{ ...SECTION, id: "connectee" }], functions: { ...OPEN, c: "user" } }),
      moduleWith({ name: "undeclared", catalogSections: [{ ...SECTION, id: "oubliee" }], functions: { a: "public", b: "public", c: "public" } }),
      moduleWith({ name: "none" }),
    ]);
    expect(resolved).toEqual([{ module: "open", section: SECTION }]);
  });

  it("refuse les identifiants réservés, mal formés ou déjà pris", () => {
    const section = (id: string) => ({ ...SECTION, id });
    const resolved = resolveCatalogSections([
      moduleWith({ name: "first", catalogSections: [section("albums"), section("gallery"), section("../x"), section("Scans"), section("a"), section("lecture")], functions: { ...OPEN } }),
      moduleWith({ name: "second", catalogSections: [section("lecture"), section("autre")], functions: { ...OPEN } }),
    ]);
    expect(resolved.map((entry) => [entry.module, entry.section.id])).toEqual([
      ["first", "lecture"],
      ["second", "autre"],
    ]);
    for (const id of ["scans", "ab", "lecture-en-ligne"]) expect(CATALOG_SECTION_ID.test(id)).toBe(true);
    for (const id of ["", "a", "Scans", "scans/x", "../x", "9scans", "scans ", "a".repeat(33)]) expect(CATALOG_SECTION_ID.test(id)).toBe(false);
  });

  it("écrit les adresses du catalogue en un seul endroit", () => {
    expect(catalogSectionPath("scans")).toBe("/catalog/scans");
    expect(catalogSectionPath("scans", "serie")).toBe("/catalog/scans/serie");
    expect(catalogSectionPath("scans", "serie", "chapitre")).toBe("/catalog/scans/serie/chapitre");
    expect(catalogSectionMediaUrl("scans", ["chapitre", "jeton", "thumb"])).toBe("/api/public/sections/scans/media/chapitre/jeton/thumb");
    expect(catalogSectionMediaUrl("scans", ["a/b", "c d"])).toBe("/api/public/sections/scans/media/a%2Fb/c%20d");
  });
});

describe("sections de catalogue : contrat des modules", () => {
  const withSections = configs.filter((config) => config.catalogSections?.length);

  it("Scan Studio apporte la section « scans », et son identifiant est celui de ses adresses", () => {
    const resolved = resolveCatalogSections(configs.map((config) => ({ ...config, enabled: true })));
    const scans = resolved.find((entry) => entry.section.id === PUBLIC_SECTION_ID);
    expect(scans).toMatchObject({ module: "scan-studio", section: { kind: "reader", label: "Scans" } });
    // Toute section déclarée est servie : aucune n'est écartée pour une fonction mal déclarée.
    expect(resolved).toHaveLength(withSections.reduce((sum, config) => sum + (config.catalogSections?.length ?? 0), 0));
    // Module désactivé : la section n'existe plus.
    expect(resolveCatalogSections(configs.map((config) => ({ ...config, enabled: config.name !== "scan-studio" }))).some((entry) => entry.module === "scan-studio")).toBe(false);
  });

  it.each(withSections.map((config) => [config.name, config] as const))("%s déclare ses fonctions publiques, les exporte et ne les offre pas au navigateur", (name, config) => {
    const moduleDir = path.join(MODULES_DIR, name);
    const entry = fs.readFileSync(path.join(moduleDir, config.entry), "utf8");
    const publicFunctions = new Set<string>();
    for (const section of config.catalogSections ?? []) {
      for (const functionName of [section.list, section.collection, section.item, section.media]) {
        expect(config.functions?.[functionName]).toBe("public");
        expect(entry).toMatch(new RegExp(`export async function ${functionName}\\b`));
        publicFunctions.add(functionName);
      }
    }
    // Aucune autre fonction n'est publique : l'audience ne sert qu'au catalogue.
    for (const [functionName, audience] of Object.entries(config.functions ?? {})) {
      if (audience === "public") expect(publicFunctions.has(functionName)).toBe(true);
    }
    // Le navigateur n'appelle jamais ces fonctions.
    const client = path.join(moduleDir, "lib/client.ts");
    if (fs.existsSync(client)) {
      const source = fs.readFileSync(client, "utf8");
      for (const functionName of publicFunctions) expect(source).not.toContain(`"${functionName}"`);
    }
  });

  it("la route d'appel des fonctions refuse l'audience publique", () => {
    const route = fs.readFileSync(path.join(process.cwd(), "src/app/api/modules/call-function/route.ts"), "utf8");
    expect(route).toMatch(/requiredAccess === "public"/);
    expect(route.indexOf('requiredAccess === "public"')).toBeLessThan(route.indexOf("callModuleFunction("));
    for (const functionName of ["listPublicSeries", "getPublicSeries", "getPublicChapter", "openPublicMedia"]) {
      expect(typeof (scanStudio as Record<string, unknown>)[functionName]).toBe("function");
    }
  });
});

describe("sections de catalogue : fichier d'un média", () => {
  let root = "";
  let dataDir = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "catalog-sections-"));
    dataDir = path.join(root, "data");
    fs.mkdirSync(path.join(dataDir, "assets"), { recursive: true });
    fs.mkdirSync(path.join(dataDir, "translation"), { recursive: true });
    fs.writeFileSync(path.join(dataDir, "assets", "page.png"), "image");
    fs.writeFileSync(path.join(dataDir, "assets", "notes.json"), "{}");
    fs.writeFileSync(path.join(dataDir, "translation", "secrets.json"), "{}");
    fs.writeFileSync(path.join(dataDir, "assets", ".hidden.png"), "image");
    fs.mkdirSync(path.join(dataDir, "assets", "folder.png"));
    fs.writeFileSync(path.join(root, "outside.png"), "image");
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("sert une image du répertoire de données", () => {
    expect(resolveSectionMediaFile(dataDir, "assets/page.png")).toBe(path.join(dataDir, "assets", "page.png"));
  });

  it("refuse tout ce qui sort du répertoire, n'est pas une image ou n'est pas un fichier", () => {
    const attempts: unknown[] = [
      "../outside.png",
      "assets/../../outside.png",
      "assets/..\\..\\outside.png",
      "/etc/passwd",
      path.join(root, "outside.png"),
      "assets//page.png",
      "assets/page.png/",
      "assets/.hidden.png",
      "assets/notes.json",
      "translation/secrets.json",
      "assets/folder.png",
      "assets/absent.png",
      "assets/page.png\0.json",
      "assets/page",
      "",
      "a".repeat(500),
      null,
      undefined,
      12,
      ["assets", "page.png"],
    ];
    for (const attempt of attempts) expect(resolveSectionMediaFile(dataDir, attempt)).toBeNull();
  });

  it("ne suit pas un lien symbolique qui sort du répertoire", () => {
    const link = path.join(dataDir, "assets", "link.png");
    try {
      fs.symlinkSync(path.join(root, "outside.png"), link);
    } catch {
      // Sans le droit de créer des liens (Windows sans mode développeur), il n'y a rien à vérifier.
      return;
    }
    expect(resolveSectionMediaFile(dataDir, "assets/link.png")).toBeNull();
  });
});
