"use client";

import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useIsMobile } from "@/hooks/use-mobile";
import { Clock, Monitor, Moon, Sun } from "lucide-react";

type ThemeToggleProps = Pick<
  React.ComponentProps<typeof Button>,
  "variant" | "size" | "className"
>;

export function ThemeToggle({
  variant = "ghost",
  size = "icon",
  className,
}: ThemeToggleProps) {
  const { themePreference, setThemePreference, timeWindow } = useTheme();
  const isMobile = useIsMobile();

  const themeIcons = {
    light: Sun,
    dark: Moon,
    system: Monitor,
    "time-based": Clock,
  };

  const Icon = themeIcons[themePreference] || Sun;

  const handleThemeChange = (
    preference: "light" | "dark" | "system" | "time-based",
    event?: React.MouseEvent
  ) => {
    const coords = event ? { x: event.clientX, y: event.clientY } : undefined;
    setThemePreference(preference, coords);
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
          Automatique ({timeWindow.dayStartHour}h-{timeWindow.dayEndHour}h)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
