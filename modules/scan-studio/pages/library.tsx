"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { BookOpenText, Cpu, Download, FolderOpen, FolderPlus, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { GalleryImportDialog } from "../components/library/gallery-import-dialog";
import { ConfirmDeleteDialog, NameDialog } from "../components/library/library-dialogs";
import { FOLDER_GRID, FolderGridSkeleton, LibraryNotice } from "../components/library/library-states";
import { useDialogTarget } from "../components/library/use-dialog-target";
import { ObjectContextMenu, ObjectMenuButton, type MenuEntry } from "../components/library/object-menu";
import { ModuleShell } from "../components/module-shell";
import { api } from "../lib/client";
import { ENGINES_PATH, LIBRARY_PATH, SOURCES_PATH, chapterHref, countLabel, errorMessage, folderHref } from "../lib/library-helpers";
import type { FolderSummary } from "../lib/types";

/** Dossiers gardés entre deux visites : le retour à la bibliothèque est instantané. */
let snapshot: FolderSummary[] | null = null;

type NameRequest = { mode: "create" } | { mode: "rename"; folder: FolderSummary };

export default function LibraryPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [folders, setFolders] = useState<FolderSummary[] | null>(snapshot);
  const [failed, setFailed] = useState(false);
  const naming = useDialogTarget<NameRequest>();
  const deleting = useDialogTarget<FolderSummary>();
  const [galleryFiles, setGalleryFiles] = useState<string[] | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await api.listFolders();
      snapshot = next;
      setFolders(next);
      setFailed(false);
    } catch (error) {
      setFailed(true);
      toast.error(errorMessage(error, "Bibliothèque indisponible."));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Arrivée depuis la galerie : « Traduire dans Scan Studio ».
  useEffect(() => {
    const files = params.get("files");
    if (files === null) return;
    const names = files.split(",").map((name) => name.trim()).filter(Boolean);
    if (names.length > 0) setGalleryFiles(names);
    router.replace(LIBRARY_PATH, { scroll: false });
  }, [params, router]);

  const createFolder = async (name: string) => {
    const folder = await api.createFolder({ name });
    void refresh();
    router.push(folderHref(folder.id));
  };

  const renameFolder = async (folder: FolderSummary, name: string) => {
    await api.updateFolder(folder.id, { name });
    setFolders((previous) => previous && previous.map((entry) => (entry.id === folder.id ? { ...entry, name } : entry)));
    void refresh();
  };

  const deleteFolder = async (folder: FolderSummary) => {
    try {
      await api.deleteFolder(folder.id);
      setFolders((previous) => {
        const next = previous && previous.filter((entry) => entry.id !== folder.id);
        snapshot = next;
        return next;
      });
      toast.success("Dossier supprimé");
    } catch (error) {
      toast.error(errorMessage(error, "Suppression du dossier impossible."));
    }
  };

  const renaming = naming.target?.mode === "rename" ? naming.target.folder : null;
  const doomed = deleting.target;

  return (
    <MotionConfig reducedMotion="user">
      <ModuleShell
        actions={
          <>
            <Button asChild variant="outline" size="icon" aria-label="Moteurs" title="Moteurs de traduction">
              <Link href={ENGINES_PATH}>
                <Cpu className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" className="gap-2">
              <Link href={SOURCES_PATH}>
                <Download className="h-4 w-4" />
                Import par lien
              </Link>
            </Button>
            <Button className="gap-2" onClick={() => naming.show({ mode: "create" })}>
              <FolderPlus className="h-4 w-4" />
              Nouveau dossier
            </Button>
          </>
        }
      >
        {folders === null ? (
          failed ? (
            <LibraryNotice icon={BookOpenText} title="Bibliothèque indisponible" text="Les dossiers n’ont pas pu être chargés.">
              <Button variant="outline" size="sm" className="gap-2" onClick={() => void refresh()}>
                <RefreshCw className="h-4 w-4" />
                Réessayer
              </Button>
            </LibraryNotice>
          ) : (
            <FolderGridSkeleton />
          )
        ) : folders.length === 0 ? (
          <LibraryNotice
            icon={BookOpenText}
            title="Créez votre premier dossier"
            text="Un dossier réunit les chapitres d’une série. Vous y déposerez ensuite les pages à traduire, chapitre par chapitre."
          >
            <Button className="gap-2" onClick={() => naming.show({ mode: "create" })}>
              <FolderPlus className="h-4 w-4" />
              Nouveau dossier
            </Button>
          </LibraryNotice>
        ) : (
          <ul className={FOLDER_GRID}>
            <AnimatePresence initial={false}>
              {folders.map((folder) => (
                <motion.li
                  key={folder.id}
                  layout
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.94 }}
                  transition={{ duration: 0.18 }}
                >
                  <FolderCard folder={folder} onRename={() => naming.show({ mode: "rename", folder })} onDelete={() => deleting.show(folder)} />
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </ModuleShell>

      {/* Sans chapitre d'accueil : le chapitre se range dans le dossier de sa série, créés au besoin. */}

      <NameDialog
        open={naming.open}
        onOpenChange={naming.onOpenChange}
        title={renaming ? "Renommer le dossier" : "Nouveau dossier"}
        description={
          renaming
            ? "Le nom change partout, les chapitres et leurs pages ne bougent pas."
            : "Un dossier par série : il porte les réglages proposés à chacun de ses chapitres."
        }
        label="Nom du dossier"
        placeholder="Nom de la série"
        initialValue={renaming?.name ?? ""}
        submitLabel={renaming ? "Renommer" : "Créer le dossier"}
        onSubmit={(name) => (renaming ? renameFolder(renaming, name) : createFolder(name))}
      />

      <ConfirmDeleteDialog
        open={deleting.open}
        onOpenChange={deleting.onOpenChange}
        title={`Supprimer « ${doomed?.name ?? ""} » ?`}
        description={
          doomed
            ? `Le dossier, ses ${countLabel(doomed.chapterCount, "chapitre", "chapitres")} et leurs ${countLabel(doomed.pageCount, "page", "pages")} seront supprimés, avec les zones tracées, les traductions, le glossaire et les exports. C’est définitif.`
            : ""
        }
        onConfirm={() => doomed && void deleteFolder(doomed)}
      />

      <GalleryImportDialog
        files={galleryFiles}
        folders={folders ?? []}
        onClose={() => setGalleryFiles(null)}
        onLibraryChanged={() => void refresh()}
        onImported={(chapterId) => {
          setGalleryFiles(null);
          router.push(chapterHref(chapterId));
        }}
      />
    </MotionConfig>
  );
}

function FolderCard({ folder, onRename, onDelete }: { folder: FolderSummary; onRename: () => void; onDelete: () => void }) {
  const href = folderHref(folder.id);

  /** Les mêmes entrées derrière « … » et au clic droit. */
  const entries: MenuEntry[] = [
    { key: "open", label: "Ouvrir", icon: FolderOpen, href },
    { key: "rename", label: "Renommer", icon: Pencil, onSelect: onRename },
    { key: "delete", label: "Supprimer", icon: Trash2, onSelect: onDelete, destructive: true, separatorBefore: true },
  ];

  return (
    <ObjectContextMenu entries={entries}>
      <div className="group flex flex-col gap-2">
        <Link
          href={href}
          aria-label={`Ouvrir ${folder.name}`}
          className="relative block aspect-[3/4] overflow-hidden rounded-xl border bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {folder.cover ? (
            // eslint-disable-next-line @next/next/no-img-element -- vignette servie par le module, avec la session
            <img
              src={folder.cover}
              alt=""
              loading="lazy"
              draggable={false}
              className="h-full w-full object-cover object-top transition-transform duration-300 group-hover:scale-[1.03]"
            />
          ) : (
            <BookOpenText aria-hidden className="absolute inset-0 m-auto h-8 w-8 text-muted-foreground/50" />
          )}
        </Link>
        <div className="flex items-start gap-1 px-0.5">
          <div className="min-w-0 flex-1">
            <Link href={href} className="block truncate text-sm font-medium hover:underline" title={folder.name}>
              {folder.name}
            </Link>
            <p className="truncate text-xs text-muted-foreground tabular-nums">
              {countLabel(folder.chapterCount, "chapitre", "chapitres")} · {countLabel(folder.pageCount, "page", "pages")}
            </p>
          </div>
          <ObjectMenuButton
            entries={entries}
            label={`Actions du dossier ${folder.name}`}
            className="md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100 md:data-[state=open]:opacity-100"
          />
        </div>
      </div>
    </ObjectContextMenu>
  );
}
