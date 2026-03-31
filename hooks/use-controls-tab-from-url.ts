import { useQueryState } from "nuqs";

export type ControlTab = "colors" | "typography" | "other" | "ai";

export function useControlsTabFromUrl() {
  const [tab, setTab] = useQueryState("tab", {
    defaultValue: "colors" as ControlTab,
  });

  const handleSetTab = (newTab: ControlTab) => {
    setTab(newTab);
  };

  return {
    tab: tab as ControlTab,
    handleSetTab,
  };
}
