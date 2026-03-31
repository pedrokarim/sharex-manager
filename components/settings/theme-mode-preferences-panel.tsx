"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { TimePicker } from "@/components/ui/time-picker";
import { useTheme } from "@/components/theme-provider";
import { isDeepEqual } from "@/lib/utils";
import type { UserThemeMode } from "@/types/theme-runtime";
import { Clock3, Palette, Save, Sparkles } from "lucide-react";
import { toast } from "sonner";

type ThemeModeFormState = {
  modeOverride: UserThemeMode;
  dayStartHour: number;
  dayEndHour: number;
};

const modeOptions: Array<{
  value: UserThemeMode;
  label: string;
  description: string;
}> = [
  {
    value: "inherit",
    label: "Par défaut du site",
    description:
      "Suit le mode publié globalement, sans forcer votre propre priorité.",
  },
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

function buildFormState(
  modeOverride: UserThemeMode,
  dayStartHour: number,
  dayEndHour: number,
) {
  return {
    modeOverride,
    dayStartHour,
    dayEndHour,
  };
}

export function ThemeModePreferencesPanel({
  showThemeEditorShortcut = true,
}: {
  showThemeEditorShortcut?: boolean;
}) {
  const router = useRouter();
  const { resolvedTheme, replaceResolvedTheme } = useTheme();
  const [formState, setFormState] = useState<ThemeModeFormState>(() =>
    buildFormState(
      resolvedTheme.userPreferences?.modeOverride ?? "inherit",
      resolvedTheme.userPreferences?.dayStartHour ?? 7,
      resolvedTheme.userPreferences?.dayEndHour ?? 19,
    ),
  );
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setFormState(
      buildFormState(
        resolvedTheme.userPreferences?.modeOverride ?? "inherit",
        resolvedTheme.userPreferences?.dayStartHour ?? 7,
        resolvedTheme.userPreferences?.dayEndHour ?? 19,
      ),
    );
  }, [resolvedTheme]);

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

  const globalModeLabel =
    modeOptions.find(
      (option) => option.value === resolvedTheme.globalTheme.mode,
    )?.label ?? resolvedTheme.globalTheme.mode;

  const handleSave = async () => {
    setIsSaving(true);

    try {
      const response = await fetch("/api/settings/theme", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formState),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Impossible d’enregistrer la priorité du thème",
        );
      }

      replaceResolvedTheme(data.payload);
      toast.success("La priorité de thème a été mise à jour.");
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

  const handleFollowSite = async () => {
    const nextState = buildFormState(
      "inherit",
      formState.dayStartHour,
      formState.dayEndHour,
    );

    setFormState(nextState);
    setIsSaving(true);

    try {
      const response = await fetch("/api/settings/theme", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(nextState),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Impossible de suivre le thème du site");
      }

      replaceResolvedTheme(data.payload, { animate: false });
      toast.success("Votre compte suit de nouveau la priorité du site.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Réinitialisation impossible",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-5 rounded-2xl border border-border/60 bg-muted/20 p-4 sm:p-5">
      <div className="space-y-4">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/80 px-3 py-1 text-xs font-medium text-muted-foreground">
            <Palette className="h-3.5 w-3.5" />
            Priorité utilisateur
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-semibold">Mode personnel</h3>
            <p className="text-sm text-muted-foreground">
              Le site est actuellement publié en mode{" "}
              <strong>{globalModeLabel}</strong>. Choisissez ici si votre compte
              suit cette base ou applique une priorité différente.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant={
              formState.modeOverride === "inherit" ? "secondary" : "default"
            }
          >
            {formState.modeOverride === "inherit"
              ? "Suit le site"
              : "Priorité personnelle"}
          </Badge>
          <Button
            variant="outline"
            onClick={handleFollowSite}
            className="text-sm"
          >
            Suivre le site
          </Button>
          <Button
            onClick={handleSave}
            disabled={!hasChanges || isSaving}
            className="text-sm"
          >
            <Save className="mr-2 h-4 w-4" />
            {isSaving ? "Enregistrement..." : "Enregistrer"}
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-muted-foreground" />
          <Label className="text-sm font-medium sm:text-base">
            Priorité du mode
          </Label>
        </div>
        <div className="grid gap-2 lg:grid-cols-5">
          {modeOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() =>
                setFormState((current) => ({
                  ...current,
                  modeOverride: option.value,
                }))
              }
              className={`rounded-2xl border px-4 py-3 text-left transition-colors ${
                formState.modeOverride === option.value
                  ? "border-primary bg-primary/10"
                  : "border-border/60 bg-background hover:bg-muted/40"
              }`}
            >
              <p className="text-sm font-medium">{option.label}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {option.description}
              </p>
            </button>
          ))}
        </div>
      </div>

      {formState.modeOverride === "time-based" && (
        <div className="space-y-4 rounded-2xl border border-border/60 bg-background p-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Clock3 className="h-4 w-4 text-muted-foreground" />
              <Label className="text-sm font-medium">
                Plage horaire personnelle
              </Label>
            </div>
            <p className="text-sm text-muted-foreground">
              Le mode clair s’applique dans cette fenêtre, puis votre interface
              passe en dark.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
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

      {showThemeEditorShortcut && (
        <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-background p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <Label className="text-sm font-medium">Palette personnelle</Label>
            <p className="text-sm text-muted-foreground">
              La palette et les réglages avancés se pilotent depuis l’atelier
              thème dédié, pour éviter de charger la page préférences
              inutilement.
            </p>
          </div>
          <Button
            variant="outline"
            className="text-sm"
            onClick={() => router.push("/settings/theme")}
          >
            Ouvrir l’atelier thème
          </Button>
        </div>
      )}
    </div>
  );
}
