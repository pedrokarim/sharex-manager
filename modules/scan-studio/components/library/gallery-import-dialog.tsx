"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "../../lib/client";
import { chapterLabel, countLabel, errorMessage, suggestNextNumber } from "../../lib/library-helpers";
import type { ChapterSummary, FolderSummary } from "../../lib/types";
import { ChapterFields } from "./library-dialogs";

/** Valeur des listes déroulantes pour « en créer un nouveau ». */
const CREATE = "__create__";

interface GalleryImportDialogProps {
  /** Noms des fichiers de la galerie à accueillir ; `null` : fenêtre fermée. */
  files: string[] | null;
  folders: FolderSummary[];
  onClose: () => void;
  /** Un dossier a été créé en chemin : la bibliothèque doit se relire. */
  onLibraryChanged: () => void;
  onImported: (chapterId: string) => void;
}

/**
 * Arrivée depuis la galerie (« Traduire dans Scan Studio ») : on choisit, ou
 * on crée, le dossier puis le chapitre qui reçoit les images.
 */
export function GalleryImportDialog({ files, folders, onClose, onLibraryChanged, onImported }: GalleryImportDialogProps) {
  const open = files !== null;
  const count = files?.length ?? 0;

  const [knownFolders, setKnownFolders] = useState<{ id: string; name: string }[]>([]);
  const [folderChoice, setFolderChoice] = useState(CREATE);
  const [folderName, setFolderName] = useState("");
  const [chapters, setChapters] = useState<ChapterSummary[] | null>([]);
  const [chapterChoice, setChapterChoice] = useState(CREATE);
  const [number, setNumber] = useState("1");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  // À l'ouverture : le dossier le plus récent est proposé, s'il y en a un.
  useEffect(() => {
    if (!open) return;
    setKnownFolders(folders.map((folder) => ({ id: folder.id, name: folder.name })));
    setFolderChoice((current) => (current !== CREATE && folders.some((folder) => folder.id === current) ? current : (folders[0]?.id ?? CREATE)));
  }, [open, folders]);

  // Les chapitres du dossier choisi.
  useEffect(() => {
    if (!open) return;
    setChapterChoice(CREATE);
    if (folderChoice === CREATE) {
      setChapters([]);
      setNumber("1");
      return;
    }
    let cancelled = false;
    setChapters(null);
    api
      .getFolder(folderChoice)
      .then((view) => {
        if (cancelled) return;
        setChapters(view.chapters);
        setNumber(suggestNextNumber(view.chapters.map((chapter) => chapter.number)));
      })
      .catch((error) => {
        if (cancelled) return;
        setChapters([]);
        toast.error(errorMessage(error, "Chapitres du dossier indisponibles."));
      });
    return () => {
      cancelled = true;
    };
  }, [open, folderChoice]);

  const creatingFolder = folderChoice === CREATE;
  const creatingChapter = chapterChoice === CREATE;
  const ready = !busy && chapters !== null && (!creatingFolder || folderName.trim() !== "") && (!creatingChapter || number.trim() !== "");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!ready || !files) return;
    setBusy(true);
    try {
      let folderId = folderChoice;
      if (creatingFolder) {
        const folder = await api.createFolder({ name: folderName.trim() });
        folderId = folder.id;
        // Une nouvelle tentative, si la suite échoue, ne recrée pas le dossier.
        setKnownFolders((previous) => [{ id: folder.id, name: folder.name }, ...previous]);
        setFolderChoice(folder.id);
        onLibraryChanged();
      }
      let chapterId = chapterChoice;
      if (creatingChapter) {
        const chapter = await api.createChapter(folderId, { number: number.trim(), title: title.trim() || undefined });
        chapterId = chapter.id;
      }
      const pages = await api.importGalleryFiles(chapterId, files);
      toast.success(pages.length < 2 ? "Image ajoutée au chapitre" : `${pages.length} images ajoutées au chapitre`);
      onImported(chapterId);
    } catch (error) {
      toast.error(errorMessage(error, "Ajout des images impossible."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Traduire dans Scan Studio</DialogTitle>
            <DialogDescription>
              {count < 2 ? "L’image choisie dans la galerie est copiée" : `Les ${count} images choisies dans la galerie sont copiées`} dans un
              chapitre. La galerie n’est pas modifiée.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <Label htmlFor="scan-studio-import-folder">Dossier</Label>
            <Select value={folderChoice} onValueChange={setFolderChoice} disabled={busy}>
              <SelectTrigger id="scan-studio-import-folder" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {knownFolders.map((folder) => (
                  <SelectItem key={folder.id} value={folder.id}>
                    {folder.name}
                  </SelectItem>
                ))}
                {knownFolders.length > 0 && <SelectSeparator />}
                <SelectItem value={CREATE}>Nouveau dossier…</SelectItem>
              </SelectContent>
            </Select>
            {creatingFolder && (
              <Input
                value={folderName}
                onChange={(event) => setFolderName(event.target.value)}
                placeholder="Nom de la série"
                aria-label="Nom du nouveau dossier"
                maxLength={120}
                autoComplete="off"
                autoFocus
              />
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="scan-studio-import-chapter">Chapitre</Label>
            {chapters === null ? (
              <Skeleton className="h-9 w-full rounded-md" />
            ) : (
              <Select value={chapterChoice} onValueChange={setChapterChoice} disabled={busy}>
                <SelectTrigger id="scan-studio-import-chapter" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {chapters.map((chapter) => (
                    <SelectItem key={chapter.id} value={chapter.id}>
                      {chapterLabel(chapter)}
                      {chapter.title ? `, ${chapter.title}` : ""} ({countLabel(chapter.pageCount, "page", "pages")})
                    </SelectItem>
                  ))}
                  {chapters.length > 0 && <SelectSeparator />}
                  <SelectItem value={CREATE}>Nouveau chapitre…</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>

          {creatingChapter && chapters !== null && <ChapterFields number={number} title={title} onNumberChange={setNumber} onTitleChange={setTitle} />}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
              Annuler
            </Button>
            <Button type="submit" disabled={!ready}>
              {busy ? "Ajout en cours…" : "Ajouter au chapitre"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
