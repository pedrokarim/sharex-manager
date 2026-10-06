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
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Clock3,
  Eye,
  FileArchive,
  FileImage,
  FileStack,
  HardDrive,
  ImageDown,
  ImageOff,
  ImageUp,
  Images,
  Languages,
  Link2,
  Loader2,
  PackageOpen,
  PenLine,
  RefreshCw,
  ScanText,
  Settings2,
  Trash2,
  TriangleAlert,
  Upload,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { ImagePickerDialog, type PickedImage } from "@/components/gallery/image-picker-dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import { AnalyzeDialog } from "../components/library/analyze-dialog";
import { dismissChapterJob, jobProgress, stopChapterJob, useChapterJob, type ChapterJob, type ChapterJobKind, type PageJob } from "../lib/chapter-jobs";
import { buildChapterArchive, saveBlob } from "../components/library/archive-export";
import { describeChapterExport, exportChapterPages, renderPageExport } from "../lib/page-export";
import { ConfirmDeleteDialog } from "../components/library/library-dialogs";
import { LibraryNotice, PAGE_GRID, PageBoardSkeleton } from "../components/library/library-states";
import { ObjectContextMenu, ObjectMenuButton, type MenuEntry } from "../components/library/object-menu";
import { SettingsDialog } from "../components/library/settings-dialog";
import { TranslateDialog } from "../components/library/translate-dialog";
import { UploadQueue, type UploadItem } from "../components/library/upload-queue";
import { useDialogTarget } from "../components/library/use-dialog-target";
import { VisibilityDialog } from "../components/library/visibility-dialog";
import { ModuleShell } from "../components/module-shell";
import { analyzePages } from "../lib/analysis";
import { api, uploadImage } from "../lib/client";
import { extractArchiveImages, type ImportSource } from "../lib/library-archive";
import {
  IMPORT_ACCEPT,
  IMPORT_BATCH_SIZE,
  LIBRARY_PATH,
  MAX_IMAGE_BYTES,
  PAGE_STATUS_LABELS,
  chapterLabel,
  chunkList,
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
  visibilityLabel,
} from "../lib/library-helpers";
import { isId, type ChapterSettings, type ChapterView, type ChapterVisibility, type PageSummary, type UploadedFile } from "../lib/types";

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
  const [visibilityOpen, setVisibilityOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [rendering, setRendering] = useState(false);
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
        // Le serveur rattache 300 images au plus par appel : une grosse archive
        // part en plusieurs paquets, dans l'ordre, pour ne pas être refusée d'un bloc.
        let added = 0;
        const batches = chunkList(ready, IMPORT_BATCH_SIZE);
        let done = 0;
        try {
          for (const batch of batches) {
            added += (await api.importPages(chapterId, batch)).length;
            done++;
          }
        } catch (error) {
          attached = false;
          toast.error(errorMessage(error, "Les images envoyées n’ont pas pu être rattachées au chapitre."));
          // Ce qui n'est devenu la page de rien ne reste pas sur le serveur.
          for (const batch of batches.slice(done)) void api.discardUploads(batch).catch(() => undefined);
        }
        if (added > 0) {
          toast.success(added < 2 ? "Page ajoutée au chapitre" : `${added} pages ajoutées au chapitre`);
          await refresh();
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
        try {
          await api.importPages(chapterId, [file]);
        } catch (error) {
          void api.discardUploads([file]).catch(() => undefined);
          throw error;
        }
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
    dialogOpenRef.current = pickerOpen || settingsOpen || analyzeOpen || translateOpen || visibilityOpen;
  }, [importFiles, pickerOpen, settingsOpen, analyzeOpen, translateOpen, visibilityOpen]);

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

  // ─── Traitement en arrière-plan (analyse ou traduction) ─────────
  const job = useChapterJob(chapterId);
  const settledPages = job ? jobProgress(job).settled : 0;
  const jobRunning = job?.running ?? false;
  // Chaque page traitée met la planche à jour : son état et son nombre de zones changent.
  useEffect(() => {
    if (job) void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- à chaque page réglée, et à la fin
  }, [settledPages, jobRunning]);
  // Le traitement vit dans cet onglet : le fermer l'arrêterait.
  useEffect(() => {
    if (!jobRunning) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [jobRunning]);

  /** Écarte les pages que l'analyse dit sans texte à traduire (couvertures, bannières). */
  const skipUntranslatable = async (ids: string[]) => {
    try {
      for (const id of ids) await api.setPageSkipped(id, true);
      toast.success(ids.length === 1 ? "Page laissée telle quelle" : "Pages laissées telles quelles");
      dismissChapterJob(chapterId);
      await refresh();
    } catch (error) {
      toast.error(errorMessage(error, "Réglage des pages impossible."));
    }
  };
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
      // Les pages entrent dans la galerie en privé ; l'album, privé lui aussi, les réunit quand il a pu être créé.
      const where = albumId === undefined ? "en privé" : "dans un album privé";
      const what = saved === 0 ? "Les pages sont déjà dans la galerie" : saved < 2 ? "Page envoyée dans la galerie" : `${saved} pages envoyées dans la galerie`;
      toast.success(`${what}, ${where}`, {
        action: albumId === undefined ? undefined : { label: "Ouvrir l’album", onClick: () => router.push(`/albums/${albumId}`) },
      });
    } catch (error) {
      toast.error(errorMessage(error, "Envoi dans la galerie impossible."));
    } finally {
      setSending(false);
    }
  };

  /** Rend toutes les pages traduites du chapitre, comme le bouton « Exporter » de l'atelier, l'une après l'autre. */
  const renderAllPages = async () => {
    if (rendering || !view) return;
    setRendering(true);
    const controller = new AbortController();
    const pending = toast.loading("Rendu des pages…", { action: { label: "Arrêter", onClick: () => controller.abort() } });
    try {
      const result = await exportChapterPages(
        view.pages.map((page) => page.id),
        { getPage: api.getPage, render: renderPageExport, upload: uploadImage, register: api.registerExport },
        { signal: controller.signal, onProgress: (done, total) => toast.loading(`Rendu : page ${Math.min(done + 1, total)} sur ${total}…`, { id: pending }) }
      );
      const summary = describeChapterExport(result);
      if (result.aborted) toast.message(`Rendu arrêté : ${summary}`, { id: pending });
      else if (result.exported === 0 && result.failed > 0) toast.error(summary, { id: pending });
      else toast.success(summary, { id: pending });
      await refresh();
    } catch (error) {
      toast.error(errorMessage(error, "Rendu des pages impossible."), { id: pending });
    } finally {
      setRendering(false);
    }
  };

  /** Archive `.cbz` du chapitre : ses pages exportées, dans l'ordre de lecture, et telles quelles les pages laissées telles quelles. */
  const exportArchive = async () => {
    if (archiving || !view) return;
    setArchiving(true);
    const pending = toast.loading("Préparation de l’archive…");
    try {
      const archive = await buildChapterArchive(view, {
        onPage: (done, total) => toast.loading(`Archive : page ${done} sur ${total}…`, { id: pending }),
      });
      saveBlob(archive.blob, archive.fileName);
      const missing = archive.plan.missing > 0 ? `, ${countLabel(archive.plan.missing, "page pas encore exportée", "pages pas encore exportées")}` : "";
      toast.success(`${countLabel(archive.plan.pages.length, "page", "pages")} dans l’archive${missing}`, { id: pending });
    } catch (error) {
      toast.error(errorMessage(error, "Export de l’archive impossible."), { id: pending });
    } finally {
      setArchiving(false);
    }
  };

  const saveVisibility = async (visibility: ChapterVisibility) => {
    const next = await api.setChapterVisibility(chapterId, visibility);
    toast.success(next.visibility === "private" ? "Chapitre repassé en privé" : `Chapitre publié : ${visibilityLabel(next.visibility).toLowerCase()}`);
    await refresh();
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
  const busy = job?.running ? "Un traitement tourne déjà sur ce chapitre : attendez sa fin, ou arrêtez-le." : null;
  const analyzeBlocked = busy
    ? busy
    : !view
    ? "Chapitre en cours de chargement."
    : pages.length === 0
      ? "Déposez d’abord les pages du chapitre."
      : maxLevel < 1
        ? "Ce chapitre est réglé sur « À la main » : l’analyse automatique demande le niveau 1, à changer dans les réglages du chapitre."
        : null;
  const translateBlocked = busy
    ? busy
    : !view
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
              size="icon"
              disabled={!view}
              onClick={() => setVisibilityOpen(true)}
              aria-label={`Visibilité du chapitre : ${visibilityLabel(view?.chapter.visibility).toLowerCase()}`}
              title={`Visibilité : ${visibilityLabel(view?.chapter.visibility).toLowerCase()}`}
            >
              <Eye className="h-4 w-4" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  className="gap-2"
                  disabled={!view || view.pages.length === 0 || sending || archiving || rendering}
                >
                  <PackageOpen className="h-4 w-4" />
                  {sending ? "Envoi…" : archiving ? "Archive…" : rendering ? "Rendu…" : "Exporter"}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuItem onClick={() => void renderAllPages()}>
                  <ImageDown aria-hidden />
                  Rendre toutes les pages traduites
                </DropdownMenuItem>
                <DropdownMenuItem disabled={exportedCount === 0} onClick={() => void exportArchive()}>
                  <FileArchive aria-hidden />
                  Archive .cbz du chapitre
                </DropdownMenuItem>
                <DropdownMenuItem disabled={exportedCount === 0} onClick={() => void sendToGallery()}>
                  <ImageUp aria-hidden />
                  Envoyer dans la galerie
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
            <AnimatePresence initial={false}>
              {job && (
                <motion.div key="job" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                  <ChapterJobBar
                    job={job}
                    pageNumbers={new Map(pages.map((page, index) => [page.id, index + 1]))}
                    onStop={() => stopChapterJob(chapterId)}
                    onDismiss={() => dismissChapterJob(chapterId)}
                    onSkip={(ids) => void skipUntranslatable(ids)}
                  />
                </motion.div>
              )}
            </AnimatePresence>
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
                        job={job?.pages[page.id]}
                        jobKind={job?.kind}
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

      <AnalyzeDialog open={analyzeOpen} onOpenChange={setAnalyzeOpen} chapterId={chapterId} pages={pages} analyze={analyzePages} />

      <TranslateDialog open={translateOpen} onOpenChange={setTranslateOpen} chapterId={chapterId} pages={pages} />

      <VisibilityDialog
        open={visibilityOpen}
        onOpenChange={setVisibilityOpen}
        title="Visibilité du chapitre"
        description="Qui peut lire ce chapitre. Rien ne devient public sans le bouton de cette fenêtre."
        value={view?.chapter.visibility ?? "private"}
        publishablePages={view?.publishablePages ?? 0}
        publicPath={view?.publicPath}
        onSave={saveVisibility}
      />


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

/** Contour d'une vignette selon l'état de sa page dans le traitement. */
const JOB_RINGS: Record<PageJob["state"], string> = {
  queued: "ring-2 ring-amber-400/70",
  running: "ring-2 ring-amber-500 ring-offset-2 ring-offset-background",
  done: "ring-2 ring-emerald-500",
  skipped: "",
  error: "ring-2 ring-destructive",
};

const JOB_CHIPS: Record<PageJob["state"], string> = {
  queued: "bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100",
  running: "bg-amber-500 text-white",
  done: "bg-emerald-600 text-white",
  skipped: "",
  error: "bg-destructive text-white",
};

/** Ce que la vignette écrit sous la page pendant et après le traitement. */
function jobLabel(job: PageJob, kind: ChapterJobKind): string {
  // Des mots courts : la vignette est étroite, et sa pastille dit déjà l'essentiel.
  if (job.state === "queued") return "En attente";
  if (job.state === "running") return kind === "analyze" ? "Analyse…" : "Traduction…";
  if (job.state === "error") return job.detail ?? "Échec";
  return job.detail ?? (kind === "analyze" ? "Analysée" : "Traduite");
}

interface ChapterJobBarProps {
  job: ChapterJob;
  /** Numéro de chaque page dans le chapitre. */
  pageNumbers: Map<string, number>;
  onStop: () => void;
  onDismiss: () => void;
  /** Écarte les pages que l'analyse dit sans texte à traduire. */
  onSkip: (pageIds: string[]) => void;
}

/**
 * Ce qui tourne sur le chapitre, ou ce qui vient de finir : l'avancement, de
 * quoi arrêter, puis le compte rendu. Le détail par page est sur les vignettes.
 */
function ChapterJobBar({ job, pageNumbers, onStop, onDismiss, onSkip }: ChapterJobBarProps) {
  const { settled, total } = jobProgress(job);
  const name = job.kind === "analyze" ? "Analyse" : "Traduction";
  const candidates = (job.untranslatable ?? []).filter((id) => pageNumbers.has(id));
  const numbers = candidates.map((id) => pageNumbers.get(id)).join(", ");

  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 px-4 py-3" role="status" aria-live="polite">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {job.running ? (
          <Loader2 aria-hidden className="h-4 w-4 shrink-0 animate-spin text-amber-600 dark:text-amber-400" />
        ) : job.failure ? (
          <TriangleAlert aria-hidden className="h-4 w-4 shrink-0 text-destructive" />
        ) : (
          <CheckCircle2 aria-hidden className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
        )}
        <p className="min-w-0 flex-1 text-sm">
          {job.running ? (
            <>
              <span className="font-medium">{job.stopping ? `${name} : arrêt après la page en cours…` : `${name} en cours, en arrière-plan`}</span>
              <span className="tabular-nums text-muted-foreground">
                {" "}
                · {settled} sur {total}
              </span>
            </>
          ) : (
            <span className="font-medium">{job.summary}</span>
          )}
        </p>
        {job.running ? (
          <Button type="button" variant="outline" size="sm" disabled={job.stopping} onClick={onStop}>
            {job.stopping ? "Arrêt…" : "Arrêter"}
          </Button>
        ) : (
          <Button type="button" variant="ghost" size="sm" onClick={onDismiss}>
            Masquer
          </Button>
        )}
      </div>
      {job.running && <Progress value={total === 0 ? 0 : Math.round((settled / total) * 100)} aria-label={`Avancement de ${job.kind === "analyze" ? "l’analyse" : "la traduction"}`} className="h-1.5" />}
      {!job.running && job.failure && <p className="text-sm text-destructive">{job.failure}</p>}
      {!job.running && candidates.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <p className="min-w-0 flex-1 text-sm text-muted-foreground">
            {candidates.length === 1
              ? `La page ${numbers} semble n’avoir rien à traduire (couverture, bannière).`
              : `Les pages ${numbers} semblent n’avoir rien à traduire (couvertures, bannières).`}
          </p>
          <Button type="button" size="sm" variant="outline" className="gap-2" onClick={() => onSkip(candidates)}>
            <ImageOff className="h-4 w-4" />
            {candidates.length === 1 ? "La laisser telle quelle" : "Les laisser telles quelles"}
          </Button>
        </div>
      )}
    </div>
  );
}

interface PageTileProps {
  page: PageSummary;
  index: number;
  total: number;
  /** Un glisser est en cours : la mise en page animée lui laisse la main. */
  sorting: boolean;
  /** Où en est la page dans le traitement en cours du chapitre ; absent : elle n'en fait pas partie. */
  job?: PageJob;
  jobKind?: ChapterJobKind;
  onOpen: () => void;
  /** Déplace la page à la place donnée (à partir de zéro). */
  onMove: (to: number) => void;
  onDelete: () => void;
  /** Marque la page « à laisser telle quelle », ou lève cette marque. */
  onSkip: (skipped: boolean) => void;
}

function PageTile({ page, index, total, sorting, job, jobKind, onOpen, onMove, onDelete, onSkip }: PageTileProps) {
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
              isDragging && "cursor-grabbing shadow-xl",
              // L'état de la page dans le traitement en cours : en attente ou en cours en ambre, traitée en vert, en échec en rouge.
              job && JOB_RINGS[job.state]
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
            {job && job.state !== "skipped" && (
              <span className={cn("absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-full shadow-sm", JOB_CHIPS[job.state])} aria-hidden>
                {job.state === "queued" ? (
                  <Clock3 className="size-3.5" />
                ) : job.state === "running" ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : job.state === "done" ? (
                  <Check className="size-3.5" />
                ) : (
                  <TriangleAlert className="size-3.5" />
                )}
              </span>
            )}
          </button>
          <div className="flex items-start gap-1 px-0.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium tabular-nums" title={page.name}>
                Page {number}
              </p>
              <p className="truncate text-xs text-muted-foreground tabular-nums" title={job?.detail}>
                {job && jobKind && job.state !== "skipped"
                  ? jobLabel(job, jobKind)
                  : page.skipped
                    ? "Laissée telle quelle"
                    : `${PAGE_STATUS_LABELS[page.status]} · ${countLabel(page.regionCount, "zone", "zones")}`}
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
