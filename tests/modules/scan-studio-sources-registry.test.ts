import { describe, expect, it } from "vitest";
import { SOURCE_ERROR_LEADS, sourceErrorDetail, sourceErrorKindOf } from "@/modules/scan-studio/lib/library-helpers";
import { SourceError, type SourceAdapter } from "@/modules/scan-studio/lib/server/sources/adapter";
import { ADAPTERS, detect, getAdapter, normalizeLink } from "@/modules/scan-studio/lib/server/sources/registry";

const CHAPTER = "https://mangadex.org/chapter/33ea9f97-cb60-4e8c-9b47-8f6ecf9a50af";

/** Le cas d'erreur d'une reconnaissance refusée. */
function kindOf(link: unknown, adapters?: SourceAdapter[]) {
  try {
    detect(link, adapters);
  } catch (error) {
    return error instanceof SourceError ? error.kind : `autre : ${(error as Error).message}`;
  }
  return "accepté";
}

describe("reconnaissance d'un lien", () => {
  it("reconnaît un lien de chapitre MangaDex", () => {
    const { adapter, url } = detect(CHAPTER);
    expect(adapter.id).toBe("mangadex");
    expect(url.toString()).toBe(CHAPTER);
  });

  it("accepte les espaces autour, le www, la casse du domaine et le numéro de page du lecteur", () => {
    expect(detect(`  ${CHAPTER}\n`).adapter.id).toBe("mangadex");
    expect(detect("https://WWW.MangaDex.org/chapter/33ea9f97-cb60-4e8c-9b47-8f6ecf9a50af/4").adapter.id).toBe("mangadex");
  });

  it("retire les paramètres de suivi et garde les autres", () => {
    const { url } = detect(`${CHAPTER}?utm_source=discord&utm_medium=social&fbclid=abc&tab=art&ref=home`);
    expect(url.toString()).toBe(`${CHAPTER}?tab=art`);
  });

  it("dit « site non géré » quand aucun adaptateur ne connaît le domaine", () => {
    expect(kindOf("https://example.com/chapter/33ea9f97-cb60-4e8c-9b47-8f6ecf9a50af")).toBe("unsupported");
    // Un domaine qui ressemble à celui d'un site géré n'est pas ce site.
    expect(kindOf("https://mangadex.org.example.com/chapter/33ea9f97-cb60-4e8c-9b47-8f6ecf9a50af")).toBe("unsupported");
    expect(kindOf("https://api.mangadex.org/chapter/33ea9f97-cb60-4e8c-9b47-8f6ecf9a50af")).toBe("unsupported");
  });

  it("dit « pas un chapitre » quand le site est connu mais que le lien désigne autre chose", () => {
    expect(kindOf("https://mangadex.org/")).toBe("not-a-chapter");
    expect(kindOf("https://mangadex.org/title/58bc83a0-1808-484e-88b9-17e167469e23/une-serie")).toBe("not-a-chapter");
    expect(kindOf("https://mangadex.org/chapter/pas-un-identifiant")).toBe("not-a-chapter");
  });

  it("refuse ce qui n'est pas un lien, sans en faire un cas de source", () => {
    for (const link of ["", "   ", "mangadex chapitre 75", "mangadex.org/chapter/x", "ftp://mangadex.org/chapter/x", "javascript:alert(1)", "https://user:secret@mangadex.org/chapter/x", "https://localhost/chapter/x", null, 42, `https://mangadex.org/${"a".repeat(3000)}`]) {
      expect(() => normalizeLink(link), String(link)).toThrow(/Lien invalide/);
      expect(kindOf(link)).toMatch(/^autre : Lien invalide/);
    }
  });

  it("n'appelle `match` que pour l'adaptateur du domaine", () => {
    const calls: string[] = [];
    const fake = (id: string, host: string, accepts: boolean): SourceAdapter => ({
      id,
      name: id,
      homepage: `https://${host}/`,
      hosts: [host],
      example: `https://${host}/c/1`,
      match: () => {
        calls.push(id);
        return accepts;
      },
      resolve: async () => ({ info: { pageCount: 0 }, pages: [] }),
    });
    const adapters = [fake("one", "one.example.org", true), fake("two", "two.example.org", false)];
    expect(detect("https://one.example.org/c/9", adapters).adapter.id).toBe("one");
    expect(kindOf("https://two.example.org/c/9", adapters)).toBe("not-a-chapter");
    expect(calls).toEqual(["one", "two"]);
  });
});

describe("registre", () => {
  it("retrouve un adaptateur par son identifiant", () => {
    expect(getAdapter("mangadex")?.name).toBe("MangaDex");
    expect(getAdapter("inconnu")).toBeUndefined();
    expect(getAdapter(undefined)).toBeUndefined();
  });

  it("chaque adaptateur a un identifiant unique, un exemple qu'il reconnaît et des domaines en minuscules", () => {
    expect(new Set(ADAPTERS.map((adapter) => adapter.id)).size).toBe(ADAPTERS.length);
    for (const adapter of ADAPTERS) {
      expect(adapter.id).toMatch(/^[a-z0-9-]+$/);
      expect(detect(adapter.example).adapter).toBe(adapter);
      expect(adapter.hosts.length).toBeGreaterThan(0);
      for (const host of adapter.hosts) expect(host).toBe(host.toLowerCase());
      expect(adapter.hosts).toContain(new URL(adapter.homepage).hostname);
    }
  });
});

describe("messages d'erreur", () => {
  it("un message de source commence par la phrase de son cas, que l'interface reconnaît", () => {
    for (const kind of Object.keys(SOURCE_ERROR_LEADS) as (keyof typeof SOURCE_ERROR_LEADS)[]) {
      const error = new SourceError(kind, "Le détail.");
      expect(error.kind).toBe(kind);
      expect(sourceErrorKindOf(error.message)).toBe(kind);
      expect(sourceErrorDetail(error.message)).toBe("Le détail.");
    }
    // Le message de la bibliothèque pour un chapitre local absent n'est pas un cas de source.
    expect(sourceErrorKindOf("Chapitre introuvable.")).toBeNull();
    expect(sourceErrorDetail("Autre chose.")).toBe("Autre chose.");
  });
});

describe("les sites gérés", () => {
  it("le registre présente MangaDex, puis les quatre sites lus par leurs pages", () => {
    expect(ADAPTERS.map((adapter) => adapter.id)).toEqual(["mangadex", "lelscanfr", "lelscans", "mushokutensei-manga", "cocomic"]);
  });

  it("chaque lien d'exemple mène à son adaptateur", () => {
    expect(detect("https://www.lelscanfr.com/manga/kumo-desu-ga-nani-ka/59.1").adapter.id).toBe("lelscanfr");
    expect(detect("https://lelscans.net/scan-one-piece/1046/17").adapter.id).toBe("lelscans");
    expect(detect("https://w7.mushokutensei-manga.com/manga/mushoku-tensei-chapter-86/").adapter.id).toBe("mushokutensei-manga");
    expect(detect("https://cocomic.co/manga/the-kingdoms-of-ruin/chapter-28/").adapter.id).toBe("cocomic");
  });

  it("une famille de sous-domaines (`*.exemple.org`) est reconnue, pas un domaine qui finit pareil", () => {
    expect(detect("https://w42.mushokutensei-manga.com/manga/mushoku-tensei-chapter-86/").adapter.id).toBe("mushokutensei-manga");
    expect(kindOf("https://w42.mushokutensei-manga.com/")).toBe("not-a-chapter");
    expect(kindOf("https://notmushokutensei-manga.com/manga/mushoku-tensei-chapter-86/")).toBe("unsupported");
    expect(kindOf("https://w7.mushokutensei-manga.com.example.org/manga/mushoku-tensei-chapter-86/")).toBe("unsupported");
  });

  it("aucun site ne déclare le domaine d'un autre, et tous disent ce qu'il faut savoir", () => {
    const hosts = ADAPTERS.flatMap((adapter) => adapter.hosts);
    expect(new Set(hosts).size).toBe(hosts.length);
    for (const adapter of ADAPTERS) {
      expect(adapter.notes, adapter.id).toBeTruthy();
      expect(new URL(adapter.homepage).protocol).toBe("https:");
    }
  });
});
