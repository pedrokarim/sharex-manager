"use client";

import { useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { DropZone } from "@/components/ui/drop-zone";
import { FontPicker } from "@/components/ui/font-picker";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { TEXT_ROLES, themedTextStyle } from "@/modules/clip-studio/engine/brand";
import type { ClipProject, ClipItem, TextRole, TextStyle, Track, Transform } from "@/modules/clip-studio/engine/types";
import { FONTS } from "@/modules/clip-studio/lib/font-catalog";
import { api, errorMessage } from "../../lib/client";
import { toBrandTheme } from "../../lib/theme";
import { KIT_LIMITS, kitAssetUrl, type BrandFont, type BrandKit } from "../../lib/types";
import { ColorField, ConfirmDialog, Field, FieldGroup, SectionHeading, SliderField, SteppedSliderField, formatNumber, formatPercent } from "../fields";
import { FormatCanvas } from "../format-preview";
import type { FileSectionProps } from "./types";

export const ROLE_LABELS: Record<TextRole, string> = {
  title: "Titre",
  subtitle: "Sous-titre",
  caption: "Légende",
  label: "Étiquette",
  body: "Texte sur carte",
};

const ROLE_SAMPLES: Record<TextRole, string> = {
  title: "Top 5 des sorties",
  subtitle: "Cette semaine",
  caption: "Une légende bien lisible",
  label: "Question 2/5",
  body: "Réponse B",
};

/** Taille du texte d'exemple, relative à la hauteur de l'aperçu. */
const ROLE_SIZES: Record<TextRole, number> = { title: 0.2, subtitle: 0.14, caption: 0.13, label: 0.12, body: 0.13 };

const ALL_WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900];
const WEIGHT_NAMES: Record<number, string> = {
  100: "Fine",
  200: "Très légère",
  300: "Légère",
  400: "Normale",
  500: "Moyenne",
  600: "Demi-grasse",
  700: "Grasse",
  800: "Très grasse",
  900: "Noire",
};

const FALLBACK_PHOTO = "/images/home/nature-lake.webp";
const PREVIEW = { width: 960, height: 240 };
const FONT_FILE = /\.(ttf|otf|woff2)$/i;

const still = { start: 0, duration: 30, animIn: { kind: "none" as const, frames: 1 }, animOut: { kind: "none" as const, frames: 1 } };
const box = (x: number, y: number, width: number, height: number, opacity = 1): Transform => ({ x, y, width, height, rotation: 0, opacity });
const track = (id: string, item: ClipItem): Track => ({ id, kind: "visual", name: id, items: [item] });

/** Aperçu d'un rôle : à gauche sur une image voilée, à droite sur un aplat (une carte pour le texte sur carte). */
function rolePreviewProject(kit: BrandKit, role: TextRole): ClipProject {
  const theme = toBrandTheme(kit);
  const background = kit.assets.find((asset) => asset.kind === "background");
  const photo = background ? kitAssetUrl(kit.id, background.file) : FALLBACK_PHOTO;
  const style = themedTextStyle(theme, role === "label" ? { role, accent: 0 } : { role }, { size: ROLE_SIZES[role], align: "center" });
  const text = (id: string, x: number) =>
    track(id, { ...still, id, type: "text", text: ROLE_SAMPLES[role], style, fit: "shrink", transform: box(x, 0.5, 0.44, 0.8) });
  const plate = role === "body" ? theme.palette.surface : theme.palette.background;
  const tracks: Track[] = [
    text("text-image", 0.25),
    text("text-plate", 0.75),
    ...(role === "body" ? [track("card", { ...still, id: "card", type: "shape", shape: "rect", fill: theme.palette.surface, radius: 0.1, transform: box(0.25, 0.5, 0.42, 0.5) } as ClipItem)] : []),
    track("plate", { ...still, id: "plate", type: "shape", shape: "rect", fill: plate, radius: 0, transform: box(0.75, 0.5, 0.5, 1) }),
    track("veil", { ...still, id: "veil", type: "shape", shape: "rect", fill: theme.palette.background, radius: 0, transform: box(0.25, 0.5, 0.5, 1, 0.42) }),
    track("photo", {
      ...still,
      id: "photo",
      type: "image",
      source: { url: photo, ref: "preview", name: "", kind: "image" },
      fit: "cover",
      motion: "none",
      radius: 0,
      transform: box(0.25, 0.5, 0.5, 1),
    }),
  ];
  return { version: 1, id: `role-${role}`, name: role, aspect: "16:9", ...PREVIEW, fps: 30, background: theme.palette.background, tracks, createdAt: 0, updatedAt: 0 };
}

/** Nom affiché d'une famille : catalogue, police importée, ou la famille telle quelle. */
function fontLabel(kit: BrandKit, family: string): string {
  return FONTS.find((font) => font.family === family)?.label ?? kit.fonts.find((font) => font.family === family)?.name ?? family;
}

export function TypographySection({ kit, update, runOperation, fontsVersion, fontsReady }: FileSectionProps & { fontsVersion: number; fontsReady: boolean }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [doomed, setDoomed] = useState<BrandFont | null>(null);
  const roomLeft = KIT_LIMITS.fonts - kit.fonts.length;

  const importFonts = async (files: File[]) => {
    setImporting(true);
    try {
      for (const file of files.slice(0, Math.max(0, roomLeft))) {
        if (!FONT_FILE.test(file.name)) {
          toast.error(`« ${file.name} » : TTF, OTF ou WOFF2 seulement.`);
          continue;
        }
        await runOperation(() => api.importFont(kit.id, file));
      }
    } catch (error) {
      toast.error(errorMessage(error, "Police refusée."));
    } finally {
      setImporting(false);
    }
  };

  const removeFont = async (font: BrandFont) => {
    try {
      await runOperation(() => api.removeFont(kit.id, font.id));
      toast.success("Police retirée");
    } catch (error) {
      toast.error(errorMessage(error, "Retrait impossible."));
    }
  };

  const setStyle = (role: TextRole, patch: Partial<TextStyle>) =>
    update((draft) => ({ ...draft, textStyles: { ...draft.textStyles, [role]: { ...draft.textStyles[role], ...patch } } }));

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading title="Typographie" text="Polices de la marque et style de chaque rôle de texte, tels que les vidéos les dessinent : sur une image voilée à gauche, sur un aplat à droite." />

      <FieldGroup title="Polices importées" text={`TTF, OTF ou WOFF2, ${KIT_LIMITS.fonts} au plus, à déposer ici ou à importer. Elles s’ajoutent aux polices de Clip Studio.`}>
        <DropZone onFiles={(files) => void importFonts(files)} accept={(file) => FONT_FILE.test(file.name)} disabled={roomLeft <= 0 || importing} label="Déposer pour importer la police" className="grid gap-2 rounded-lg">
          {kit.fonts.length > 0 && (
            <ul className="grid gap-2">
              <AnimatePresence initial={false}>
                {kit.fonts.map((font) => (
                  <motion.li key={font.id} layout initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} className="flex min-w-0 items-center gap-2">
                    <span aria-hidden className="w-10 shrink-0 text-center text-xl" style={{ fontFamily: `"${font.family}", sans-serif` }}>
                      Aa
                    </span>
                    <Input
                      aria-label="Nom de la police"
                      value={font.name}
                      maxLength={KIT_LIMITS.name}
                      onChange={(event) =>
                        update((draft) => ({ ...draft, fonts: draft.fonts.map((entry) => (entry.id === font.id ? { ...entry, name: event.target.value } : entry)) }))
                      }
                      className="h-8 min-w-0 flex-1 text-sm"
                    />
                    <span className="hidden shrink-0 text-xs text-muted-foreground uppercase tabular-nums @sm/form:inline">
                      {font.format} · {formatNumber(Math.round(font.size / 1024))}&nbsp;Ko
                    </span>
                    <Button variant="ghost" size="icon" className="size-8 shrink-0" aria-label={`Retirer ${font.name}`} onClick={() => setDoomed(font)}>
                      <Trash2 className="size-4" />
                    </Button>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
          <input
            ref={fileInput}
            type="file"
            accept=".ttf,.otf,.woff2,font/ttf,font/otf,font/woff2"
            multiple
            className="hidden"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = "";
              if (files.length > 0) void importFonts(files);
            }}
          />
          <Button variant="outline" size="sm" className="w-fit gap-2" onClick={() => fileInput.current?.click()} disabled={importing || roomLeft <= 0}>
            {importing ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            Importer une police
          </Button>
        </DropZone>
      </FieldGroup>

      <FieldGroup title="Rôles de texte" text="Chaque rôle a sa police et son style ; ouvrez-en un pour le régler.">
        <Accordion type="multiple" defaultValue={["title"]} className="-mt-1">
          {TEXT_ROLES.map((role) => {
            const style = kit.textStyles[role];
            return (
              <AccordionItem key={role} value={role}>
                <AccordionTrigger className="items-center gap-3 py-3 hover:no-underline">
                  <span className="flex min-w-0 flex-1 items-baseline gap-3">
                    <span className="w-28 shrink-0 text-sm font-medium">{ROLE_LABELS[role]}</span>
                    <span
                      className="min-w-0 truncate text-base text-muted-foreground"
                      style={{ fontFamily: `"${style.font}", sans-serif`, fontWeight: style.weight, textTransform: style.uppercase ? "uppercase" : undefined }}
                    >
                      {fontLabel(kit, style.font)} · {style.weight}
                    </span>
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <RoleEditor kit={kit} role={role} style={style} onChange={(patch) => setStyle(role, patch)} fontsVersion={fontsVersion} fontsReady={fontsReady} />
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </FieldGroup>

      <ConfirmDialog
        open={doomed !== null}
        onOpenChange={(open) => !open && setDoomed(null)}
        title={`Retirer « ${doomed?.name ?? ""} » ?`}
        description="Les styles qui l’utilisent reprennent une police de Clip Studio."
        confirmLabel="Retirer"
        destructive
        onConfirm={() => {
          if (doomed) void removeFont(doomed);
          setDoomed(null);
        }}
      />
    </div>
  );
}

const LETTER_SPACING_STOPS = [-0.1, 0, 0.1, 0.2, 0.3, 0.4, 0.5];

function RoleEditor({
  kit,
  role,
  style,
  onChange,
  fontsVersion,
  fontsReady,
}: {
  kit: BrandKit;
  role: TextRole;
  style: TextStyle;
  onChange: (patch: Partial<TextStyle>) => void;
  fontsVersion: number;
  fontsReady: boolean;
}) {
  const project = useMemo(() => rolePreviewProject(kit, role), [kit, role]);
  const catalog = FONTS.find((font) => font.family === style.font);
  const paletteColor = role === "label" ? "Texte sur accent et accent de la palette." : role === "body" ? "Texte sur surface de la palette." : null;
  const swatches = [
    { color: kit.palette.ink, label: "Encre" },
    { color: kit.palette.accent, label: "Accent" },
    ...(kit.palette.accentSecondary ? [{ color: kit.palette.accentSecondary, label: "Mise en avant" }] : []),
    { color: kit.palette.background, label: "Fond" },
    { color: "#ffffff", label: "Blanc" },
    { color: "#000000", label: "Noir" },
  ];
  const groups = [
    { label: "Clip Studio", fonts: FONTS.map((font) => ({ value: font.family, label: font.label, family: font.family, hint: font.weights.join(", ") })) },
    { label: "Importées", fonts: kit.fonts.map((font) => ({ value: font.family, label: font.name, family: font.family, hint: font.format.toUpperCase() })) },
  ];

  return (
    <div className="grid gap-4">
      <FormatCanvas built={{ project, frame: 0, spec: { width: PREVIEW.width, height: PREVIEW.height } }} fontsVersion={fontsVersion} ready={fontsReady} className="w-full" />
      <div className="grid gap-4 @md/form:grid-cols-2">
        <Field label="Police">
          <FontPicker
            label={`Police du rôle ${ROLE_LABELS[role].toLocaleLowerCase("fr")}`}
            value={style.font}
            sample={ROLE_SAMPLES[role]}
            groups={groups}
            onValueChange={(font) => {
              // Une police du catalogue n'a que certaines graisses : on garde la plus proche.
              const next = FONTS.find((entry) => entry.family === font);
              const weight = next && !next.weights.includes(style.weight) ? next.weights.reduce((best, w) => (Math.abs(w - style.weight) < Math.abs(best - style.weight) ? w : best)) : style.weight;
              onChange({ font, weight });
            }}
          />
        </Field>
        {catalog ? (
          <Field label="Graisse" hint={catalog.weights.length === 1 ? "Cette police n’a qu’une graisse." : undefined}>
            <ToggleGroup
              type="single"
              variant="outline"
              value={String(style.weight)}
              onValueChange={(value) => value && onChange({ weight: Number(value) })}
              className="w-full"
            >
              {Array.from(new Set([...catalog.weights, style.weight]))
                .sort((a, b) => a - b)
                .map((weight) => (
                  <ToggleGroupItem
                    key={weight}
                    value={String(weight)}
                    aria-label={`${weight}, ${WEIGHT_NAMES[weight] ?? ""}`}
                    title={WEIGHT_NAMES[weight]}
                    className="flex-1"
                    style={{ fontFamily: `"${style.font}", sans-serif`, fontWeight: weight }}
                  >
                    {weight}
                  </ToggleGroupItem>
                ))}
            </ToggleGroup>
          </Field>
        ) : (
          <SteppedSliderField
            label="Graisse"
            value={style.weight}
            min={100}
            max={900}
            step={100}
            stops={[100, 400, 700, 900]}
            format={(weight) => String(weight)}
            onChange={(weight) => onChange({ weight: ALL_WEIGHTS.includes(weight) ? weight : 400 })}
          />
        )}
        <Field label="Couleur" hint={paletteColor ?? undefined}>
          {paletteColor ? (
            <p className="text-sm text-muted-foreground">Celle de la palette</p>
          ) : (
            <ColorField label={`Couleur du rôle ${ROLE_LABELS[role].toLocaleLowerCase("fr")}`} value={style.color} swatches={swatches} onChange={(color) => onChange({ color })} />
          )}
        </Field>
        <label className="flex items-center gap-2.5 self-end pb-1.5 text-sm">
          <Switch checked={style.uppercase} onCheckedChange={(uppercase) => onChange({ uppercase })} />
          Majuscules
        </label>
        <div className="@md/form:col-span-2">
          <SteppedSliderField
            label="Espacement des lettres"
            value={style.letterSpacing}
            min={-0.1}
            max={0.5}
            step={0.01}
            stops={LETTER_SPACING_STOPS}
            format={(value) => formatNumber(Math.round(value * 100) / 100)}
            onChange={(letterSpacing) => onChange({ letterSpacing })}
          />
        </div>
      </div>

      <div className="grid gap-3">
        <ToggleRow label="Contour" checked={style.stroke !== null} onCheckedChange={(on) => onChange({ stroke: on ? { color: "#000000", width: 0.08 } : null })}>
          {style.stroke && (
            <div className="grid gap-3 @md/form:grid-cols-[auto_minmax(0,1fr)] @md/form:items-end">
              <ColorField label="Couleur du contour" value={style.stroke.color} swatches={swatches} onChange={(color) => onChange({ stroke: { ...style.stroke!, color } })} />
              <SliderField label="Épaisseur" value={style.stroke.width} min={0} max={0.4} step={0.01} format={formatPercent} onChange={(width) => onChange({ stroke: { ...style.stroke!, width } })} />
            </div>
          )}
        </ToggleRow>
        <ToggleRow label="Ombre" checked={style.shadow !== null} onCheckedChange={(on) => onChange({ shadow: on ? { color: "rgba(0,0,0,0.55)", blur: 0.25, offsetY: 0.06 } : null })}>
          {style.shadow && (
            <div className="grid gap-3 @md/form:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)] @md/form:items-end">
              <ColorField label="Couleur de l’ombre" value={style.shadow.color} swatches={swatches} onChange={(color) => onChange({ shadow: { ...style.shadow!, color } })} />
              <SliderField label="Flou" value={style.shadow.blur} min={0} max={2} step={0.05} format={formatPercent} onChange={(blur) => onChange({ shadow: { ...style.shadow!, blur } })} />
              <SliderField label="Décalage" value={style.shadow.offsetY} min={-1} max={1} step={0.01} format={formatPercent} onChange={(offsetY) => onChange({ shadow: { ...style.shadow!, offsetY } })} />
            </div>
          )}
        </ToggleRow>
        {role === "label" && (
          <div className="grid gap-3 @md/form:grid-cols-2">
            <SliderField
              label="Marge du fond"
              value={style.background?.padding ?? 0.4}
              min={0}
              max={2}
              step={0.05}
              format={formatPercent}
              onChange={(padding) => onChange({ background: { color: style.background?.color ?? kit.palette.accent, radius: style.background?.radius ?? 0.35, padding } })}
            />
            <SliderField
              label="Arrondi du fond"
              value={style.background?.radius ?? 0.35}
              min={0}
              max={1}
              step={0.05}
              format={formatPercent}
              onChange={(radius) => onChange({ background: { color: style.background?.color ?? kit.palette.accent, padding: style.background?.padding ?? 0.4, radius } })}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function ToggleRow({ label, checked, onCheckedChange, children }: { label: string; checked: boolean; onCheckedChange: (checked: boolean) => void; children?: React.ReactNode }) {
  return (
    <div className="grid gap-2.5">
      <label className="flex items-center gap-2.5 text-sm">
        <Switch checked={checked} onCheckedChange={onCheckedChange} />
        {label}
      </label>
      {children}
    </div>
  );
}
