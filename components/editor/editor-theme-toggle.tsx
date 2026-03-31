"use client";

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

export function EditorThemeToggle({
  variant = "ghost",
  size = "icon",
  className,
}: Pick<React.ComponentProps<typeof Button>, "variant" | "size" | "className">) {
  const [themeState] = useAtom(themeEditorStateAtom);
  const [, setThemeState] = useAtom(setThemeStateAtom);
  const [timeBasedTheme] = useAtom(timeBasedThemeAtom);
  const [, setPreferredThemeMode] = useAtom(preferredThemeModeAtom);
  const isMobile = useIsMobile();

  useTimeBasedTheme();

  const themeIcons = {
    light: Sun,
    dark: Moon,
    system: Monitor,
    "time-based": Clock,
  };

  const Icon = themeIcons[themeState.currentMode as keyof typeof themeIcons] || Sun;
  const { dayStartHour, dayEndHour } = timeBasedTheme;

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

  const handleThemeChange = (newTheme: ThemeMode, event?: React.MouseEvent) => {
    setPreferredThemeMode(newTheme);

    if (newTheme === "light") {
      const coords = event ? { x: event.clientX, y: event.clientY } : undefined;
      applyThemeWithAnimation("light", coords);
    } else if (newTheme === "dark") {
      const coords = event ? { x: event.clientX, y: event.clientY } : undefined;
      applyThemeWithAnimation("dark", coords);
    } else if (newTheme === "system") {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      const coords = event ? { x: event.clientX, y: event.clientY } : undefined;
      applyThemeWithAnimation(prefersDark ? "dark" : "light", coords);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size={size} className={className}>
          <Icon className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all" />
          <span className="sr-only">Changer le thème</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side={isMobile ? "bottom" : "right"} align="end">
        <DropdownMenuItem onClick={(event) => handleThemeChange("light", event)}>
          <Sun className="mr-2 h-4 w-4" />
          Clair
        </DropdownMenuItem>
        <DropdownMenuItem onClick={(event) => handleThemeChange("dark", event)}>
          <Moon className="mr-2 h-4 w-4" />
          Sombre
        </DropdownMenuItem>
        <DropdownMenuItem onClick={(event) => handleThemeChange("system", event)}>
          <Monitor className="mr-2 h-4 w-4" />
          Système
        </DropdownMenuItem>
        <DropdownMenuItem onClick={(event) => handleThemeChange("time-based", event)}>
          <Clock className="mr-2 h-4 w-4" />
          Automatique ({dayStartHour}h-{dayEndHour}h)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
