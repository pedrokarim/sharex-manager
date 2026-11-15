"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronLeft, CircleAlert, Pencil, Pin, PinOff, RotateCw, Trash2 } from "lucide-react";
import { GalleryClient } from "@/app/(app)/gallery/page.client";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { ActionStatus, errorMessage, useFeedback } from "@/components/feedback";
import { THEMED_ICONS } from "@/components/icon-theme";
import { PageTitleIcon } from "@/components/page-title-icon";
import { describeRules, tagNameMap } from "@/lib/organization/describe-rules";
import type { Collection, CollectionSummary, Tag } from "@/lib/organization/types";
import { CollectionEditor } from "../collection-editor";
import { collectionHref, fetchCollection, fetchTags, fileCountLabel, updateCollection } from "../collection-api";
import { DeleteCollectionDialog } from "../delete-collection-dialog";

type LoadState =
  | { status: "loading" }
  | { status: "failed" }
  | { status: "missing" }
  | { status: "ready"; collection: CollectionSummary };

/**
 * Une collection : son en-tête (nom, règles, actions), puis la galerie
 * filtrée par ses règles. La galerie est celle de `/gallery`, avec ses
 * vues, sa sélection et sa visionneuse ; seul le filtre change.
 */
export function CollectionPageClient({ slug }: { slug: string }) {
  const router = useRouter();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [tags, setTags] = useState<Tag[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pinBusy, setPinBusy] = useState(false);
  const feedback = useFeedback();

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const [found, tagList] = await Promise.all([fetchCollection(slug), fetchTags().catch(() => [] as Tag[])]);
      setTags(tagList);
      setState(found ? { status: "ready", collection: found } : { status: "missing" });
    } catch {
      setState({ status: "failed" });
    }
  }, [slug]);

  const currentSlug = state.status === "ready" ? state.collection.slug : null;
  useEffect(() => {
    // Après un renommage, l'adresse suit le nouveau slug : la collection est déjà là.
    if (currentSlug === slug) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- relancé seulement quand l'adresse change
  }, [slug, load]);

  const names = useMemo(() => tagNameMap(tags), [tags]);

  if (state.status === "loading") return <HeaderSkeleton />;

  if (state.status === "failed") {
    return (
      <Empty className="py-12 sm:py-24">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CircleAlert className="size-5 text-destructive" />
          </EmptyMedia>
          <EmptyTitle>Chargement impossible</EmptyTitle>
          <EmptyDescription>
            La collection n’a pas pu être chargée. Vérifiez votre connexion, puis réessayez.
          </EmptyDescription>
        </EmptyHeader>
        <Button variant="outline" onClick={() => void load()}>
          <RotateCw aria-hidden />
          Réessayer
        </Button>
      </Empty>
    );
  }

  if (state.status === "missing") {
    return (
      <Empty className="py-12 sm:py-24">
        <EmptyHeader>
          <EmptyTitle>Collection introuvable</EmptyTitle>
          <EmptyDescription className="break-words">
            Aucune de vos collections ne porte l’adresse «&nbsp;{slug}&nbsp;». Elle a peut-être été supprimée ou
            renommée.
          </EmptyDescription>
        </EmptyHeader>
        <Button variant="outline" asChild>
          <Link href="/organization/collections">Voir les collections</Link>
        </Button>
      </Empty>
    );
  }

  const collection = state.collection;
  const rulesLine = describeRules(collection.rules, names);
  // La galerie se recharge quand ce qui la filtre ou la trie change, pas pour un épinglage.
  const galleryKey = `${collection.id}:${JSON.stringify(collection.rules)}:${collection.sort}:${collection.order}`;

  const setCollection = (next: Collection) =>
    setState({ status: "ready", collection: { ...collection, ...next } });

  const togglePin = async () => {
    feedback.clear();
    setPinBusy(true);
    const pinned = !collection.pinned;
    try {
      // Le bouton change de libellé : la réussite se voit sans message.
      setCollection(await updateCollection(collection.id, { pinned }));
    } catch (error) {
      feedback.error(errorMessage(error, "L’épinglage n’a pas pu être modifié."));
    } finally {
      setPinBusy(false);
    }
  };

  return (
    <div className="flex min-h-full shrink-0 flex-col">
      <header className="flex flex-col gap-3 pt-2 pb-4">
        <Link
          href="/organization/collections"
          className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft aria-hidden className="size-4" />
          Collections
        </Link>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h1 className="flex min-w-0 items-center gap-3 text-xl font-bold sm:text-2xl">
              <PageTitleIcon icon={THEMED_ICONS.collections} />
              <span className="min-w-0 break-words">{collection.name}</span>
            </h1>
            <p className="mt-2 text-sm break-words text-muted-foreground">
              <span className="tabular-nums">{fileCountLabel(collection.fileCount)}</span> · {rulesLine}
            </p>
            {collection.description ? (
              <p className="mt-1 max-w-prose text-sm break-words">{collection.description}</p>
            ) : null}
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2 lg:shrink-0 lg:justify-end">
            <ActionStatus state={feedback.state} className="order-last basis-full lg:order-first lg:basis-auto" />
            <Button variant="outline" onClick={() => setEditorOpen(true)}>
              <Pencil aria-hidden />
              Modifier
            </Button>
            <Button variant="ghost" loading={pinBusy} onClick={() => void togglePin()} aria-pressed={collection.pinned}>
              {collection.pinned ? <PinOff aria-hidden /> : <Pin aria-hidden />}
              {collection.pinned ? "Désépingler" : "Épingler"}
            </Button>
            <Button
              variant="ghost"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 aria-hidden />
              Supprimer
            </Button>
          </div>
        </div>
      </header>

      <GalleryClient
        key={galleryKey}
        initialFiles={null}
        initialHasMore={false}
        collectionId={collection.id}
      />

      <CollectionEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        collection={collection}
        tags={tags}
        onSaved={(saved) => {
          setCollection(saved);
          if (saved.slug && saved.slug !== slug) router.replace(collectionHref(saved.slug));
          // Le nombre de fichiers vient du serveur : relu après une modification des règles.
          void fetchCollection(saved.id)
            .then((fresh) => {
              if (fresh) setState({ status: "ready", collection: fresh });
            })
            .catch(() => undefined);
        }}
      />
      <DeleteCollectionDialog
        collection={deleteOpen ? collection : null}
        onOpenChange={setDeleteOpen}
        onDeleted={() => {
          // L'écran disparaît avec la collection : le retour se lit sur la liste.
          toast.success(`Collection « ${collection.name} » supprimée`);
          router.push("/organization/collections");
        }}
      />
    </div>
  );
}

function HeaderSkeleton() {
  return (
    <div
      role="status"
      aria-label="Chargement de la collection"
      className="flex animate-in flex-col gap-3 pt-2 fade-in-0 fill-mode-both delay-150 duration-300 motion-reduce:animate-none"
    >
      <Skeleton className="h-4 w-24" />
      <div className="flex items-center gap-3">
        <Skeleton className="size-10 rounded-xl sm:size-11" />
        <Skeleton className="h-7 w-56 max-w-[60%]" />
      </div>
      <Skeleton className="h-4 w-80 max-w-full" />
    </div>
  );
}
