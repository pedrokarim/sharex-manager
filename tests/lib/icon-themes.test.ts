import { execFileSync } from "child_process";
import { existsSync, readFileSync, rmSync } from "fs";
import { join } from "path";
import { afterEach, describe, expect, it } from "vitest";
import { scopeSvgIds } from "@/components/icon-theme";
import {
  DEFAULT_ICON_SET,
  ICON_CONCEPTS,
  ICON_SETS,
  LUCIDE_CONCEPT_ICONS,
  LUCIDE_ICON_SET,
  isIconSetId,
} from "@/lib/icon-themes/registry";

const setsDir = join(process.cwd(), "src", "lib", "icon-themes", "sets");

describe("jeux d'icônes générés", () => {
  it("couvrent chacun les trente concepts de l'interface", () => {
    for (const set of ICON_SETS) {
      if (set.id === LUCIDE_ICON_SET) continue;
      const file = JSON.parse(readFileSync(join(setsDir, `${set.id}.json`), "utf8"));
      expect(file.id).toBe(set.id);
      for (const concept of ICON_CONCEPTS) {
        expect(file.icons[concept]?.body, `${set.id} / ${concept}`).toBeTruthy();
        expect(file.icons[concept]?.viewBox).toMatch(/^-?\d+(\.\d+)? -?\d+(\.\d+)? \d+(\.\d+)? \d+(\.\d+)?$/);
      }
    }
  });

  it("ne contiennent ni script ni gestionnaire d'événement", () => {
    for (const set of ICON_SETS) {
      if (set.id === LUCIDE_ICON_SET) continue;
      const text = readFileSync(join(setsDir, `${set.id}.json`), "utf8");
      expect(text).not.toMatch(/<script|on[a-z]+=|javascript:/i);
    }
  });

  it("gardent une icône Lucide de repli pour chaque concept", () => {
    for (const concept of ICON_CONCEPTS) expect(LUCIDE_CONCEPT_ICONS[concept]).toBeTruthy();
  });

  it("ont Fluent Color pour jeu par défaut, et refusent un jeu inconnu", () => {
    expect(DEFAULT_ICON_SET).toBe("fluent-color");
    expect(ICON_SETS[0].id).toBe(DEFAULT_ICON_SET);
    expect(isIconSetId("lucide")).toBe(true);
    expect(isIconSetId("inconnu")).toBe(false);
    expect(isIconSetId(undefined)).toBe(false);
  });
});

describe("scopeSvgIds", () => {
  it("donne à chaque rendu ses propres identifiants de dégradé", () => {
    const body = '<defs><linearGradient id="a"/></defs><path fill="url(#a)"/><use href="#a" xlink:href="#a"/>';
    const scoped = scopeSvgIds(body, "r1");
    expect(scoped).toContain('id="a-r1"');
    expect(scoped).toContain("url(#a-r1)");
    expect(scoped).toContain('href="#a-r1"');
    expect(scoped).toContain('xlink:href="#a-r1"');
    expect(scoped).not.toMatch(/url\(#a\)|"#a"/);
  });

  it("laisse intact un dessin sans identifiant", () => {
    const body = '<path d="M0 0h24" fill="currentColor"/>';
    expect(scopeSvgIds(body, "r1")).toBe(body);
  });
});

describe("themeDb, jeu d'icônes", () => {
  const dbPath = join(process.cwd(), "data", `icon-set-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);

  afterEach(() => {
    for (const suffix of ["", "-shm", "-wal"]) if (existsSync(`${dbPath}${suffix}`)) rmSync(`${dbPath}${suffix}`, { force: true });
  });

  // `bun:sqlite` n'existe pas sous Node (la CI lance Vitest sous Node) : le
  // stockage se teste dans un sous-processus Bun, comme dans theme-db.test.ts.
  const run = (script: string) =>
    JSON.parse(
      execFileSync("bun", ["-e", script], { cwd: process.cwd(), env: { ...process.env, THEME_DB_PATH: dbPath }, encoding: "utf8" }),
    );

  it("rend Fluent Color tant que rien n'est choisi, puis le jeu enregistré", () => {
    const result = run(`
      import { themeDb } from "./src/lib/theme/theme-db";
      const before = themeDb.getIconSet();
      themeDb.setIconSet("phosphor-duotone", "admin-1");
      const after = themeDb.getIconSet();
      themeDb.setIconSet("lucide");
      let refused = false;
      try { themeDb.setIconSet("inconnu"); } catch { refused = true; }
      console.log(JSON.stringify({ before, after, last: themeDb.getIconSet(), refused }));
    `);
    expect(result).toEqual({ before: "fluent-color", after: "phosphor-duotone", last: "lucide", refused: true });
  });
});

describe("THEMED_ICONS dans les composants serveur", () => {
  it("n'est lu que par des modules clients : une page serveur passe le nom du concept", async () => {
    const { globSync } = await import("node:fs");
    const files = globSync("src/**/*.tsx", { cwd: process.cwd() });
    const offenders = files.filter((file) => {
      const text = readFileSync(join(process.cwd(), file), "utf8");
      return text.includes("THEMED_ICONS.") && !/^\s*["']use client["']/.test(text);
    });
    expect(offenders).toEqual([]);
  });
});
