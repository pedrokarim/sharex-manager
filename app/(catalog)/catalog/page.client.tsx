"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, FolderOpen, Images, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HeroBackground } from "@/components/catalog/hero-background";
import { Loading } from "@/components/ui/loading";
import type { Album } from "@/types/albums";

interface CatalogData {
  albums: (Album & { coverImages?: string[] })[];
  heroImages: string[];
  total: number;
}

export function CatalogLanding() {
  const [data, setData] = useState<CatalogData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCatalog = async () => {
      try {
        const response = await fetch(
          "/api/public/catalog?includeImages=true&randomImages=8&limit=6"
        );
        if (response.ok) {
          const result = await response.json();
          setData(result);
        }
      } catch (error) {
        console.error("Erreur lors du chargement du catalogue:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchCatalog();
  }, []);

  if (loading) {
    return <Loading fullHeight />;
  }

  return (
    <div className="relative">
      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        <HeroBackground images={data?.heroImages || []} />

        <div className="relative z-10 container mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="max-w-4xl mx-auto space-y-8">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 text-white/90 text-sm">
              <Sparkles className="h-4 w-4" />
              <span>Collection publique</span>
            </div>

            {/* Title */}
            <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-white leading-tight tracking-tight">
              Explorez notre
              <br />
              <span className="bg-gradient-to-r from-white via-white/80 to-white/60 bg-clip-text text-transparent">
                collection
              </span>
            </h1>

            {/* Subtitle */}
            <p className="text-lg sm:text-xl text-white/70 max-w-2xl mx-auto leading-relaxed">
              Découvrez une sélection d'albums et d'images partagés
              publiquement. Parcourez, explorez et laissez-vous inspirer.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
              <Link href="/catalog/albums">
                <Button
                  size="lg"
                  className="rounded-full px-8 gap-2 bg-white text-black hover:bg-white/90 shadow-xl shadow-white/20"
                >
                  <FolderOpen className="h-5 w-5" />
                  Voir les albums
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/catalog/gallery">
                <Button
                  size="lg"
                  variant="outline"
                  className="rounded-full px-8 gap-2 border-2 border-white/60 bg-black/20 backdrop-blur-md text-white hover:bg-black/30 hover:border-white/80 shadow-xl shadow-black/20"
                >
                  <Images className="h-5 w-5" />
                  Explorer la galerie
                </Button>
              </Link>
            </div>

            {/* Stats */}
            {data && data.total > 0 && (
              <div className="pt-12 flex items-center justify-center gap-8 sm:gap-16">
                <div className="text-center">
                  <div className="text-3xl sm:text-4xl font-bold text-white">
                    {data.total}
                  </div>
                  <div className="text-sm text-white/60 mt-1">
                    Albums publics
                  </div>
                </div>
                <div className="w-px h-12 bg-white/20" />
                <div className="text-center">
                  <div className="text-3xl sm:text-4xl font-bold text-white">
                    {data.heroImages.length}+
                  </div>
                  <div className="text-sm text-white/60 mt-1">Images</div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10">
          <div className="w-6 h-10 rounded-full border-2 border-white/30 flex justify-center pt-2">
            <div className="w-1 h-3 rounded-full bg-white/60 animate-bounce" />
          </div>
        </div>
      </section>

      {/* Featured Albums Section */}
      {data && data.albums.length > 0 && (
        <section className="py-20 sm:py-32 bg-background">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-end justify-between mb-12">
              <div>
                <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
                  Albums à découvrir
                </h2>
                <p className="text-muted-foreground mt-2 max-w-xl">
                  Une sélection d'albums récemment partagés
                </p>
              </div>
              <Link href="/catalog/albums">
                <Button variant="ghost" className="gap-2 hidden sm:flex">
                  Voir tout
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
              {data.albums.map((album) => (
                <AlbumCard key={album.id} album={album} />
              ))}
            </div>

            <div className="mt-8 text-center sm:hidden">
              <Link href="/catalog/albums">
                <Button variant="outline" className="gap-2">
                  Voir tous les albums
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function AlbumCard({ album }: { album: Album & { coverImages?: string[] } }) {
  const hasImages = album.coverImages && album.coverImages.length > 0;

  return (
    <Link href={`/catalog/albums/${album.publicSlug}`}>
      <article className="group relative overflow-hidden rounded-2xl bg-card border border-border/50 transition-all duration-500 hover:shadow-2xl hover:shadow-primary/5 hover:-translate-y-1">
        {/* Image Grid */}
        <div className="aspect-[4/3] relative overflow-hidden bg-gradient-to-br from-muted to-muted/50">
          {hasImages ? (
            album.coverImages!.length === 1 ? (
              <Image
                src={`/api/files/${encodeURIComponent(album.coverImages![0])}`}
                alt={album.name}
                fill
                className="object-cover transition-transform duration-700 group-hover:scale-110"
              />
            ) : (
              <div className="grid grid-cols-2 grid-rows-2 h-full gap-0.5">
                {[0, 1, 2, 3].map((index) => {
                  const image = album.coverImages?.[index];
                  if (image) {
                    return (
                      <div key={index} className="relative overflow-hidden">
                        <Image
                          src={`/api/files/${encodeURIComponent(image)}`}
                          alt=""
                          fill
                          className="object-cover transition-transform duration-700 group-hover:scale-110"
                        />
                      </div>
                    );
                  }
                  return (
                    <div
                      key={index}
                      className="bg-gradient-to-br from-muted to-muted/30 flex items-center justify-center"
                    >
                      <FolderOpen className="h-6 w-6 text-muted-foreground/30" />
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <FolderOpen className="h-16 w-16 text-muted-foreground/30" />
            </div>
          )}

          {/* Overlay gradient */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        </div>

        {/* Content */}
        <div className="p-5">
          <h3 className="font-semibold text-lg truncate group-hover:text-primary transition-colors">
            {album.name}
          </h3>
          {album.description && (
            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
              {album.description}
            </p>
          )}
          <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
            <Images className="h-3.5 w-3.5" />
            <span>
              {album.fileCount} {album.fileCount === 1 ? "image" : "images"}
            </span>
          </div>
        </div>
      </article>
    </Link>
  );
}
