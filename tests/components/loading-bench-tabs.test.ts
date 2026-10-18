import { describe, expect, test } from "vitest";
import { BENCH_TABS, resolveBenchTab } from "@/app/(app)/loading-bench/tabs";

/** L'onglet du banc des chargements se lit dans `?tab=` ; une valeur inconnue rouvre le premier. */
describe("onglets du banc des chargements", () => {
  test("les quatre onglets, dans l'ordre", () => {
    expect(BENCH_TABS.map((tab) => tab.label)).toEqual(["Indicateurs", "Textes et statuts", "Retours d’action", "Squelettes de pages"]);
  });

  test.each(BENCH_TABS.map((tab) => tab.id))("?tab=%s rouvre cet onglet", (id) => {
    expect(resolveBenchTab(id)).toBe(id);
  });

  test.each([null, undefined, "", "inconnu"])("%s rouvre le premier onglet", (param) => {
    expect(resolveBenchTab(param)).toBe("indicators");
  });
});
