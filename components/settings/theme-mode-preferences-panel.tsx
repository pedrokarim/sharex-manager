"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { TimePicker } from "@/components/ui/time-picker";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTheme } from "@/components/theme-provider";
import { isDeepEqual } from "@/lib/utils";
import type { UserThemeMode } from "@/types/theme-runtime";
import { Clock3, Palette, Save } from "lucide-react";
import { toast } from "sonner";

type ThemeModeFormState = {
  modeOverride: UserThemeMode;
  dayStartHour: number;
  dayEndHour: number;
};

const personalModeOptions: Array<{
  value: Exclude<UserThemeMode, "inherit">;
  label: string;
  description: string;
}> = [
  {
    value: "light",
    label: "Clair",
    description: "Force l’interface en light pour votre compte.",
  },
  {
    value: "dark",
    label: "Sombre",
    description: "Force l’interface en dark pour votre compte.",
  },
  {
    value: "system",
    label: "Système",
    description: "Suit la préférence du device uniquement pour vous.",
  },
  {
    value: "time-based",
    label: "Automatique",
    description: "Bascule entre light et dark selon votre plage horaire.",
  },
];

const globalModeLabelMap: Record<string, string> = {
  light: "Clair",
  dark: "Sombre",
  system: "Système",
};

function buildFormState(
  modeOverride: UserThemeMode,
  dayStartHour: number,
  dayEndHour: number,
): ThemeModeFormState {
  return { modeOverride, dayStartHour, dayEndHour };
}

export function ThemeModePreferencesPanel({
  showThemeEditorShortcut = true,
}: {
  showThemeEditorShortcut?: boolean;
}) {
  const router = useRouter();
  const { resolvedTheme, replaceResolvedTheme } = useTheme();
  const lastNonInheritMode = useRef<Exclude<UserThemeMode, "inherit">>("system");

  const [formState, setFormState] = useState<ThemeModeFormState>(() =>
    buildFormState(
      resolvedTheme.userPreferences?.modeOverride ?? "inherit",
      resolvedTheme.userPreferences?.dayStartHour ?? 7,
      resolvedTheme.userPreferences?.dayEndHour ?? 19,
    ),
  );
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const mode = resolvedTheme.userPreferences?.modeOverride ?? "inherit";
    setFormState(
      buildFormState(
        mode,
        resolvedTheme.userPreferences?.dayStartHour ?? 7,
        resolvedTheme.userPreferences?.dayEndHour ?? 19,
      ),
    );
    if (mode !== "inherit") {
      lastNonInheritMode.current = mode;
    }
  }, [resolvedTheme]);

  useEffect(() => {
    if (formState.modeOverride !== "inherit") {
      lastNonInheritMode.current = formState.modeOverride;
    }
  }, [formState.modeOverride]);

  const initialState = useMemo(
    () =>
      buildFormState(
        resolvedTheme.userPreferences?.modeOverride ?? "inherit",
        resolvedTheme.userPreferences?.dayStartHour ?? 7,
        resolvedTheme.userPreferences?.dayEndHour ?? 19,
      ),
    [resolvedTheme],
  );
  const hasChanges = !isDeepEqual(formState, initialState);
  const isPersonalMode = formState.modeOverride !== "inherit";

  const globalModeLabel =
    globalModeLabelMap[resolvedTheme.globalTheme.mode] ??
    resolvedTheme.globalTheme.mode;

  const handleTogglePersonalMode = (enabled: boolean) => {
    setFormState((current) => ({
      ...current,
      modeOverride: enabled ? lastNonInheritMode.current : "inherit",
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);

    try {
      const response = await fetch("/api/settings/theme", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formState,
          overrideEnabled: formState.modeOverride !== "inherit",
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Impossible d’enregistrer la priorité du thème",
        );
      }

      replaceResolvedTheme(data.payload);
      toast.success(
        isPersonalMode
          ? "Votre mode personnel a été enregistré."
          : "Votre compte suit de nouveau le thème du site.",
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Erreur lors de l’enregistrement",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-5">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-background px-4 py-2.5 sm:justify-start">
            <Label htmlFor="personal-mode-toggle" className="text-sm font-medium whitespace-nowrap">
              Mode personnel
            </Label>
            <Switch
              id="personal-mode-toggle"
              checked={isPersonalMode}
              onCheckedChange={handleTogglePersonalMode}
            />
          </div>

          {isPersonalMode && (
            <TooltipProvider delayDuration={300}>
              <div className="flex flex-wrap gap-1.5">
                {personalModeOptions.map((option) => (
                  <Tooltip key={option.value}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() =>
                          setFormState((current) => ({
                            ...current,
                            modeOverride: option.value,
                          }))
                        }
                        className={`rounded-xl border px-3 py-1.5 text-sm transition-colors ${
                          formState.modeOverride === option.value
                            ? "border-primary bg-primary/10 font-medium"
                            : "border-border/60 bg-background hover:bg-muted/40"
                        }`}
                      >
                        {option.label}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{option.description}</p>
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>
            </TooltipProvider>
          )}

          {!isPersonalMode && (
            <p className="text-sm text-muted-foreground">
              Suit le mode du site ({globalModeLabel})
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {showThemeEditorShortcut && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push("/settings/theme")}
            >
              Ouvrir l’atelier
            </Button>
          )}
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!hasChanges || isSaving}
          >
            <Save className="mr-2 h-3.5 w-3.5" />
            {isSaving ? "..." : "Enregistrer"}
          </Button>
        </div>
      </div>

      {isPersonalMode && formState.modeOverride === "time-based" && (
        <div className="mt-4 flex flex-col gap-3 border-t border-border/60 pt-4 sm:flex-row sm:items-end sm:gap-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock3 className="h-4 w-4 shrink-0" />
            <span>Plage horaire :</span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:flex sm:gap-3">
            <TimePicker
              label="Début"
              value={`${formState.dayStartHour.toString().padStart(2, "0")}:00`}
              onChange={(value) => {
                const [hours] = value.split(":").map(Number);
                setFormState((current) => ({
                  ...current,
                  dayStartHour: hours,
                }));
              }}
              format="24h"
            />
            <TimePicker
              label="Fin"
              value={`${formState.dayEndHour.toString().padStart(2, "0")}:00`}
              onChange={(value) => {
                const [hours] = value.split(":").map(Number);
                setFormState((current) => ({ ...current, dayEndHour: hours }));
              }}
              format="24h"
            />
          </div>
        </div>
      )}
    </div>
  );
}
