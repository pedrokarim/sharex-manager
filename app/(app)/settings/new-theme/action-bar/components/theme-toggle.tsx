"use client";

import { Button } from "@/components/ui/button";
import { TooltipWrapper } from "@/components/tooltip-wrapper";
import { useNewThemeStore } from "@/store/new-theme-store";
import { Moon, Sun } from "lucide-react";

export function ThemeToggle() {
  const { themeState, setCurrentMode } = useNewThemeStore();
  const isDark = themeState.currentMode === "dark";

  const toggleTheme = () => {
    setCurrentMode(isDark ? "light" : "dark");
  };

  return (
    <TooltipWrapper label={`Switch to ${isDark ? "light" : "dark"} mode`}>
      <Button
        variant="ghost"
        size="icon"
        onClick={toggleTheme}
        className="group size-8 hover:[&>svg]:scale-120 hover:[&>svg]:transition-all"
      >
        {isDark ? (
          <Sun className="h-4 w-4" />
        ) : (
          <Moon className="h-4 w-4" />
        )}
      </Button>
    </TooltipWrapper>
  );
}
