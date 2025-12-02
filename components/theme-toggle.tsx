"use client";

import { useTheme } from "@/components/theme-provider";
import { useAtom } from "jotai";
import {
  timeBasedThemeAtom,
  preferredThemeModeAtom,
  type ThemeMode,
} from "@/lib/atoms/preferences";
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
  const { theme, setTheme, toggleTheme } = useTheme();
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

  // Pour l'instant, simplifier et utiliser le thème actuel pour l'icône
  const Icon = themeIcons[theme as keyof typeof themeIcons] || Sun;
  const { dayStartHour, dayEndHour } = timeBasedTheme;

  // Fonction pour gérer le changement de thème
  const handleThemeChange = (newTheme: ThemeMode) => {
    setPreferredThemeMode(newTheme);

    // Pour l'instant, simplifier : si c'est light ou dark, utiliser setTheme
    if (newTheme === "light") {
      setTheme("light");
    } else if (newTheme === "dark") {
      setTheme("dark");
    } else if (newTheme === "system") {
      // Pour system, on pourrait détecter les préférences système
      const prefersDark = window.matchMedia(
        "(prefers-color-scheme: dark)"
      ).matches;
      setTheme(prefersDark ? "dark" : "light");
    }
    // time-based peut être géré plus tard
  };

  // Aussi permettre le toggle simple avec clic sur le bouton principal
  const handleToggle = () => {
    toggleTheme();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon">
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
