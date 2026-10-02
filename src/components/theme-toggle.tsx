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
import { Check, Monitor, Moon, Sun } from "lucide-react";

type ThemeToggleProps = Pick<
  React.ComponentProps<typeof Button>,
  "variant" | "size" | "className"
>;

const THEME_OPTIONS = [
  { value: "light", label: "Clair", icon: Sun },
  { value: "dark", label: "Sombre", icon: Moon },
  { value: "system", label: "Système", icon: Monitor },
] as const;

/** Icône du réglage de thème en cours. */
export function useThemeIcon() {
  const { themePreference } = useTheme();
  return THEME_OPTIONS.find((option) => option.value === themePreference)?.icon ?? Sun;
}

/**
 * Les modes d'affichage, à poser dans n'importe quel menu déroulant : le
 * bouton de thème et le menu du compte montrent les mêmes, avec le choix en
 * cours coché. Le choix vaut pour ce navigateur ; les couleurs, elles, sont
 * celles du site pour tout le monde.
 */
export function ThemeOptions() {
  const { themePreference, setThemePreference } = useTheme();

  return (
    <>
      {THEME_OPTIONS.map((option) => (
        <DropdownMenuItem
          key={option.value}
          // Le clic donne le point de départ de la révélation circulaire.
          onClick={(event) =>
            setThemePreference(option.value, {
              x: event.clientX,
              y: event.clientY,
            })
          }
        >
          <option.icon className="mr-2 h-4 w-4" />
          {option.label}
          {themePreference === option.value ? (
            <Check className="ml-auto h-4 w-4" />
          ) : null}
        </DropdownMenuItem>
      ))}
    </>
  );
}

export function ThemeToggle({
  variant = "ghost",
  size = "icon",
  className,
}: ThemeToggleProps) {
  const isMobile = useIsMobile();
  const Icon = useThemeIcon();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size={size} className={className}>
          <Icon className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all" />
          <span className="sr-only">Changer le thème</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side={isMobile ? "bottom" : "right"} align="end">
        <ThemeOptions />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
