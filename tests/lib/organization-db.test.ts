/**
 * Base des tags et des collections. `bun:sqlite` n'existe pas sous Node (la
 * CI lance Vitest sous Node) : chaque scénario tourne dans un sous-processus
 * `bun -e`, sur une base jetable, comme pour le thème.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFileSync } from "child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";

const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

let dbPath = "";
let uploads = "";

function run<T>(body: string): T {
  const script = `
    import { organizationDb as db } from "./src/lib/organization/organization-db";
    const out = await (async () => { ${body} })();
    console.log(JSON.stringify(out));
  `;
  const output = execFileSync("bun", ["-e", script], {
    cwd: process.cwd(),
    env: { ...process.env, ORGANIZATION_DB_PATH: dbPath, UPLOAD_PATH: uploads },
    encoding: "utf8",
  });
  return JSON.parse(output.trim().split("\n").pop()!) as T;
}

beforeEach(() => {
  const id = stamp();
  dbPath = join(process.cwd(), "data", `organization-db-test-${id}.db`);
  uploads = join(process.cwd(), "data", `organization-uploads-test-${id}`);
  mkdirSync(uploads, { recursive: true });
  for (const name of ["a.png", "b.mp4", "c.pdf"]) writeFileSync(join(uploads, name), "x");
});

afterEach(() => {
  for (const suffix of ["", "-shm", "-wal"]) {
    if (existsSync(dbPath + suffix)) rmSync(dbPath + suffix, { force: true });
  }
  rmSync(uploads, { recursive: true, force: true });
});

describe("organizationDb – tags", () => {
  it("rend le tag existant pour un nom au même slug, et compte les fichiers présents", () => {
    const out = run<any>(`
      const first = db.createTag({ name: "Jeu vidéo", createdBy: "u1" });
      const second = db.createTag({ name: "  jeu-video ", createdBy: "u2" });
      db.setFileTags("a.png", ["Jeu vidéo"], "u1");
      db.setFileTags("gone.png", ["Jeu vidéo"], "u1");
      return { first, second, tags: db.listTags() };
    `);
    expect(out.first.created).toBe(true);
    expect(out.second.created).toBe(false);
    expect(out.second.tag.id).toBe(out.first.tag.id);
    expect(out.second.tag.name).toBe("Jeu vidéo");
    expect(out.tags).toHaveLength(1);
    // « gone.png » n'est pas dans le dossier d'envoi : il ne compte pas.
    expect(out.tags[0]).toMatchObject({ slug: "jeu-video", fileCount: 1, createdBy: "u1" });
    expect(out.tags[0].lastUsedAt).toEqual(expect.any(String));
  });

  it("refuse un nom vide et borne la longueur", () => {
    const out = run<any>(`
      let error = null;
      try { db.createTag({ name: "  !!! " }); } catch (e) { error = e.code; }
      const long = db.createTag({ name: "x".repeat(80) }).tag;
      return { error, length: long.name.length };
    `);
    expect(out.error).toBe("invalid_name");
    expect(out.length).toBe(40);
  });

  it("renomme : le slug suit le nom s'il est libre, et les règles suivent le slug", () => {
    const out = run<any>(`
      const a = db.createTag({ name: "Valo" }).tag;
      const b = db.createTag({ name: "Maquette" }).tag;
      const col = db.createCollection("u1", { name: "Valo", rules: { tagsAll: ["valo"] } });
      const renamed = db.updateTag(a.id, { name: "Valorant" });
      const blocked = db.updateTag(b.id, { name: "Valorant" });
      return { renamed, blocked, rules: db.getCollection(col.id, "u1").rules };
    `);
    expect(out.renamed.slug).toBe("valorant");
    expect(out.rules).toEqual({ tagsAll: ["valorant"] });
    // « valorant » est pris : le nom change, le slug reste.
    expect(out.blocked).toMatchObject({ name: "Valorant", slug: "maquette" });
  });

  it("supprime un tag : il quitte les fichiers et les règles", () => {
    const out = run<any>(`
      const a = db.createTag({ name: "A" }).tag;
      db.createTag({ name: "B" });
      db.setFileTags("a.png", ["A", "B"]);
      const col = db.createCollection("u1", { name: "Mix", rules: { tagsAll: ["a", "b"], tagsNone: ["a"] } });
      const only = db.createCollection("u1", { name: "Seul", rules: { tagsAny: ["a"] } });
      db.deleteTag(a.id);
      return {
        fileTags: db.getFileTags("a.png").map((t) => t.slug),
        mix: db.getCollection(col.id, "u1").rules,
        only: db.getCollection(only.id, "u1").rules,
      };
    `);
    expect(out.fileTags).toEqual(["b"]);
    expect(out.mix).toEqual({ tagsAll: ["b"] });
    expect(out.only).toEqual({});
  });

  it("fusionne : les fichiers gardent la cible, la source disparaît des règles", () => {
    const out = run<any>(`
      const src = db.createTag({ name: "Valo" }).tag;
      const into = db.createTag({ name: "Valorant" }).tag;
      db.setFileTags("a.png", ["Valo"]);
      db.setFileTags("b.mp4", ["Valo", "Valorant"]);
      const col = db.createCollection("u1", { name: "V", rules: { tagsAny: ["valo", "valorant"] } });
      const merged = db.mergeTags(src.id, into.id);
      let same = null;
      try { db.mergeTags(into.id, into.id); } catch (e) { same = e.code; }
      return {
        merged,
        source: db.getTag(src.id),
        a: db.getFileTags("a.png").map((t) => t.slug),
        b: db.getFileTags("b.mp4").map((t) => t.slug),
        rules: db.getCollection(col.id, "u1").rules,
        same,
      };
    `);
    expect(out.merged).toMatchObject({ slug: "valorant", fileCount: 2 });
    expect(out.source).toBeNull();
    expect(out.a).toEqual(["valorant"]);
    expect(out.b).toEqual(["valorant"]);
    expect(out.rules).toEqual({ tagsAny: ["valorant"] });
    expect(out.same).toBe("same_tag");
  });
});

describe("organizationDb – tags d'un fichier", () => {
  it("remplace, ajoute et retire en lot, et rend la table par fichier", () => {
    const out = run<any>(`
      const replaced = db.setFileTags("a.png", ["Reçu", "reçu", "Maquette"], "u1");
      const again = db.setFileTags("a.png", ["Maquette"], "u1");
      const batch = db.updateFilesTags(["a.png", "b.mp4"], { add: ["Jeu"], remove: ["maquette"] }, "u2");
      return {
        replaced: replaced.map((t) => t.slug),
        again: again.map((t) => t.slug),
        batch,
        map: Object.fromEntries(db.tagsByFile()),
      };
    `);
    expect(out.replaced).toEqual(["maquette", "recu"]);
    expect(out.again).toEqual(["maquette"]);
    expect(out.batch).toMatchObject({ added: 2, removed: 1, skipped: [] });
    expect(out.batch.tags.map((t: any) => t.slug)).toEqual(["jeu"]);
    expect(out.map).toEqual({ "a.png": ["jeu"], "b.mp4": ["jeu"] });
  });

  it("borne un fichier à TAGS_PER_FILE_MAX tags", () => {
    const out = run<any>(`
      const names = Array.from({ length: 30 }, (_, i) => "t" + i);
      db.setFileTags("a.png", names);
      let error = null;
      try { db.setFileTags("a.png", [...names, "t30"]); } catch (e) { error = e.code; }
      const batch = db.updateFilesTags(["a.png", "b.mp4"], { add: ["extra"] });
      return { error, batch, count: db.getFileTags("a.png").length };
    `);
    expect(out.error).toBe("too_many_tags");
    expect(out.batch).toMatchObject({ added: 1, skipped: ["a.png"] });
    expect(out.count).toBe(30);
  });

  it("oublie les tags d'un fichier supprimé", () => {
    const out = run<any>(`
      db.setFileTags("a.png", ["X"]);
      db.forgetFile("a.png");
      return { tags: db.getFileTags("a.png"), map: [...db.tagsByFile().keys()], tagStillThere: db.listTags().length };
    `);
    expect(out.tags).toEqual([]);
    expect(out.map).toEqual([]);
    expect(out.tagStillThere).toBe(1);
  });
});

describe("organizationDb – collections", () => {
  it("crée par compte, slug unique par compte, épinglées d'abord", () => {
    const out = run<any>(`
      const a = db.createCollection("u1", { name: "Vidéos", rules: { kinds: ["video"] } });
      const b = db.createCollection("u1", { name: "vidéos", rules: { starred: true }, sort: "name", order: "asc" });
      const c = db.createCollection("u2", { name: "Vidéos", rules: { kinds: ["video"] } });
      const p = db.createCollection("u1", { name: "Preview", rules: { secure: false } });
      db.setCollectionPinned(b.id, "u1", true);
      return {
        slugs: [a.slug, b.slug, c.slug, p.slug],
        sortOf: { sort: b.sort, order: b.order },
        list: db.listCollections("u1").map((x) => x.slug),
        foreign: db.getCollection(a.id, "u2"),
        bySlug: db.findCollection("videos-2", "u1")?.id === b.id,
        byId: db.findCollection(String(a.id), "u1")?.slug,
      };
    `);
    expect(out.slugs).toEqual(["videos", "videos-2", "videos", "preview-2"]);
    expect(out.sortOf).toEqual({ sort: "name", order: "asc" });
    expect(out.list[0]).toBe("videos-2");
    expect(out.foreign).toBeNull();
    expect(out.bySlug).toBe(true);
    expect(out.byId).toBe("videos");
  });

  it("refuse une collection sans règle ou aux règles invalides", () => {
    const out = run<any>(`
      const codes = [];
      for (const rules of [{}, { tagsAll: [] }, { search: "   " }, { period: { lastDays: 0 } }, { bogus: 1 }]) {
        try { db.createCollection("u1", { name: "X", rules }); codes.push("ok"); } catch (e) { codes.push(e.code); }
      }
      return codes;
    `);
    expect(out).toEqual(["empty_rules", "empty_rules", "empty_rules", "invalid_rules", "invalid_rules"]);
  });

  it("modifie et supprime seulement pour le propriétaire", () => {
    const out = run<any>(`
      const a = db.createCollection("u1", { name: "Reçus", rules: { search: "recu" } });
      const foreign = db.updateCollection(a.id, "u2", { name: "Volée" });
      const renamed = db.updateCollection(a.id, "u1", { name: "Factures", rules: { tagsAll: ["Factures"] }, pinned: true });
      const foreignDelete = db.deleteCollection(a.id, "u2");
      const deleted = db.deleteCollection(a.id, "u1");
      return { foreign, renamed, foreignDelete, deleted, after: db.listCollections("u1") };
    `);
    expect(out.foreign).toBeNull();
    expect(out.renamed).toMatchObject({ name: "Factures", slug: "factures", pinned: true, rules: { tagsAll: ["factures"] } });
    expect(out.foreignDelete).toBe(false);
    expect(out.deleted).toBe(true);
    expect(out.after).toEqual([]);
  });
});
