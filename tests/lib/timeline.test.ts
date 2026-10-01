import { describe, expect, it } from "vitest";
import {
  buildRail,
  formatMonthKey,
  indexAtY,
  monthAtIndex,
  monthKeyOf,
  summarizeMonths,
  yAtIndex,
  yearLabels,
  type TimelineMonth,
} from "@/lib/timeline";

describe("frise : mois", () => {
  it("range une date dans le mois du fuseau du navigateur", () => {
    // 31 août 22 h UTC : déjà le 1er septembre à La Réunion (UTC+4, décalage -240).
    expect(monthKeyOf("2026-08-31T22:00:00Z")).toBe("2026-08");
    expect(monthKeyOf("2026-08-31T22:00:00Z", -240)).toBe("2026-09");
  });

  it("donne une clé neutre à une date illisible", () => {
    expect(monthKeyOf("pas une date")).toBe("0000-00");
    expect(formatMonthKey("0000-00")).toBe("");
  });

  it("regroupe des dates triées en mois consécutifs", () => {
    expect(
      summarizeMonths(["2026-09-12T10:00:00Z", "2026-09-02T10:00:00Z", "2026-07-30T10:00:00Z", "2016-07-01T10:00:00Z"])
    ).toEqual([
      { key: "2026-09", count: 2 },
      { key: "2026-07", count: 1 },
      { key: "2016-07", count: 1 },
    ]);
  });

  it("nomme un mois dans la langue demandée", () => {
    expect(formatMonthKey("2016-07", "short", "fr")).toBe("juil. 2016");
    expect(formatMonthKey("2016-07", "long", "fr")).toBe("juillet 2016");
    expect(formatMonthKey("2016-07", "long", "en")).toBe("July 2016");
  });
});

describe("frise : rail", () => {
  const months: TimelineMonth[] = [
    { key: "2026-09", count: 94 },
    { key: "2026-08", count: 14 },
    { key: "2016-07", count: 4 },
    { key: "1971-01", count: 1 },
  ];

  it("occupe toute la hauteur, proportionnellement au contenu", () => {
    const layout = buildRail(months, 500, 0);
    expect(layout.total).toBe(113);
    expect(layout.segments[0].top).toBe(0);
    expect(layout.segments.at(-1)!.bottom).toBeCloseTo(500);
    // Dix ans de vide entre 2026 et 2016 ne prennent aucune place.
    expect(layout.segments[2].top).toBeCloseTo(layout.segments[1].bottom);
    expect(layout.segments[0].bottom - layout.segments[0].top).toBeCloseTo((94 / 113) * 500);
  });

  it("laisse une part fixe au mois d'une seule image", () => {
    const layout = buildRail(months, 500);
    const last = layout.segments.at(-1)!;
    expect(last.bottom - last.top).toBeGreaterThan(20);
  });

  it("retrouve le fichier visé par une hauteur, et réciproquement", () => {
    const layout = buildRail(months, 500);
    expect(indexAtY(layout, 0)).toMatchObject({ index: 0, month: { key: "2026-09" } });
    expect(indexAtY(layout, 9999)).toMatchObject({ index: 112, month: { key: "1971-01" } });
    expect(indexAtY(layout, -50)!.index).toBe(0);
    for (const index of [0, 50, 94, 107, 108, 112]) {
      expect(indexAtY(layout, yAtIndex(layout, index) + 0.01)!.index).toBe(index);
    }
    expect(monthAtIndex(layout, 94)!.key).toBe("2026-08");
    expect(monthAtIndex(layout, 108)!.key).toBe("2016-07");
  });

  it("ne dit rien d'une galerie vide", () => {
    const layout = buildRail([], 500);
    expect(indexAtY(layout, 10)).toBeNull();
    expect(yAtIndex(layout, 3)).toBe(0);
    expect(yearLabels(layout)).toEqual([]);
  });

  it("étage les années serrées sans les faire se chevaucher ni sortir du rail", () => {
    const layout = buildRail(
      [
        { key: "2026-09", count: 400 },
        { key: "2016-07", count: 2 },
        { key: "2015-03", count: 1 },
        { key: "2014-01", count: 1 },
        { key: "1971-01", count: 1 },
      ],
      400
    );
    const labels = yearLabels(layout, 18);
    expect(labels.map((label) => label.year)).toEqual([2026, 2016, 2015, 2014, 1971]);
    for (let index = 1; index < labels.length; index++) {
      expect(labels[index].labelY - labels[index - 1].labelY).toBeGreaterThanOrEqual(18 - 1e-6);
    }
    expect(labels.at(-1)!.labelY).toBeLessThanOrEqual(400);
    expect(labels[0].labelY).toBeGreaterThanOrEqual(0);
  });

  it("n'affiche qu'une partie des années quand elles ne tiennent pas", () => {
    const many = Array.from({ length: 40 }, (_, index) => ({ key: `${2026 - index}-01`, count: 1 }));
    const labels = yearLabels(buildRail(many, 180), 18);
    expect(labels.length).toBeLessThanOrEqual(10);
    expect(labels[0].year).toBe(2026);
    for (let index = 1; index < labels.length; index++) {
      expect(labels[index].labelY - labels[index - 1].labelY).toBeGreaterThanOrEqual(18 - 1e-6);
    }
  });
});
