"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { useAtom } from "jotai";
import {
  timeBasedThemeAtom,
  preferredThemeModeAtom,
} from "@/lib/atoms/preferences";

export function useTimeBasedTheme() {
  const { setTheme } = useTheme();
  const [timeBasedTheme] = useAtom(timeBasedThemeAtom);
  const [preferredThemeMode] = useAtom(preferredThemeModeAtom);
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
      setTheme(isDayTime ? "light" : "dark");
    }
  }, [currentHour, timeBasedTheme, setTheme, preferredThemeMode]);
}
