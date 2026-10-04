import { describe, expect, it } from "vitest";

import { dayKeyOf, formatDayLabel, groupByDay, packDaysIntoRows } from "@/lib/gallery-days";
import { pickGalleryHighlights } from "@/lib/gallery-highlights";

const at = (iso: string) => ({ name: `${iso}.png`, createdAt: iso });
const labels = { today: "Aujourd'hui", yesterday: "Hier" };

describe("groupByDay", () => {
  it("regroupe les éléments consécutifs d'un même jour sans rien réordonner", () => {
    const files = [
      at("2026-10-02T18:00:00"),
      at("2026-10-02T09:00:00"),
      at("2026-10-01T23:59:00"),
      at("2026-09-30T08:00:00"),
    ];
    const days = groupByDay(files, (file) => file.createdAt);

    expect(days.map((day) => day.key)).toEqual(["2026-10-02", "2026-10-01", "2026-09-30"]);
    expect(days.map((day) => day.items.length)).toEqual([2, 1, 1]);
    expect(days[0].items[0]).toBe(files[0]);
  });

  it("donne une clé neutre à une date illisible", () => {
    expect(dayKeyOf("pas une date")).toBe("0000-00-00");
  });
});

describe("formatDayLabel", () => {
  const now = new Date("2026-10-02T12:00:00");

  it("nomme aujourd'hui et hier", () => {
    expect(formatDayLabel(new Date("2026-10-02T01:00:00"), "fr", labels, now)).toBe("Aujourd'hui");
    expect(formatDayLabel(new Date("2026-10-01T23:00:00"), "fr", labels, now)).toBe("Hier");
  });

  it("n'écrit l'année que si elle diffère de l'année en cours", () => {
    expect(formatDayLabel(new Date("2026-06-25T10:00:00"), "fr", labels, now)).toBe("jeu. 25 juin");
    expect(formatDayLabel(new Date("2025-10-28T10:00:00"), "fr", labels, now)).toBe("mar. 28 octobre 2025");
  });
});

describe("packDaysIntoRows", () => {
  const day = (key: string, count: number) => ({
    key,
    date: new Date(`${key}T12:00:00`),
    items: Array.from({ length: count }, (_, index) => `${key}#${index}`),
  });

  it("fait partager une rangée à plusieurs jours, sans case vide", () => {
    const rows = packDaysIntoRows([day("2026-10-28", 1), day("2026-10-18", 1), day("2026-10-17", 2)], 4);

    expect(rows).toHaveLength(1);
    expect(rows[0].items).toHaveLength(4);
    expect(rows[0].starts.map(({ column, span }) => [column, span])).toEqual([
      [0, 1],
      [1, 1],
      [2, 2],
    ]);
  });

  it("continue un jour trop long à la rangée suivante, sans répéter son étiquette", () => {
    const rows = packDaysIntoRows([day("2026-10-05", 1), day("2026-10-04", 6), day("2026-10-03", 1)], 4);

    expect(rows.map((row) => row.items.length)).toEqual([4, 4]);
    // Rangée 1 : le 5 (1 carte) puis le 4 (3 cartes). Rangée 2 : la suite du 4, puis le 3.
    expect(rows[0].starts.map(({ day: start, column, span }) => [start.key, column, span])).toEqual([
      ["2026-10-05", 0, 1],
      ["2026-10-04", 1, 3],
    ]);
    expect(rows[1].starts.map(({ day: start, column, span }) => [start.key, column, span])).toEqual([["2026-10-03", 3, 1]]);
  });

  it("ne perd aucun élément et garde leur ordre", () => {
    const days = [day("a", 3), day("b", 7), day("c", 2)];
    const rows = packDaysIntoRows(days, 5);

    expect(rows.flatMap((row) => row.items)).toEqual(days.flatMap((entry) => entry.items));
  });

  it("supporte une grille d'une seule colonne", () => {
    const rows = packDaysIntoRows([day("a", 2), day("b", 1)], 1);

    expect(rows.map((row) => row.starts.length)).toEqual([1, 0, 1]);
  });
});

describe("pickGalleryHighlights", () => {
  const now = new Date("2026-10-02T12:00:00Z");

  it("propose un souvenir de la même période, l'année la plus proche", () => {
    const files = [
      { name: "recent.png", createdAt: "2026-10-01T10:00:00Z" },
      { name: "an-dernier.png", createdAt: "2025-10-03T10:00:00Z" },
      { name: "plus-vieux.png", createdAt: "2024-10-02T10:00:00Z" },
    ];
    const [memory] = pickGalleryHighlights(files, [], now);

    expect(memory).toMatchObject({ kind: "memory", file: "an-dernier.png", years: 1, count: 1 });
    expect(memory.href).toContain("/gallery?start=2025-09-29");
  });

  it("se rabat sur le même mois quand aucun fichier ne tombe ces jours-là", () => {
    const files = [{ name: "octobre.png", createdAt: "2024-10-25T10:00:00Z" }];
    const [month] = pickGalleryHighlights(files, [], now);

    expect(month).toMatchObject({ kind: "month", file: "octobre.png", years: 2 });
  });

  it("illustre favoris, fichiers privés et album par leur image la plus récente", () => {
    const files = [
      { name: "clip.mp4", createdAt: "2026-10-02T09:00:00Z", isStarred: true },
      { name: "favori.png", createdAt: "2026-10-01T09:00:00Z", isStarred: true },
      { name: "prive.jpg", createdAt: "2026-09-30T09:00:00Z", isSecure: true },
    ];
    const highlights = pickGalleryHighlights(files, [{ id: 7, name: "Paysages", fileCount: 3, thumbnailFile: "favori.png" }], now);

    expect(highlights.map((entry) => entry.kind)).toEqual(["starred", "secure", "album"]);
    expect(highlights[0]).toMatchObject({ file: "favori.png", count: 1, href: "/gallery/starred" });
    expect(highlights[1]).toMatchObject({ file: "prive.jpg", href: "/gallery/secure" });
    expect(highlights[2]).toMatchObject({ name: "Paysages", href: "/albums/7" });
  });

  it("ne propose rien pour une galerie vide", () => {
    expect(pickGalleryHighlights([], [], now)).toEqual([]);
  });
});
