"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { CircleAlert, Ghost, History, Search, Trash2 } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { ActionStatus, errorMessage, useFeedback } from "@/components/feedback";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ModuleShell } from "../components/module-shell";
import { MODULE_PATH, callModule, formatDate } from "../lib/client";
import { engineInfo, formatSimilarity, type HistoryEntry } from "../lib/types";

const PAGE_SIZE = 48;

interface HistoryPage {
  entries: HistoryEntry[];
  total: number;
  hasMore: boolean;
}

export default function HistoryPageView() {
  const [query, setQuery] = useState("");
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  // Échec de lecture : un état durable de la page, affiché à la place de la
  // liste avec de quoi réessayer.
  const [loadError, setLoadError] = useState<string | null>(null);
  // Échec de « Tout effacer » : à côté du bouton, qui reste affiché.
  const clearFeedback = useFeedback();
  const request = useRef(0);

  const load = useCallback(async (search: string, offset: number) => {
    const ticket = ++request.current;
    setLoading(true);
    setLoadError(null);
    try {
      const page = await callModule<HistoryPage>("listHistory", { search, offset, limit: PAGE_SIZE });
      if (request.current !== ticket) return;
      setEntries((previous) => (offset === 0 ? page.entries : [...previous, ...page.entries]));
      setTotal(page.total);
      setHasMore(page.hasMore);
    } catch (error) {
      if (request.current === ticket) {
        setLoadError(errorMessage(error, "L’historique n’a pas pu être chargé. Vérifiez votre connexion, puis réessayez."));
      }
    } finally {
      if (request.current === ticket) setLoading(false);
    }
  }, []);

  // La recherche part après une courte pause de frappe.
  useEffect(() => {
    const timer = setTimeout(() => void load(query.trim(), 0), query ? 250 : 0);
    return () => clearTimeout(timer);
  }, [query, load]);

  /** Lève en cas d'échec : la carte affiche l'erreur sur elle-même. */
  const remove = async (id: string) => {
    await callModule("deleteSearch", id);
    setEntries((previous) => previous.filter((entry) => entry.id !== id));
    setTotal((previous) => (previous === null ? previous : Math.max(0, previous - 1)));
  };

  // La liste qui se vide et l'état « Aucune recherche enregistrée » disent
  // déjà que l'effacement a réussi.
  const clear = async () => {
    clearFeedback.clear();
    try {
      await callModule("clearHistory");
      setEntries([]);
      setTotal(0);
      setHasMore(false);
    } catch (error) {
      clearFeedback.error(errorMessage(error, "L’historique n’a pas pu être effacé. Réessayez."));
    }
  };

  const empty = !loading && !loadError && entries.length === 0;

  return (
    <ModuleShell
      current="history"
      actions={
        total ? (
          <>
            <ActionStatus state={clearFeedback.state} className="max-w-[min(16rem,50vw)]" />
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Trash2 className="h-4 w-4" />
                  Tout effacer
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Effacer tout l’historique ?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Les {total} recherches enregistrées, leurs images et leurs résultats seront supprimés. C’est définitif.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annuler</AlertDialogCancel>
                  <AlertDialogAction onClick={() => void clear()}>Tout effacer</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        ) : undefined
      }
    >
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nom de l’image ou titre trouvé" className="h-9 pl-9" />
        </div>
        {total !== null && (
          <span className="text-sm tabular-nums text-muted-foreground">
            {total} recherche{total > 1 ? "s" : ""}
          </span>
        )}
        <p className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
          <Ghost className="h-3.5 w-3.5" />
          Les recherches éphémères n’apparaissent pas ici.
        </p>
      </div>

      {loadError && entries.length === 0 ? (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>Historique indisponible</AlertTitle>
          <AlertDescription>
            <p className="break-words">{loadError}</p>
            <Button variant="outline" size="sm" className="mt-1" onClick={() => void load(query.trim(), 0)}>
              Réessayer
            </Button>
          </AlertDescription>
        </Alert>
      ) : empty ? (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <History className="h-10 w-10 text-muted-foreground" />
          <div className="space-y-1">
            <h2 className="text-base font-semibold">{query ? "Aucune recherche ne correspond" : "Aucune recherche enregistrée"}</h2>
            <p className="max-w-sm text-sm text-muted-foreground">
              {query ? "Essayez un autre mot." : "Chaque recherche que vous lancez est gardée ici, sauf si vous activez le mode éphémère."}
            </p>
          </div>
          {!query && (
            <Button asChild size="sm">
              <Link href={MODULE_PATH}>Lancer une recherche</Link>
            </Button>
          )}
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          <AnimatePresence initial={false}>
            {entries.map((entry) => (
              <HistoryCard key={entry.id} entry={entry} onRemove={() => remove(entry.id)} />
            ))}
          </AnimatePresence>
          {loading && Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="aspect-[4/5] rounded-xl" />)}
        </ul>
      )}

      {loadError && entries.length > 0 && (
        <p role="alert" className="flex items-center justify-center gap-1.5 text-sm text-destructive">
          <CircleAlert className="h-4 w-4 shrink-0" />
          <span className="min-w-0 break-words">{loadError}</span>
        </p>
      )}

      {hasMore && !loading && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={() => void load(query.trim(), entries.length)}>
            Afficher la suite
          </Button>
        </div>
      )}
    </ModuleShell>
  );
}

/** Une recherche de l'historique ; un échec de suppression s'affiche sur la carte. */
function HistoryCard({ entry, onRemove }: { entry: HistoryEntry; onRemove: () => Promise<void> }) {
  const feedback = useFeedback();
  const best = entry.best ? engineInfo(entry.best.engine) : undefined;

  const remove = async () => {
    feedback.clear();
    try {
      await onRemove();
    } catch (error) {
      feedback.error(errorMessage(error, "Suppression impossible. Réessayez."));
    }
  };

  return (
    <motion.li
      layout
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.94 }}
      transition={{ duration: 0.18 }}
      className="group relative overflow-hidden rounded-xl border bg-card"
    >
      <Link href={`${MODULE_PATH}?search=${entry.id}`} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <div className="aspect-square bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element -- aperçu servi par le module */}
          <img src={entry.preview} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
        </div>
        <div className="space-y-1 p-2.5">
          <p className="truncate text-sm font-medium" title={entry.best?.title ?? entry.name}>
            {entry.best?.title ?? "Rien de sûr"}
          </p>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {best && <BrandLogo brand={best.brand} className="size-3.5 rounded-sm" />}
            {entry.best && formatSimilarity(entry.best.similarity) && (
              <span className="font-medium tabular-nums text-foreground">{formatSimilarity(entry.best.similarity)}</span>
            )}
            <span className="truncate">{formatDate(entry.createdAt)}</span>
          </p>
          <p className="truncate text-[11px] text-muted-foreground" title={entry.name}>
            {entry.name}
          </p>
        </div>
      </Link>
      {/* L'erreur se pose sur l'image, juste sous le bouton qui l'a produite. */}
      {feedback.state && (
        <div className="pointer-events-none absolute inset-x-2 top-11 flex justify-end">
          <ActionStatus
            state={feedback.state}
            className="max-w-full rounded-md bg-background/90 px-2 py-1 shadow-sm backdrop-blur-md"
          />
        </div>
      )}
      <button
        type="button"
        onClick={() => void remove()}
        aria-label="Supprimer cette recherche"
        title="Supprimer"
        className="absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-lg bg-black/55 text-white opacity-0 backdrop-blur-md transition-opacity hover:bg-destructive focus-visible:opacity-100 group-hover:opacity-100"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </motion.li>
  );
}
