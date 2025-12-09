"use client";

import { useEffect, useState } from "react";
import { useAtom } from "jotai";
import {
  timeBasedThemeAtom,
  preferredThemeModeAtom,
} from "@/lib/atoms/preferences";
import { themeEditorStateAtom, setThemeStateAtom } from "@/lib/atoms/editor";

export function useTimeBasedTheme() {
  const [timeBasedTheme] = useAtom(timeBasedThemeAtom);
  const [preferredThemeMode] = useAtom(preferredThemeModeAtom);
  const [themeState] = useAtom(themeEditorStateAtom);
  const [, setThemeState] = useAtom(setThemeStateAtom);
  const [currentHour, setCurrentHour] = useState(() => new Date().getHours());

  useEffect(() => {
    // Mettre à jour l'heure toutes les minutes
    const interval = setInterval(() => {
      setCurrentHour(new Date().getHours());
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // N'appliquer le thème basé sur le temps que si le mode préféré est "time-based"
    if (preferredThemeMode === "time-based") {
      const { dayStartHour, dayEndHour } = timeBasedTheme;
      const isDayTime = currentHour >= dayStartHour && currentHour < dayEndHour;
      const newMode = isDayTime ? "light" : "dark";

      // Ne changer que si le mode actuel est différent
      if (themeState.currentMode !== newMode) {
        setThemeState({ ...themeState, currentMode: newMode });
      }
    }
  }, [
    currentHour,
    timeBasedTheme,
    setThemeState,
    preferredThemeMode,
    themeState,
  ]);

  return {
    currentHour,
    timeBasedTheme,
    preferredThemeMode,
  };
}
