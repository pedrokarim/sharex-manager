"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Images,
  ImageDown,
  Search,
  Sparkles,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
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
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { ModuleConfig } from "@/types/modules";
import { ModuleShell } from "../components/module-shell";
import { ImageViewer, type Shot } from "../components/image-viewer";
import {
  callModule,
  formatBytes,
  imageUrl,
  timeAgo,
  type Collection,
  type HistoryItem,
  type ModuleStats,
} from "../lib/client";

interface LibraryPageProps {
  moduleName: string;
  moduleConfig: ModuleConfig;
  settings: Record<string, any>;
}

export default function LibraryPage({}: LibraryPageProps) {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [stats, setStats] = useState<ModuleStats | null>(null);
  const [loading, setLoading] = useState(true);

  const [query, setQuery] = useState("");
  const [modelFilter, setModelFilter] = useState("all");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [collectionFilter, setCollectionFilter] = useState("all");
  const [collections, setCollections] = useState<Collection[]>([]);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const [history, moduleStats, cols] = await Promise.all([
        callModule<HistoryItem[]>("getHistory", 200),
        callModule<ModuleStats>("getStats"),
        callModule<Collection[]>("listCollections"),
      ]);
      setItems(history);
      setStats(moduleStats);
      setCollections(cols);
    } catch {
      toast.error("Chargement de la bibliothèque impossible");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      if (favoritesOnly && !item.favorite) return false;
      if (modelFilter !== "all" && item.model !== modelFilter) return false;
      if (
        collectionFilter !== "all" &&
        (item.collectionId ?? "none") !== collectionFilter
      ) {
        return false;
      }
      if (!needle) return true;
      // Les notes font partie de ce qui a produit l'image : les inclure évite
      // qu'une recherche sur « aquarelle » rate les générations où le mot est
      // dans le pré-prompt plutôt que dans le prompt.
      return (
        item.prompt.toLowerCase().includes(needle) ||
        item.notes.toLowerCase().includes(needle)
      );
    });
  }, [items, query, modelFilter, favoritesOnly, collectionFilter]);

  /** Les libellés de modèles viennent des statistiques : le catalogue courant
      ne connaît plus forcément un moteur retiré depuis. */
  const modelLabels = useMemo(
    () => new Map((stats?.byModel ?? []).map((entry) => [entry.model, entry.label])),
    [stats]
  );

  /** La grille montre des images, pas des générations : on aplatit les lots. */
  const shots: Shot[] = useMemo(
    () =>
      filtered.flatMap((item) =>
        item.imageFiles.map((file) => ({ item, file }))
      ),
    [filtered]
  );

  const availableModels = useMemo(
    () => [...new Set(items.map((i) => i.model))],
    [items]
  );

  const handleToggleFavorite = useCallback(
    async (item: HistoryItem, event: React.MouseEvent) => {
      event.stopPropagation();
      try {
        const res = await callModule<{ favorite: boolean }>(
          "toggleFavorite",
          item.id
        );
        setItems((prev) =>
          prev.map((i) =>
            i.id === item.id ? { ...i, favorite: res.favorite } : i
          )
        );
      } catch {
        toast.error("Modification impossible");
      }
    },
    []
  );

  const handleSaveToGallery = useCallback(
    async (item: HistoryItem, file: string, event: React.MouseEvent) => {
      event.stopPropagation();
      try {
        const res = await callModule<{ fileName?: string }>(
          "saveToGallery",
          item.id,
          file
        );
        toast.success(`Ajoutée à la galerie : ${res?.fileName}`);
        load();
      } catch (err: any) {
        toast.error(err?.message ?? "Copie impossible");
      }
    },
    [load]
  );

  const handleClearAll = useCallback(async () => {
    try {
      await callModule("clearHistory");
      setItems([]);
      load();
      toast.success("Bibliothèque vidée");
    } catch {
      toast.error("Suppression impossible");
    }
  }, [load]);

  const hasFilters = Boolean(query) || modelFilter !== "all" || favoritesOnly;

  return (
    <ModuleShell
      current="library"
      title="Bibliothèque"
      description="Toutes les images produites par le module, avec leurs réglages."
      actions={
        <>
          <Button size="sm" asChild className="gap-2">
            <Link href="/m/ai-image-gen">
              <Sparkles className="h-4 w-4" />
              Générer
            </Link>
          </Button>
          {items.length > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Trash2 className="h-4 w-4" />
                  Tout vider
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Vider la bibliothèque ?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Les {stats?.images ?? items.length} images générées et leur
                    historique seront supprimés du disque. Les copies déjà
                    envoyées dans la galerie de l&apos;application, elles, sont
                    conservées.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annuler</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleClearAll}
                    className="bg-destructive text-white hover:bg-destructive/90"
                  >
                    Supprimer
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </>
      }
    >
      {/* Compteurs */}
      {stats && stats.generations > 0 && (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Générations", value: stats.generations.toString() },
            { label: "Images", value: stats.images.toString() },
            { label: "En galerie", value: stats.inGallery.toString() },
            { label: "Sur le disque", value: formatBytes(stats.diskBytes) },
          ].map((stat) => (
            <div key={stat.label} className="rounded-lg border bg-card px-4 py-3">
              <dt className="text-xs text-muted-foreground">{stat.label}</dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums">
                {stat.value}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {/* Filtres */}
      {items.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <InputGroup className="w-full sm:max-w-xs">
            <InputGroupAddon align="inline-start">
              <Search />
            </InputGroupAddon>
            <InputGroupInput
              placeholder="Rechercher dans les prompts…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  aria-label="Effacer la recherche"
                  onClick={() => setQuery("")}
                >
                  <X />
                </InputGroupButton>
              </InputGroupAddon>
            )}
          </InputGroup>

          {availableModels.length > 1 && (
            <Select value={modelFilter} onValueChange={setModelFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les modèles</SelectItem>
                {availableModels.map((m) => (
                  <SelectItem key={m} value={m}>
                    {modelLabels.get(m) ?? m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {collections.length > 0 && (
            <Select value={collectionFilter} onValueChange={setCollectionFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les séries</SelectItem>
                <SelectItem value="none">Hors série</SelectItem>
                {collections.map((collection) => (
                  <SelectItem key={collection.id} value={collection.id}>
                    {collection.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Button
            variant={favoritesOnly ? "default" : "outline"}
            size="sm"
            onClick={() => setFavoritesOnly((v) => !v)}
            className="gap-1.5"
          >
            <Star
              className={cn("h-3.5 w-3.5", favoritesOnly && "fill-current")}
            />
            Favoris
            {stats?.favorites ? ` (${stats.favorites})` : ""}
          </Button>

          <span className="ml-auto text-sm text-muted-foreground tabular-nums">
            {shots.length} image{shots.length > 1 ? "s" : ""}
          </span>
        </div>
      )}

      {/* Grille */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-6 w-6 text-muted-foreground" />
        </div>
      ) : shots.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {shots.map((shot, index) => {
            const inGallery = Boolean(shot.item.savedToGallery?.[shot.file]);
            return (
              <figure
                key={`${shot.item.id}-${shot.file}`}
                className="group relative aspect-square overflow-hidden rounded-xl border bg-muted"
              >
                <button
                  type="button"
                  onClick={() => setViewerIndex(index)}
                  className="block h-full w-full"
                  aria-label={`Ouvrir : ${shot.item.prompt}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imageUrl(shot.file)}
                    alt={shot.item.prompt}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                  />
                </button>

                {/* Actions rapides, sans passer par la visionneuse */}
                <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                  <Button
                    size="icon"
                    variant="secondary"
                    aria-label={
                      shot.item.favorite
                        ? "Retirer des favoris"
                        : "Ajouter aux favoris"
                    }
                    onClick={(e) => handleToggleFavorite(shot.item, e)}
                    className="h-7 w-7"
                  >
                    <Star
                      className={cn(
                        "h-3.5 w-3.5",
                        shot.item.favorite && "fill-amber-400 text-amber-400"
                      )}
                    />
                  </Button>
                  <Button
                    size="icon"
                    variant="secondary"
                    aria-label={
                      inGallery ? "Déjà en galerie" : "Ajouter à la galerie"
                    }
                    disabled={inGallery}
                    onClick={(e) => handleSaveToGallery(shot.item, shot.file, e)}
                    className="h-7 w-7"
                  >
                    <ImageDown className="h-3.5 w-3.5" />
                  </Button>
                </div>

                {/* L'étoile reste visible hors survol quand elle est active,
                    sinon un favori ne se distingue pas dans la grille. */}
                {shot.item.favorite && (
                  <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-background/90 p-1 group-hover:opacity-0">
                    <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                  </span>
                )}

                <figcaption className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 pt-6 opacity-0 transition-opacity group-hover:opacity-100">
                  <p className="line-clamp-2 text-[11px] leading-tight text-white">
                    {shot.item.prompt}
                  </p>
                  <p className="mt-0.5 text-[10px] text-white/70">
                    {timeAgo(shot.item.createdAt)}
                  </p>
                </figcaption>
              </figure>
            );
          })}
        </div>
      ) : hasFilters ? (
        <Empty className="rounded-xl border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Search />
            </EmptyMedia>
            <EmptyTitle>Aucun résultat</EmptyTitle>
            <EmptyDescription>
              Aucune image ne correspond à ces filtres.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setQuery("");
                setModelFilter("all");
                setFavoritesOnly(false);
              }}
            >
              Réinitialiser les filtres
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <Empty className="rounded-xl border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Images />
            </EmptyMedia>
            <EmptyTitle>La bibliothèque est vide</EmptyTitle>
            <EmptyDescription>
              Les images générées depuis le Studio sont archivées ici avec le
              prompt et les réglages qui les ont produites.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild className="gap-2">
              <Link href="/m/ai-image-gen">
                <Sparkles className="h-4 w-4" />
                Générer une première image
              </Link>
            </Button>
          </EmptyContent>
        </Empty>
      )}

      {/* Répartition par modèle */}
      {stats && stats.byModel.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>Répartition :</span>
          {stats.byModel.map((entry) => (
            <Badge key={entry.model} variant="secondary" className="font-normal">
              {entry.label} · {entry.count}
            </Badge>
          ))}
        </div>
      )}

      <ImageViewer
        shots={shots}
        index={viewerIndex}
        onIndexChange={setViewerIndex}
        onMutate={load}
      />
    </ModuleShell>
  );
}
