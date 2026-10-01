"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { toast } from "sonner";
import { ArrowLeft, CalendarSearch, ChevronDown, Images } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Loading } from "@/components/ui/loading";
import { PublicImageViewer } from "@/components/catalog/public-image-viewer";
import { VideoThumbnail } from "@/components/gallery/video-thumbnail";
import { isImageFile, isVideoFile, mediaCountLabel } from "@/lib/media-kind";
import { CatalogMosaic } from "@/components/catalog/catalog-mosaic";
import { cn } from "@/lib/utils";
import type { Album } from "@/types/albums";
import { TimelineNavigator, timelineGroupProps } from "@/components/timeline/timeline-navigator";
import { formatMonthKey, monthKeyOf } from "@/lib/timeline";

interface CatalogAlbumDetailPageProps {
  slug: string;
}

interface AlbumImage {
  name: string;
  url: string;
  addedAt: string;
  durationMs?: number;
}

type Density = "dense" | "normal" | "large";

const DENSITY: Record<Density, string> = {
  dense: "grid-cols-3 sm:grid-cols-5 lg:grid-cols-8 xl:grid-cols-10 gap-1",
  normal: "grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 gap-1.5",
  large: "grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2",
};

const thumb = (name: string) => `/api/thumbnails/${encodeURIComponent(name)}`;

/** Hauteur de la barre du site, qui recouvre le haut de la page. */
const STICKY_OFFSET = 100;

const monthKey = (iso?: string) => {
  if (!iso) return "0000-00";
  const date = new Date(iso);
  return monthKeyOf(date, Number.isNaN(date.getTime()) ? 0 : date.getTimezoneOffset());
};

const monthLabel = (key: string) => (key === "0000-00" ? "Sans date" : formatMonthKey(key, "long", "fr-FR"));

/** Tout l'album est déjà chargé : un saut n'a rien à demander au serveur. */
const nothingToLoad = async () => {};

const formatDate = (iso?: string) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(d);
};

export function CatalogAlbumDetailPage({ slug }: CatalogAlbumDetailPageProps) {
  const [album, setAlbum] = useState<Album | null>(null);
  const [files, setFiles] = useState<AlbumImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [density, setDensity] = useState<Density>("normal");
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerKey, setPickerKey] = useState<string | null>(null);
  const galleryRef = useRef<HTMLDivElement | null>(null);

  /** Mois d'ajout consécutifs, du plus récent au plus ancien. */
  const groups = useMemo(() => {
    const result: { key: string; start: number; items: AlbumImage[] }[] = [];
    files.forEach((file, index) => {
      const key = monthKey(file.addedAt);
      const last = result[result.length - 1];
      if (last?.key === key) last.items.push(file);
      else result.push({ key, start: index, items: [file] });
    });
    return result;
  }, [files]);
  const months = useMemo(() => groups.map((group) => ({ key: group.key, count: group.items.length })), [groups]);
  const canPickDate = months.length > 1;

  const fetchAlbumData = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/public/albums/${slug}`);

      if (!response.ok) {
        if (response.status === 404) {
          // L'écran « album introuvable » suffit : un toast en plus fait doublon.
          setAlbum(null);
          return;
        }
        throw new Error("Erreur lors du chargement");
      }

      const data = await response.json();
      setAlbum(data);

      const imageFiles: AlbumImage[] = (data.files || [])
        .filter((entry: any) => isImageFile(entry.fileName) || isVideoFile(entry.fileName))
        .map((entry: any) => ({
          name: entry.fileName,
          url: `/api/files/${encodeURIComponent(entry.fileName)}`,
          addedAt: entry.addedAt,
          durationMs: entry.durationMs,
        }));
      setFiles(imageFiles);
    } catch (error) {
      console.error("Erreur:", error);
      toast.error("Erreur lors du chargement de l'album");
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    fetchAlbumData();
  }, [fetchAlbumData]);

  if (loading) {
    return (
      <div className="pt-24">
        <Loading fullHeight />
      </div>
    );
  }

  if (!album) {
    return (
      <div className="pb-16 pt-24">
        <div className="container mx-auto px-4 py-16 text-center sm:px-6 lg:px-8">
          <Images className="mx-auto mb-4 h-14 w-14 text-muted-foreground/30" />
          <h1 className="text-2xl font-bold">Album introuvable</h1>
          <p className="mt-2 text-muted-foreground">
            Cet album n&apos;existe pas ou n&apos;est plus accessible.
          </p>
          <Button variant="outline" className="mt-6 gap-2" asChild>
            <Link href="/catalog/albums">
              <ArrowLeft className="h-4 w-4" />
              Retour aux albums
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  const updatedAt = formatDate(files[0]?.addedAt);

  return (
    <>
      {/* Bandeau volontairement plus court que l'accueil : un album se présente,
          il n'a pas à rejouer l'ouverture du site. */}
      <section className="relative flex min-h-[44vh] items-end overflow-hidden">
        {files.length > 0 ? (
          <CatalogMosaic
            images={files.slice(0, 24).map((file) => file.name)}
            rate={1.2}
            fade={1800}
          />
        ) : (
          <div className="absolute inset-0 bg-muted" />
        )}

        {/* Même parti pris que l'accueil : contenu clair sur voile sombre,
            quel que soit le thème de l'application. */}
        {/* pb-28 : même raison que sur l'accueil, rester au-dessus du fondu. */}
        <div className="container relative z-10 mx-auto px-4 pb-28 text-white sm:px-6 lg:px-8">
          <p className="font-mono text-xs text-white/60">
            <Link href="/catalog/albums" className="hover:text-white">
              Albums
            </Link>{" "}
            / {album.name}
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tighter text-balance sm:text-4xl lg:text-5xl">
            {album.name}
          </h1>
          {album.description ? (
            <p className="mt-3 max-w-[54ch] leading-relaxed text-white/75">
              {album.description}
            </p>
          ) : null}
          <div className="mt-5 flex flex-wrap gap-5 font-mono text-xs text-white/60">
            <span className="font-semibold text-white">
              {mediaCountLabel(files.map((file) => file.name))}
            </span>
            {updatedAt ? (
              <span>
                mis à jour le{" "}
                <b className="font-semibold text-white">{updatedAt}</b>
              </span>
            ) : null}
          </div>
        </div>
      </section>

      <div ref={galleryRef} className="container mx-auto px-4 pb-16 sm:px-6 lg:px-8">
        {files.length > 0 ? (
          <div className="flex flex-wrap items-center gap-3 border-b py-4">
            <div className="flex overflow-hidden rounded-md border">
              {(["dense", "normal", "large"] as Density[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setDensity(mode)}
                  aria-pressed={density === mode}
                  className={cn(
                    "px-3 py-1.5 font-mono text-xs capitalize transition-colors",
                    density === mode
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {mode === "large" ? "grand" : mode}
                </button>
              ))}
            </div>
            {canPickDate ? (
              <button
                type="button"
                onClick={() => {
                  setPickerKey(null);
                  setPickerOpen(true);
                }}
                className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                <CalendarSearch className="h-3.5 w-3.5" />
                Aller à une date
              </button>
            ) : null}
            <span className="ml-auto font-mono text-xs text-muted-foreground">
              {mediaCountLabel(files.map((file) => file.name))}
            </span>
          </div>
        ) : null}

        {files.length === 0 ? (
          <div className="mt-8 rounded-xl border border-dashed py-20 text-center">
            <Images className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
            <h3 className="font-semibold">Album vide</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Cet album ne contient aucune image ni vidéo.
            </p>
          </div>
        ) : (
          groups.map((group) => (
            <section
              key={`${group.key}-${group.start}`}
              className="mt-5"
              {...timelineGroupProps(group.key, group.start, group.items.length)}
            >
              {canPickDate ? (
                <div className="mb-2 flex items-baseline gap-3 border-b pb-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPickerKey(group.key);
                      setPickerOpen(true);
                    }}
                    title="Aller à une date"
                    className="group/month inline-flex items-center gap-1 font-mono text-xs font-medium capitalize transition-colors hover:text-primary"
                  >
                    {monthLabel(group.key)}
                    <ChevronDown className="h-3 w-3 opacity-0 transition-opacity group-hover/month:opacity-100 group-focus-visible/month:opacity-100" />
                  </button>
                </div>
              ) : null}
              <div className={cn("grid", DENSITY[density])}>
                {group.items.map((file, indexInGroup) => (
                  <button
                    key={file.name}
                    type="button"
                    onClick={() => setSelectedIndex(group.start + indexInGroup)}
                    className="group relative aspect-square overflow-hidden rounded-sm bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={`Ouvrir ${file.name}`}
                  >
                    {isVideoFile(file.name) ? (
                      <VideoThumbnail name={file.name} durationMs={file.durationMs} sizes="(max-width: 640px) 33vw, (max-width: 1024px) 20vw, 12vw" />
                    ) : (
                      <Image
                        src={thumb(file.name)}
                        alt=""
                        fill
                        sizes="(max-width: 640px) 33vw, (max-width: 1024px) 20vw, 12vw"
                        className="object-cover transition-transform duration-300 group-hover:scale-[1.04]"
                      />
                    )}
                  </button>
                ))}
              </div>
            </section>
          ))
        )}
      </div>

      <TimelineNavigator
        months={months}
        containerRef={galleryRef}
        topOffset={STICKY_OFFSET}
        loadAt={nothingToLoad}
        pickerOpen={pickerOpen}
        onPickerOpenChange={setPickerOpen}
        pickerKey={pickerKey}
        locale="fr-FR"
      />

      <PublicImageViewer
        items={files.map((file) => ({
          ...file,
          album: { name: album.name, slug: album.publicSlug || "" },
        }))}
        index={selectedIndex}
        onClose={() => setSelectedIndex(null)}
        onIndexChange={setSelectedIndex}
      />
    </>
  );
}
