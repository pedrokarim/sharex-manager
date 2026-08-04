"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, FolderOpen, Images } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Loading } from "@/components/ui/loading";
import { CatalogMosaic } from "@/components/catalog/catalog-mosaic";
import { CatalogAlbumCard } from "@/components/catalog/catalog-album-card";
import type { Album } from "@/types/albums";

interface CatalogData {
  albums: (Album & { coverImages?: string[] })[];
  heroImages: Array<{
    name: string;
    addedAt?: string;
    albumSlug?: string;
    albumName?: string;
  }>;
  total: number;
  imagesTotal?: number;
}

const formatDate = (iso?: string) =>
  iso
    ? new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(
        new Date(iso),
      )
    : "—";

export function CatalogLanding() {
  const [data, setData] = useState<CatalogData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCatalog = async () => {
      try {
        // 24 images suffisent à peupler la mosaïque : elle les recycle en
        // boucle, inutile de tirer tout le catalogue pour un fond.
        const response = await fetch(
          "/api/public/catalog?includeImages=true&randomImages=24&limit=6",
        );
        if (response.ok) setData(await response.json());
      } catch (error) {
        console.error("Erreur lors du chargement du catalogue:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchCatalog();
  }, []);

  if (loading) return <Loading fullScreen />;

  const heroNames = (data?.heroImages ?? []).map((image) => image.name);
  const imagesTotal = data?.imagesTotal ?? heroNames.length;
  const lastAdded = data?.heroImages?.[0]?.addedAt;

  return (
    <div className="relative">
      <section className="relative flex min-h-[82vh] items-end overflow-hidden">
        {heroNames.length > 0 ? (
          <CatalogMosaic images={heroNames} rate={1.5} fade={1600} />
        ) : (
          <div className="absolute inset-0 bg-muted" />
        )}

        {/* Le héros est posé sur un voile sombre : son contenu reste clair dans
            les deux thèmes, indépendamment des couleurs de l'application. */}
        {/* pb-28 : le contenu doit passer au-dessus du fondu de raccord (h-24),
            sinon les statistiques se délavent en thème clair. */}
        <div className="container relative z-10 mx-auto px-4 pb-28 text-white sm:px-6 lg:px-8">
          <h1 className="max-w-[14ch] text-4xl font-bold leading-[0.98] tracking-tighter text-balance sm:text-5xl lg:text-7xl">
            {imagesTotal > 0
              ? `${imagesTotal} images, partagées librement.`
              : "Une collection en préparation."}
          </h1>

          <p className="mt-4 max-w-[50ch] text-base leading-relaxed text-white/75 sm:text-lg">
            {data && data.total > 0
              ? "Des albums mis à jour au fil des captures. Entrez par un album ou parcourez tout d'un bloc."
              : "Aucun album public pour le moment. Revenez bientôt."}
          </p>

          <div className="mt-7 flex flex-wrap gap-3">
            <Button
              size="lg"
              className="gap-2 bg-white text-black hover:bg-white/90"
              asChild
            >
              <Link href="/catalog/gallery">
                <Images className="h-4 w-4" />
                Parcourir la galerie
              </Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="gap-2 border-white/25 bg-black/30 text-white backdrop-blur hover:bg-black/45 hover:text-white"
              asChild
            >
              <Link href="/catalog/albums">
                <FolderOpen className="h-4 w-4" />
                Voir les albums
              </Link>
            </Button>
          </div>

          {data && data.total > 0 ? (
            <dl className="mt-8 flex flex-wrap gap-8 border-t border-white/15 pt-5 font-mono text-[11px] uppercase tracking-wider text-white/60">
              <div>
                <dt>albums</dt>
                <dd className="font-sans text-2xl font-semibold tracking-tight tabular-nums text-white">
                  {data.total}
                </dd>
              </div>
              <div>
                <dt>images</dt>
                <dd className="font-sans text-2xl font-semibold tracking-tight tabular-nums text-white">
                  {imagesTotal}
                </dd>
              </div>
              <div>
                <dt>dernier ajout</dt>
                <dd className="font-sans text-2xl font-semibold tracking-tight text-white">
                  {formatDate(lastAdded)}
                </dd>
              </div>
            </dl>
          ) : null}
        </div>
      </section>

      {data && data.albums.length > 0 ? (
        <section className="container mx-auto px-4 pt-16 sm:px-6 lg:px-8">
          <div className="mb-6 flex items-baseline gap-3">
            <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              Sélection
            </span>
            <h2 className="text-2xl font-semibold tracking-tight">
              Albums à découvrir
            </h2>
            <Link
              href="/catalog/albums"
              className="ml-auto inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Tout voir
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.albums.map((album) => (
              <CatalogAlbumCard key={album.id} album={album} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
