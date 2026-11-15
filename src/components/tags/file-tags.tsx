"use client";

/**
 * Les tags d'un fichier, modifiables sur place : chaque ajout ou retrait est
 * enregistré aussitôt (`PUT /api/files/[filename]/tags`), et le retour se lit
 * à côté du champ. Sert dans la visionneuse et dans la fenêtre « Tags… » du
 * menu d'un fichier.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { RotateCw, Tag as TagIcon } from "lucide-react";
import { ActionStatus, errorMessage, useFeedback } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { TagRef } from "@/lib/organization/types";
import { TagEditor } from "./tag-editor";
import { galleryTagHref, slugOfName, tagsApi, useTagList } from "./tags-api";

interface FileTagsProps {
  fileName: string;
  /** Titre « Tags » au-dessus du champ, avec le retour à sa droite. */
  heading?: boolean;
  autoFocus?: boolean;
  /** À incrémenter quand les tags ont changé ailleurs (action en lot) : la liste se relit. */
  version?: number;
  /** Les tags enregistrés viennent de changer. */
  onSaved?: (tags: TagRef[]) => void;
}

export function FileTags({ fileName, heading = true, autoFocus, version = 0, onSaved }: FileTagsProps) {
  const known = useTagList();
  const knownRef = useRef(known);
  knownRef.current = known;
  /** Les tags du fichier tels que le serveur les connaît (slug compris, pour les liens). */
  const [refs, setRefs] = useState<TagRef[]>([]);
  const [names, setNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const feedback = useFeedback();
  const savedRef = useRef<string[]>([]);
  // Les enregistrements partent l'un après l'autre : le dernier envoyé est le dernier écrit.
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  const requestRef = useRef(0);
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const tags = await tagsApi.ofFile(fileName);
      const loaded = tags.map((tag) => tag.name);
      savedRef.current = loaded;
      setRefs(tags);
      setNames(loaded);
    } catch (error) {
      setLoadError(errorMessage(error, "Les tags du fichier n’ont pas pu être chargés."));
    } finally {
      setLoading(false);
    }
  }, [fileName]);

  useEffect(() => {
    feedback.clear();
    void load();
    // `feedback.clear` est stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, version]);

  const save = (next: string[]) => {
    setNames(next);
    feedback.clear();
    const request = ++requestRef.current;
    queueRef.current = queueRef.current
      .catch(() => undefined)
      .then(() => tagsApi.setOfFile(fileName, next))
      .then((tags) => {
        // Un tag créé à la volée : les suggestions se relisent pour le connaître.
        if (tags.some((tag) => !knownRef.current.tags.some((entry) => entry.id === tag.id))) void knownRef.current.reload();
        savedRef.current = tags.map((tag) => tag.name);
        setRefs(tags);
        onSavedRef.current?.(tags);
        if (request !== requestRef.current) return;
        setNames(savedRef.current);
        feedback.success("Enregistré");
      })
      .catch((error) => {
        if (request !== requestRef.current) return;
        setNames(savedRef.current);
        feedback.error(errorMessage(error, "Les tags n’ont pas été enregistrés."));
      });
  };

  const tagHref = (name: string) => galleryTagHref(slugOfName(name, [...refs, ...known.tags]));

  const status = <ActionStatus state={feedback.state} className="min-h-5" />;

  return (
    <div className="min-w-0 space-y-2" data-slot="file-tags">
      {heading ? (
        <div className="flex min-w-0 items-center justify-between gap-2">
          <h3 className="flex shrink-0 items-center gap-2 text-sm font-medium">
            <TagIcon className="h-4 w-4" />
            Tags
          </h3>
          {status}
        </div>
      ) : null}

      {loading ? (
        <Skeleton className="h-9 w-full rounded-md" />
      ) : loadError ? (
        <div role="alert" className="flex min-w-0 flex-wrap items-center gap-2 text-sm text-destructive">
          <p className="min-w-0 flex-1 break-words">{loadError}</p>
          <Button variant="outline" size="sm" onClick={() => void load()} className="shrink-0">
            <RotateCw className="size-4" />
            Réessayer
          </Button>
        </div>
      ) : (
        <TagEditor
          value={names}
          onChange={save}
          tags={known.tags}
          tagHref={tagHref}
          autoFocus={autoFocus}
          aria-label={`Tags de ${fileName}`}
        />
      )}

      {!heading ? <div className="flex min-w-0 justify-end">{status}</div> : null}
    </div>
  );
}

/** Fenêtre « Tags… » du menu d'un fichier. */
export function FileTagsDialog({
  fileName,
  onOpenChange,
  onSaved,
}: {
  fileName: string | null;
  onOpenChange: (open: boolean) => void;
  onSaved?: (fileName: string, tags: TagRef[]) => void;
}) {
  return (
    <Dialog open={fileName !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader className="min-w-0">
          <DialogTitle>Tags du fichier</DialogTitle>
          <DialogDescription className="truncate" title={fileName ?? undefined}>
            {fileName}
          </DialogDescription>
        </DialogHeader>
        {fileName ? (
          <FileTags
            key={fileName}
            fileName={fileName}
            heading={false}
            autoFocus
            onSaved={(tags) => onSaved?.(fileName, tags)}
          />
        ) : null}
        <p className="text-xs text-muted-foreground">Chaque changement est enregistré aussitôt. Un nom inconnu crée le tag.</p>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fermer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
