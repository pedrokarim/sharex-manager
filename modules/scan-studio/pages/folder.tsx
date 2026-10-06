"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, MotionConfig, Reorder, useDragControls } from "framer-motion";
import { ArrowDown, ArrowUp, BookA, BookOpenText, FileStack, FolderOpen, GripVertical, Pencil, Plus, RefreshCw, Settings2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { GlossaryDialog } from "../components/library/glossary-dialog";
import { ChapterDialog, ConfirmDeleteDialog } from "../components/library/library-dialogs";
import { ChapterListSkeleton, LibraryNotice } from "../components/library/library-states";
import { ObjectContextMenu, ObjectMenuButton, type MenuEntry } from "../components/library/object-menu";
import { SettingsDialog } from "../components/library/settings-dialog";
import { useDialogTarget } from "../components/library/use-dialog-target";
import { ModuleShell } from "../components/module-shell";
import { api } from "../lib/client";
import {
  LIBRARY_PATH,
  chapterHref,
  chapterLabel,
  countLabel,
  errorMessage,
  moveItem,
  orderByIds,
  progressRatio,
  progressSummary,
  sameOrder,
  settingsSummary,
  suggestNextNumber,
} from "../lib/library-helpers";
import { isId, type ChapterSettings, type ChapterSummary, type FolderView, type GlossaryEntry } from "../lib/types";

/** Dossiers déjà vus : on les réaffiche tout de suite, puis on les rafraîchit. */
const snapshots = new Map<string, FolderView>();

type ChapterRequest = { mode: "create" } | { mode: "rename"; chapter: ChapterSummary };

export default function FolderPage() {
  const id = useSearchParams().get("id");
  if (!isId(id)) {
    return (
      <ModuleShell>
        <LibraryNotice icon={FolderOpen} title="Dossier introuvable" text="L’adresse ne désigne aucun dossier de la bibliothèque.">
          <Button asChild variant="outline" size="sm">
            <Link href={LIBRARY_PATH}>Revenir à la bibliothèque</Link>
          </Button>
        </LibraryNotice>
      </ModuleShell>
    );
  }
  return <FolderChapters key={id} folderId={id} />;
}

function FolderChapters({ folderId }: { folderId: string }) {
  const router = useRouter();
  const [view, setView] = useState<FolderView | null>(snapshots.get(folderId) ?? null);
  const [failed, setFailed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [glossaryOpen, setGlossaryOpen] = useState(false);
  const editing = useDialogTarget<ChapterRequest>();
  const deleting = useDialogTarget<ChapterSummary>();
  /** Ordre connu du serveur : un glisser qui ne change rien n'envoie rien. */
  const savedOrder = useRef<string[]>([]);
  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  const store = useCallback(
    (next: FolderView) => {
      const ordered = { ...next, chapters: orderByIds(next.chapters, next.folder.chapterIds) };
      savedOrder.current = ordered.chapters.map((chapter) => chapter.id);
      snapshots.set(folderId, ordered);
      setView(ordered);
    },
    [folderId]
  );

  const refresh = useCallback(async () => {
    try {
      store(await api.getFolder(folderId));
      setFailed(false);
    } catch (error) {
      setFailed(true);
      toast.error(errorMessage(error, "Dossier indisponible."));
    }
  }, [folderId, store]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** Montre le nouvel ordre tout de suite ; l'envoi se fait à la fin du geste. */
  const showOrder = (ids: string[]) => {
    setView((previous) => previous && { ...previous, chapters: orderByIds(previous.chapters, ids) });
  };

  const commitOrder = async (ids: string[]) => {
    if (sameOrder(ids, savedOrder.current)) return;
    try {
      await api.reorderChapters(folderId, ids);
      savedOrder.current = ids;
    } catch (error) {
      toast.error(errorMessage(error, "Le nouvel ordre n’a pas pu être enregistré."));
      void refresh();
    }
  };

  const moveChapter = (chapterId: string, offset: number) => {
    const ids = (viewRef.current?.chapters ?? []).map((chapter) => chapter.id);
    const from = ids.indexOf(chapterId);
    const next = moveItem(ids, from, from + offset);
    showOrder(next);
    void commitOrder(next);
  };

  const createChapter = async (input: { number: string; title?: string }) => {
    const chapter = await api.createChapter(folderId, input);
    void refresh();
    router.push(chapterHref(chapter.id));
  };

  const renameChapter = async (chapter: ChapterSummary, input: { number: string; title?: string }) => {
    // Un titre vidé doit s'effacer : on envoie la chaîne vide plutôt que rien.
    await api.updateChapter(chapter.id, { number: input.number, title: input.title ?? "" });
    await refresh();
  };

  const deleteChapter = async (chapter: ChapterSummary) => {
    try {
      await api.deleteChapter(chapter.id);
      setView((previous) => previous && { ...previous, chapters: previous.chapters.filter((entry) => entry.id !== chapter.id) });
      toast.success("Chapitre supprimé");
      void refresh();
    } catch (error) {
      toast.error(errorMessage(error, "Suppression du chapitre impossible."));
    }
  };

  const saveDefaults = async (defaults: ChapterSettings) => {
    await api.updateFolder(folderId, { defaults });
    toast.success("Réglages du dossier enregistrés");
    await refresh();
  };

  const saveGlossary = async (glossary: GlossaryEntry[]) => {
    const folder = await api.updateFolder(folderId, { glossary });
    // Le glossaire rendu par le serveur fait foi : il l'a nettoyé à son tour.
    setView((previous) => {
      if (!previous) return previous;
      const next = { ...previous, folder: { ...previous.folder, glossary: folder.glossary, updatedAt: folder.updatedAt } };
      snapshots.set(folderId, next);
      return next;
    });
    toast.success("Glossaire enregistré");
  };

  const chapters = view?.chapters ?? [];
  const pageCount = chapters.reduce((sum, chapter) => sum + chapter.pageCount, 0);
  const renaming = editing.target?.mode === "rename" ? editing.target.chapter : null;
  const doomed = deleting.target;

  return (
    <MotionConfig reducedMotion="user">
      <ModuleShell
        crumbs={view ? [{ label: view.folder.name }] : []}
        actions={
          <>
            <Button variant="outline" className="gap-2" disabled={!view} onClick={() => setGlossaryOpen(true)}>
              <BookA className="h-4 w-4" />
              Glossaire
            </Button>
            <Button variant="outline" className="gap-2" disabled={!view} onClick={() => setSettingsOpen(true)}>
              <Settings2 className="h-4 w-4" />
              Réglages du dossier
            </Button>
            <Button className="gap-2" disabled={!view} onClick={() => editing.show({ mode: "create" })}>
              <Plus className="h-4 w-4" />
              Nouveau chapitre
            </Button>
          </>
        }
      >
        {view === null ? (
          failed ? (
            <LibraryNotice icon={FolderOpen} title="Dossier indisponible" text="Ce dossier n’a pas pu être chargé. Il a peut-être été supprimé.">
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
            <ChapterListSkeleton />
          )
        ) : chapters.length === 0 ? (
          <LibraryNotice
            icon={FileStack}
            title="Aucun chapitre pour l’instant"
            text="Créez le premier chapitre de ce dossier, puis déposez-y ses pages. Il reprendra les réglages du dossier."
          >
            <Button className="gap-2" onClick={() => editing.show({ mode: "create" })}>
              <Plus className="h-4 w-4" />
              Nouveau chapitre
            </Button>
          </LibraryNotice>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground tabular-nums">
              {countLabel(chapters.length, "chapitre", "chapitres")}, {countLabel(pageCount, "page", "pages")} · par défaut, {settingsSummary(view.folder.defaults)}
            </p>
            <Reorder.Group as="ol" axis="y" values={chapters.map((chapter) => chapter.id)} onReorder={showOrder} className="flex flex-col">
              <AnimatePresence initial={false}>
                {chapters.map((chapter, index) => (
                  <ChapterRow
                    key={chapter.id}
                    chapter={chapter}
                    first={index === 0}
                    last={index === chapters.length - 1}
                    onDrop={() => void commitOrder((viewRef.current?.chapters ?? []).map((entry) => entry.id))}
                    onMove={(offset) => moveChapter(chapter.id, offset)}
                    onRename={() => editing.show({ mode: "rename", chapter })}
                    onDelete={() => deleting.show(chapter)}
                  />
                ))}
              </AnimatePresence>
            </Reorder.Group>
          </div>
        )}
      </ModuleShell>

      <ChapterDialog
        open={editing.open}
        onOpenChange={editing.onOpenChange}
        title={renaming ? "Renommer le chapitre" : "Nouveau chapitre"}
        description={
          renaming
            ? "Le numéro est libre : « 12 », « 12.5 » ou « Extra ». L’ordre de la liste ne change pas."
            : "Le numéro est libre : « 12 », « 12.5 » ou « Extra ». Le chapitre reprend les réglages du dossier."
        }
        initialNumber={renaming ? renaming.number : suggestNextNumber(chapters.map((chapter) => chapter.number))}
        initialTitle={renaming?.title ?? ""}
        submitLabel={renaming ? "Renommer" : "Créer le chapitre"}
        onSubmit={(input) => (renaming ? renameChapter(renaming, input) : createChapter(input))}
      />

      <ConfirmDeleteDialog
        open={deleting.open}
        onOpenChange={deleting.onOpenChange}
        title={`Supprimer ${doomed ? chapterLabel(doomed) : "le chapitre"} ?`}
        description={
          doomed
            ? `Le chapitre et ses ${countLabel(doomed.pageCount, "page", "pages")} seront supprimés, avec les images d’origine, les zones tracées, les traductions et les exports. C’est définitif.`
            : ""
        }
        onConfirm={() => doomed && void deleteChapter(doomed)}
      />

      {view && (
        <SettingsDialog
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          title="Réglages du dossier"
          description="Ces réglages sont proposés à chaque nouveau chapitre du dossier. Les chapitres existants gardent les leurs."
          value={view.folder.defaults}
          onSave={saveDefaults}
        />
      )}

      {view && (
        <GlossaryDialog open={glossaryOpen} onOpenChange={setGlossaryOpen} folderName={view.folder.name} value={view.folder.glossary} onSave={saveGlossary} />
      )}
    </MotionConfig>
  );
}

interface ChapterRowProps {
  chapter: ChapterSummary;
  first: boolean;
  last: boolean;
  /** Fin d'un glisser : l'ordre affiché part au serveur. */
  onDrop: () => void;
  onMove: (offset: number) => void;
  onRename: () => void;
  onDelete: () => void;
}

function ChapterRow({ chapter, first, last, onDrop, onMove, onRename, onDelete }: ChapterRowProps) {
  const controls = useDragControls();
  const href = chapterHref(chapter.id);
  const label = chapterLabel(chapter);
  const summary = progressSummary(chapter.progress, chapter.pageCount);

  /** Les mêmes entrées derrière « … » et au clic droit. */
  const entries: MenuEntry[] = [
    { key: "open", label: "Ouvrir", icon: BookOpenText, href },
    { key: "rename", label: "Renommer", icon: Pencil, onSelect: onRename },
    { key: "up", label: "Monter", icon: ArrowUp, onSelect: () => onMove(-1), disabled: first, separatorBefore: true },
    { key: "down", label: "Descendre", icon: ArrowDown, onSelect: () => onMove(1), disabled: last },
    { key: "delete", label: "Supprimer", icon: Trash2, onSelect: onDelete, destructive: true, separatorBefore: true },
  ];

  return (
    <Reorder.Item
      as="li"
      value={chapter.id}
      dragListener={false}
      dragControls={controls}
      onDragEnd={onDrop}
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.18 }}
      className="relative list-none overflow-hidden rounded-lg bg-background"
    >
      <ObjectContextMenu entries={entries}>
        <div className="group flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted/50 sm:gap-4">
          <button
            type="button"
            onPointerDown={(event) => controls.start(event)}
            aria-label={`Glisser pour déplacer ${label}`}
            title="Glisser pour réordonner"
            className="flex h-8 w-5 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground/60 hover:text-foreground active:cursor-grabbing"
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <Link href={href} tabIndex={-1} aria-hidden className="relative block h-16 w-12 shrink-0 overflow-hidden rounded-md border bg-muted">
            {chapter.cover ? (
              // eslint-disable-next-line @next/next/no-img-element -- vignette servie par le module, avec la session
              <img src={chapter.cover} alt="" loading="lazy" draggable={false} className="h-full w-full object-cover object-top" />
            ) : (
              <BookOpenText className="absolute inset-0 m-auto h-4 w-4 text-muted-foreground/50" />
            )}
          </Link>
          <div className="min-w-0 flex-1">
            <Link href={href} className="block truncate text-sm font-medium hover:underline">
              {label}
              {chapter.title && <span className="font-normal text-muted-foreground"> · {chapter.title}</span>}
            </Link>
            <p className="truncate text-xs text-muted-foreground tabular-nums">
              {countLabel(chapter.pageCount, "page", "pages")}
              <span className="md:hidden"> · {summary}</span>
            </p>
          </div>
          <div className="hidden w-56 shrink-0 flex-col gap-1.5 md:flex">
            <Progress value={Math.round(progressRatio(chapter.progress, chapter.pageCount) * 100)} aria-label={`Avancement de ${label}`} className="h-1.5" />
            <p className="truncate text-xs text-muted-foreground tabular-nums">{summary}</p>
          </div>
          <ObjectMenuButton entries={entries} label={`Actions de ${label}`} />
        </div>
      </ObjectContextMenu>
    </Reorder.Item>
  );
}
