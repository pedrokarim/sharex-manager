"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  FileImage,
  FileStack,
  HardDrive,
  ImageDown,
  ImageUp,
  Images,
  ImageOff,
  Languages,
  Link2,
  PenLine,
  RefreshCw,
  ScanText,
  Settings2,
  Trash2,
  Upload,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { ImagePickerDialog, type PickedImage } from "@/components/gallery/image-picker-dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { AnalyzeDialog } from "../components/library/analyze-dialog";
import { ConfirmDeleteDialog } from "../components/library/library-dialogs";
import { LibraryNotice, PAGE_GRID, PageBoardSkeleton } from "../components/library/library-states";
import { ObjectContextMenu, ObjectMenuButton, type MenuEntry } from "../components/library/object-menu";
import { SettingsDialog } from "../components/library/settings-dialog";
import { TranslateDialog } from "../components/library/translate-dialog";
import { UploadQueue, type UploadItem } from "../components/library/upload-queue";
import { useDialogTarget } from "../components/library/use-dialog-target";
import { ModuleShell } from "../components/module-shell";
import { analyzePages } from "../lib/analysis";
import { api, uploadImage } from "../lib/client";
import { extractArchiveImages, type ImportSource } from "../lib/library-archive";
import {
  IMPORT_ACCEPT,
  LIBRARY_PATH,
  MAX_IMAGE_BYTES,
  PAGE_STATUS_LABELS,
  chapterLabel,
  countLabel,
  editorHref,
  errorMessage,
  folderHref,
  isArchiveName,
  isImageName,
  moveItem,
  naturalCompare,
  orderByIds,
  runPool,
  settingsSummary,
  SOURCES_PATH,
} from "../lib/library-helpers";
import { isId, type ChapterSettings, type ChapterView, type PageSummary, type UploadedFile } from "../lib/types";

/** Chapitres déjà vus : on les réaffiche tout de suite, puis on les rafraîchit. */
const snapshots = new Map<string, ChapterView>();

/** Envois simultanés vers le serveur pendant un import. */
const UPLOAD_CONCURRENCY = 3;

export default function ChapterPage() {
  const id = useSearchParams().get("id");
  if (!isId(id)) {
    return (
      <ModuleShell>
        <LibraryNotice icon={FileStack} title="Chapitre introuvable" text="L’adresse ne désigne aucun chapitre de la bibliothèque.">
          <Button asChild variant="outline" size="sm">
            <Link href={LIBRARY_PATH}>Revenir à la bibliothèque</Link>
          </Button>
        </LibraryNotice>
      </ModuleShell>
    );
  }
  return <ChapterBoard key={id} chapterId={id} />;
}

/** Trie les fichiers déposés : images acceptées, archives ouvertes, le reste compté. */
async function collectSources(files: File[]): Promise<{ sources: ImportSource[]; ignored: number; unreadable: string[] }> {
  const sources: ImportSource[] = [];
  const unreadable: string[] = [];
  let ignored = 0;
  for (const file of files) {
    if (isArchiveName(file.name)) {
      try {
        const extracted = await extractArchiveImages(file);
        sources.push(...extracted.images);
        ignored += extracted.ignored;
      } catch {
        unreadable.push(file.name);
      }
    } else if (isImageName(file.name) && file.size <= MAX_IMAGE_BYTES) {
      sources.push({ name: file.name, blob: file });
    } else {
      ignored++;
    }
  }
  sources.sort((left, right) => naturalCompare(left.name, right.name));
  return { sources, ignored, unreadable };
}

function ChapterBoard({ chapterId }: { chapterId: string }) {
  const router = useRouter();
  const [view, setView] = useState<ChapterView | null>(snapshots.get(chapterId) ?? null);
  const [failed, setFailed] = useState(false);
  const [queue, setQueue] = useState<UploadItem[]>([]);
  const [importing, setImporting] = useState(false);
  const [sending, setSending] = useState(false);
  const [sorting, setSorting] = useState(false);
  const [dropping, setDropping] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  // Analyse et traduction ne partent que de ces deux fenêtres, ouvertes d'un clic.
  const [analyzeOpen, setAnalyzeOpen] = useState(false);
  const [translateOpen, setTranslateOpen] = useState(false);
  const deleting = useDialogTarget<{ page: PageSummary; number: number }>();
  const fileInput = useRef<HTMLInputElement>(null);
  const importLock = useRef(false);

  const store = useCallback(
    (next: ChapterView) => {
      const ordered = { ...next, pages: orderByIds(next.pages, next.chapter.pageIds) };
      snapshots.set(chapterId, ordered);
      setView(ordered);
    },
    [chapterId]
  );

  const refresh = useCallback(async () => {
    try {
      store(await api.getChapter(chapterId));
      setFailed(false);
    } catch (error) {
      setFailed(true);
      toast.error(errorMessage(error, "Chapitre indisponible."));
    }
  }, [chapterId, store]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // ─── Import ────────────────────────────────────────────────────

  /** Envoie les images une à une, puis les rattache au chapitre en un seul appel. */
  const importSources = useCallback(
    async (sources: ImportSource[]) => {
      const stamp = Date.now();
      const items: UploadItem[] = sources.map((source, index) => ({ id: `${stamp}-${index}`, name: source.name, status: "waiting" }));
      const patch = (id: string, change: Partial<UploadItem>) =>
        setQueue((previous) => previous.map((item) => (item.id === id ? { ...item, ...change } : item)));
      setQueue(items);

      const uploaded: (UploadedFile | null)[] = sources.map(() => null);
      await runPool(sources, UPLOAD_CONCURRENCY, async (source, index) => {
        patch(items[index].id, { status: "uploading" });
        try {
          uploaded[index] = await uploadImage(source.blob, source.name);
          patch(items[index].id, { status: "done" });
        } catch (error) {
          patch(items[index].id, { status: "error", error: errorMessage(error, "Envoi impossible") });
        }
      });

      const ready = uploaded.filter((file): file is UploadedFile => file !== null);
      const failures = sources.length - ready.length;
      let attached = true;
      if (ready.length > 0) {
        try {
          const pages = await api.importPages(chapterId, ready);
          toast.success(pages.length < 2 ? "Page ajoutée au chapitre" : `${pages.length} pages ajoutées au chapitre`);
          await refresh();
        } catch (error) {
          attached = false;
          toast.error(errorMessage(error, "Les images envoyées n’ont pas pu être rattachées au chapitre."));
        }
      }
      if (failures > 0) toast.error(failures < 2 ? "Une image n’a pas pu être envoyée." : `${failures} images n’ont pas pu être envoyées.`);
      // Sans échec, la liste a fini de servir ; sinon elle reste pour être lue.
      if (failures === 0 && attached) setQueue([]);
    },
    [chapterId, refresh]
  );

  const importFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      if (importLock.current) {
        toast.error("Un import est déjà en cours. Attendez sa fin avant d’en lancer un autre.");
        return;
      }
      importLock.current = true;
      setImporting(true);
      try {
        const { sources, ignored, unreadable } = await collectSources(files);
        for (const name of unreadable) toast.error(`L’archive « ${name} » n’a pas pu être lue.`);
        if (ignored > 0) {
          toast.warning(
            `${ignored < 2 ? "Un fichier ignoré" : `${ignored} fichiers ignorés`} : seules les images png, jpg et webp de moins de 40 Mo sont acceptées.`
          );
        }
        if (sources.length > 0) await importSources(sources);
      } catch (error) {
        toast.error(errorMessage(error, "Import impossible."));
      } finally {
        importLock.current = false;
        setImporting(false);
      }
    },
    [importSources]
  );

  /** Image venue du sélecteur commun : galerie, autre module, ordinateur ou lien. */
  const importPicked = async (image: PickedImage) => {
    setPickerOpen(false);
    if (image.kind === "file") {
      void importFiles([image.file]);
      return;
    }
    try {
      if (image.kind === "gallery") {
        await api.importGalleryFiles(chapterId, [image.name]);
      } else {
        // Un lien est lu par le navigateur : le site d'origine peut le refuser.
        const response = await fetch(image.url);
        if (!response.ok) throw new Error(`Image inaccessible (HTTP ${response.status})`);
        const blob = await response.blob();
        const extension = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : blob.type === "image/jpeg" ? "jpg" : null;
        if (!extension) throw new Error("Ce lien ne mène pas à une image png, jpg ou webp.");
        const file = await uploadImage(blob, `image-${Date.now()}.${extension}`);
        await api.importPages(chapterId, [file]);
      }
      toast.success("Page ajoutée au chapitre");
      await refresh();
    } catch (error) {
      toast.error(errorMessage(error, "Cette image n’a pas pu être ajoutée."));
    }
  };

  // Dépôt de fichiers n'importe où sur la page.
  const importFilesRef = useRef(importFiles);
  const dialogOpenRef = useRef(false);
  useEffect(() => {
    importFilesRef.current = importFiles;
    dialogOpenRef.current = pickerOpen || settingsOpen || analyzeOpen || translateOpen;
  }, [importFiles, pickerOpen, settingsOpen, analyzeOpen, translateOpen]);

  useEffect(() => {
    let depth = 0;
    const carriesFiles = (event: DragEvent) => !dialogOpenRef.current && Array.from(event.dataTransfer?.types ?? []).includes("Files");
    const onEnter = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      depth++;
      setDropping(true);
    };
    const onOver = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    };
    const onLeave = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDropping(false);
    };
    const onDrop = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      depth = 0;
      setDropping(false);
      void importFilesRef.current(Array.from(event.dataTransfer?.files ?? []));
    };
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragover", onOver);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, []);

  // ─── Pages ─────────────────────────────────────────────────────

  const pages = view?.pages ?? [];
  // Les pages laissées telles quelles (couvertures, bannières) ne partent ni à
  // l'analyse ni à la traduction.
  const workPages = pages.filter((page) => !page.skipped);
  const pageIds = pages.map((page) => page.id);

  const applyOrder = async (ids: string[]) => {
    setView((previous) => previous && { ...previous, chapter: { ...previous.chapter, pageIds: ids }, pages: orderByIds(previous.pages, ids) });
    try {
      await api.reorderPages(chapterId, ids);
    } catch (error) {
      toast.error(errorMessage(error, "Le nouvel ordre n’a pas pu être enregistré."));
      void refresh();
    }
  };

  const movePage = (pageId: string, to: number) => {
    const from = pageIds.indexOf(pageId);
    if (from < 0 || from === to) return;
    void applyOrder(moveItem(pageIds, from, to));
  };

  /** La mise en page animée reprend à l'image suivante : le dépôt lui-même ne glisse pas deux fois. */
  const endSorting = () => requestAnimationFrame(() => setSorting(false));

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    endSorting();
    if (!over || active.id === over.id) return;
    movePage(String(active.id), pageIds.indexOf(String(over.id)));
  };

  const skipPage = async (page: PageSummary, skipped: boolean) => {
    try {
      const updated = await api.setPageSkipped(page.id, skipped);
      setView((previous) => previous && { ...previous, pages: previous.pages.map((entry) => (entry.id === updated.id ? updated : entry)) });
      toast.success(skipped ? "Page laissée telle quelle" : "Page remise à traduire");
    } catch (error) {
      toast.error(errorMessage(error, "Réglage de la page impossible."));
    }
  };

  const deletePage = async (page: PageSummary) => {
    try {
      await api.deletePage(page.id);
      setView((previous) => previous && { ...previous, pages: previous.pages.filter((entry) => entry.id !== page.id) });
      toast.success("Page supprimée");
      void refresh();
    } catch (error) {
      toast.error(errorMessage(error, "Suppression de la page impossible."));
    }
  };

  // ─── Chapitre ──────────────────────────────────────────────────

  const exportedCount = pages.filter((page) => page.exportUrl).length;

  const sendToGallery = async () => {
    if (sending) return;
    setSending(true);
    try {
      const { saved, albumId } = await api.sendChapterToGallery(chapterId);
      toast.success(saved < 2 ? "Page envoyée dans la galerie, dans un album privé" : `${saved} pages envoyées dans la galerie, dans un album privé`, {
        action: albumId === undefined ? undefined : { label: "Ouvrir l’album", onClick: () => router.push(`/albums/${albumId}`) },
      });
    } catch (error) {
      toast.error(errorMessage(error, "Envoi dans la galerie impossible."));
    } finally {
      setSending(false);
    }
  };

  const saveSettings = async (settings: ChapterSettings) => {
    await api.updateChapter(chapterId, { settings });
    toast.success("Réglages du chapitre enregistrés");
    await refresh();
  };

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } }),
    // Entrée ouvre la page : seule la barre d'espace saisit et repose une vignette.
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space"] },
    })
  );

  const label = view ? chapterLabel(view.chapter) : "";
  const doomed = deleting.target;

  // Le niveau maximal du chapitre borne ce qui peut tourner (§ 3 du dossier).
  const maxLevel = view?.chapter.settings.maxLevel ?? 0;
  const analyzeBlocked = !view
    ? "Chapitre en cours de chargement."
    : pages.length === 0
      ? "Déposez d’abord les pages du chapitre."
      : maxLevel < 1
        ? "Ce chapitre est réglé sur « À la main » : l’analyse automatique demande le niveau 1, à changer dans les réglages du chapitre."
        : null;
  const translateBlocked = !view
    ? "Chapitre en cours de chargement."
    : pages.length === 0
      ? "Déposez d’abord les pages du chapitre."
      : maxLevel < 2
        ? "Le niveau maximal de ce chapitre interdit la traduction automatique : elle demande le niveau 2, à changer dans les réglages du chapitre."
        : null;

  const importButton = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className="gap-2" disabled={!view || importing}>
          <Upload className="h-4 w-4" />
          Importer des pages
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuItem onClick={() => fileInput.current?.click()}>
          <HardDrive aria-hidden />
          Images ou archive de l’ordinateur…
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setPickerOpen(true)}>
          <Images aria-hidden />
          Une image de la galerie ou d’un lien…
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => router.push(`${SOURCES_PATH}?chapter=${chapterId}`)}>
          <Link2 aria-hidden />
          Depuis le lien d’un site…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <MotionConfig reducedMotion="user">
      <ModuleShell
        crumbs={view ? [{ label: view.folder.name, href: folderHref(view.folder.id) }, { label: view.chapter.title ? `${label} · ${view.chapter.title}` : label }] : []}
        actions={
          <>
            <Button variant="outline" size="icon" disabled={!view} onClick={() => setSettingsOpen(true)} aria-label="Réglages du chapitre" title="Réglages du chapitre">
              <Settings2 className="h-4 w-4" />
            </Button>
            <GatedAction label="Analyser" icon={ScanText} blocked={analyzeBlocked} onClick={() => setAnalyzeOpen(true)} />
            <GatedAction label="Traduire" icon={Languages} blocked={translateBlocked} onClick={() => setTranslateOpen(true)} />
            <Button
              variant="outline"
              className="gap-2"
              disabled={exportedCount === 0 || sending}
              onClick={() => void sendToGallery()}
              title={exportedCount === 0 ? "Exportez d’abord une page depuis l’atelier" : undefined}
            >
              <ImageUp className="h-4 w-4" />
              {sending ? "Envoi…" : "Envoyer dans la galerie"}
            </Button>
            {importButton}
          </>
        }
      >
        <input
          ref={fileInput}
          type="file"
          accept={IMPORT_ACCEPT}
          multiple
          hidden
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = "";
            void importFiles(files);
          }}
        />

        <UploadQueue items={queue} finished={!importing} onDismiss={() => setQueue([])} />

        {view === null ? (
          failed ? (
            <LibraryNotice icon={FileStack} title="Chapitre indisponible" text="Ce chapitre n’a pas pu être chargé. Il a peut-être été supprimé.">
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="gap-2" onClick={() => void refresh()}>
                  <RefreshCw className="h-4 w-4" />
                  Réessayer
                </Button>
                <Button asChild variant="ghost" size="sm">
                  <Link href={LIBRARY_PATH}>Revenir à la bibliothèque</Link>
                </Button>
              </div>
            </LibraryNotice>
          ) : (
            <PageBoardSkeleton />
          )
        ) : pages.length === 0 ? (
          <LibraryNotice
            icon={FileImage}
            title="Déposez les pages du chapitre"
            text="Glissez vos images n’importe où sur cette page (png, jpg, webp), ou une archive .zip ou .cbz. Elles se rangent dans l’ordre de leurs noms."
          >
            <Button className="gap-2" disabled={importing} onClick={() => fileInput.current?.click()}>
              <Upload className="h-4 w-4" />
              Choisir des fichiers
            </Button>
          </LibraryNotice>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground tabular-nums">
              {countLabel(pages.length, "page", "pages")} · {settingsSummary(view.chapter.settings)}
              {pages.length > 1 && " · glissez une vignette pour changer l’ordre"}
            </p>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={() => setSorting(true)}
              onDragEnd={onDragEnd}
              onDragCancel={endSorting}
              accessibility={{
                screenReaderInstructions: {
                  draggable: "Barre d’espace pour saisir la page, flèches pour la déplacer, barre d’espace pour la reposer, Échap pour annuler.",
                },
                announcements: {
                  onDragStart: ({ active }) => `Page ${pageIds.indexOf(String(active.id)) + 1} saisie.`,
                  onDragOver: ({ over }) => (over ? `Au-dessus de la place ${pageIds.indexOf(String(over.id)) + 1}.` : undefined),
                  onDragEnd: ({ over }) => (over ? `Page reposée à la place ${pageIds.indexOf(String(over.id)) + 1}.` : "Page reposée."),
                  onDragCancel: () => "Déplacement annulé.",
                },
              }}
            >
              <SortableContext items={pageIds} strategy={rectSortingStrategy}>
                <ul className={PAGE_GRID}>
                  <AnimatePresence initial={false}>
                    {pages.map((page, index) => (
                      <PageTile
                        key={page.id}
                        page={page}
                        index={index}
                        total={pages.length}
                        sorting={sorting}
                        onOpen={() => router.push(editorHref(page.id))}
                        onMove={(to) => movePage(page.id, to)}
                        onDelete={() => deleting.show({ page, number: index + 1 })}
                        onSkip={(skipped) => void skipPage(page, skipped)}
                      />
                    ))}
                  </AnimatePresence>
                </ul>
              </SortableContext>
            </DndContext>
          </div>
        )}
      </ModuleShell>

      <AnimatePresence>
        {dropping && (
          <motion.div
            key="drop-target"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            className="pointer-events-none fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-background/85 text-center backdrop-blur-sm"
          >
            <ImageDown aria-hidden className="h-10 w-10 text-primary" />
            <p className="text-base font-semibold">Déposez pour ajouter au chapitre</p>
            <p className="max-w-sm text-sm text-muted-foreground">Images png, jpg ou webp, ou une archive .zip ou .cbz.</p>
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmDeleteDialog
        open={deleting.open}
        onOpenChange={deleting.onOpenChange}
        title={`Supprimer la page ${doomed?.number ?? ""} ?`}
        description={
          doomed
            ? `L’image « ${doomed.page.name} » sera retirée du chapitre, avec ses ${countLabel(doomed.page.regionCount, "zone", "zones")}, leurs traductions et son export. C’est définitif.`
            : ""
        }
        onConfirm={() => doomed && void deletePage(doomed.page)}
      />

      {view && (
        <SettingsDialog
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          title="Réglages du chapitre"
          description="Ils ne valent que pour ce chapitre. Les réglages du dossier servent de point de départ aux nouveaux chapitres."
          value={view.chapter.settings}
          onSave={saveSettings}
        />
      )}

      <AnalyzeDialog open={analyzeOpen} onOpenChange={setAnalyzeOpen} pages={workPages} analyze={analyzePages} onPagesChanged={() => void refresh()} />

      <TranslateDialog open={translateOpen} onOpenChange={setTranslateOpen} chapterId={chapterId} pages={workPages} onPagesChanged={() => void refresh()} />


      <ImagePickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        title="Page à ajouter"
        description="L’image choisie est copiée dans le chapitre."
        onPick={(image) => void importPicked(image)}
      />
    </MotionConfig>
  );
}

/**
 * Action de l'en-tête bornée par le niveau du chapitre : quand elle est
 * interdite, le bouton reste visible et une infobulle dit pourquoi.
 */
function GatedAction({ label, icon: Icon, blocked, onClick }: { label: string; icon: LucideIcon; blocked: string | null; onClick: () => void }) {
  const button = (
    <Button variant="outline" className="gap-2" disabled={blocked !== null} onClick={onClick} aria-label={label}>
      <Icon className="h-4 w-4" />
      <span className="hidden lg:inline">{label}</span>
    </Button>
  );
  if (blocked === null) return button;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* Un bouton désactivé ne reçoit ni survol ni focus : l'infobulle s'accroche à ce qui l'entoure. */}
        <span tabIndex={0} aria-label={`${label}, indisponible : ${blocked}`} className="inline-flex rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {button}
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs">
        {blocked}
      </TooltipContent>
    </Tooltip>
  );
}

interface PageTileProps {
  page: PageSummary;
  index: number;
  total: number;
  /** Un glisser est en cours : la mise en page animée lui laisse la main. */
  sorting: boolean;
  onOpen: () => void;
  /** Déplace la page à la place donnée (à partir de zéro). */
  onMove: (to: number) => void;
  onDelete: () => void;
  /** Marque la page « à laisser telle quelle », ou lève cette marque. */
  onSkip: (skipped: boolean) => void;
}

function PageTile({ page, index, total, sorting, onOpen, onMove, onDelete, onSkip }: PageTileProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: page.id });
  const number = index + 1;

  /** Les mêmes entrées derrière « … » et au clic droit. */
  const entries: MenuEntry[] = [
    { key: "open", label: "Ouvrir dans l’atelier", icon: PenLine, href: editorHref(page.id) },
    ...(page.exportUrl ? [{ key: "export", label: "Voir l’export", icon: FileImage, href: page.exportUrl, newTab: true }] : []),
    page.skipped
      ? { key: "unskip", label: "Remettre à traduire", icon: Languages, onSelect: () => onSkip(false), separatorBefore: true }
      : { key: "skip", label: "Laisser telle quelle", icon: ImageOff, onSelect: () => onSkip(true), separatorBefore: true },
    { key: "first", label: "Placer au début", icon: ChevronsLeft, onSelect: () => onMove(0), disabled: index === 0, separatorBefore: true },
    { key: "earlier", label: "Reculer d’une place", icon: ChevronLeft, onSelect: () => onMove(index - 1), disabled: index === 0 },
    { key: "later", label: "Avancer d’une place", icon: ChevronRight, onSelect: () => onMove(index + 1), disabled: index === total - 1 },
    { key: "last", label: "Placer à la fin", icon: ChevronsRight, onSelect: () => onMove(total - 1), disabled: index === total - 1 },
    { key: "delete", label: "Supprimer", icon: Trash2, onSelect: onDelete, destructive: true, separatorBefore: true },
  ];

  return (
    <motion.li
      layout={sorting ? false : "position"}
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.94 }}
      transition={{ duration: 0.18 }}
      className={cn("list-none", isDragging && "relative z-10")}
    >
      <ObjectContextMenu entries={entries}>
        <div ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} className="group flex flex-col gap-1.5">
          <button
            type="button"
            {...attributes}
            {...listeners}
            aria-roledescription="page déplaçable"
            aria-label={`Ouvrir la page ${number} dans l’atelier`}
            onClick={onOpen}
            className={cn(
              "relative block aspect-[3/4] w-full cursor-pointer overflow-hidden rounded-lg border bg-muted transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isDragging && "cursor-grabbing shadow-xl"
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- vignette servie par le module, avec la session */}
            <img
              src={page.thumbUrl}
              alt=""
              loading="lazy"
              draggable={false}
              className={cn(
                "h-full w-full object-cover object-top transition-transform duration-300 group-hover:scale-[1.03]",
                page.skipped && "opacity-60"
              )}
            />
          </button>
          <div className="flex items-start gap-1 px-0.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium tabular-nums" title={page.name}>
                Page {number}
              </p>
              <p className="truncate text-xs text-muted-foreground tabular-nums">
                {page.skipped ? "Laissée telle quelle" : `${PAGE_STATUS_LABELS[page.status]} · ${countLabel(page.regionCount, "zone", "zones")}`}
              </p>
            </div>
            <ObjectMenuButton
              entries={entries}
              label={`Actions de la page ${number}`}
              className="md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100 md:data-[state=open]:opacity-100"
            />
          </div>
        </div>
      </ObjectContextMenu>
    </motion.li>
  );
}
