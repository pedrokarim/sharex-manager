/** Onglets du banc des chargements, dans l'ordre d'affichage. */
export const BENCH_TABS = [
  { id: "indicators", label: "Indicateurs" },
  { id: "texts", label: "Textes et statuts" },
  { id: "feedback", label: "Retours d’action" },
  { id: "skeletons", label: "Squelettes de pages" },
] as const;

export type BenchTabId = (typeof BENCH_TABS)[number]["id"];

/** L'onglet demandé par `?tab=`, ou le premier quand le paramètre manque ou n'existe pas. */
export function resolveBenchTab(param: string | null | undefined): BenchTabId {
  return BENCH_TABS.find((tab) => tab.id === param)?.id ?? BENCH_TABS[0].id;
}
