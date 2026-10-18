"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Clapperboard,
  Download,
  IdCard,
  Image as ImageIcon,
  Palette,
  RefreshCw,
  Ruler,
  Send,
  Smile,
  Sparkles,
  Star,
  Type,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormStatus, useFeedback } from "@/components/feedback";
import { Spinner } from "@/components/ui/spinner";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Kbd } from "@/components/ui/kbd";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { FormatsPanel } from "../components/format-preview";
import { prepareKitFonts } from "../components/format-render";
import { KitCommandPalette, PaletteButton, usePaletteShortcut, type PaletteAction } from "../components/kit-command-palette";
import { ModuleShell } from "../components/module-shell";
import { AiSection } from "../components/sections/ai-section";
import { ColorsSection } from "../components/sections/colors-section";
import { IdentitySection } from "../components/sections/identity-section";
import { LogosSection } from "../components/sections/logos-section";
import { MascotSection } from "../components/sections/mascot-section";
import { PublishingSection } from "../components/sections/publishing-section";
import { TypographySection } from "../components/sections/typography-section";
import { VideoSection } from "../components/sections/video-section";
import { ReferenceStyleSection } from "../components/sections/reference-style-section";
import { api, downloadBase64, errorMessage } from "../lib/client";
import type { FormatId } from "../lib/formats";
import { MODULE_PATH } from "../lib/types";
import { useElementWidth, useFillHeight, useStoredLayout } from "../lib/use-editor-layout";
import { useKitEditor, type SaveState } from "../lib/use-kit-editor";

type SectionId = "identity" | "colors" | "typography" | "logos" | "mascot" | "video" | "ai" | "publishing" | "style";

/**
 * Sections de l'éditeur, et le format où chacune se voit le mieux : en
 * changeant de section, l'aperçu montre de lui-même l'endroit où la
 * modification compte (l'accroche sur la bannière, le filigrane et le carton
 * de fin sur un short…). On peut toujours choisir un autre format.
 */
const SECTIONS: { id: SectionId; label: string; icon: LucideIcon; format?: FormatId }[] = [
  { id: "identity", label: "Identité", icon: IdCard, format: "banner" },
  { id: "colors", label: "Couleurs", icon: Palette, format: "banner" },
  { id: "typography", label: "Typographie", icon: Type, format: "short-cover" },
  { id: "logos", label: "Logos", icon: ImageIcon, format: "avatar" },
  { id: "mascot", label: "Mascotte", icon: Smile, format: "endcard-vertical" },
  { id: "video", label: "Vidéo", icon: Clapperboard, format: "endcard-vertical" },
  { id: "ai", label: "Assistant IA", icon: Sparkles },
  { id: "publishing", label: "Publication", icon: Send },
  // Style mesuré sur une vidéo de référence (07 sexies, D4).
  { id: "style", label: "Style de référence", icon: Ruler, format: "endcard-vertical" },
];

/** En dessous, les trois panneaux ne tiennent plus côte à côte. */
const WIDE = 1000;
/** En dessous, formulaire et aperçu s'empilent. */
const MEDIUM = 640;

const isEditable = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.closest("[role=combobox],[role=listbox],[role=menu],[role=dialog]") !== null);

export default function EditorPage() {
  const router = useRouter();
  const params = useSearchParams();
  const kitId = params.get("kit");
  const editor = useKitEditor(kitId);
  const { kit } = editor;
  const [section, setSection] = useState<SectionId>("identity");
  const [format, setFormat] = useState<FormatId>("banner");
  const [fontsReady, setFontsReady] = useState(false);
  const [fontsVersion, setFontsVersion] = useState(0);
  const [exportingZip, setExportingZip] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [widthRef, width] = useElementWidth<HTMLDivElement>();
  const mode = width === 0 ? null : width >= WIDE ? "wide" : width >= MEDIUM ? "medium" : "narrow";
  const [fillRef, fillHeight] = useFillHeight<HTMLDivElement>(mode === "wide" || mode === "medium");
  // Le même élément est mesuré en largeur (disposition) et rempli en hauteur (espace de travail).
  const workspaceRef = useCallback(
    (node: HTMLDivElement | null) => {
      widthRef.current = node;
      fillRef.current = node;
    },
    [widthRef, fillRef]
  );
  const wideLayout = useStoredLayout("brand-kit:editor-layout:wide");
  const mediumLayout = useStoredLayout("brand-kit:editor-layout:medium");

  usePaletteShortcut(setPaletteOpen);

  const goTo = useCallback((id: SectionId) => {
    setSection(id);
    const target = SECTIONS.find((entry) => entry.id === id)?.format;
    if (target) setFormat(target);
  }, []);

  // Touches 1 à 9 : une section, hors d'un champ de saisie.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.repeat || isEditable(event.target)) return;
      if (document.querySelector("[role=dialog][data-state=open],[role=alertdialog][data-state=open]")) return;
      const index = Number(event.key) - 1;
      if (Number.isInteger(index) && index >= 0 && index < SECTIONS.length) {
        event.preventDefault();
        goTo(SECTIONS[index].id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goTo]);

  // Polices du catalogue et polices importées : chargées avant tout dessin, rechargées quand la liste change.
  const fontKey = kit ? `${kit.id}:${kit.fonts.map((font) => font.family).join(",")}` : "";
  useEffect(() => {
    if (!kit) return;
    let cancelled = false;
    void prepareKitFonts(kit).then(() => {
      if (cancelled) return;
      setFontsReady(true);
      setFontsVersion((version) => version + 1);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seule la liste des polices compte
  }, [fontKey]);

  // Gestes de l'en-tête (et de la palette de commandes) : l'étoile « par défaut »
  // et le téléchargement se voient ; un échec s'écrit sous l'en-tête.
  const headerFeedback = useFeedback();

  const makeDefault = async () => {
    if (!kit) return;
    headerFeedback.clear();
    try {
      await editor.flush();
      await api.setDefaultKit(kit.id);
      await editor.reload();
    } catch (error) {
      headerFeedback.error(errorMessage(error, "Cette marque n’a pas pu devenir la marque par défaut. Réessayez."));
    }
  };

  const exportZip = async () => {
    if (!kit) return;
    setExportingZip(true);
    headerFeedback.clear();
    try {
      await editor.flush();
      const archive = await api.exportKit(kit.id);
      downloadBase64(archive.fileName, archive.data);
    } catch (error) {
      headerFeedback.error(errorMessage(error, "L’archive n’a pas pu être préparée. Réessayez."));
    } finally {
      setExportingZip(false);
    }
  };

  const sectionProps = useMemo(() => (kit ? { kit, update: editor.update, runOperation: editor.runOperation } : null), [kit, editor.update, editor.runOperation]);

  const paletteActions: PaletteAction[] = [
    ...SECTIONS.map((entry, index) => ({ id: `section-${entry.id}`, label: entry.label, icon: entry.icon, shortcut: String(index + 1), onSelect: () => goTo(entry.id) })),
    ...(kit && !kit.isDefault ? [{ id: "default", label: "Définir par défaut", icon: Star, onSelect: () => void makeDefault() }] : []),
    { id: "zip", label: "Exporter l’archive ZIP", icon: Download, onSelect: () => void exportZip() },
  ];

  const palette = (
    <KitCommandPalette
      open={paletteOpen}
      onOpenChange={setPaletteOpen}
      currentKitId={kitId ?? undefined}
      actions={paletteActions}
      actionsHeading="Cette image de marque"
      onCreate={() => router.push(`${MODULE_PATH}?create=manual`)}
      onAssistant={() => router.push(`${MODULE_PATH}?create=assistant`)}
    />
  );

  if (!kitId || editor.loadError) {
    return (
      <ModuleShell crumbs={[{ label: "Éditeur" }]}>
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Palette />
            </EmptyMedia>
            <EmptyTitle>Image de marque introuvable</EmptyTitle>
            <EmptyDescription>{editor.loadError ?? "Aucune image de marque n’est désignée."}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild variant="outline" className="gap-2">
              <Link href={MODULE_PATH}>
                <ArrowLeft className="size-4" />
                Toutes les images de marque
              </Link>
            </Button>
          </EmptyContent>
        </Empty>
        {palette}
      </ModuleShell>
    );
  }

  const form = (
    <div className="@container/form min-w-0">
      {sectionProps ? (
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={section} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }}>
            {section === "identity" && <IdentitySection {...sectionProps} />}
            {section === "colors" && <ColorsSection {...sectionProps} />}
            {section === "typography" && <TypographySection {...sectionProps} fontsVersion={fontsVersion} fontsReady={fontsReady} />}
            {section === "logos" && <LogosSection {...sectionProps} />}
            {section === "mascot" && <MascotSection {...sectionProps} fontsVersion={fontsVersion} fontsReady={fontsReady} onShowFormat={setFormat} />}
            {section === "video" && <VideoSection {...sectionProps} />}
            {section === "ai" && <AiSection {...sectionProps} />}
            {section === "publishing" && <PublishingSection {...sectionProps} />}
            {section === "style" && <ReferenceStyleSection {...sectionProps} />}
          </motion.div>
        </AnimatePresence>
      ) : (
        <div className="grid gap-4" aria-hidden>
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}
    </div>
  );

  const preview = kit ? (
    <FormatsPanel
      kit={kit}
      exports={editor.exports}
      onExportsChange={editor.setExports}
      fontsVersion={fontsVersion}
      fontsReady={fontsReady}
      beforeExport={editor.flush}
      selected={format}
      onSelect={setFormat}
      update={editor.update}
      runOperation={editor.runOperation}
    />
  ) : (
    <div className="grid gap-4" aria-hidden>
      <Skeleton className="h-6 w-48" />
      <Skeleton className="aspect-video w-full rounded-xl" />
    </div>
  );

  return (
    <MotionConfig reducedMotion="user">
      <ModuleShell
        crumbs={[{ label: kit?.name || "Image de marque" }]}
        status={kit && <SaveIndicator state={editor.saveState} onRetry={() => void editor.retry()} />}
        actions={
          <>
            <PaletteButton onClick={() => setPaletteOpen(true)} />
            {kit &&
              (kit.isDefault ? (
                <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Star aria-hidden className="size-4 fill-current" />
                  par défaut
                </span>
              ) : (
                <Button variant="ghost" size="sm" className="gap-2" onClick={() => void makeDefault()}>
                  <Star className="size-4" />
                  Définir par défaut
                </Button>
              ))}
            {kit && (
              <Button variant="outline" size="sm" className="gap-2" onClick={() => void exportZip()} loading={exportingZip}>
                <Download className="size-4" />
                Exporter
              </Button>
            )}
          </>
        }
      >
        <FormStatus state={headerFeedback.state} />
        <AnimatePresence initial={false}>
          {editor.saveState === "conflict" && (
            <motion.div key="conflict" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="shrink-0 overflow-hidden">
              <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
                <AlertTriangle aria-hidden className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <p className="min-w-0 flex-1">
                  Cette image de marque a changé ailleurs entre-temps : vos dernières modifications ne sont pas enregistrées. Rechargez-la pour reprendre à partir de la
                  version enregistrée.
                </p>
                <Button size="sm" variant="outline" className="gap-2" onClick={() => void editor.reload()}>
                  <RefreshCw className="size-4" />
                  Recharger
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div
          ref={workspaceRef}
          style={mode === "wide" || mode === "medium" ? { height: fillHeight } : undefined}
          className={cn("min-w-0", (mode === "wide" || mode === "medium") && "-mx-4 -mb-4 flex min-h-[520px] flex-col overflow-hidden border-t")}
        >
          {mode === "wide" && (
            <ResizablePanelGroup id="brand-kit-editor-wide" orientation="horizontal" defaultLayout={wideLayout.defaultLayout} onLayoutChanged={wideLayout.onLayoutChanged}>
              <ResizablePanel id="sections" defaultSize="210px" minSize="160px" maxSize="280px" groupResizeBehavior="preserve-pixel-size">
                <div className="h-full overflow-y-auto p-2">
                  <SectionNav section={section} onSelect={goTo} vertical />
                </div>
              </ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel id="form" defaultSize="45%" minSize="340px">
                <div className="h-full overflow-y-auto px-5 pt-4 pb-6">{form}</div>
              </ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel id="preview" minSize="300px">
                <div className="h-full overflow-y-auto px-4 pt-4 pb-6">{preview}</div>
              </ResizablePanel>
            </ResizablePanelGroup>
          )}
          {mode === "medium" && (
            <>
              <div className="shrink-0 border-b px-2 py-1.5">
                <SectionNav section={section} onSelect={goTo} />
              </div>
              <div className="min-h-0 flex-1">
                <ResizablePanelGroup id="brand-kit-editor-medium" orientation="horizontal" defaultLayout={mediumLayout.defaultLayout} onLayoutChanged={mediumLayout.onLayoutChanged}>
                  <ResizablePanel id="form" defaultSize="55%" minSize="320px">
                    <div className="h-full overflow-y-auto px-4 pt-4 pb-6">{form}</div>
                  </ResizablePanel>
                  <ResizableHandle withHandle />
                  <ResizablePanel id="preview" minSize="260px">
                    <div className="h-full overflow-y-auto px-4 pt-4 pb-6">{preview}</div>
                  </ResizablePanel>
                </ResizablePanelGroup>
              </div>
            </>
          )}
          {mode === "narrow" && (
            <div className="flex min-w-0 flex-col gap-6 pb-4">
              <div className="-mx-4 border-y px-2 py-1.5">
                <SectionNav section={section} onSelect={goTo} />
              </div>
              {form}
              <div className="border-t pt-5">{preview}</div>
            </div>
          )}
        </div>
      </ModuleShell>
      {palette}
    </MotionConfig>
  );
}

/** Navigation des sections : verticale avec ses raccourcis dans le grand éditeur, en bande défilante sinon. */
function SectionNav({ section, onSelect, vertical = false }: { section: SectionId; onSelect: (id: SectionId) => void; vertical?: boolean }) {
  return (
    <nav aria-label="Sections de l’image de marque" className={cn("flex gap-1", vertical ? "flex-col" : "flex-wrap")}>
      {SECTIONS.map((entry, index) => {
        const Icon = entry.icon;
        const active = entry.id === section;
        return (
          <button
            key={entry.id}
            type="button"
            onClick={() => onSelect(entry.id)}
            aria-current={active ? "true" : undefined}
            aria-keyshortcuts={String(index + 1)}
            className={cn(
              "flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
              vertical && "w-full",
              active ? "bg-primary/10 font-medium text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <Icon aria-hidden className={cn("size-4 shrink-0", active && "text-primary")} />
            <span className={cn("whitespace-nowrap", vertical && "min-w-0 flex-1 truncate")}>{entry.label}</span>
            {vertical && <Kbd className="shrink-0 text-foreground/75">{index + 1}</Kbd>}
          </button>
        );
      })}
    </nav>
  );
}

const SAVE_LABELS: Record<SaveState, string> = {
  saved: "Enregistré",
  pending: "Enregistrement…",
  saving: "Enregistrement…",
  error: "Non enregistré",
  conflict: "Changé ailleurs",
};

/** Indicateur discret de l'enregistrement automatique. */
function SaveIndicator({ state, onRetry }: { state: SaveState; onRetry: () => void }) {
  return (
    <span aria-live="polite" className={cn("flex items-center gap-1.5 text-xs", state === "error" || state === "conflict" ? "text-destructive" : "text-muted-foreground")}>
      {state === "saved" && <Check aria-hidden className="size-3.5" />}
      {(state === "pending" || state === "saving") && <Spinner aria-hidden className="size-3.5" />}
      {(state === "error" || state === "conflict") && <AlertTriangle aria-hidden className="size-3.5" />}
      {SAVE_LABELS[state]}
      {state === "error" && (
        <button type="button" onClick={onRetry} className="underline underline-offset-2 hover:text-foreground">
          Réessayer
        </button>
      )}
    </span>
  );
}
