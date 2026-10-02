"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Moon, Palette, RotateCcw, Sun } from "lucide-react";
import { toast } from "sonner";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { ColorPaletteEditor, ColorPalettePreview } from "@/components/theme/color-palette-editor";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { defaultThemeState } from "@/config/theme";
import { THEME_PALETTES } from "@/config/theme-palettes";
import { THEME_COLOR_KEYS } from "@/lib/theme/constants";
import { cn } from "@/lib/utils";
import type { ThemeStyles } from "@/types/theme";
import type { GlobalThemeConfig, GlobalThemeMode, ThemeRuntimeUpdateResponse } from "@/types/theme-runtime";

const MODES: { value: GlobalThemeMode; label: string; hint: string }[] = [
  { value: "light", label: "Clair", hint: "Toujours clair" },
  { value: "dark", label: "Sombre", hint: "Toujours sombre" },
  { value: "system", label: "Système", hint: "Suit l’appareil du visiteur" },
];

type Palette = "light" | "dark";

/**
 * Cadre d'un sélecteur à choix unique. Il est tracé, et le choix en cours est
 * plein : un fond teinté ne suffit pas, il se confond avec la page dès que la
 * palette donne la même couleur au fond et au fond atténué.
 */
const SEGMENTED = "inline-flex gap-1 rounded-xl border border-foreground/15 p-1";

/** Nombre de palettes montrées avant « Tout afficher ». */
const PALETTES_SHOWN = 12;

/** Couleurs qui résument une palette, dans sa vignette. */
const PALETTE_SAMPLE = ["background", "primary", "secondary", "accent", "foreground"] as const;

/** Deux thèmes ont-ils les mêmes couleurs ? Le reste ne se modifie pas ici. */
const sameColors = (a: ThemeStyles, b: ThemeStyles) =>
  (["light", "dark"] as const).every((mode) => THEME_COLOR_KEYS.every((key) => a[mode][key] === b[mode][key]));

/**
 * Thème global : le mode du site et ses couleurs, rien de plus. Les polices,
 * les rayons, les ombres et les espacements du thème publié sont renvoyés tels
 * quels à l'enregistrement.
 */
export default function ThemeAdminPageClient({ initialGlobalTheme }: { initialGlobalTheme: GlobalThemeConfig }) {
  const router = useRouter();
  const { replaceResolvedTheme } = useTheme();
  const [published, setPublished] = useState(initialGlobalTheme);
  const [mode, setMode] = useState<GlobalThemeMode>(initialGlobalTheme.mode);
  const [styles, setStyles] = useState<ThemeStyles>(initialGlobalTheme.styles);
  const [palette, setPalette] = useState<Palette>("light");
  const [saving, setSaving] = useState(false);
  const [allPalettes, setAllPalettes] = useState(false);

  const dirty = mode !== published.mode || !sameColors(styles, published.styles);
  const isDefault = useMemo(() => sameColors(styles, defaultThemeState.styles as ThemeStyles), [styles]);

  const setColor = (key: (typeof THEME_COLOR_KEYS)[number], value: string) =>
    setStyles((current) => ({ ...current, [palette]: { ...current[palette], [key]: value } }));

  /** La palette prête à l'emploi dont le brouillon porte exactement les couleurs. */
  const currentPalette = useMemo(
    () =>
      THEME_PALETTES.find((candidate) =>
        (["light", "dark"] as const).every((mode) => THEME_COLOR_KEYS.every((key) => candidate[mode][key] === styles[mode][key])),
      )?.id,
    [styles],
  );

  /** Applique les couleurs d'une palette aux deux modes. Le reste du thème ne bouge pas. */
  const applyPalette = (id: string) => {
    const chosen = THEME_PALETTES.find((candidate) => candidate.id === id);
    if (!chosen) return;
    setStyles((current) => ({
      light: { ...current.light, ...chosen.light },
      dark: { ...current.dark, ...chosen.dark },
    }));
  };

  // La palette en cours reste visible même repliée.
  const shownPalettes = allPalettes
    ? THEME_PALETTES
    : [
        ...THEME_PALETTES.filter((candidate) => candidate.id === currentPalette),
        ...THEME_PALETTES.filter((candidate) => candidate.id !== currentPalette),
      ].slice(0, PALETTES_SHOWN);

  /** Remet les couleurs d'origine, dans les deux modes. À publier ensuite. */
  const resetColors = () =>
    setStyles((current) => {
      const defaults = defaultThemeState.styles as ThemeStyles;
      const next = { light: { ...current.light }, dark: { ...current.dark } };
      for (const key of THEME_COLOR_KEYS) {
        next.light[key] = defaults.light[key];
        next.dark[key] = defaults.dark[key];
      }
      return next;
    });

  const publish = async () => {
    setSaving(true);
    try {
      const response = await fetch("/api/admin/theme", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, styles }),
      });
      const data = (await response.json()) as ThemeRuntimeUpdateResponse & { error?: string };
      if (!response.ok) throw new Error(data.error || "Impossible de publier le thème");

      setPublished(data.globalTheme);
      setMode(data.globalTheme.mode);
      setStyles(data.globalTheme.styles);
      replaceResolvedTheme(data.payload, { animate: false });
      router.refresh();
      toast.success("Le thème global est publié.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erreur lors de la publication");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-full shrink-0 flex-col gap-8">
      <AdminPageHeader
        icon={Palette}
        title="Thème global"
        description="Le mode et les couleurs du site, pour tous les visiteurs."
        actions={
          <>
            <Button variant="outline" onClick={resetColors} disabled={saving || isDefault} className="text-sm">
              <RotateCcw className="mr-2 h-4 w-4" />
              Couleurs d’origine
            </Button>
            <Button onClick={publish} disabled={saving || !dirty} className="text-sm">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {dirty ? "Publier" : "Publié"}
            </Button>
          </>
        }
      />

      <section>
        <h2 className="text-lg font-semibold tracking-tight">Mode du site</h2>
        <p className="text-sm text-muted-foreground">
          Ce que voit un visiteur qui n’a rien choisi. Chacun peut ensuite régler le sien.
        </p>
        <div className={cn(SEGMENTED, "mt-4 flex-wrap")} role="radiogroup" aria-label="Mode du site">
          {MODES.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={mode === option.value}
              title={option.hint}
              onClick={() => setMode(option.value)}
              className={cn(
                "rounded-lg px-4 py-1.5 text-sm font-medium transition-colors",
                mode === option.value ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      <section>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Palettes</h2>
            <p className="text-sm text-muted-foreground">
              {THEME_PALETTES.length} palettes prêtes à l’emploi. Un clic en applique les couleurs, claires et sombres ;
              vous pouvez ensuite les retoucher une à une.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setAllPalettes((value) => !value)} className="text-sm">
            {allPalettes ? "Réduire" : "Tout afficher"}
          </Button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
          {shownPalettes.map((candidate) => {
            const selected = candidate.id === currentPalette;
            return (
              <button
                key={candidate.id}
                type="button"
                onClick={() => applyPalette(candidate.id)}
                aria-pressed={selected}
                className={cn(
                  "flex items-center gap-3 rounded-xl border p-2 text-left transition-colors",
                  selected ? "border-foreground bg-foreground/[0.06]" : "border-foreground/15 hover:border-foreground/40",
                )}
              >
                {/* Cinq couleurs de la palette, dans le mode en cours d'édition. */}
                <span className="flex h-8 w-16 shrink-0 overflow-hidden rounded-md ring-1 ring-foreground/15">
                  {PALETTE_SAMPLE.map((key) => (
                    <span key={key} className="flex-1" style={{ backgroundColor: candidate[palette][key] }} />
                  ))}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{candidate.label}</span>
                {selected ? <Check className="size-4 shrink-0" /> : null}
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Couleurs</h2>
            <p className="text-sm text-muted-foreground">
              Chaque mode a sa palette. Cliquez sur une pastille pour choisir, ou saisissez une valeur CSS.
            </p>
          </div>
          <div className={SEGMENTED} role="radiogroup" aria-label="Palette à modifier">
            {(
              [
                { value: "light", label: "Palette claire", icon: Sun },
                { value: "dark", label: "Palette sombre", icon: Moon },
              ] as const
            ).map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={palette === option.value}
                onClick={() => setPalette(option.value)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-medium transition-colors",
                  palette === option.value ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <option.icon className="h-4 w-4" />
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 grid gap-8 xl:grid-cols-[minmax(0,1fr)_420px]">
          <ColorPaletteEditor palette={styles[palette]} onChange={setColor} />
          {/* L'aperçu suit le défilement : on voit l'effet de chaque couleur. */}
          <div className="xl:sticky xl:top-4 xl:self-start">
            <ColorPalettePreview palette={styles[palette]} />
            <p className="mt-3 text-xs text-muted-foreground">
              Aperçu de la palette {palette === "light" ? "claire" : "sombre"}. Rien ne change sur le site avant la
              publication.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
