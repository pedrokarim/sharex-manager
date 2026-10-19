import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROJECT_QUERY,
  activity,
  aspectOf,
  channelTotals,
  cleanProjectQuery,
  cleanTags,
  exportPublications,
  exportQueryString,
  filterExports,
  matchesSearch,
  paginate,
  parseExportQuery,
  parseProjectQuery,
  projectQueryString,
  publicationRows,
  queryProjects,
  updateProjectQuery,
  withStats,
  type ExportLike,
  type JobLike,
  type ProjectSummary,
} from "@/modules/clip-studio/lib/library";
import { pageWindow } from "@/modules/clip-studio/components/library-ui";

const NOW = new Date(2026, 9, 19, 12).getTime();
const DAY = 86_400_000;

function project(id: string, patch: Partial<ProjectSummary> = {}): ProjectSummary {
  return {
    id,
    name: `Projet ${id}`,
    aspect: "9:16",
    width: 1080,
    height: 1920,
    durationFrames: 300,
    fps: 30,
    itemCount: 3,
    tags: [],
    exportCount: 0,
    createdAt: NOW - 10 * DAY,
    updatedAt: NOW - DAY,
    ...patch,
  };
}

function job(id: string, accountId: string, patch: Partial<JobLike> = {}): JobLike {
  return {
    id,
    accountId,
    connector: "youtube",
    state: "done",
    source: { id: "exp-a" },
    createdAt: NOW - DAY,
    updatedAt: NOW - DAY,
    ...patch,
  };
}

describe("pagination", () => {
  it("découpe en pages et ramène une page hors bornes à la dernière", () => {
    const items = Array.from({ length: 50 }, (_, index) => index);
    expect(paginate(items, 1, 24).items).toHaveLength(24);
    expect(paginate(items, 3, 24)).toMatchObject({ items: [48, 49], page: 3, pageCount: 3, total: 50 });
    expect(paginate(items, 9, 24).page).toBe(3);
    expect(paginate([], 4, 24)).toMatchObject({ page: 1, pageCount: 1, total: 0 });
  });

  it("montre la première, la dernière et les voisines de la page en cours", () => {
    expect(pageWindow(1, 1)).toEqual([1]);
    expect(pageWindow(5, 10)).toEqual([1, null, 4, 5, 6, null, 10]);
    expect(pageWindow(2, 4)).toEqual([1, 2, 3, 4]);
  });
});

describe("recherche", () => {
  it("ignore la casse et les accents, et demande tous les mots", () => {
    expect(matchesSearch("ete plage", ["Été à la PLAGE"])).toBe(true);
    expect(matchesSearch("ete montagne", ["Été à la plage"])).toBe(false);
    expect(matchesSearch("  ", ["n’importe quoi"])).toBe(true);
  });
});

describe("étiquettes", () => {
  it("nettoie, dédoublonne sans la casse et borne", () => {
    expect(cleanTags([" Voyage ", "voyage", "a,b", 3, "", "x".repeat(40)])).toEqual(["Voyage", "a b", "x".repeat(32)]);
    expect(cleanTags(Array.from({ length: 20 }, (_, index) => `t${index}`))).toHaveLength(12);
    expect(cleanTags("pas une liste")).toEqual([]);
  });
});

describe("adresse des projets", () => {
  it("lit et réécrit la requête sans les valeurs par défaut", () => {
    const query = parseProjectQuery(new URLSearchParams("q=plage&sort=name&page=3&aspect=16:9&tag=Voyage&view=list"));
    expect(query).toMatchObject({ q: "plage", sort: "name", dir: "asc", page: 3, aspect: "16:9", tag: "Voyage" });
    expect(projectQueryString(query, "list")).toBe("?q=plage&sort=name&aspect=16%3A9&tag=Voyage&view=list&page=3");
    expect(projectQueryString(DEFAULT_PROJECT_QUERY)).toBe("");
  });

  it("écarte les valeurs inconnues ou dangereuses", () => {
    const query = parseProjectQuery(new URLSearchParams("sort=drop&page=-4&aspect=2:1&brand=../x&origin=hack&exported=maybe&period=1d"));
    expect(query).toEqual(DEFAULT_PROJECT_QUERY);
  });

  it("revient à la première page quand un filtre change, garde la page sinon", () => {
    const query = { ...DEFAULT_PROJECT_QUERY, page: 4 };
    expect(updateProjectQuery(query, { aspect: "1:1" }).page).toBe(1);
    expect(updateProjectQuery(query, { page: 5 }).page).toBe(5);
    // Un nouveau tri reprend son sens naturel.
    expect(updateProjectQuery(query, { sort: "name" }).dir).toBe("asc");
  });

  it("relit une requête venue du navigateur", () => {
    expect(cleanProjectQuery({ q: "  a   b ", page: 2, sort: "duration" })).toMatchObject({ q: "a b", page: 2, sort: "duration", dir: "desc" });
    expect(cleanProjectQuery(null)).toEqual(DEFAULT_PROJECT_QUERY);
  });
});

describe("filtres et tri des projets", () => {
  const items = [
    project("a", { name: "Bière", aspect: "16:9", width: 1920, height: 1080, tags: ["Voyage"], exportCount: 2, brandKitId: "kit-aaaaaa", origin: "assistant" }),
    project("b", { name: "alpha", durationFrames: 900, updatedAt: NOW - 40 * DAY }),
    project("c", { name: "Ćeline", origin: "subtitle", tags: ["voyage", "Été"], updatedAt: NOW - 2 * DAY }),
  ];

  it("filtre par format, marque, origine, étiquette, export et période", () => {
    const run = (patch: Partial<typeof DEFAULT_PROJECT_QUERY>) => queryProjects(items, { ...DEFAULT_PROJECT_QUERY, ...patch }, NOW).items.map((item) => item.id);
    expect(run({ aspect: "16:9" })).toEqual(["a"]);
    expect(run({ brand: "none" })).toEqual(["c", "b"]);
    expect(run({ brand: "kit-aaaaaa" })).toEqual(["a"]);
    expect(run({ origin: "other" })).toEqual(["b"]);
    expect(run({ tag: "VOYAGE" })).toEqual(["a", "c"]);
    expect(run({ exported: "yes" })).toEqual(["a"]);
    expect(run({ exported: "no" })).toEqual(["c", "b"]);
    expect(run({ period: "30d" })).toEqual(["a", "c"]);
    expect(run({ q: "ete" })).toEqual(["c"]);
  });

  it("trie par nom à la française, par durée, par date", () => {
    const sorted = (sort: "name" | "duration" | "created", dir: "asc" | "desc") => queryProjects(items, { ...DEFAULT_PROJECT_QUERY, sort, dir }, NOW).items.map((item) => item.id);
    expect(sorted("name", "asc")).toEqual(["b", "a", "c"]);
    expect(sorted("duration", "desc")[0]).toBe("b");
  });

  it("compte les valeurs des filtres sur toute la bibliothèque", () => {
    const { facets, libraryTotal } = queryProjects(items, { ...DEFAULT_PROJECT_QUERY, aspect: "1:1" }, NOW);
    expect(libraryTotal).toBe(3);
    expect(facets.aspects).toEqual([
      { value: "9:16", count: 2 },
      { value: "16:9", count: 1 },
    ]);
    expect(facets.tags[0]).toEqual({ tag: "Voyage", count: 2 });
    expect(facets.withoutBrand).toBe(2);
    expect(facets.exported).toBe(1);
  });
});

describe("publications d'un export", () => {
  it("garde une ligne par compte, la publication réussie l'emportant sur les échecs", () => {
    const rows = publicationRows([
      job("j1", "acc-1", { state: "failed", error: "quota", createdAt: NOW - 3 * DAY }),
      job("j2", "acc-1", { result: { externalId: "v1", url: "https://youtu.be/v1" }, createdAt: NOW - 2 * DAY }),
      job("j3", "acc-2", { connector: "tiktok", state: "failed", error: "refus" }),
      job("j4", "acc-3", { connector: "instagram", state: "queued", publishAt: NOW + DAY }),
    ]);
    expect(rows.map((row) => [row.accountId, row.state])).toEqual([
      ["acc-2", "failed"],
      ["acc-3", "scheduled"],
      ["acc-1", "published"],
    ]);
    expect(rows.find((row) => row.accountId === "acc-1")).toMatchObject({ url: "https://youtu.be/v1", externalId: "v1", attempts: 2, retryable: false });
    expect(rows.find((row) => row.accountId === "acc-2")).toMatchObject({ retryable: true, error: "refus" });
    expect(rows.find((row) => row.accountId === "acc-3")?.at).toBe(NOW + DAY);
  });

  it("donne l'état d'ensemble et ignore les envois annulés", () => {
    expect(exportPublications([]).status).toBe("none");
    expect(exportPublications([job("j1", "acc-1", { state: "cancelled" })])).toEqual({ status: "none", rows: [] });
    expect(exportPublications([job("j1", "acc-1", { state: "uploading" })]).status).toBe("pending");
    expect(exportPublications([job("j1", "acc-1"), job("j2", "acc-2", { state: "failed" })]).status).toBe("published");
  });

  it("compte les publications par service", () => {
    const totals = channelTotals([
      exportPublications([job("j1", "acc-1"), job("j2", "acc-2", { connector: "tiktok", state: "failed" })]),
      exportPublications([job("j3", "acc-1", { source: { id: "exp-b" } })]),
    ]);
    expect(totals).toEqual([
      { connector: "youtube", published: 2, scheduled: 0, pending: 0, failed: 0 },
      { connector: "tiktok", published: 0, scheduled: 0, pending: 0, failed: 1 },
    ]);
  });

  it("ajoute les statistiques connues par compte et par publication", () => {
    const rows = publicationRows([job("j1", "acc-1", { result: { externalId: "v1", url: "u" } }), job("j2", "acc-2")]);
    const stats = new Map([["acc-1", new Map([["v1", { views: 1200, likes: 40 }]])]]);
    const enriched = withStats(rows, stats);
    expect(enriched.find((row) => row.accountId === "acc-1")?.stats).toEqual({ views: 1200, likes: 40 });
    expect(enriched.find((row) => row.accountId === "acc-2")?.stats).toBeUndefined();
  });
});

describe("exports", () => {
  const exports: ExportLike[] = [
    { id: "exp-a", projectId: "p1", projectName: "Plage", width: 1080, height: 1920, durationMs: 30_000, sizeBytes: 5e6, createdAt: NOW - DAY, post: { base: { title: "Les plus belles plages" } } },
    { id: "exp-b", projectId: "p2", projectName: "Montagne", width: 1920, height: 1080, durationMs: 60_000, sizeBytes: 9e6, createdAt: NOW - 50 * DAY, brandKitId: "kit-bbbbbb" },
  ];

  it("reconnaît le format d'un cadre", () => {
    expect(aspectOf(1080, 1920)).toBe("9:16");
    expect(aspectOf(1280, 720)).toBe("16:9");
    expect(aspectOf(1080, 1350)).toBe("4:5");
    expect(aspectOf(1000, 300)).toBeNull();
  });

  it("filtre par format, marque, période, recherche, service et état", () => {
    const ids = (patch: Record<string, string>, publications?: Map<string, ReturnType<typeof exportPublications>>) =>
      filterExports(exports, parseExportQuery(new URLSearchParams(patch)), publications, NOW).map((entry) => entry.id);
    expect(ids({ aspect: "16:9" })).toEqual(["exp-b"]);
    expect(ids({ brand: "none" })).toEqual(["exp-a"]);
    expect(ids({ period: "30d" })).toEqual(["exp-a"]);
    expect(ids({ q: "belles" })).toEqual(["exp-a"]);
    const publications = new Map([["exp-a", exportPublications([job("j1", "acc-1"), job("j2", "acc-2", { connector: "tiktok", state: "failed" })])]]);
    expect(ids({ channel: "tiktok" }, publications)).toEqual(["exp-a"]);
    expect(ids({ status: "failed" }, publications)).toEqual(["exp-a"]);
    expect(ids({ status: "none" }, publications)).toEqual(["exp-b"]);
    // Sans les publications (non administrateur), les filtres de publication sont ignorés.
    expect(ids({ status: "failed" })).toEqual(["exp-a", "exp-b"]);
  });

  it("garde la requête des exports dans l'adresse", () => {
    const query = parseExportQuery(new URLSearchParams("status=failed&channel=youtube&page=2&sort=size"));
    expect(exportQueryString(query, "grid")).toBe("?sort=size&channel=youtube&status=failed&view=grid&page=2");
    expect(parseExportQuery(new URLSearchParams("channel=../../x&status=nope&project=<script>"))).toMatchObject({ channel: "", status: "", project: "" });
  });
});

describe("activité", () => {
  it("compte exports et publications par jour sur trente jours", () => {
    const result = activity([NOW, NOW - DAY, NOW - 10 * DAY, NOW - 40 * DAY], [NOW - 2 * DAY], NOW);
    expect(result.days).toHaveLength(30);
    expect(result.days.at(-1)).toMatchObject({ exports: 1 });
    expect(result.days.reduce((sum, day) => sum + day.exports, 0)).toBe(3);
    expect(result).toMatchObject({ exportsWeek: 2, exportsMonth: 3, publicationsWeek: 1, publicationsMonth: 1 });
  });
});
