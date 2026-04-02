"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAtom } from "jotai";
import Editor from "@/components/editor/editor";
import { useTheme } from "@/components/theme-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { defaultThemeState } from "@/config/theme";
import {
  loadThemeEditorStateAtom,
  themeEditorStateAtom,
} from "@/lib/atoms/editor";
import {
  getThemeColorOverridesFromStyles,
  getUserThemeDraftStyles,
} from "@/lib/theme/user-theme-styles";
import { isDeepEqual } from "@/lib/utils";
import { Palette, RotateCcw, Save, Settings2 } from "lucide-react";
import { toast } from "sonner";

export default function ThemeSettingsPageClient() {
  const { resolvedTheme, replaceResolvedTheme } = useTheme();
  const [themeState] = useAtom(themeEditorStateAtom);
  const [, loadThemeEditorState] = useAtom(loadThemeEditorStateAtom);
  const [isSaving, setIsSaving] = useState(false);

  const emptyThemePromise = useMemo(() => Promise.resolve(null), []);
  const savedDraftStyles = useMemo(
    () => getUserThemeDraftStyles(resolvedTheme),
    [resolvedTheme],
  );

  useEffect(() => {
    loadThemeEditorState({
      ...defaultThemeState,
      preset: undefined,
      styles: savedDraftStyles,
      currentMode: resolvedTheme.activeMode,
      hslAdjustments: defaultThemeState.hslAdjustments,
    });
  }, [loadThemeEditorState, resolvedTheme.activeMode, savedDraftStyles]);

  const hasUnsavedChanges = !isDeepEqual(themeState.styles, savedDraftStyles);
  const currentModePreference =
    resolvedTheme.userPreferences?.modeOverride ?? "inherit";
  const currentModeLabel =
    currentModePreference === "inherit"
      ? "Par défaut du site"
      : currentModePreference === "light"
        ? "Clair"
        : currentModePreference === "dark"
          ? "Sombre"
          : currentModePreference === "system"
            ? "Système"
            : "Automatique";

  const persistUserTheme = async ({
    overrideEnabled,
    successMessage,
    animate,
  }: {
    overrideEnabled: boolean;
    successMessage: string;
    animate?: boolean;
  }) => {
    const colorOverrides = getThemeColorOverridesFromStyles(
      resolvedTheme.globalTheme.styles,
      themeState.styles,
    );

    const response = await fetch("/api/settings/theme", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        modeOverride: currentModePreference,
        overrideEnabled,
        lightColorOverrides: colorOverrides.light,
        darkColorOverrides: colorOverrides.dark,
        stylesOverride: themeState.styles,
        dayStartHour: resolvedTheme.userPreferences?.dayStartHour ?? 7,
        dayEndHour: resolvedTheme.userPreferences?.dayEndHour ?? 19,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error || "Impossible d’enregistrer le thème utilisateur",
      );
    }

    replaceResolvedTheme(data.payload, { animate });
    toast.success(successMessage);
  };

  const handleSave = async () => {
    setIsSaving(true);

    try {
      await persistUserTheme({
        overrideEnabled: true,
        successMessage:
          "Votre thème utilisateur a bien été enregistré et remplace désormais le thème du site pour votre compte.",
        animate: true,
      });
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
    setIsSaving(true);

    try {
      await persistUserTheme({
        overrideEnabled: false,
        successMessage:
          "Votre palette personnelle est désactivée. Votre brouillon reste conservé dans l’éditeur.",
        animate: false,
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Réinitialisation impossible",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border/70 bg-gradient-to-br from-card via-card to-muted/25 p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/80 px-3 py-1 text-xs font-medium text-muted-foreground">
              <Palette className="h-3.5 w-3.5" />
              Thème utilisateur
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                Atelier de thème personnel
              </h1>
              <p className="max-w-3xl text-sm text-muted-foreground sm:text-base">
                L’éditeur ci-dessous sert à choisir votre thème utilisateur. La
                priorité du mode se règle dans les préférences, puis
                l’enregistrement ici active votre override personnel.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">Priorité: {currentModeLabel}</Badge>
              <Badge
                variant={
                  resolvedTheme.userPreferences?.overrideEnabled
                    ? "default"
                    : "secondary"
                }
              >
                {resolvedTheme.userPreferences?.overrideEnabled
                  ? "Palette perso active"
                  : "Palette perso inactive"}
              </Badge>
            </div>
          </div>

          <div className="grid gap-2 sm:flex sm:flex-wrap">
            <Button variant="outline" asChild className="w-full sm:w-auto">
              <Link href="/settings/preferences">
                <Settings2 className="mr-2 h-4 w-4" />
                Préférences utilisateur
              </Link>
            </Button>
            <Button
              variant="outline"
              onClick={handleFollowSite}
              disabled={isSaving}
              className="w-full sm:w-auto"
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Désactiver ma palette
            </Button>
            <Button
              onClick={handleSave}
              disabled={!hasUnsavedChanges || isSaving}
              className="w-full sm:w-auto"
            >
              <Save className="mr-2 h-4 w-4" />
              {isSaving ? "Enregistrement..." : "Enregistrer mon thème"}
            </Button>
          </div>
        </div>
      </section>

      <Card className="overflow-hidden rounded-[1.75rem] border-border/70 shadow-sm">
        <CardHeader className="border-b border-border/60 bg-muted/20 px-4 py-4 sm:px-6 sm:py-5">
          <CardTitle className="text-xl">Éditeur de thème</CardTitle>
          <CardDescription className="text-sm">
            Sélectionnez une base, ajustez-la, puis enregistrez. Le thème global
            du site reste intact: seul votre compte est concerné.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-hidden p-0">
          <div className="h-[68svh] min-h-[420px] overflow-hidden sm:h-[75vh] sm:min-h-[680px]">
            <Editor themePromise={emptyThemePromise} showActionBar={false} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
