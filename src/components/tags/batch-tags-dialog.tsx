"use client";

/**
 * « Ajouter des tags » et « Retirer des tags » de la barre de sélection :
 * les tags choisis sont posés sur (ou retirés de) tous les fichiers
 * sélectionnés, par `POST /api/files/tags/batch`.
 */
import { useEffect, useState } from "react";
import { errorMessage, FormStatus, useFeedback } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { chunk } from "@/lib/utils/chunk";
import { TagEditor } from "./tag-editor";
import { tagsApi, useTagList } from "./tags-api";

export type BatchTagsMode = "add" | "remove";

/** Plafond de `POST /api/files/tags/batch` (`BATCH_FILES_MAX` de la route). */
const BATCH_FILES_MAX = 500;

function filesLabel(count: number): string {
  return `${count.toLocaleString("fr-FR")} fichier${count > 1 ? "s" : ""}`;
}

/** Le bilan d'une action en lot, lu au-dessus de la barre de sélection. */
export function batchTagsMessage(mode: BatchTagsMode, names: string[], fileCount: number): string {
  const subject = names.length === 1 ? `« ${names[0]} »` : `${names.length} tags`;
  const verb = mode === "add" ? "ajouté" : "retiré";
  const agreement = names.length > 1 ? "s" : "";
  return `${subject} ${verb}${agreement} ${mode === "add" ? "à" : "de"} ${filesLabel(fileCount)}`;
}

export function BatchTagsDialog({
  mode,
  files,
  onOpenChange,
  onDone,
}: {
  /** `null` : fenêtre fermée. */
  mode: BatchTagsMode | null;
  files: string[];
  onOpenChange: (open: boolean) => void;
  onDone: (message: string, mode: BatchTagsMode) => void;
}) {
  const known = useTagList({ enabled: mode !== null });
  const [names, setNames] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const feedback = useFeedback();
  const { clear } = feedback;
  const lastMode = mode ?? "add";

  useEffect(() => {
    if (mode === null) return;
    setNames([]);
    clear();
  }, [mode, clear]);

  const submit = async () => {
    if (mode === null || names.length === 0 || files.length === 0) return;
    setBusy(true);
    feedback.clear();
    let done = 0;
    try {
      // La route plafonne le nombre de fichiers par requête, comme les autres routes en lot.
      for (const batch of chunk(files, BATCH_FILES_MAX)) {
        await tagsApi.batch(batch, mode === "add" ? { add: names } : { remove: names });
        done += batch.length;
      }
      onDone(batchTagsMessage(mode, names, files.length), mode);
    } catch (error) {
      const reason = errorMessage(error, "Les tags n’ont pas pu être modifiés.");
      feedback.error(done > 0 ? `${filesLabel(done)} sur ${files.length} traités ; la suite a échoué : ${reason}` : reason);
    } finally {
      setBusy(false);
    }
  };

  const action = lastMode === "add" ? `Ajouter à ${filesLabel(files.length)}` : `Retirer de ${filesLabel(files.length)}`;

  return (
    <Dialog open={mode !== null} onOpenChange={(open) => !busy && onOpenChange(open)}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{lastMode === "add" ? "Ajouter des tags" : "Retirer des tags"}</DialogTitle>
          <DialogDescription>
            {lastMode === "add"
              ? files.length === 1
                ? "Les tags choisis s’ajoutent au fichier sélectionné. Un nom inconnu crée le tag."
                : `Les tags choisis s’ajoutent aux ${filesLabel(files.length)} sélectionnés. Un nom inconnu crée le tag.`
              : files.length === 1
                ? "Les tags choisis sont retirés du fichier sélectionné."
                : `Les tags choisis sont retirés des ${filesLabel(files.length)} sélectionnés qui les portent.`}
          </DialogDescription>
        </DialogHeader>
        <form
          id="batch-tags-form"
          className="min-w-0"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <TagEditor
            value={names}
            onChange={(next) => {
              setNames(next);
              feedback.clear();
            }}
            tags={known.tags}
            allowCreate={lastMode === "add"}
            disabled={busy}
            autoFocus
            aria-label={lastMode === "add" ? "Tags à ajouter" : "Tags à retirer"}
          />
          <FormStatus state={feedback.state} className="pt-3" />
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Annuler
          </Button>
          <Button
            type="submit"
            form="batch-tags-form"
            loading={busy}
            disabled={names.length === 0}
            variant={lastMode === "remove" ? "destructive" : "default"}
          >
            {action}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
