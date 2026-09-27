"use client";

import { useEffect, useState } from "react";
import { useAtom } from "jotai";
import { useTheme } from "@/components/theme-provider";
import { themeEditorStateAtom, setThemeStateAtom } from "@/lib/atoms/editor";
import { Moon, Sun, Monitor, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useIsMobile } from "@/hooks/use-mobile";

type PreviewThemeMode = "light" | "dark" | "system" | "time-based";

export function EditorThemeToggle({
  variant = "ghost",
  size = "icon",
  className,
}: Pick<React.ComponentProps<typeof Button>, "variant" | "size" | "className">) {
  const [themeState] = useAtom(themeEditorStateAtom);
  const [, setThemeState] = useAtom(setThemeStateAtom);
  const { timeWindow } = useTheme();
  const isMobile = useIsMobile();
  const [previewMode, setPreviewMode] = useState<PreviewThemeMode>(
    themeState.currentMode,
  );

  useEffect(() => {
    setPreviewMode((current) =>
      current === "light" || current === "dark"
        ? themeState.currentMode
        : current,
    );
  }, [themeState.currentMode]);

  const themeIcons = {
    light: Sun,
    dark: Moon,
    system: Monitor,
    "time-based": Clock,
  };

  const Icon = themeIcons[previewMode] || Sun;
  const { dayStartHour, dayEndHour } = timeWindow;

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

  const resolvePreviewMode = (mode: PreviewThemeMode) => {
    if (mode === "light" || mode === "dark") {
      return mode;
    }

    if (mode === "system") {
      return window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    }

    const currentHour = new Date().getHours();
    const isDayTime =
      currentHour >= dayStartHour && currentHour < dayEndHour;
    return isDayTime ? "light" : "dark";
  };

  const handleThemeChange = (
    newTheme: PreviewThemeMode,
    event?: React.MouseEvent,
  ) => {
    const coords = event ? { x: event.clientX, y: event.clientY } : undefined;
    setPreviewMode(newTheme);
    applyThemeWithAnimation(resolvePreviewMode(newTheme), coords);
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
