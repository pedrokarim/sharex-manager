"use client";

import { useTheme } from "@/components/theme-provider";
import { useAtom } from "jotai";
import {
  timeBasedThemeAtom,
  preferredThemeModeAtom,
  type ThemeMode,
} from "@/lib/atoms/preferences";
import { themeEditorStateAtom, setThemeStateAtom } from "@/lib/atoms/editor";
import { useTimeBasedTheme } from "@/hooks/use-time-based-theme";
import { Moon, Sun, Monitor, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useIsMobile } from "@/hooks/use-mobile";

export function ThemeToggle() {
  const { toggleTheme } = useTheme();
  const [themeState] = useAtom(themeEditorStateAtom);
  const [, setThemeState] = useAtom(setThemeStateAtom);
  const [timeBasedTheme] = useAtom(timeBasedThemeAtom);
  const [preferredThemeMode, setPreferredThemeMode] = useAtom(
    preferredThemeModeAtom
  );
  const isMobile = useIsMobile();
  // Utiliser le hook pour activer le thème basé sur le temps
  useTimeBasedTheme();

  const themeIcons = {
    light: Sun,
    dark: Moon,
    system: Monitor,
    "time-based": Clock,
  };

  // Utiliser le mode actuel du thème pour l'icône
  const Icon = themeIcons[themeState.currentMode as keyof typeof themeIcons] || Sun;
  const { dayStartHour, dayEndHour } = timeBasedTheme;

  // Fonction pour gérer le changement de thème
  const handleThemeChange = (newTheme: ThemeMode) => {
    setPreferredThemeMode(newTheme);

    // Changer le mode selon la sélection
    if (newTheme === "light") {
      setThemeState({ ...themeState, currentMode: "light" });
    } else if (newTheme === "dark") {
      setThemeState({ ...themeState, currentMode: "dark" });
    } else if (newTheme === "system") {
      // Pour system, détecter les préférences système
      const prefersDark = window.matchMedia(
        "(prefers-color-scheme: dark)"
      ).matches;
      setThemeState({ ...themeState, currentMode: prefersDark ? "dark" : "light" });
    }
    // time-based est géré automatiquement par useTimeBasedTheme
  };

  // Toggle simple entre light et dark avec animation
  const handleToggle = (event: React.MouseEvent<HTMLButtonElement>) => {
    const { clientX: x, clientY: y } = event;
    toggleTheme({ x, y });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" onClick={handleToggle}>
          <Icon className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all" />
          <span className="sr-only">Changer le thème</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side={isMobile ? "bottom" : "right"} align="end">
        <DropdownMenuItem onClick={() => handleThemeChange("light")}>
          <Sun className="mr-2 h-4 w-4" />
          Clair
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleThemeChange("dark")}>
          <Moon className="mr-2 h-4 w-4" />
          Sombre
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleThemeChange("system")}>
          <Monitor className="mr-2 h-4 w-4" />
          Système
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleThemeChange("time-based")}>
          <Clock className="mr-2 h-4 w-4" />
          Automatique ({dayStartHour}h-{dayEndHour}h)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
