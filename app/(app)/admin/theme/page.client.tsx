"use client";

import { useEffect, useMemo, useState } from "react";
import { Provider as JotaiProvider, createStore, useAtom } from "jotai";
import { useRouter } from "next/navigation";
import Editor from "@/components/editor/editor";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { defaultThemeState } from "@/config/theme";
import {
  loadThemeEditorStateAtom,
  themeEditorStateAtom,
} from "@/lib/atoms/editor";
import { isDeepEqual } from "@/lib/utils";
import { findMatchingThemePresetName } from "@/utils/theme-preset-helper";
import type {
  GlobalThemeConfig,
  GlobalThemeMode,
  ThemeRuntimeUpdateResponse,
} from "@/types/theme-runtime";
import { Palette, PaintBucket } from "lucide-react";

const modeOptions: Array<{
  value: GlobalThemeMode;
  label: string;
  description: string;
}> = [
  {
    value: "light",
    label: "Clair",
    description: "Force l’interface publique en light.",
  },
  {
    value: "dark",
    label: "Sombre",
    description: "Force l’interface publique en dark.",
  },
  {
    value: "system",
    label: "Système",
    description: "Laisse l’app suivre la préférence du device.",
  },
];

function resolveEditorPreviewMode(mode: GlobalThemeMode): "light" | "dark" {
  if (mode === "dark") {
    return "dark";
  }

  if (mode === "light") {
    return "light";
  }

  if (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  ) {
    return "dark";
  }

  return "light";
}

function ThemeAdminPageContent({
  initialGlobalTheme,
}: {
  initialGlobalTheme: GlobalThemeConfig;
}) {
  const router = useRouter();
  const { replaceResolvedTheme } = useTheme();
  const [themeState] = useAtom(themeEditorStateAtom);
  const [, loadThemeEditorState] = useAtom(loadThemeEditorStateAtom);
  const [globalMode, setGlobalMode] = useState<GlobalThemeMode>(
    initialGlobalTheme.mode
  );
  const [publishedTheme, setPublishedTheme] =
    useState<GlobalThemeConfig>(initialGlobalTheme);
  const [isSaving, setIsSaving] = useState(false);

  const emptyThemePromise = useMemo(() => Promise.resolve(null), []);

  useEffect(() => {
    const matchingPreset = findMatchingThemePresetName(publishedTheme.styles);

    loadThemeEditorState({
      ...defaultThemeState,
      preset: matchingPreset,
      styles: publishedTheme.styles,
      currentMode: resolveEditorPreviewMode(publishedTheme.mode),
      hslAdjustments: defaultThemeState.hslAdjustments,
    });
  }, [loadThemeEditorState, publishedTheme.mode, publishedTheme.styles]);

  const hasUnsavedChanges =
    globalMode !== publishedTheme.mode ||
    !isDeepEqual(themeState.styles, publishedTheme.styles);

  const handlePublish = async () => {
    setIsSaving(true);

    try {
      const response = await fetch("/api/admin/theme", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode: globalMode,
          styles: themeState.styles,
        }),
      });

      const data = (await response.json()) as ThemeRuntimeUpdateResponse & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error || "Impossible de publier le thème");
      }

      setPublishedTheme(data.globalTheme);
      setGlobalMode(data.globalTheme.mode);
      replaceResolvedTheme(data.payload, { animate: false });
      router.refresh();
      toast.success("Le thème global a été publié.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Erreur lors de la publication"
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[2rem] border border-border/70 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.16),transparent_26%),radial-gradient(circle_at_80%_20%,rgba(249,115,22,0.14),transparent_22%),linear-gradient(135deg,var(--card),color-mix(in_oklab,var(--card)_82%,var(--muted)))] p-6 shadow-sm sm:p-7">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
          <div className="space-y-4">
            <Badge
              variant="outline"
              className="rounded-full border-border/70 bg-background/80 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-muted-foreground"
            >
              Palette maître
            </Badge>
            <div className="space-y-3">
              <h1 className="max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">
                Panneau de thème global
              </h1>
              <p className="max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
                Cette page pilote la base visuelle de tout le site. Le thème publié
                sert de source principale, puis les préférences utilisateur viennent
                éventuellement s&apos;y superposer sans l&apos;écraser.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-border/60 bg-background/80 p-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  Publication
                </p>
                <p className="mt-2 text-sm">
                  {hasUnsavedChanges
                    ? "Des changements locaux attendent une publication."
                    : "Le draft correspond exactement au thème publié."}
                </p>
              </div>
              <div className="rounded-2xl border border-border/60 bg-background/80 p-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  Mode public
                </p>
                <p className="mt-2 text-sm">
                  {modeOptions.find((option) => option.value === globalMode)?.label}
                </p>
              </div>
              <div className="rounded-2xl border border-border/60 bg-background/80 p-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  Dernière mise à jour
                </p>
                <p className="mt-2 text-sm">
                  {new Date(publishedTheme.updatedAt).toLocaleString("fr-FR")}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-[1.75rem] border border-border/60 bg-background/80 p-5 shadow-sm backdrop-blur">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-1">
                <p className="text-sm font-medium">État de publication</p>
                <p className="text-sm text-muted-foreground">
                  Sélectionnez le mode global, ajustez le thème, puis publiez.
                </p>
              </div>
              <Badge
                variant={hasUnsavedChanges ? "secondary" : "default"}
                className="rounded-full px-3 py-1"
              >
                {hasUnsavedChanges ? "Draft local" : "Publié"}
              </Badge>
            </div>

            <Separator className="my-4" />

            <div className="space-y-3">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Mode global du site
              </p>
              <div className="grid gap-2 sm:grid-cols-3">
                {modeOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setGlobalMode(option.value)}
                    className={`rounded-2xl border px-4 py-3 text-left transition-colors ${
                      globalMode === option.value
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

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-muted-foreground">
                {hasUnsavedChanges
                  ? "Le site n’utilisera ces changements qu’après publication."
                  : "Le thème publié est déjà en production."}
              </div>
              <Button onClick={handlePublish} disabled={!hasUnsavedChanges || isSaving}>
                <PaintBucket className="mr-2 h-4 w-4" />
                {isSaving ? "Publication..." : "Publier le thème global"}
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* py-0 gap-0 : Card porte py-6 depuis shadcn v4 ; l'en-tête et l'éditeur
          gèrent déjà leur propre espacement, la marge s'ajoutait en doublon. */}
      <Card className="gap-0 overflow-hidden rounded-[2rem] border-border/70 py-0 shadow-sm">
        <CardHeader className="border-b border-border/60 bg-muted/20 px-6 py-5">
          <CardTitle className="flex items-center gap-2 text-xl">
            <Palette className="h-5 w-5" />
            Atelier du thème publié
          </CardTitle>
          <CardDescription className="text-sm">
            L’éditeur existant pilote ici le thème de référence du site. Les
            presets servent d’amorçage, mais rien n’est mis en ligne tant que la
            publication n’a pas été validée.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="h-[75vh] min-h-[680px]">
            <Editor
              themePromise={emptyThemePromise}
              presetSelectOptions={{
                fallbackLabel: hasUnsavedChanges ? "Draft global" : "Theme publie",
                showPresetUnsavedState: false,
                showSavedThemes: false,
              }}
              showActionBar={false}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function ThemeAdminPageClient({
  initialGlobalTheme,
}: {
  initialGlobalTheme: GlobalThemeConfig;
}) {
  const editorStore = useMemo(() => createStore(), []);

  return (
    <JotaiProvider store={editorStore}>
      <ThemeAdminPageContent initialGlobalTheme={initialGlobalTheme} />
    </JotaiProvider>
  );
}
