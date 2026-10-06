"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, Clock3, Loader2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

export type UploadStatus = "waiting" | "uploading" | "done" | "error";

export interface UploadItem {
  id: string;
  name: string;
  status: UploadStatus;
  error?: string;
}

const STATUS_LABELS: Record<UploadStatus, string> = {
  waiting: "En attente",
  uploading: "Envoi en cours",
  done: "Envoyée",
  error: "Échec",
};

function StatusIcon({ status }: { status: UploadStatus }) {
  const className = "h-3.5 w-3.5 shrink-0";
  if (status === "uploading") return <Loader2 aria-hidden className={cn(className, "animate-spin text-primary")} />;
  if (status === "done") return <Check aria-hidden className={cn(className, "text-emerald-600 dark:text-emerald-400")} />;
  if (status === "error") return <TriangleAlert aria-hidden className={cn(className, "text-destructive")} />;
  return <Clock3 aria-hidden className={cn(className, "text-muted-foreground/60")} />;
}

interface UploadQueueProps {
  items: UploadItem[];
  /** L'envoi est fini : la liste ne reste que s'il y a des échecs à lire. */
  finished: boolean;
  onDismiss: () => void;
}

/** L'import en cours, fichier par fichier : chacun dit où il en est. */
export function UploadQueue({ items, finished, onDismiss }: UploadQueueProps) {
  const settled = items.filter((item) => item.status === "done" || item.status === "error").length;
  const failures = items.filter((item) => item.status === "error").length;

  return (
    <AnimatePresence initial={false}>
      {items.length > 0 && (
        <motion.section
          key="upload-queue"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2 }}
          aria-label="Import des pages"
          className="overflow-hidden"
        >
          <div className="flex flex-col gap-2 pb-2">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm font-medium tabular-nums" aria-live="polite">
                {finished
                  ? failures > 0
                    ? `${failures} sur ${items.length} en échec`
                    : "Import terminé"
                  : `Import en cours, ${settled} sur ${items.length}`}
              </p>
              <Progress value={Math.round((settled / items.length) * 100)} aria-label="Avancement de l’import" className="h-1.5 max-w-xs flex-1" />
              {finished && (
                <Button variant="ghost" size="sm" className="ml-auto h-7" onClick={onDismiss}>
                  Fermer
                </Button>
              )}
            </div>
            <ul className="grid max-h-40 grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-x-6 gap-y-1 overflow-y-auto">
              {items.map((item) => (
                <li key={item.id} className="flex min-w-0 items-center gap-2 text-xs" title={item.error ?? item.name}>
                  <StatusIcon status={item.status} />
                  <span className="sr-only">{STATUS_LABELS[item.status]}</span>
                  <span className={cn("truncate", item.status === "waiting" && "text-muted-foreground")}>{item.name}</span>
                  {item.error && <span className="truncate text-destructive">{item.error}</span>}
                </li>
              ))}
            </ul>
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  );
}
