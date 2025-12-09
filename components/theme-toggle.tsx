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
  const Icon =
    themeIcons[themeState.currentMode as keyof typeof themeIcons] || Sun;
  const { dayStartHour, dayEndHour } = timeBasedTheme;

  // Fonction pour appliquer un thème avec animation
  const applyThemeWithAnimation = (
    newMode: "light" | "dark",
    coords?: { x: number; y: number }
  ) => {
    const root = document.documentElement;
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    if (!document.startViewTransition || prefersReducedMotion) {
      setThemeState({ ...themeState, currentMode: newMode });
      return;
    }

    if (coords) {
      root.style.setProperty("--x", `${coords.x}px`);
      root.style.setProperty("--y", `${coords.y}px`);
    }

    document.startViewTransition(() => {
      setThemeState({ ...themeState, currentMode: newMode });
    });
  };

  // Fonction pour gérer le changement de thème
  const handleThemeChange = (newTheme: ThemeMode, event?: React.MouseEvent) => {
    setPreferredThemeMode(newTheme);

    // Changer le mode selon la sélection
    if (newTheme === "light") {
      const coords = event ? { x: event.clientX, y: event.clientY } : undefined;
      applyThemeWithAnimation("light", coords);
    } else if (newTheme === "dark") {
      const coords = event ? { x: event.clientX, y: event.clientY } : undefined;
      applyThemeWithAnimation("dark", coords);
    } else if (newTheme === "system") {
      // Pour system, détecter les préférences système
      const prefersDark = window.matchMedia(
        "(prefers-color-scheme: dark)"
      ).matches;
      const coords = event ? { x: event.clientX, y: event.clientY } : undefined;
      applyThemeWithAnimation(prefersDark ? "dark" : "light", coords);
    }
    // time-based est géré automatiquement par useTimeBasedTheme
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
        <DropdownMenuItem onClick={(e) => handleThemeChange("light", e)}>
          <Sun className="mr-2 h-4 w-4" />
          Clair
        </DropdownMenuItem>
        <DropdownMenuItem onClick={(e) => handleThemeChange("dark", e)}>
          <Moon className="mr-2 h-4 w-4" />
          Sombre
        </DropdownMenuItem>
        <DropdownMenuItem onClick={(e) => handleThemeChange("system", e)}>
          <Monitor className="mr-2 h-4 w-4" />
          Système
        </DropdownMenuItem>
        <DropdownMenuItem onClick={(e) => handleThemeChange("time-based", e)}>
          <Clock className="mr-2 h-4 w-4" />
          Automatique ({dayStartHour}h-{dayEndHour}h)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
