import { useQueryState } from "nuqs";
import React from "react";
import { useAtom } from "jotai";
import { applyThemePresetAtom } from "@/lib/atoms/editor";

export const useThemePresetFromUrl = () => {
  const [preset, setPreset] = useQueryState("theme");
  const [, applyThemePreset] = useAtom(applyThemePresetAtom);

  // Apply theme preset if it exists in URL and remove it
  React.useEffect(() => {
    if (preset) {
      applyThemePreset(preset);
      setPreset(null); // Remove the preset from URL
    }
  }, [preset, setPreset, applyThemePreset]);
};
