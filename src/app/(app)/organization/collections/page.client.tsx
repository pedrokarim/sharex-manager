"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { CircleAlert, MoreHorizontal, Pencil, Pin, PinOff, Plus, RotateCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { ActionStatus, errorMessage, useFeedback } from "@/components/feedback";
import { THEMED_ICONS } from "@/components/icon-theme";
import { PageTitleIcon } from "@/components/page-title-icon";
import { describeRules, tagNameMap } from "@/lib/organization/describe-rules";
import type { Collection, CollectionSummary, Tag } from "@/lib/organization/types";
import { CollectionCover } from "./collection-cover";
import { CollectionEditor } from "./collection-editor";
import {
  collectionHref,
  fetchCollection,
  fetchCollections,
  fetchTags,
  fileCountLabel,
  sortCollections,
  updateCollection,
} from "./collection-api";
import { DeleteCollectionDialog } from "./delete-collection-dialog";

const GRID = "grid grid-cols-[repeat(auto-fill,minmax(min(100%,15rem),1fr))] gap-x-5 gap-y-7";

/** Une collection enregistrée garde son nombre et son aperçu jusqu'au prochain chargement. */
function asSummary(saved: Collection, previous?: CollectionSummary): CollectionSummary {
  return { fileCount: previous?.fileCount ?? 0, cover: previous?.cover ?? [], ...saved };
}

export function CollectionsClient() {
  const [collections, setCollections] = useState<CollectionSummary[] | null>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<CollectionSummary | null>(null);
  const [deleting, setDeleting] = useState<CollectionSummary | null>(null);

  const load = useCallback(async () => {
    setLoadFailed(false);
    setCollections(null);
    try {
      // Sans tags, les règles s'affichent avec les slugs : la liste ne s'en prive pas.
      const [list, tagList] = await Promise.all([fetchCollections(), fetchTags().catch(() => [] as Tag[])]);
      setCollections(list);
      setTags(tagList);
    } catch {
      setLoadFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const names = useMemo(() => tagNameMap(tags), [tags]);
  const ordered = useMemo(() => (collections ? sortCollections(collections) : []), [collections]);

  const openEditor = (collection: CollectionSummary | null) => {
    setEditing(collection);
    setEditorOpen(true);
  };

  const handleSaved = (saved: Collection) => {
    setCollections((current) => {
      const list = current ?? [];
      const previous = list.find((item) => item.id === saved.id);
      return previous
        ? list.map((item) => (item.id === saved.id ? asSummary(saved, previous) : item))
        : [asSummary(saved), ...list];
    });
    // Le nombre et l'aperçu viennent du serveur : on les relit pour la collection touchée.
    void fetchCollection(saved.id)
      .then((fresh) => {
        if (!fresh) return;
        setCollections((current) => current?.map((item) => (item.id === saved.id ? fresh : item)) ?? current);
      })
      .catch(() => undefined);
  };

  const replace = (next: CollectionSummary) =>
    setCollections((current) => current?.map((item) => (item.id === next.id ? next : item)) ?? current);

  return (
    <div className="flex min-h-full shrink-0 flex-col gap-6 pt-2">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="flex min-w-0 items-center gap-3 text-xl font-bold sm:text-2xl">
            <PageTitleIcon icon={THEMED_ICONS.collections} />
            Collections
          </h1>
          <p className="mt-1 text-sm text-muted-foreground sm:text-base">
            Des recherches enregistrées. Chaque collection se remplit d’elle-même selon ses règles, sans rien y ajouter à la main.
          </p>
        </div>
        <Button onClick={() => openEditor(null)} className="w-full shrink-0 sm:w-auto">
          <Plus aria-hidden />
          Nouvelle collection
        </Button>
      </header>

      {loadFailed ? (
        <Empty className="py-12 sm:py-24">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CircleAlert className="size-5 text-destructive" />
            </EmptyMedia>
            <EmptyTitle>Chargement impossible</EmptyTitle>
            <EmptyDescription>
              Les collections n’ont pas pu être chargées. Vérifiez votre connexion, puis réessayez.
            </EmptyDescription>
          </EmptyHeader>
          <Button variant="outline" onClick={() => void load()}>
            <RotateCw aria-hidden />
            Réessayer
          </Button>
        </Empty>
      ) : collections === null ? (
        <CollectionsSkeleton />
      ) : ordered.length === 0 ? (
        <Empty className="py-12 sm:py-24">
          <EmptyHeader>
            <EmptyTitle>Aucune collection</EmptyTitle>
            <EmptyDescription>
              Une collection garde une recherche sous la main&nbsp;: «&nbsp;les vidéos taguées Valorant des
              30&nbsp;derniers jours&nbsp;», par exemple. Les nouveaux fichiers qui répondent à ses règles y entrent
              d’eux-mêmes.
            </EmptyDescription>
          </EmptyHeader>
          <Button onClick={() => openEditor(null)}>
            <Plus aria-hidden />
            Nouvelle collection
          </Button>
        </Empty>
      ) : (
        <MotionConfig reducedMotion="user">
          <ul className={GRID} aria-label="Collections">
            <AnimatePresence initial={false}>
              {ordered.map((collection) => (
                <CollectionItem
                  key={collection.id}
                  collection={collection}
                  rulesLine={describeRules(collection.rules, names)}
                  onEdit={() => openEditor(collection)}
                  onDelete={() => setDeleting(collection)}
                  onChange={replace}
                />
              ))}
            </AnimatePresence>
          </ul>
        </MotionConfig>
      )}

      <CollectionEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        collection={editing}
        tags={tags}
        onSaved={handleSaved}
      />
      <DeleteCollectionDialog
        collection={deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        onDeleted={(id) => setCollections((current) => current?.filter((item) => item.id !== id) ?? current)}
      />
    </div>
  );
}

function CollectionItem({
  collection,
  rulesLine,
  onEdit,
  onDelete,
  onChange,
}: {
  collection: CollectionSummary;
  rulesLine: string;
  onEdit: () => void;
  onDelete: () => void;
  onChange: (next: CollectionSummary) => void;
}) {
  const feedback = useFeedback();
  const href = collectionHref(collection.slug);

  const togglePin = async () => {
    feedback.clear();
    const pinned = !collection.pinned;
    // Le changement se voit tout de suite (la collection change de place) ;
    // un refus du serveur la remet où elle était.
    onChange({ ...collection, pinned });
    try {
      await updateCollection(collection.id, { pinned });
    } catch (error) {
      onChange(collection);
      feedback.error(errorMessage(error, pinned ? "Épinglage impossible." : "Désépinglage impossible."));
    }
  };

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="flex min-w-0 flex-col gap-2.5"
      data-testid="collection-item"
    >
      <Link
        href={href}
        className="block rounded-lg focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        aria-label={collection.name}
        tabIndex={-1}
      >
        <CollectionCover files={collection.cover} className="transition-opacity hover:opacity-90" />
      </Link>
      <div className="flex min-w-0 items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            {collection.pinned ? (
              <Pin aria-label="Épinglée" className="size-3.5 shrink-0 text-muted-foreground" />
            ) : null}
            <Link
              href={href}
              className="min-w-0 truncate font-medium hover:underline hover:underline-offset-4"
              title={collection.name}
            >
              {collection.name}
            </Link>
            <span className="ml-auto shrink-0 text-sm tabular-nums text-muted-foreground">
              {fileCountLabel(collection.fileCount)}
            </span>
          </div>
          <p className="mt-0.5 truncate text-sm text-muted-foreground" title={rulesLine}>
            {rulesLine}
          </p>
          <ActionStatus state={feedback.state} className="mt-1 max-w-full" />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" className="-mt-1 -mr-1 shrink-0" aria-label={`Actions de ${collection.name}`}>
              <MoreHorizontal aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onEdit}>
              <Pencil aria-hidden />
              Modifier
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void togglePin()}>
              {collection.pinned ? <PinOff aria-hidden /> : <Pin aria-hidden />}
              {collection.pinned ? "Désépingler" : "Épingler en tête"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={onDelete}>
              <Trash2 aria-hidden />
              Supprimer
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </motion.li>
  );
}

function CollectionsSkeleton() {
  return (
    <div
      className={`${GRID} animate-in fade-in-0 fill-mode-both delay-150 duration-300 motion-reduce:animate-none`}
      role="status"
      aria-label="Chargement des collections"
    >
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="flex min-w-0 flex-col gap-2.5">
          <Skeleton className="aspect-[4/3] w-full rounded-lg" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3.5 w-1/2" />
        </div>
      ))}
    </div>
  );
}
