"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { CatalogAlbumCard } from "@/components/catalog/catalog-album-card";
import { CatalogMosaic } from "@/components/catalog/catalog-mosaic";
import { FRONT_CONTAINER, FRONT_NARROW, FRONT_WIDE } from "@/components/front/container";
import { DISPLAY } from "@/components/front/fonts";
import { PhotoHeader } from "@/components/front/photo-header";
import { Reveal } from "@/components/front/reveal";
import { ACCENT, KICKER, PILL_GLASS, PILL_ON_PHOTO, PILL_SOLID } from "@/components/front/styles";
import type { CatalogOverview } from "@/lib/public-catalog";
import { cn } from "@/lib/utils";

interface CatalogLandingProps {
  catalog: CatalogOverview;
}

const formatCount = (value: number) => new Intl.NumberFormat("fr-FR").format(value);

const formatDate = (iso?: string) =>
  iso ? new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(new Date(iso)) : "–";

const TALL = "h-64 sm:h-80 lg:h-[420px]";
const SHORT = "h-64 lg:h-72";

/**
 * Largeur et hauteur de chaque album de la sélection, sur six colonnes, selon
 * leur nombre : la grille se compose pour ne jamais laisser une ligne à moitié
 * vide. À cinq, un grand et un étroit, puis trois égaux.
 */
const SELECTIONS: Record<number, { span: string; cover: string }[]> = {
  1: [{ span: "lg:col-span-6", cover: "h-64 sm:h-80 lg:h-[520px]" }],
  2: [
    { span: "lg:col-span-4", cover: TALL },
    { span: "lg:col-span-2", cover: TALL },
  ],
  3: [
    { span: "lg:col-span-2", cover: TALL },
    { span: "lg:col-span-2", cover: TALL },
    { span: "lg:col-span-2", cover: TALL },
  ],
  4: [
    { span: "lg:col-span-4", cover: TALL },
    { span: "lg:col-span-2", cover: TALL },
    { span: "lg:col-span-2", cover: TALL },
    { span: "lg:col-span-4", cover: TALL },
  ],
  5: [
    { span: "lg:col-span-4", cover: TALL },
    { span: "lg:col-span-2", cover: TALL },
    { span: "lg:col-span-2", cover: SHORT },
    { span: "lg:col-span-2", cover: SHORT },
    { span: "lg:col-span-2", cover: SHORT },
  ],
};

export function CatalogLanding({ catalog }: CatalogLandingProps) {
  const heroNames = catalog.heroImages.map((image) => image.name);
  const hasAlbums = catalog.total > 0;
  const hasImages = catalog.imagesTotal > 0;

  const stats = [
    { value: formatCount(catalog.total), label: catalog.total > 1 ? "albums" : "album" },
    { value: formatCount(catalog.imagesTotal), label: catalog.imagesTotal > 1 ? "images" : "image" },
    { value: formatDate(catalog.lastAddedAt), label: "dernier ajout" },
  ];

  return (
    <>
      {/* Les images du catalogue font le fond ; tant qu'il n'y en a pas, une
          photo de forêt tient la place. */}
      <PhotoHeader
        size="hero"
        align="left"
        photo="mist"
        backdrop={heroNames.length > 0 ? <CatalogMosaic images={heroNames} rate={1.5} fade={1600} /> : undefined}
        kicker="Le catalogue"
        title={hasImages ? `${formatCount(catalog.imagesTotal)} ${catalog.imagesTotal > 1 ? "images" : "image"},` : "Une collection"}
        titleAccent={hasImages ? "partagées librement." : "en préparation."}
        description={
          hasAlbums
            ? "Des albums mis à jour au fil des captures. Entrez par un album, ou parcourez tout d'un bloc."
            : "Aucun album public pour le moment. Revenez bientôt."
        }
      >
        <div className="flex flex-wrap gap-3">
          <Link href="/catalog/gallery" className={PILL_ON_PHOTO}>
            Parcourir la galerie
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <Link href="/catalog/albums" className={PILL_GLASS}>
            Voir les albums
          </Link>
        </div>
      </PhotoHeader>

      {hasAlbums ? (
        <dl className={cn(FRONT_CONTAINER, "grid grid-cols-3 gap-6 pt-6 pb-20 text-center sm:pb-28")}>
          {stats.map((stat, index) => (
            <Reveal key={stat.label} delay={index * 0.1}>
              <dd className={cn(DISPLAY, "text-4xl tabular-nums sm:text-6xl")}>{stat.value}</dd>
              <dt className="mt-2 text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase sm:text-sm">
                {stat.label}
              </dt>
            </Reveal>
          ))}
        </dl>
      ) : null}

      {catalog.albums.length > 0 ? (
        <section className="pb-24 sm:pb-32">
          <Reveal className={cn(FRONT_WIDE, "grid gap-6 lg:grid-cols-2 lg:items-end")}>
            <div>
              <p className={cn(KICKER, ACCENT)}>Sélection</p>
              <h2 className={cn(DISPLAY, "mt-4 text-5xl leading-[1.02] text-balance sm:text-6xl")}>Albums à découvrir</h2>
            </div>
            <div className="lg:pb-2">
              <p className="text-pretty text-muted-foreground sm:text-lg">
                Chaque album réunit une série : un lieu, un projet, une période. Ouvrez celui qui vous parle.
              </p>
              <Link href="/catalog/albums" className={cn("group mt-4 inline-flex items-center gap-1.5 text-sm font-semibold", ACCENT)}>
                Tous les albums
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
          </Reveal>

          <ul className={cn(FRONT_WIDE, "mt-14 grid gap-x-5 gap-y-10 sm:grid-cols-2 lg:grid-cols-6")}>
            {catalog.albums.map((album, index) => {
              const slot = (SELECTIONS[catalog.albums.length] ?? SELECTIONS[5])[index % 5];
              return (
                <Reveal as="li" key={album.id} delay={(index % 3) * 0.08} className={slot.span}>
                  <CatalogAlbumCard album={album} coverClassName={slot.cover} />
                </Reveal>
              );
            })}
          </ul>
        </section>
      ) : null}

      {hasImages ? (
        <section className="bg-foreground/[0.035] py-24 sm:py-28">
          <Reveal className={cn(FRONT_NARROW, "text-center")}>
            <p className={cn(KICKER, ACCENT)}>La galerie</p>
            <h2 className={cn(DISPLAY, "mt-4 text-4xl leading-[1.05] text-balance sm:text-5xl")}>
              Tout voir, d&apos;un seul tenant
            </h2>
            <p className="mt-5 text-pretty text-muted-foreground sm:text-lg">
              La galerie réunit les images de tous les albums, de la plus récente à la plus ancienne, avec une frise pour
              remonter le temps.
            </p>
            <Link href="/catalog/gallery" className={cn(PILL_SOLID, "mt-9")}>
              Ouvrir la galerie
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </Reveal>
        </section>
      ) : null}
    </>
  );
}
