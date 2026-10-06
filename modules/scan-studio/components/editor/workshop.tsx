"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  CloudOff,
  Download,
  Eye,
  EyeOff,
  ImageDown,
  Loader2,
  Maximize,
  Minus,
  Plus,
  Redo2,
  Undo2,
  Languages,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { api, newId, uploadImage } from "../../lib/client";
import { styleTableFamilies, usedFontFamilies } from "../../lib/custom-fonts";
import { ensureCustomFonts, ensureFonts, fetchCustomFonts, nearestWeight, type FontLoadFailure } from "../../lib/fonts";
import type { Rect } from "../../lib/geometry";
import { chapterHref, chapterLabel, editorHref, errorMessage } from "../../lib/library-helpers";
import { sampleBackgroundColor, sampleColorAt, type PixelData } from "../../lib/mask-color";
import {
  createRegion,
  createSfxRegion,
  duplicateRegion,
  findRegion,
  neighbourId,
  removeRegion,
  setMaskColor,
  shiftRegion,
  updateRegion,
} from "../../lib/region-edit";
import { createMeasure, layoutRegion, renderPage } from "../../lib/render";
import { minReadableSize, type Measure, type TextLayout } from "../../lib/text-layout";
import { boundsOf, resolveStyle, type CustomFont, type PageView, type Point, type ScanRegion, type TextStyle } from "../../lib/types";
// Analyse automatique de la page (niveau 1) : tout est dans `analyze-action.tsx`.
import { AnalysisIndicator, AnalyzeButton, usePageAnalysis } from "./analyze-action";
import { ENGINE_NAMES } from "../library/engine-logo";
import { readZoneOnSurface } from "../../lib/analysis";
import { applyTranslations, collectTexts, enginesUnavailable, isLocked, statusAfterTranslation } from "../../lib/translate-pages";
import { WORKSPACE_CLASS } from "./editor-skeleton";
import { Inspector, TRANSLATION_FIELD, type InspectorAi } from "./inspector";
import { RegionMenuItems, type RegionActions } from "./region-menu";
import { RegionStrip } from "./region-strip";
import { Stage, type StageHandle } from "./stage";
import { TOOLS, VIEW_LABELS, isTypingTarget, type Tool, type ViewMode } from "./tools";
import { useInpaint } from "./use-inpaint";
import { createPixelReader, type ReadPixels } from "../../lib/inpaint-patch";
import { exportNameOf } from "../../lib/page-export";
import { usePageHistory, type SaveState } from "./use-page-history";

/** Plafond de zones d'une page à l'enregistrement (voir `sanitize-page.ts`). */
const MAX_REGIONS = 400;

/**
 * Style copié d'une zone. Gardé hors du composant : il survit au passage à la
 * page suivante, pour reporter un même lettrage sur tout un chapitre.
 */
let styleClipboard: { style: TextStyle; autoFit: boolean } | null = null;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function download(url: string, name: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

interface WorkshopProps {
  view: PageView;
  /** Relit la page sur le serveur, après un conflit de révision. */
  onReload: () => void;
}

/**
 * Atelier d'une page : la scène au centre, les outils à gauche, l'inspecteur à
 * droite, le bandeau des zones en bas. Ce composant tient l'état de la séance
 * (outil, vue, sélection) et relie les gestes à l'historique de la page.
 */
export function Workshop({ view: pageView, onReload }: WorkshopProps) {
  const { page, chapter, folder } = pageView;
  const settings = chapter.settings;
  const router = useRouter();
  const { present, commit, undo, redo, canUndo, canRedo, saveState, saveError, savedAt, isSaved, flush, adoptStatus } = usePageHistory(
    page.id,
    { regions: page.regions, status: page.status },
    page.revision,
  );
  const regions = present.regions;
  const regionsRef = useRef(regions);
  regionsRef.current = regions;

  const [tool, setTool] = useState<Tool>("select");
  // Tant que rien n'est traduit, la page s'ouvre sur l'original : la vue « traduit » n'aurait rien à montrer.
  const [viewMode, setViewMode] = useState<ViewMode>(() => (page.regions.some((region) => region.translation.text.trim() !== "") ? "translated" : "original"));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showMasks, setShowMasks] = useState(true);
  const [showTexts, setShowTexts] = useState(true);
  const [brushWidth, setBrushWidth] = useState(() => clamp(Math.round(page.source.width / 60), 4, 80));
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [focusToken, setFocusToken] = useState(0);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [layoutCache, setLayoutCache] = useState(() => new WeakMap<ScanRegion, TextLayout>());
  const [canPasteStyle, setCanPasteStyle] = useState(styleClipboard !== null);
  const [exporting, setExporting] = useState(false);
  const [exported, setExported] = useState<{ url: string; name: string } | null>(null);
  const stageRef = useRef<StageHandle>(null);
  const measureRef = useRef<Measure | null>(null);
  const [customFonts, setCustomFonts] = useState<CustomFont[]>([]);
  const [fontFailures, setFontFailures] = useState<FontLoadFailure[]>([]);

  const selected = findRegion(regions, selectedId);
  const pageIndex = chapter.pageIds.indexOf(page.id);
  const previousPageId = pageIndex > 0 ? chapter.pageIds[pageIndex - 1] : null;
  const nextPageId = pageIndex >= 0 && pageIndex < chapter.pageIds.length - 1 ? chapter.pageIds[pageIndex + 1] : null;

  // ─── Image et polices ──────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const element = new Image();
    element.decoding = "async";
    element.src = pageView.imageUrl;
    element
      .decode()
      .then(() => {
        if (!cancelled) setImage(element);
      })
      .catch(() => {
        if (!cancelled) toast.error("L’image de cette page n’a pas pu être chargée");
      });
    // Un canevas dessine avec la police de repli tant que la vraie n'est pas
    // là : une fois prêtes, les mises en lignes sont à refaire.
    void ensureFonts().then(() => {
      if (!cancelled) setLayoutCache(new WeakMap());
    });
    return () => {
      cancelled = true;
    };
  }, [pageView.imageUrl]);

  // Polices ajoutées : la liste, pour le choix de police de l'inspecteur.
  useEffect(() => {
    let cancelled = false;
    fetchCustomFonts()
      .then((fonts) => {
        if (!cancelled) setCustomFonts(fonts);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // Celles que la page dessine sont chargées avant que la scène s'en serve ; une
  // fois là, les mises en lignes sont à refaire, comme pour les polices fournies.
  const usedFamilies = useMemo(
    () => [...new Set([...usedFontFamilies(regions, settings), ...styleTableFamilies(settings.styles)])].sort().join("\n"),
    [regions, settings],
  );
  useEffect(() => {
    let cancelled = false;
    void ensureCustomFonts(usedFamilies ? usedFamilies.split("\n") : []).then((failures) => {
      if (cancelled) return;
      setFontFailures(failures);
      setLayoutCache(new WeakMap());
    });
    return () => {
      cancelled = true;
    };
  }, [usedFamilies]);

  useEffect(
    () => () => {
      if (exported) URL.revokeObjectURL(exported.url);
    },
    [exported],
  );

  /** Mise en lignes de chaque traduction : la taille ajustée, et les textes qui débordent. */
  const layouts = useMemo(() => {
    const result = new Map<string, TextLayout>();
    if (typeof document === "undefined") return result;
    if (!measureRef.current) {
      const ctx = document.createElement("canvas").getContext("2d");
      if (!ctx) return result;
      measureRef.current = createMeasure(ctx, nearestWeight);
    }
    const minSize = minReadableSize(page.source.width);
    for (const region of regions) {
      if (region.translation.text.trim()) {
        result.set(region.id, layoutRegion(region, settings, measureRef.current, { minSize, cache: layoutCache }));
      }
    }
    return result;
  }, [regions, settings, layoutCache, page.source.width]);

  const overflowing = useMemo(() => {
    const ids = new Set<string>();
    layouts.forEach((layout, id) => {
      if (!layout.fits) ids.add(id);
    });
    return ids;
  }, [layouts]);

  // ─── Pixels de la page ─────────────────────────────────────────

  /** Pixels d'un rectangle de l'image d'origine, et le coin où il commence. Seule cette portion est décodée. */
  const readPixels = useMemo<ReadPixels>(() => {
    if (!image) return () => null;
    return createPixelReader(image, page.source);
  }, [image, page.source]);

  /** Couleur du fond autour d'un contour : celle que prendra son masque. */
  const backgroundColorOf = useCallback(
    (outline: Point[]): string => {
      const bounds = boundsOf(outline);
      const ring = clamp(Math.round(page.source.width / 400), 2, 6);
      const read = readPixels({ x: bounds.x - ring - 1, y: bounds.y - ring - 1, width: bounds.width + 2 * ring + 2, height: bounds.height + 2 * ring + 2 });
      if (!read) return "#ffffff";
      return sampleBackgroundColor(read.pixels, { ...bounds, x: bounds.x - read.offset.x, y: bounds.y - read.offset.y }, { ring });
    },
    [readPixels, page.source.width],
  );

  // ─── Fond reconstruit ──────────────────────────────────────────
  const inpaint = useInpaint(regions, page.source, readPixels, image !== null);
  const inpaintRef = useRef(inpaint);
  inpaintRef.current = inpaint;

  // ─── Modifications ─────────────────────────────────────────────

  const patchRegion = useCallback(
    (regionId: string, update: (region: ScanRegion) => ScanRegion, key?: string) =>
      commit((current) => {
        const next = updateRegion(current.regions, regionId, update);
        return next === current.regions ? current : { ...current, regions: next };
      }, key),
    [commit],
  );

  const changeRegions = useCallback(
    (update: (regions: ScanRegion[]) => ScanRegion[]) =>
      commit((current) => {
        const next = update(current.regions);
        return next === current.regions ? current : { ...current, regions: next };
      }),
    [commit],
  );

  const canAddRegion = useCallback(() => {
    if (regionsRef.current.length < MAX_REGIONS) return true;
    toast.info(`Une page porte au plus ${MAX_REGIONS} zones`);
    return false;
  }, []);

  /** Lecture du texte d'une zone ; tenue dans une référence, car elle dépend de l'analyse, déclarée plus bas. */
  const readZoneRef = useRef<((regionId: string, automatic: boolean, outline?: Point[]) => void) | null>(null);
  const readingZoneRef = useRef(false);
  const [readingZoneId, setReadingZoneId] = useState<string | null>(null);

  /** Nouvelle zone tracée sur la scène : on la sélectionne et le curseur va dans sa traduction. */
  const createRegionFrom = useCallback(
    (outline: Point[], kind?: "sfx") => {
      if (!canAddRegion()) return;
      const region = kind === "sfx" ? createSfxRegion(newId(), outline, backgroundColorOf(outline)) : createRegion(newId(), outline, backgroundColorOf(outline));
      changeRegions((current) => [...current, region]);
      setSelectedId(region.id);
      setTool("select");
      setFocusToken((token) => token + 1);
      // Le texte que le repérage n'a pas vu : on le lit là où la zone vient d'être tracée.
      if (kind !== "sfx") readZoneRef.current?.(region.id, true, outline);
    },
    [canAddRegion, backgroundColorOf, changeRegions],
  );

  const removeSelected = useCallback(
    (regionId: string) => {
      changeRegions((current) => removeRegion(current, regionId));
      setSelectedId((current) => (current === regionId ? null : current));
    },
    [changeRegions],
  );

  const duplicate = useCallback(
    (regionId: string) => {
      if (!canAddRegion()) return;
      // L'identifiant est tiré ici : il faut le connaître pour sélectionner la copie.
      const copyId = newId();
      const offset = Math.max(8, Math.round(page.source.width / 50));
      changeRegions((current) => duplicateRegion(current, regionId, copyId, offset, page.source));
      setSelectedId(copyId);
    },
    [canAddRegion, changeRegions, page.source],
  );

  const actions: RegionActions = useMemo(
    () => ({
      duplicate,
      shift: (regionId, delta) => changeRegions((current) => shiftRegion(current, regionId, delta)),
      copyStyle: (regionId) => {
        const region = findRegion(regionsRef.current, regionId);
        if (!region) return;
        styleClipboard = { style: structuredClone(resolveStyle(region, settings)), autoFit: region.text.autoFit };
        setCanPasteStyle(true);
        toast.success("Style copié");
      },
      pasteStyle: (regionId) => {
        const copied = styleClipboard;
        if (!copied) return;
        patchRegion(regionId, (region) => ({ ...region, text: { ...region.text, style: structuredClone(copied.style), autoFit: copied.autoFit } }));
      },
      remove: removeSelected,
      canPasteStyle,
    }),
    [duplicate, changeRegions, patchRegion, removeSelected, canPasteStyle, settings],
  );

  /** Pipette : la couleur de la page sous le clic devient celle du masque sélectionné. */
  const pickColor = useCallback(
    (point: Point) => {
      if (!selectedId || !findRegion(regionsRef.current, selectedId)) {
        toast.info("Sélectionnez d’abord la zone dont vous réglez le masque");
        return;
      }
      const read = readPixels({ x: point.x - 2, y: point.y - 2, width: 5, height: 5 });
      const color = read ? sampleColorAt(read.pixels, point.x - read.offset.x, point.y - read.offset.y, 1) : null;
      if (!color) {
        toast.error("Couleur illisible à cet endroit de la page");
        return;
      }
      // Les retouches au pinceau suivent la nouvelle couleur ; un masque coupé repasse en aplat.
      patchRegion(selectedId, (region) => {
        const recolored = setMaskColor(region, color);
        return recolored.mask.kind === "none" ? { ...recolored, mask: { ...recolored.mask, kind: "fill" } } : recolored;
      });
      setTool("select");
    },
    [selectedId, readPixels, patchRegion],
  );

  /**
   * Quitte la page en cours pour une autre adresse : ce qui n'est pas encore
   * envoyé part d'abord. Si l'enregistrement échoue, on reste, et on propose
   * de partir quand même.
   */
  const leaveTo = useCallback(
    async (href: string) => {
      const hadChanges = !isSaved();
      await flush();
      if (!isSaved()) {
        toast.error("Vos dernières modifications ne sont pas enregistrées", {
          description: "L’enregistrement a échoué. Vous pouvez rester sur la page et réessayer.",
          action: { label: "Quitter quand même", onClick: () => router.push(href) },
          duration: 12_000,
        });
        return;
      }
      if (hadChanges) toast.success("Modifications enregistrées");
      router.push(href);
    },
    [flush, isSaved, router],
  );

  const goToPage = useCallback(
    (pageId: string | null) => {
      if (pageId) void leaveTo(editorHref(pageId));
    },
    [leaveTo],
  );

  // ─── Export ────────────────────────────────────────────────────

  /**
   * Rend la page à sa taille réelle avec `renderPage`, la fonction qui dessine
   * la vue « traduit », puis dépose le PNG et le déclare au serveur.
   */
  const exportPage = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      if (!image) throw new Error("L’image de la page n’est pas encore chargée");
      await flush();
      await ensureFonts();
      // Une police ajoutée qui ne se charge pas donnerait un export différent de l'aperçu d'une autre machine : on s'arrête.
      const unloaded = (await ensureCustomFonts(usedFontFamilies(regionsRef.current, settings))).filter((failure) => failure.name);
      if (unloaded.length > 0) {
        throw new Error(`La police « ${unloaded[0].name} » n’a pas pu être chargée : ${unloaded[0].reason}`);
      }
      // Les fonds en cours de reconstruction sont attendus : l'export pose les mêmes que l'aperçu.
      await inpaintRef.current.settle();
      const canvas = document.createElement("canvas");
      canvas.width = page.source.width;
      canvas.height = page.source.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Cette page est trop grande pour être rendue par le navigateur");
      ctx.imageSmoothingQuality = "high";
      renderPage(ctx, page.source, image, regionsRef.current, settings, {
        view: "translated",
        resolveWeight: nearestWeight,
        resolveInpaint: inpaintRef.current.resolve,
      });
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("Cette page est trop grande pour être rendue par le navigateur");

      const name = exportNameOf(page.name, settings.targetLanguage);
      const uploaded = await uploadImage(blob, name);
      const summary = await api.registerExport(page.id, uploaded.file);
      adoptStatus(summary.status);
      const url = URL.createObjectURL(blob);
      setExported({ url, name });
      toast.success("Page exportée", { action: { label: "Télécharger", onClick: () => download(url, name) } });
    } catch (error) {
      toast.error(errorMessage(error, "Export impossible"));
    } finally {
      setExporting(false);
    }
  };

  // ─── Clavier ───────────────────────────────────────────────────
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      // Un menu ou une liste déroulante ouverts gardent leur clavier.
      if (target?.closest?.("[data-radix-popper-content-wrapper], [role='menu'], [role='dialog']")) return;
      const typing = isTypingTarget(target);
      const inTranslation = Boolean(target?.hasAttribute?.(TRANSLATION_FIELD));
      const ctrl = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();

      // Tab : zone suivante. Depuis le champ de traduction, le curseur y reste,
      // pour traduire toute la page sans lâcher le clavier.
      if (event.key === "Tab" && !ctrl && !event.altKey && (!typing || inTranslation)) {
        const next = neighbourId(regionsRef.current, selectedId, event.shiftKey ? -1 : 1);
        if (!next) return;
        event.preventDefault();
        setSelectedId(next);
        if (inTranslation) setFocusToken((token) => token + 1);
        return;
      }
      if (event.key === "Escape") {
        if (typing) target?.blur();
        else if (stageRef.current?.cancelDraft()) return;
        else if (tool !== "select") setTool("select");
        else setSelectedId(null);
        return;
      }
      if (ctrl && key === "s") {
        event.preventDefault();
        void flush().then(() => {
          if (isSaved()) toast.success("Modifications enregistrées", { id: "scan-studio-saved" });
        });
        return;
      }
      if (typing) return;

      if (event.code === "Space") {
        event.preventDefault();
        setSpaceHeld(true);
      } else if (ctrl && key === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (ctrl && key === "y") {
        event.preventDefault();
        redo();
      } else if (ctrl && key === "d" && selectedId) {
        event.preventDefault();
        duplicate(selectedId);
      } else if (ctrl && key === "0") {
        event.preventDefault();
        stageRef.current?.fit();
      } else if (ctrl || event.altKey) {
        return;
      } else if (event.key === "Enter") {
        if (stageRef.current?.closeDraft()) {
          event.preventDefault();
        } else if (findRegion(regionsRef.current, selectedId) && !target?.closest?.("button, a")) {
          event.preventDefault();
          setFocusToken((token) => token + 1);
        }
      } else if ((event.key === "Delete" || event.key === "Backspace") && selectedId) {
        event.preventDefault();
        removeSelected(selectedId);
      } else if (event.key.startsWith("Arrow")) {
        event.preventDefault();
        if (selectedId) {
          // Une zone est sélectionnée : les flèches poussent son texte, de 1 px ou de 10 avec Maj.
          const step = event.shiftKey ? 10 : 1;
          const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
          const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
          patchRegion(
            selectedId,
            (region) => ({ ...region, text: { ...region.text, box: { ...region.text.box, x: region.text.box.x + dx, y: region.text.box.y + dy } } }),
            `${selectedId}:nudge`,
          );
        } else if (event.key === "ArrowLeft") {
          goToPage(previousPageId);
        } else if (event.key === "ArrowRight") {
          goToPage(nextPageId);
        }
      } else if (key === "o") {
        setViewMode((current) => (current === "original" ? "translated" : "original"));
      } else {
        const shortcut = TOOLS.find((entry) => entry.shortcut.toLowerCase() === key);
        if (shortcut) setTool(shortcut.id);
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") setSpaceHeld(false);
    };
    const onBlur = () => setSpaceHeld(false);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [selectedId, tool, undo, redo, flush, duplicate, removeSelected, patchRegion, goToPage, previousPageId, nextPageId, isSaved]);

  const selectedIndex = selected ? regions.indexOf(selected) : -1;

  // ─── IA en dernier recours ─────────────────────────────────────

  /** La page telle que l'atelier la compose, pour la comparer à une version rendue par IA. */
  const renderManual = useCallback(
    (canvas: HTMLCanvasElement, width: number) => {
      const scale = width / page.source.width;
      canvas.width = width;
      canvas.height = Math.max(1, Math.round(page.source.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.scale(scale, scale);
      ctx.imageSmoothingQuality = "high";
      renderPage(ctx, page.source, image, regionsRef.current, settings, {
        view: "translated",
        resolveWeight: nearestWeight,
        resolveInpaint: inpaintRef.current.resolve,
      });
    },
    [image, page.source, settings],
  );

  // Sous le niveau 3, rien de l'IA n'est montré ; le serveur refuserait de toute façon.
  const ai: InspectorAi | null = useMemo(
    () =>
      settings.maxLevel >= 3
        ? { chapterId: chapter.id, image, renderManual, flush, onPatchRegion: patchRegion, onSelectRegion: setSelectedId }
        : null,
    [settings.maxLevel, chapter.id, image, renderManual, flush, patchRegion],
  );

  // ─── Analyse automatique ───────────────────────────────────────
  const getRegions = useCallback(() => regionsRef.current, []);
  const analysis = usePageAnalysis({ image, page: page.source, settings, commit, getRegions });

  /**
   * Lit le texte qui se trouve dans le contour d'une zone, avec le moteur de
   * l'analyse, dans le navigateur. `automatic` : la zone vient d'être tracée ;
   * on ne remplit alors que si rien n'a été saisi entre-temps, et on ne dit
   * rien si la lecture ne donne rien.
   */
  const canReadZone = image !== null && !analysis.blocker;
  const readZone = useCallback(
    (regionId: string, automatic: boolean, drawn?: Point[]) => {
      // Une zone tracée à l'instant n'est pas encore dans l'état de la page : son contour est passé tel quel.
      const outline = drawn ?? regionsRef.current.find((region) => region.id === regionId)?.outline;
      if (!image || analysis.blocker || !outline || readingZoneRef.current) return;
      readingZoneRef.current = true;
      setReadingZoneId(regionId);
      readZoneOnSurface(image, page.source, boundsOf(outline), settings)
        .then((found) => {
          if (!found) {
            if (!automatic) toast.info("Aucun texte lu dans cette zone", { description: "Resserrez le contour autour du texte, ou saisissez-le à la main." });
            return;
          }
          let filled = false;
          patchRegion(regionId, (region) => {
            // Tracé à l'instant : ce qui a été saisi pendant la lecture n'est pas écrasé.
            if (automatic && region.reading.clean.trim() !== "") return region;
            filled = true;
            return { ...region, direction: found.direction, reading: found.reading };
          });
          if (filled) toast.success("Texte lu dans la zone", { description: found.reading.clean.slice(0, 80) });
        })
        .catch((error: unknown) => {
          if (!automatic) toast.error(errorMessage(error, "Lecture de la zone impossible"));
        })
        .finally(() => {
          readingZoneRef.current = false;
          setReadingZoneId(null);
        });
    },
    [image, analysis.blocker, page.source, settings, patchRegion],
  );
  readZoneRef.current = readZone;

  // ─── Traduction de la page ─────────────────────────────────────
  const [translating, setTranslating] = useState(false);
  const translatingRef = useRef(false);
  /** Pourquoi la traduction automatique n'est pas permise ici ; `null` : elle l'est. */
  const translateBlocker = settings.maxLevel < 2 ? "Le niveau de ce chapitre n’autorise pas la traduction automatique : réglez-le dans le chapitre." : null;

  /**
   * Traduit les zones de la page qui ont un texte d'origine et pas encore de
   * traduction, par les moteurs réglés dans « Moteurs ». Un clic, une demande :
   * rien n'est relancé tout seul. Les propositions se posent dans les zones et
   * la vue passe sur « Traduit ».
   */
  const translatePage = useCallback(async (onlyRegionId?: string) => {
    if (translatingRef.current || translateBlocker) return;
    // Une seule zone : on la retraduit même si elle a déjà une proposition.
    const scope = onlyRegionId ? regionsRef.current.filter((region) => region.id === onlyRegionId) : regionsRef.current;
    const items = collectTexts({ regions: scope }, { retranslate: Boolean(onlyRegionId), skipKinds: onlyRegionId ? [] : undefined });
    if (items.length === 0 && onlyRegionId) {
      // Une traduction corrigée ou validée à la main n'est jamais remplacée : on le dit plutôt que de ne rien faire.
      if (scope.some(isLocked)) {
        toast.info("Cette traduction a été corrigée à la main : elle n’est pas remplacée", { description: "Videz le champ « Traduction » si vous voulez une nouvelle proposition." });
      } else {
        toast.info("Cette zone n’a pas de texte d’origine à traduire", { description: "Saisissez-le, ou utilisez « Lire le texte de la zone »." });
      }
      return;
    }
    if (items.length === 0) {
      const any = regionsRef.current.length > 0;
      toast.info(any ? "Rien à traduire sur cette page" : "Aucune zone sur cette page", {
        description: any ? "Toutes les zones ont déjà une traduction, ou n’ont pas de texte d’origine." : "Lancez d’abord « Analyser », ou tracez une zone autour d’un texte.",
      });
      return;
    }
    translatingRef.current = true;
    setTranslating(true);
    const pending = toast.loading(`Traduction de ${items.length} ${items.length < 2 ? "zone" : "zones"}…`);
    try {
      const batch = await api.translateTexts(chapter.id, items);
      let applied = 0;
      if (batch.results.length > 0) {
        commit((current) => {
          const merged = applyTranslations(current.regions, batch.results, Date.now());
          applied = merged.applied;
          if (merged.applied === 0) return current;
          return { regions: merged.regions, status: statusAfterTranslation(current.status, merged.regions) ?? current.status };
        });
        setViewMode("translated");
      }
      const engine = batch.results.find((result) => result.engine)?.engine;
      if (batch.failed.length === 0) {
        toast.success(`${batch.results.length} ${batch.results.length < 2 ? "zone traduite" : "zones traduites"}`, {
          id: pending,
          description: engine ? `Par ${ENGINE_NAMES[engine]}. Relisez les propositions : Ctrl+Z annule.` : "Depuis le glossaire, la mémoire ou le cache.",
        });
      } else if (batch.results.length > 0) {
        toast.warning(`${batch.results.length} ${batch.results.length < 2 ? "zone traduite" : "zones traduites"}, ${batch.failed.length} sans réponse`, {
          id: pending,
          description: batch.failed[0].error,
          duration: 10_000,
        });
      } else {
        toast.error(enginesUnavailable(batch) ? "Aucun moteur de traduction ne répond" : "La traduction n’a rien rendu", {
          id: pending,
          description: batch.failed[0]?.error,
          duration: 12_000,
        });
      }
      void applied;
    } catch (error) {
      toast.error(errorMessage(error, "Traduction impossible"), { id: pending });
    } finally {
      translatingRef.current = false;
      setTranslating(false);
    }
  }, [translateBlocker, chapter.id, commit]);

  return (
    <div className={WORKSPACE_CLASS}>
      {/* ─── En-tête ─────────────────────────────────────────────── */}
      <header className="flex min-h-12 shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b px-3 py-1.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button asChild variant="ghost" size="icon" className="h-8 w-8 shrink-0">
              <Link
                href={chapterHref(chapter.id)}
                aria-label="Retour au chapitre"
                onClick={(event) => {
                  // Clic ordinaire : on enregistre avant de partir. Un clic du milieu ou avec Ctrl ouvre un autre onglet, rien à retenir.
                  if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey) return;
                  event.preventDefault();
                  void leaveTo(chapterHref(chapter.id));
                }}
              >
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Retour au chapitre</TooltipContent>
        </Tooltip>
        {/* Le chapitre garde une largeur lisible ; le dossier ne s'affiche que s'il reste de la place. */}
        <div className="flex min-w-[5.5rem] max-w-56 shrink items-baseline gap-1.5 text-sm" title={`${folder.name} › ${chapterLabel(chapter)}`}>
          <span className="hidden max-w-32 truncate text-muted-foreground min-[1800px]:inline">{folder.name}</span>
          <span className="hidden text-muted-foreground min-[1800px]:inline">›</span>
          <span className="truncate font-semibold">{chapterLabel(chapter)}</span>
        </div>

        <div className="flex shrink-0 items-center">
          <IconButton label="Page précédente" disabled={!previousPageId} onClick={() => goToPage(previousPageId)}>
            <ChevronLeft className="h-4 w-4" />
          </IconButton>
          <span className="px-1 font-mono text-xs whitespace-nowrap tabular-nums text-muted-foreground">
            <span className="hidden min-[1800px]:inline">page </span>
            {pageIndex + 1} / {chapter.pageIds.length}
          </span>
          <IconButton label="Page suivante" disabled={!nextPageId} onClick={() => goToPage(nextPageId)}>
            <ChevronRight className="h-4 w-4" />
          </IconButton>
        </div>

        <span className="shrink-0 text-xs text-muted-foreground">Affichage</span>
        <div role="radiogroup" aria-label="Vue de la page" className="flex shrink-0 items-center rounded-md bg-muted/60 p-0.5">
          {(Object.keys(VIEW_LABELS) as ViewMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={viewMode === mode}
              title={mode === "side" ? "Affiche l’original et la traduction côte à côte" : "Change seulement l’affichage, ne traduit rien. O bascule entre l’original et la traduction."}
              onClick={() => setViewMode(mode)}
              className={cn(
                "h-7 rounded-[5px] px-2.5 text-xs whitespace-nowrap transition-colors",
                // La vue affichée se voit d'un coup d'œil : c'est le seul segment en couleur.
                viewMode === mode ? "bg-primary font-medium text-primary-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {VIEW_LABELS[mode]}
            </button>
          ))}
        </div>

        <SaveIndicator state={saveState} error={saveError} savedAt={savedAt} onRetry={() => void flush()} onReload={onReload} />
        <AnalysisIndicator analysis={analysis} />

        <div className="ml-auto flex shrink-0 items-center gap-1">
          <ToggleButton
            label="Masques"
            hint="Montre ou cache les masques à l’écran, pour voir l’original dessous. L’export les garde toujours."
            pressed={showMasks}
            onToggle={() => setShowMasks((current) => !current)}
          />
          <ToggleButton
            label="Textes"
            hint="Montre ou cache les textes traduits à l’écran. L’export les garde toujours."
            pressed={showTexts}
            onToggle={() => setShowTexts((current) => !current)}
          />
          <div className="mx-1 flex items-center">
            <IconButton label="Dézoomer" onClick={() => stageRef.current?.zoomBy(1 / 1.25)}>
              <Minus className="h-4 w-4" />
            </IconButton>
            <span className="w-11 text-center font-mono text-xs tabular-nums text-muted-foreground">{Math.round(zoom * 100)}{" "}%</span>
            <IconButton label="Zoomer" onClick={() => stageRef.current?.zoomBy(1.25)}>
              <Plus className="h-4 w-4" />
            </IconButton>
            <IconButton label="Ajuster à la fenêtre (Ctrl 0)" onClick={() => stageRef.current?.fit()}>
              <Maximize className="h-4 w-4" />
            </IconButton>
          </div>
          <IconButton label="Annuler (Ctrl Z)" disabled={!canUndo} onClick={undo}>
            <Undo2 className="h-4 w-4" />
          </IconButton>
          <IconButton label="Rétablir (Ctrl Maj Z)" disabled={!canRedo} onClick={redo}>
            <Redo2 className="h-4 w-4" />
          </IconButton>
          <AnalyzeButton analysis={analysis} />
          <Tooltip>
            <TooltipTrigger asChild>
              {/* Un bouton coupé ne reçoit pas le survol : l'enveloppe porte l'infobulle. */}
              <span className="inline-flex" tabIndex={translateBlocker ? 0 : undefined}>
                <Button variant="outline" size="sm" className="h-8 gap-2" disabled={translating || translateBlocker !== null} onClick={() => void translatePage()}>
                  {translating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Languages className="h-4 w-4" />}
                  Traduire<span className="hidden min-[1800px]:inline"> la page</span>
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-64">
              {translateBlocker ?? "Traduit les zones qui n’ont pas encore de traduction, par les moteurs de la page « Moteurs ». Le texte des bulles part chez le moteur utilisé."}
            </TooltipContent>
          </Tooltip>
          <Button size="sm" className="ml-2 h-8 gap-2" disabled={exporting || !image} onClick={() => void exportPage()}>
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageDown className="h-4 w-4" />}
            Exporter<span className="hidden min-[1800px]:inline"> la page</span>
          </Button>
          {exported && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button asChild variant="outline" size="icon" className="h-8 w-8">
                  <a href={exported.url} download={exported.name} aria-label="Télécharger la page exportée">
                    <Download className="h-4 w-4" />
                  </a>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Télécharger la page exportée</TooltipContent>
            </Tooltip>
          )}
        </div>
      </header>

      {/* ─── Espace de travail ──────────────────────────────────── */}
      <div className="flex min-h-0 flex-1">
        <nav className="flex w-14 shrink-0 flex-col items-center gap-1 overflow-y-auto border-r py-2" aria-label="Outils">
          {TOOLS.map((entry) => (
            <Tooltip key={entry.id}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setTool(entry.id)}
                  aria-pressed={tool === entry.id}
                  aria-label={entry.label}
                  aria-keyshortcuts={entry.shortcut}
                  className={cn(
                    "flex size-10 items-center justify-center rounded-lg transition-colors",
                    tool === entry.id ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                  )}
                >
                  <entry.icon className="h-5 w-5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                {entry.label} ({entry.shortcut})
              </TooltipContent>
            </Tooltip>
          ))}
        </nav>

        <Stage
          ref={stageRef}
          page={page.source}
          image={image}
          regions={regions}
          settings={settings}
          view={viewMode}
          tool={tool}
          panning={spaceHeld}
          selectedId={selected ? selected.id : null}
          showMasks={showMasks}
          showTexts={showTexts}
          brushWidth={brushWidth}
          layoutCache={layoutCache}
          resolveInpaint={inpaint.resolve}
          onSelect={setSelectedId}
          onPatchRegion={patchRegion}
          onCreateRegion={createRegionFrom}
          onPickColor={pickColor}
          onEditText={() => setFocusToken((token) => token + 1)}
          onZoomChange={setZoom}
          menu={
            selected ? <RegionMenuItems variant="context" regionId={selected.id} index={selectedIndex} count={regions.length} actions={actions} /> : null
          }
        />

        <aside className="w-80 shrink-0 border-l" aria-label="Inspecteur">
          <Inspector
            page={page}
            status={present.status}
            onStatusChange={(status) => commit((current) => (current.status === status ? current : { ...current, status }))}
            regions={regions}
            region={selected}
            settings={settings}
            layout={selected ? layouts.get(selected.id) ?? null : null}
            tool={tool}
            onToolChange={setTool}
            brushWidth={brushWidth}
            onBrushWidthChange={setBrushWidth}
            focusToken={focusToken}
            onPatch={(update, key) => selected && patchRegion(selected.id, update, key)}
            onAutoColor={() => selected && patchRegion(selected.id, (region) => setMaskColor(region, backgroundColorOf(region.outline)))}
            actions={actions}
            customFonts={customFonts}
            fontFailures={fontFailures}
            inpaintStatus={selected ? inpaint.statusOf(selected.id) : null}
            ai={ai}
            onTranslateZone={selected && !translateBlocker ? () => void translatePage(selected.id) : undefined}
            translatingZone={translating}
            onReadZone={selected && canReadZone ? () => readZone(selected.id, false) : undefined}
            readingZone={selected ? readingZoneId === selected.id : false}
          />
        </aside>
      </div>

      {/* ─── Zones ──────────────────────────────────────────────── */}
      <RegionStrip regions={regions} selectedId={selected ? selected.id : null} onSelect={setSelectedId} overflowing={overflowing} actions={actions} />
    </div>
  );
}

function SaveIndicator({
  state,
  error,
  savedAt,
  onRetry,
  onReload,
}: {
  state: SaveState;
  error: string | null;
  /** Heure du dernier enregistrement de cette visite ; `null` : rien n'a encore été modifié. */
  savedAt: number | null;
  onRetry: () => void;
  onReload: () => void;
}) {
  if (state === "conflict") {
    return (
      <span className="flex shrink-0 items-center gap-2 text-xs text-destructive" role="alert">
        <CloudOff className="h-3.5 w-3.5" />
        <span className="whitespace-nowrap" title={error ?? undefined}>
          Page modifiée ailleurs, enregistrement arrêté
        </span>
        <Button variant="outline" size="sm" className="h-7 text-xs text-foreground" onClick={onReload}>
          Recharger la page
        </Button>
      </span>
    );
  }
  if (state === "error") {
    return (
      <span className="flex min-w-0 items-center gap-2 text-xs text-destructive" role="alert">
        <CloudOff className="h-3.5 w-3.5 shrink-0" />
        <span className="max-w-64 truncate" title={error ?? undefined}>
          {error ?? "Enregistrement impossible"}
        </span>
        <Button variant="outline" size="sm" className="h-7 shrink-0 text-xs text-foreground" onClick={onRetry}>
          Réessayer
        </Button>
      </span>
    );
  }
  return (
    <span
      className="flex shrink-0 items-center gap-1.5 text-xs whitespace-nowrap text-muted-foreground"
      aria-live="polite"
      title="Chaque modification est enregistrée toute seule, une seconde après. Ctrl+S enregistre tout de suite."
    >
      {state === "saved" ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {state !== "saved"
        ? "Enregistrement…"
        : savedAt
          ? `Enregistré à ${new Date(savedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`
          : "Enregistrement automatique"}
    </span>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span>
          <Button variant="ghost" size="icon" className="h-8 w-8" disabled={disabled} onClick={onClick} aria-label={label}>
            {children}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function ToggleButton({ label, hint, pressed, onToggle }: { label: string; hint: string; pressed: boolean; onToggle: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn("h-8 gap-1.5 px-2 text-xs", !pressed && "text-muted-foreground")}
          aria-pressed={pressed}
          aria-label={label}
          onClick={onToggle}
        >
          {pressed ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          <span className="hidden min-[1800px]:inline">{label}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent className="max-w-56">{hint}</TooltipContent>
    </Tooltip>
  );
}
