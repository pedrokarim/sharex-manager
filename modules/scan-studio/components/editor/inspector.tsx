"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { AlignCenter, AlignLeft, AlignRight, MoreHorizontal, Pipette, ScanEye, TriangleAlert, Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { needsReview } from "../../lib/analysis/merge";
import { fontLabel, isMissingFont } from "../../lib/custom-fonts";
import { FONTS, nearestWeight, type FontLoadFailure } from "../../lib/fonts";
import { FONTS_PATH } from "../../lib/font-paths";
import { PAGE_STATUS_LABELS, PAGE_STATUS_ORDER } from "../../lib/library-helpers";
import { patchStyle, setMaskColor, setReadingText, setTranslationText } from "../../lib/region-edit";
import type { TextLayout } from "../../lib/text-layout";
import {
  REGION_KINDS,
  boundsOf,
  resolveStyle,
  type ChapterSettings,
  type CustomFont,
  type MaskShape,
  type PageStatus,
  type RegionKind,
  type RegionMask,
  type ScanPage,
  type ScanRegion,
  type TextStyle,
} from "../../lib/types";
import { PageAi } from "../ai/page-ai";
import { RegionAi } from "../ai/region-ai";
import type { ManualRenderer } from "../ai/version-compare";
import { RegionMenuItems, type RegionActions } from "./region-menu";
import { KIND_LABELS, MASK_KIND_LABELS, MASK_KIND_ORDER, MASK_SHAPE_LABELS, type Tool } from "./tools";
import type { InpaintStatus } from "./use-inpaint";

/** Ce dont les commandes d'IA ont besoin. Absent quand le niveau du chapitre est sous 3 : elles ne sont alors pas montrées. */
export interface InspectorAi {
  chapterId: string;
  /** Image d'origine de la page, pour la vue des écarts. */
  image: HTMLImageElement | null;
  renderManual: ManualRenderer;
  /** Enregistre la page avant un appel : le serveur lit les zones telles qu'elles sont enregistrées. */
  flush: () => Promise<void>;
  onPatchRegion: (regionId: string, update: (region: ScanRegion) => ScanRegion, key: string) => void;
  onSelectRegion: (regionId: string) => void;
}

/** Attribut qui désigne le champ de traduction : Tab y passe d'une zone à l'autre. */
export const TRANSLATION_FIELD = "data-translation-field";

interface InspectorProps {
  page: ScanPage;
  status: PageStatus;
  onStatusChange: (status: PageStatus) => void;
  regions: ScanRegion[];
  /** Zone sélectionnée ; `null` : l'inspecteur décrit la page. */
  region: ScanRegion | null;
  settings: ChapterSettings;
  /** Mise en lignes de la traduction de la zone, pour afficher la taille ajustée et signaler un débordement. */
  layout: TextLayout | null;
  tool: Tool;
  onToolChange: (tool: Tool) => void;
  brushWidth: number;
  onBrushWidthChange: (width: number) => void;
  /** Incrémenté pour amener le curseur dans le champ de traduction. */
  focusToken: number;
  /** `key` regroupe les réglages successifs d'un même champ en une étape d'annulation. */
  onPatch: (update: (region: ScanRegion) => ScanRegion, key: string) => void;
  /** Reprend la couleur du masque sur le fond de la bulle. */
  onAutoColor: () => void;
  actions: RegionActions;
  /** Polices ajoutées dans la page « Polices », proposées à côté des polices fournies. */
  customFonts: CustomFont[];
  /** Polices ajoutées que le navigateur n'a pas pu charger, avec la raison. */
  fontFailures: FontLoadFailure[];
  /** Où en est le fond reconstruit de la zone sélectionnée, quand son masque le demande. */
  inpaintStatus: InpaintStatus | null;
  ai: InspectorAi | null;
  /** Traduit cette zone seule par les moteurs réglés ; absent : la traduction automatique n'est pas permise ici. */
  onTranslateZone?: () => void;
  /** Une traduction est en cours. */
  translatingZone?: boolean;
  /** Lit le texte de la zone sur la page, avec le moteur de l'analyse ; absent : la lecture n'est pas possible ici. */
  onReadZone?: () => void;
  /** Une lecture de zone est en cours. */
  readingZone?: boolean;
}

export function Inspector(props: InspectorProps) {
  const { region, regions, page } = props;
  const index = region ? regions.findIndex((entry) => entry.id === region.id) : -1;
  // Dernière demande de saisie déjà servie. Tenue ici, où rien ne se démonte :
  // sélectionner une zone plus tard ne doit pas rejouer une demande ancienne.
  const servedFocusRef = useRef(props.focusToken);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-11 shrink-0 items-center justify-between border-b px-3">
        <span className="truncate text-sm font-semibold">{region ? `Zone ${index + 1}` : "Page"}</span>
        {region && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Actions de la zone">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <RegionMenuItems variant="dropdown" regionId={region.id} index={index} count={regions.length} actions={props.actions} />
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-3">
        {region ? (
          <RegionFields {...props} region={region} servedFocusRef={servedFocusRef} />
        ) : (
          <PageFields page={page} regions={regions} status={props.status} onStatusChange={props.onStatusChange} ai={props.ai} />
        )}
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────

function PageFields({
  page,
  regions,
  status,
  onStatusChange,
  ai,
}: Pick<InspectorProps, "page" | "regions" | "status" | "onStatusChange" | "ai">) {
  const pending = regions.filter((region) => !region.translation.text.trim()).length;
  return (
    <>
      <Section title="Fichier">
        <p className="text-sm break-words">{page.name}</p>
        <Row label="Dimensions">
          <span className="font-mono text-xs tabular-nums">
            {page.source.width} × {page.source.height} px
          </span>
        </Row>
      </Section>
      <Section title="Avancement">
        <Row label="Zones">
          <span className="font-mono text-xs tabular-nums">{regions.length}</span>
        </Row>
        <Row label="À traduire">
          <span className="font-mono text-xs tabular-nums">{pending}</span>
        </Row>
        <Choice label="État" value={status} options={PAGE_STATUS_LABELS} order={PAGE_STATUS_ORDER} onChange={onStatusChange} />
      </Section>
      {ai && (
        <Section title="IA, en dernier recours">
          <PageAi
            pageId={page.id}
            chapterId={ai.chapterId}
            regions={regions}
            page={page.source}
            image={ai.image}
            renderManual={ai.renderManual}
            flush={ai.flush}
            onPatchRegion={ai.onPatchRegion}
            onSelectRegion={ai.onSelectRegion}
          />
        </Section>
      )}
      <p className="text-xs leading-relaxed text-muted-foreground">
        Tracez une zone autour d’un texte avec le rectangle (R) ou le contour libre (P), puis tapez sa traduction. Tab passe à la zone suivante.
      </p>
    </>
  );
}

// ─── Zone ────────────────────────────────────────────────────────

function RegionFields(props: InspectorProps & { region: ScanRegion; servedFocusRef: React.RefObject<number> }) {
  const { region, settings, layout, onPatch, servedFocusRef } = props;
  const translationRef = useRef<HTMLTextAreaElement>(null);
  const style = resolveStyle(region, settings);

  // Juste après la création d'une zone, ou sur Entrée : on tape tout de suite.
  useEffect(() => {
    if (props.focusToken === servedFocusRef.current) return;
    servedFocusRef.current = props.focusToken;
    const field = translationRef.current;
    if (!field) return;
    field.focus();
    field.setSelectionRange(field.value.length, field.value.length);
  }, [props.focusToken, servedFocusRef]);

  const key = (field: string) => `${region.id}:${field}`;
  const setStyle = (patch: Partial<TextStyle>, field: string) => onPatch((current) => patchStyle(current, patch), key(field));
  const setMask = (patch: Partial<RegionMask>, field: string) => onPatch((current) => ({ ...current, mask: { ...current.mask, ...patch } }), key(field));

  const font = FONTS.find((entry) => entry.family === style.font);
  const fontMissing = isMissingFont(style.font, props.customFonts);
  const fontFailure = props.fontFailures.find((failure) => failure.family === style.font);
  const fontOptions = Object.fromEntries([
    ...FONTS.map((entry) => [entry.family, entry.family] as const),
    ...props.customFonts.map((entry) => [entry.family, entry.name] as const),
    // Police du chapitre absente de la liste : on la garde proposée plutôt que de la remplacer en silence.
    ...(font || props.customFonts.some((entry) => entry.family === style.font) ? [] : [[style.font, fontLabel(style.font, props.customFonts)] as const]),
  ]);
  const usesMask = region.mask.kind !== "none";
  const lettering = region.kind === "sfx" || region.kind === "shout" || Boolean(style.letterSpacing) || (style.stretch !== undefined && style.stretch !== 1);
  const overflows = layout !== null && !layout.fits;

  return (
    <>
      <Section title="Type">
        <Choice
          label="Type de zone"
          value={region.kind}
          options={KIND_LABELS}
          order={REGION_KINDS}
          onChange={(kind: RegionKind) => onPatch((current) => ({ ...current, kind }), key("kind"))}
        />
      </Section>

      <Section title="Texte d’origine">
        <Textarea
          value={region.reading.clean}
          onChange={(event) => onPatch((current) => setReadingText(current, event.target.value), key("reading"))}
          rows={2}
          placeholder="Facultatif"
          aria-label="Texte d’origine"
          className="resize-none text-sm"
        />
        {props.onReadZone && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            disabled={props.readingZone}
            onClick={props.onReadZone}
            title="Lit le texte qui se trouve dans le contour de la zone, sur cette machine, sans rien envoyer"
          >
            <ScanEye className={cn("h-3.5 w-3.5", props.readingZone && "animate-pulse")} />
            {props.readingZone ? "Lecture…" : region.reading.clean.trim() ? "Relire le texte de la zone" : "Lire le texte de la zone"}
          </Button>
        )}
        {needsReview(region) && (
          <div className="space-y-1.5 text-xs text-amber-600 dark:text-amber-400">
            <p className="flex items-start gap-1.5">
              <ScanEye className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Lecture à vérifier (confiance {Math.round(region.reading.confidence * 100)}{" "}%). Comparez avec la page et corrigez le texte s’il le faut.
              </span>
            </p>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs text-foreground"
              onClick={() => onPatch((current) => ({ ...current, reading: { ...current.reading, edited: true } }), key("reviewed"))}
            >
              La lecture est juste
            </Button>
          </div>
        )}
      </Section>

      <Section title="Traduction">

        {props.onTranslateZone && (

          <Button

            variant="outline"

            size="sm"

            className="h-7 gap-1.5 self-start text-xs"

            disabled={props.translatingZone || region.reading.clean.trim() === ""}

            onClick={props.onTranslateZone}

            title={region.reading.clean.trim() === "" ? "Cette zone n’a pas de texte d’origine" : "Traduit le texte d’origine de cette zone par les moteurs de la page « Moteurs »"}

          >

            <Languages className={cn("h-3.5 w-3.5", props.translatingZone && "animate-pulse")} />

            {props.translatingZone ? "Traduction…" : region.translation.text.trim() ? "Retraduire cette zone" : "Traduire cette zone"}

          </Button>

        )}
        <Textarea
          ref={translationRef}
          {...{ [TRANSLATION_FIELD]: "" }}
          value={region.translation.text}
          onChange={(event) => onPatch((current) => setTranslationText(current, event.target.value), key("translation"))}
          rows={3}
          placeholder="Texte à poser sur la page"
          aria-label="Traduction"
          className="resize-none text-sm"
        />
        {overflows && (
          <p className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              {region.text.autoFit
                ? "Ce texte ne tient pas dans sa boîte à une taille lisible. Agrandissez la boîte ou raccourcissez le texte."
                : "Ce texte déborde de sa boîte. Agrandissez-la, réduisez la taille ou activez l’ajustement."}
            </span>
          </p>
        )}
      </Section>

      <Section title="Masque">
        <Choice
          label="Masquer l’original"
          value={region.mask.kind}
          options={MASK_KIND_LABELS}
          order={MASK_KIND_ORDER}
          onChange={(kind: RegionMask["kind"]) => setMask({ kind }, "mask-kind")}
        />
        {region.mask.kind === "inpaint" && <InpaintNote status={props.inpaintStatus} />}
        {usesMask && (
          <>
            <Choice
              label="Forme"
              value={region.mask.shape}
              options={MASK_SHAPE_LABELS}
              onChange={(shape: MaskShape) => setMask({ shape }, "mask-shape")}
            />
            <ColorField
              label={region.mask.kind === "inpaint" ? "Couleur de repli" : "Couleur"}
              value={region.mask.color}
              onChange={(color) => onPatch((current) => setMaskColor(current, color), key("mask-color"))}
            />
            <div className="grid grid-cols-2 gap-1.5">
              <Button
                variant={props.tool === "eyedropper" ? "secondary" : "outline"}
                size="sm"
                className="h-7 gap-1.5 px-2 text-[11px]"
                aria-pressed={props.tool === "eyedropper"}
                onClick={() => props.onToolChange(props.tool === "eyedropper" ? "select" : "eyedropper")}
              >
                <Pipette className="h-3.5 w-3.5" />
                Prélever sur la page
              </Button>
              <Button variant="outline" size="sm" className="h-7 px-2 text-[11px]" onClick={props.onAutoColor}>
                Couleur du fond
              </Button>
            </div>
            <Slider label="Marge" unit="px" min={-20} max={60} step={1} value={region.mask.grow} onChange={(grow) => setMask({ grow }, "mask-grow")} />
            <Slider label="Largeur du pinceau" unit="px" min={2} max={200} step={1} value={props.brushWidth} onChange={props.onBrushWidthChange} />
            {region.mask.strokes.length > 0 && (
              <Button variant="outline" size="sm" className="h-7 w-full text-[11px]" onClick={() => setMask({ strokes: [] }, "mask-strokes")}>
                Effacer les retouches au pinceau ({region.mask.strokes.length})
              </Button>
            )}
          </>
        )}
      </Section>

      <Section title="Texte">
        <Row label="Police">
          <Select
            value={style.font}
            onValueChange={(family) => setStyle({ font: family, weight: nearestWeight(family, style.weight) }, "font")}
          >
            <SelectTrigger size="sm" className="w-40 text-xs" aria-label="Police">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(fontOptions).map(([family, label]) => (
                <SelectItem key={family} value={family} className="text-sm" style={{ fontFamily: `"${family.replace(/["\\;]/g, "")}", sans-serif` }}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
        {(fontMissing || fontFailure) && (
          <p className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              {fontMissing
                ? "Cette police a été retirée du module : le texte est dessiné avec une police de repli, à l’écran comme à l’export. Choisissez-en une autre."
                : `Cette police n’a pas pu être chargée (${fontFailure?.reason ?? "raison inconnue"}) : le texte est dessiné avec une police de repli.`}
            </span>
          </p>
        )}
        <p className="text-right text-[11px]">
          <Link href={FONTS_PATH} className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
            Ajouter une police
          </Link>
        </p>
        {font && font.weights.length > 1 && (
          <Choice
            label="Graisse"
            value={String(nearestWeight(style.font, style.weight))}
            options={Object.fromEntries(font.weights.map((weight) => [String(weight), weight >= 600 ? "Gras" : "Normal"]))}
            onChange={(weight) => setStyle({ weight: Number(weight) }, "weight")}
          />
        )}
        <Row label="Ajuster à la boîte">
          <Switch
            checked={region.text.autoFit}
            onCheckedChange={(autoFit) =>
              onPatch(
                // En coupant l'ajustement, le texte garde la taille qu'il avait à l'écran.
                (current) => {
                  const kept = !autoFit && layout && layout.lines.length > 0 ? patchStyle(current, { size: Math.round(layout.size) }) : current;
                  return { ...kept, text: { ...kept.text, autoFit } };
                },
                key("auto-fit"),
              )
            }
          />
        </Row>
        {region.text.autoFit ? (
          <Row label="Taille">
            <span className="font-mono text-xs tabular-nums">
              {layout && layout.lines.length > 0 ? `${formatNumber(layout.size)} px, ajustée` : "ajustée"}
            </span>
          </Row>
        ) : (
          <Slider label="Taille" unit="px" min={6} max={240} step={1} value={style.size} onChange={(size) => setStyle({ size }, "size")} />
        )}
        <Slider label="Interligne" min={0.8} max={2} step={0.02} value={style.lineHeight} onChange={(lineHeight) => setStyle({ lineHeight }, "line-height")} />
        <Row label="Alignement">
          {(["left", "center", "right"] as const).map((align) => {
            const Icon = align === "left" ? AlignLeft : align === "center" ? AlignCenter : AlignRight;
            const label = align === "left" ? "À gauche" : align === "center" ? "Centré" : "À droite";
            return (
              <button
                key={align}
                type="button"
                onClick={() => setStyle({ align }, "align")}
                aria-pressed={style.align === align}
                aria-label={label}
                title={label}
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-md transition-colors",
                  style.align === align ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            );
          })}
        </Row>
        <Row label="Italique">
          <Switch checked={style.italic} onCheckedChange={(italic) => setStyle({ italic }, "italic")} />
        </Row>
        <Row label="Capitales">
          <Switch checked={style.uppercase} onCheckedChange={(uppercase) => setStyle({ uppercase }, "uppercase")} />
        </Row>
        <ColorField label="Couleur" value={style.color} onChange={(color) => setStyle({ color }, "color")} />
        <Row label="Contour">
          <Switch
            checked={Boolean(style.stroke && style.stroke.width > 0)}
            onCheckedChange={(checked) =>
              // Une épaisseur nulle, et non l'absence de contour : le type de zone peut en imposer un.
              setStyle({ stroke: { color: style.stroke?.color ?? contrastOf(style.color), width: checked ? Math.max(2, Math.round(style.size / 12)) : 0 } }, "stroke")
            }
          />
        </Row>
        {style.stroke && style.stroke.width > 0 && (
          <>
            <ColorField label="Couleur du contour" value={style.stroke.color} onChange={(color) => setStyle({ stroke: { ...style.stroke!, color } }, "stroke-color")} />
            <Slider
              label="Épaisseur du contour"
              unit="px"
              min={0.5}
              max={24}
              step={0.5}
              value={style.stroke.width}
              onChange={(width) => setStyle({ stroke: { ...style.stroke!, width } }, "stroke-width")}
            />
          </>
        )}
        {lettering && (
          <>
            <Slider
              label="Espacement des lettres"
              unit="%"
              min={-10}
              max={60}
              step={1}
              value={Math.round((style.letterSpacing ?? 0) * 100)}
              onChange={(percent) => setStyle({ letterSpacing: percent === 0 ? undefined : percent / 100 }, "letter-spacing")}
            />
            <Slider
              label="Étirement"
              unit="%"
              min={40}
              max={300}
              step={5}
              value={Math.round((style.stretch ?? 1) * 100)}
              onChange={(percent) => setStyle({ stretch: percent === 100 ? undefined : percent / 100 }, "stretch")}
            />
          </>
        )}
        <Slider
          label="Rotation"
          unit="°"
          min={-180}
          max={180}
          step={1}
          value={region.text.box.rotation}
          onChange={(rotation) => onPatch((current) => ({ ...current, text: { ...current.text, box: { ...current.text.box, rotation } } }), key("rotation"))}
        />
        <div className="grid grid-cols-2 gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 text-[11px]"
            onClick={() => onPatch((current) => ({ ...current, text: { ...current.text, box: { ...boundsOf(current.outline), rotation: 0 } } }), key("box-reset"))}
          >
            Recaler sur le contour
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 text-[11px]"
            disabled={region.text.style === null}
            onClick={() => onPatch((current) => ({ ...current, text: { ...current.text, style: null } }), key("style-reset"))}
          >
            Revenir au style du type
          </Button>
        </div>
      </Section>

      {props.ai && (
        <Section title="IA, en dernier recours">
          <RegionAi pageId={props.page.id} chapterId={props.ai.chapterId} region={region} flush={props.ai.flush} onPatch={onPatch} />
        </Section>
      )}
    </>
  );
}

/** Où en est le fond reconstruit, et ce que la méthode sait faire. */
function InpaintNote({ status }: { status: InpaintStatus | null }) {
  if (status?.state === "failed") {
    return (
      <p className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
        <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>{status.message}</span>
      </p>
    );
  }
  return (
    <p className="text-xs leading-snug text-muted-foreground">
      {status?.state === "ready"
        ? `Fond reconstruit d’après les pixels voisins${status.grain ? ", trame comprise" : ""}, dans le navigateur et sans IA.`
        : "Reconstruction du fond en cours…"}{" "}
      Elle prolonge un aplat, un dégradé ou une trame ; un trait du dessin qui traversait la zone s’arrête à son bord.
    </p>
  );
}

// ─── Blocs communs ───────────────────────────────────────────────

const formatNumber = (value: number) => Number(value.toFixed(2)).toLocaleString("fr-FR");

/** Noir ou blanc, à l'opposé de la couleur donnée : point de départ d'un contour lisible. */
function contrastOf(color: string): string {
  const hex = toHex6(color).slice(1);
  const [r, g, b] = [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 128 ? "#111111" : "#ffffff";
}

/** `<input type="color">` ne connaît que `#rrggbb`. */
function toHex6(color: string): string {
  if (/^#[0-9a-f]{6}$/i.test(color)) return color.toLowerCase();
  if (/^#[0-9a-f]{8}$/i.test(color)) return color.slice(0, 7).toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(color)) return `#${Array.from(color.slice(1), (digit) => digit + digit).join("")}`.toLowerCase();
  return "#ffffff";
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2.5">
      <h3 className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{title}</h3>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-7 items-center justify-between gap-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1">{children}</div>
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block space-y-1">
      <span className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono tabular-nums">
          {formatNumber(value)}
          {unit ? `\u00a0${unit}` : ""}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-primary"
      />
    </label>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const hex = toHex6(value);
  return (
    <Row label={label}>
      <span className="font-mono text-[11px] text-muted-foreground uppercase">{hex}</span>
      <input
        type="color"
        value={hex}
        onChange={(event) => onChange(event.target.value)}
        className="h-7 w-10 cursor-pointer rounded border bg-transparent"
        aria-label={label}
      />
    </Row>
  );
}

function Choice<T extends string>({
  label,
  value,
  options,
  order,
  onChange,
}: {
  label: string;
  value: T;
  options: Record<T, string>;
  /** Ordre d'affichage, quand celui des clés ne convient pas. */
  order?: readonly T[];
  onChange: (value: T) => void;
}) {
  return (
    <Row label={label}>
      <Select value={value} onValueChange={(next) => onChange(next as T)}>
        <SelectTrigger size="sm" className="w-40 text-xs" aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(order ?? (Object.keys(options) as T[])).map((key) => (
            <SelectItem key={key} value={key} className="text-xs">
              {options[key]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Row>
  );
}
