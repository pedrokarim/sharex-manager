"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { Download, ExternalLink, MoreHorizontal, Play, RefreshCw, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Item, ItemActions, ItemContent, ItemDescription, ItemFooter, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { LinkImportPanel } from "../components/library/link-import-panel";
import { SourceIcon } from "../components/library/source-logo";
import { ModuleShell } from "../components/module-shell";
import { api, formatDate } from "../lib/client";
import { SOURCE_ERROR_LEADS, chapterHref, chapterLabel, errorMessage, sourceErrorDetail } from "../lib/library-helpers";
import type { SourceStatus } from "../lib/types";

/** Sources gardées entre deux visites : elles restent à l'écran pendant qu'on les rafraîchit. */
let snapshot: SourceStatus[] | null = null;

/**
 * « Import par lien » : le seul endroit où l'on récupère un chapitre par son
 * lien. En haut, le lien, son aperçu et le suivi ; en dessous, les sites gérés.
 * Ouverte depuis un chapitre (`?chapter=…`), les pages s'ajoutent à ce chapitre.
 */
export default function SourcesPage() {
  const chapterId = useSearchParams().get("chapter");
  const [target, setTarget] = useState<{ id: string; number: string; title?: string } | null>(null);
  // Un chapitre demandé mais pas encore lu : on attend de savoir où iront les pages.
  const [targetPending, setTargetPending] = useState(Boolean(chapterId));
  const { data: session } = useSession();
  // Le serveur refuse de toute façon ces réglages aux autres comptes : ici, on ne fait que ne pas les proposer.
  const isAdmin = session?.user?.role === "admin";
  const [sources, setSources] = useState<SourceStatus[] | null>(snapshot);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  /** Exemple choisi dans la liste : il est mis dans le champ et lu. */
  const [example, setExample] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!chapterId) {
      setTarget(null);
      setTargetPending(false);
      return;
    }
    let cancelled = false;
    setTargetPending(true);
    api
      .getChapter(chapterId)
      .then((view) => {
        if (!cancelled) setTarget({ id: view.chapter.id, number: view.chapter.number, title: view.chapter.title });
      })
      .catch((error) => {
        if (!cancelled) toast.error(errorMessage(error, "Ce chapitre est introuvable : le lien sera rangé dans le dossier de sa série."));
      })
      .finally(() => {
        if (!cancelled) setTargetPending(false);
      });
    return () => {
      cancelled = true;
    };
  }, [chapterId]);

  const store = useCallback((next: SourceStatus[]) => {
    snapshot = next;
    setSources(next);
    setFailed(false);
  }, []);

  /** Remplace une ligne par ce que le serveur vient de rendre pour elle. */
  const storeOne = useCallback((status: SourceStatus) => {
    setSources((previous) => {
      const next = previous ? previous.map((entry) => (entry.id === status.id ? status : entry)) : [status];
      snapshot = next;
      return next;
    });
  }, []);

  /** Lit l'état des sources sur ce serveur. Aucun site n'est joint, sauf la toute première fois, pour son icône. */
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      store(await api.listSources());
    } catch (error) {
      setFailed(true);
      toast.error(errorMessage(error, "Liste des sources indisponible."));
    } finally {
      setRefreshing(false);
    }
  }, [store]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const tryExample = (link: string) => {
    setExample(link);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <MotionConfig reducedMotion="user">
      <ModuleShell
        crumbs={target ? [{ label: chapterLabel(target), href: chapterHref(target.id) }, { label: "Import par lien" }] : [{ label: "Import par lien" }]}
        actions={
          <Button variant="outline" className="gap-2" disabled={refreshing} onClick={() => void refresh()}>
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
            Actualiser
          </Button>
        }
      >
        <div className="flex flex-col gap-6">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Download aria-hidden className="size-5" />
            </span>
            <div className="min-w-0">
              <h2 className="text-xl font-semibold tracking-tight">Import par lien</h2>
              <p className="max-w-3xl text-sm text-muted-foreground">
                Le lien d’un chapitre suffit : le site est reconnu, les pages arrivent une à une et se rangent dans la bibliothèque.
              </p>
            </div>
          </div>

          <div className="grid items-start gap-x-8 gap-y-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div className="min-w-0 xl:sticky xl:top-20">
          {targetPending ? (
            <div className="grid max-w-3xl gap-3" aria-hidden>
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : (
            <LinkImportPanel chapter={target ?? undefined} initialLink={example} onChanged={() => void refresh()} />
          )}
          </div>

          <div className="min-w-0">

          {sources === null ? (
            failed ? (
              <div className="flex flex-col items-start gap-3">
                <p className="text-sm text-muted-foreground">La liste des sources n’a pas pu être chargée.</p>
                <Button variant="outline" size="sm" className="gap-2" onClick={() => void refresh()}>
                  <RefreshCw className="h-4 w-4" />
                  Réessayer
                </Button>
              </div>
            ) : (
              <SourcesSkeleton />
            )
          ) : (
            <section className="flex flex-col gap-3" aria-labelledby="scan-studio-source-list">
              <div className="space-y-1">
                <h2 id="scan-studio-source-list" className="text-base font-semibold">
                  Sites gérés
                </h2>
                <p className="text-sm text-muted-foreground">
                  Lus par ce qu’ils servent ouvertement à tout visiteur, une page après l’autre, sans compte ni contournement.
                </p>
                {!isAdmin && <p className="text-xs text-muted-foreground">Activer ou désactiver une source est réservé à un administrateur.</p>}
              </div>
              {sources.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun adaptateur n’est installé.</p>
              ) : (
                <ItemGroup className="grid gap-3 min-[1900px]:grid-cols-2">
                  <AnimatePresence initial={false}>
                    {sources.map((source) => (
                      <motion.div key={source.id} layout="position" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                        <SourceRow source={source} isAdmin={isAdmin} onSaved={storeOne} onTry={() => tryExample(source.example)} />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </ItemGroup>
              )}
            </section>
          )}
          </div>
          </div>
        </div>
      </ModuleShell>
    </MotionConfig>
  );
}

/** Une source avant son arrivée : même gabarit que sa ligne. */
function SourcesSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden>
      <Skeleton className="h-5 w-28" />
      <div className="grid gap-3 min-[1900px]:grid-cols-2">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="flex flex-col gap-3 rounded-md border p-4">
            <div className="flex items-center gap-3">
              <Skeleton className="size-9 rounded-md" />
              <div className="flex flex-col gap-1.5">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-44" />
              </div>
              <Skeleton className="ml-auto h-5 w-9 rounded-full" />
            </div>
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-40" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Longueur à partir de laquelle des notes dépassent deux lignes, à peu près. */
const NOTES_PREVIEW_LENGTH = 150;

/** Les domaines à montrer : sans « www.exemple.org » quand « exemple.org » est déjà là. */
function mainHosts(hosts: string[]): string[] {
  const plain = hosts.filter((host) => !host.startsWith("*."));
  const kept = plain.filter((host) => !plain.some((other) => other !== host && host.endsWith(`.${other}`)));
  return kept.length > 0 ? kept : hosts;
}

interface SourceRowProps {
  source: SourceStatus;
  isAdmin: boolean;
  onSaved: (status: SourceStatus) => void;
  /** Met l'exemple dans le champ du lien, en haut de la page, et le lit. */
  onTry: () => void;
}

function SourceRow({ source, isAdmin, onSaved, onTry }: SourceRowProps) {
  const [saving, setSaving] = useState(false);
  const [refreshingIcon, setRefreshingIcon] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const switchId = `scan-studio-source-${source.id}-enabled`;
  const notesId = `scan-studio-source-${source.id}-notes`;

  const setEnabled = async (enabled: boolean) => {
    if (saving) return;
    setSaving(true);
    try {
      onSaved(await api.setSourceEnabled(source.id, enabled));
      toast.success(enabled ? `${source.name} est activé` : `${source.name} est désactivé`);
    } catch (error) {
      toast.error(errorMessage(error, "Ce réglage n’a pas pu être enregistré."));
    } finally {
      setSaving(false);
    }
  };

  const refreshIcon = async () => {
    if (refreshingIcon) return;
    setRefreshingIcon(true);
    try {
      onSaved(await api.refreshSourceIcon(source.id));
      toast.success(`Icône de ${source.name} relue chez le site`);
    } catch (error) {
      toast.error(errorMessage(error, "L’icône n’a pas pu être récupérée."));
    } finally {
      setRefreshingIcon(false);
    }
  };

  return (
    <Item variant="outline" role="listitem" className="h-full items-start">
      <ItemMedia variant="image" className="size-9 rounded-md">
        <SourceIcon iconUrl={source.iconUrl} className="size-9 rounded-md" />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>{source.name}</ItemTitle>
        <ItemDescription className="break-words">{mainHosts(source.hosts).join(", ")}</ItemDescription>
      </ItemContent>
      <ItemActions>
        {isAdmin ? (
          <Switch id={switchId} checked={source.enabled} disabled={saving} onCheckedChange={(next) => void setEnabled(next)} aria-label={`Activer ${source.name}`} />
        ) : (
          <span className={cn("text-xs", source.enabled ? "text-emerald-700 dark:text-emerald-300" : "text-muted-foreground")}>
            {source.enabled ? "Activée" : "Désactivée"}
          </span>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon" className="size-8" aria-label={`Actions pour ${source.name}`}>
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem disabled={!source.enabled} onClick={onTry}>
              <Play aria-hidden />
              Essayer l’exemple
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href={source.homepage} target="_blank" rel="noreferrer noopener">
                <ExternalLink aria-hidden />
                Ouvrir le site
              </a>
            </DropdownMenuItem>
            {isAdmin && (
              <DropdownMenuItem disabled={refreshingIcon} onClick={() => void refreshIcon()}>
                <RefreshCw aria-hidden />
                Relire l’icône
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </ItemActions>

      {source.notes && (
        <div className="flex basis-full flex-col items-start gap-1">
          <p id={notesId} className={cn("text-xs leading-relaxed text-muted-foreground", !expanded && "line-clamp-2")}>
            {source.notes}
          </p>
          {source.notes.length > NOTES_PREVIEW_LENGTH && (
            <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" aria-expanded={expanded} aria-controls={notesId} onClick={() => setExpanded((open) => !open)}>
              {expanded ? "Réduire" : "Lire la suite"}
            </Button>
          )}
        </div>
      )}

      {source.lastError && (
        <p className="flex basis-full items-start gap-2 text-xs text-amber-700 dark:text-amber-300">
          <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          <span className="min-w-0 break-words">
            <span className="font-medium">Dernier échec, {formatDate(source.lastError.at)} : </span>
            {SOURCE_ERROR_LEADS[source.lastError.kind]} {sourceErrorDetail(source.lastError.message)}
          </span>
        </p>
      )}

      <ItemFooter className="text-xs text-muted-foreground tabular-nums">
        <span>{source.lastUsedAt ? `Dernier import réussi : ${formatDate(source.lastUsedAt)}` : "Aucun import pour l’instant"}</span>
        {!source.enabled && <span>Désactivée</span>}
      </ItemFooter>
    </Item>
  );
}
