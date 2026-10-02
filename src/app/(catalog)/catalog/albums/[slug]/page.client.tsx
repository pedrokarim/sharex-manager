"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { ArrowLeft, Images } from "lucide-react";

import {
  CATALOG_STICKY_OFFSET,
  CatalogToolbar,
  DateChip,
  DensitySwitch,
  MediaGrid,
  MediaGridSkeleton,
  MediaTile,
  MonthHeading,
  type Density,
} from "@/components/catalog/catalog-grid";
import { CatalogMosaic } from "@/components/catalog/catalog-mosaic";
import { PublicImageViewer } from "@/components/catalog/public-image-viewer";
import { FRONT_FULL } from "@/components/front/container";
import { DISPLAY } from "@/components/front/fonts";
import { PhotoHeader } from "@/components/front/photo-header";
import { ACCENT, PILL_GLASS } from "@/components/front/styles";
import { TimelineNavigator, timelineGroupProps } from "@/components/timeline/timeline-navigator";
import { isImageFile, isVideoFile, mediaCountLabel } from "@/lib/media-kind";
import type { PublicAlbumSummary } from "@/lib/seo-album";
import { formatMonthKey, monthKeyOf } from "@/lib/timeline";
import { cn } from "@/lib/utils";

interface CatalogAlbumDetailPageProps {
  slug: string;
  /** Nom et description, lus côté serveur : l'en-tête s'affiche sans attendre. */
  summary: PublicAlbumSummary | null;
}

interface AlbumImage {
  name: string;
  url: string;
  addedAt: string;
  durationMs?: number;
}

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

export function CatalogAlbumDetailPage({ slug, summary }: CatalogAlbumDetailPageProps) {
  const [missing, setMissing] = useState(summary === null);
  const [files, setFiles] = useState<AlbumImage[]>([]);
  const [loading, setLoading] = useState(summary !== null);
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
          setMissing(true);
          return;
        }
        throw new Error("Erreur lors du chargement");
      }

      const data = await response.json();
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

  const known = summary !== null;
  useEffect(() => {
    // Un album que le serveur n'a pas trouvé n'a rien à charger.
    if (known) fetchAlbumData();
  }, [known, fetchAlbumData]);

  const mosaicNames = useMemo(() => files.slice(0, 24).map((file) => file.name), [files]);

  if (!summary || missing) {
    return (
      <>
        <PhotoHeader
          photo="path"
          kicker="Albums"
          title="Album"
          titleAccent="introuvable."
          description="Cet album n'existe pas, ou n'est plus partagé publiquement."
        >
          <Link href="/catalog/albums" className={PILL_GLASS}>
            <ArrowLeft className="size-4" />
            Retour aux albums
          </Link>
        </PhotoHeader>
        <div className="h-24" />
      </>
    );
  }

  const updatedAt = formatDate(files[0]?.addedAt ?? summary.updatedAt);
  const countLabel = loading ? null : mediaCountLabel(files.map((file) => file.name));

  return (
    <>
      {/* L'en-tête d'un album est plus court que celui du catalogue : il se
          présente, il n'a pas à rejouer l'ouverture du site. Ses propres images
          en font le fond, dès qu'elles sont connues. */}
      <PhotoHeader
        photo="path"
        backdrop={
          mosaicNames.length > 0 ? (
            <motion.div className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1.2 }}>
              <CatalogMosaic images={mosaicNames} rate={1.2} fade={1800} />
            </motion.div>
          ) : loading ? (
            <span />
          ) : undefined
        }
        kicker={
          <>
            <Link href="/catalog/albums" className="transition-colors hover:text-white">
              Albums
            </Link>
            <span className="mx-2 text-white/40">/</span>
            <span className="text-white/70">{summary.name}</span>
          </>
        }
        title={summary.name}
        description={summary.description}
      >
        {/* La hauteur est réservée : la date arrive sans faire bouger le titre. */}
        <p className="min-h-5 text-sm text-white/65">
          {updatedAt ? (
            <>
              Mis à jour le <span className="font-semibold text-white">{updatedAt}</span>
            </>
          ) : null}
        </p>
      </PhotoHeader>

      {files.length > 0 ? (
        <CatalogToolbar>
          <span className="flex-1 text-sm text-muted-foreground">{countLabel}</span>
          {canPickDate ? (
            <DateChip
              onClick={() => {
                setPickerKey(null);
                setPickerOpen(true);
              }}
            />
          ) : null}
          <DensitySwitch value={density} onChange={setDensity} />
        </CatalogToolbar>
      ) : null}

      <div ref={galleryRef} className={cn(FRONT_FULL, "pt-6 pb-24")}>
        {loading ? (
          <div className="pt-16">
            <MediaGridSkeleton density={density} />
          </div>
        ) : files.length === 0 ? (
          <div className="py-24 text-center">
            <Images className={cn("mx-auto size-9", ACCENT)} strokeWidth={1.5} />
            <h2 className={cn(DISPLAY, "mt-5 text-3xl")}>Album vide</h2>
            <p className="mt-2 text-muted-foreground">Cet album ne contient aucune image ni vidéo.</p>
          </div>
        ) : (
          groups.map((group) => (
            <section
              key={`${group.key}-${group.start}`}
              className="mt-12 first:mt-4"
              {...timelineGroupProps(group.key, group.start, group.items.length)}
            >
              {canPickDate ? (
                <MonthHeading
                  label={monthLabel(group.key)}
                  onPick={() => {
                    setPickerKey(group.key);
                    setPickerOpen(true);
                  }}
                />
              ) : null}
              <MediaGrid density={density}>
                {group.items.map((file, indexInGroup) => (
                  <MediaTile
                    key={file.name}
                    name={file.name}
                    durationMs={file.durationMs}
                    onOpen={() => setSelectedIndex(group.start + indexInGroup)}
                  />
                ))}
              </MediaGrid>
            </section>
          ))
        )}
      </div>

      <TimelineNavigator
        months={months}
        containerRef={galleryRef}
        topOffset={CATALOG_STICKY_OFFSET}
        loadAt={nothingToLoad}
        pickerOpen={pickerOpen}
        onPickerOpenChange={setPickerOpen}
        pickerKey={pickerKey}
        locale="fr-FR"
      />

      <PublicImageViewer
        items={files.map((file) => ({
          ...file,
          album: { name: summary.name, slug },
        }))}
        index={selectedIndex}
        onClose={() => setSelectedIndex(null)}
        onIndexChange={setSelectedIndex}
      />
    </>
  );
}
