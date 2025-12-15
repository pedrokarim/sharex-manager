"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { FolderOpen, Images, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Loading } from "@/components/ui/loading";
import type { Album } from "@/types/albums";

interface CatalogData {
  albums: (Album & { coverImages?: string[] })[];
  total: number;
}

export function CatalogAlbumsPage() {
  const [data, setData] = useState<CatalogData | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const fetchCatalog = async () => {
      try {
        const response = await fetch(
          "/api/public/catalog?includeImages=true&limit=100"
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

  const filteredAlbums =
    data?.albums.filter(
      (album) =>
        album.name.toLowerCase().includes(search.toLowerCase()) ||
        album.description?.toLowerCase().includes(search.toLowerCase())
    ) || [];

  if (loading) {
    return (
      <div className="pt-24">
        <Loading fullHeight />
      </div>
    );
  }

  return (
    <div className="pt-24 pb-16">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-12">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight">
            Albums publics
          </h1>
          <p className="text-muted-foreground mt-3 max-w-2xl text-lg">
            Explorez notre collection d'albums partagés publiquement
          </p>
        </div>

        {/* Search */}
        <div className="mb-8 max-w-md">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Rechercher un album..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 rounded-full"
            />
          </div>
        </div>

        {/* Stats */}
        <div className="mb-8 text-sm text-muted-foreground">
          {filteredAlbums.length} album{filteredAlbums.length !== 1 ? "s" : ""}{" "}
          trouvé{filteredAlbums.length !== 1 ? "s" : ""}
        </div>

        {/* Grid */}
        {filteredAlbums.length === 0 ? (
          <div className="text-center py-16">
            <FolderOpen className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="text-lg font-semibold">Aucun album trouvé</h3>
            <p className="text-muted-foreground mt-1">
              {search
                ? "Essayez avec d'autres termes de recherche"
                : "Aucun album n'est disponible pour le moment"}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredAlbums.map((album) => (
              <AlbumCard key={album.id} album={album} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AlbumCard({ album }: { album: Album & { coverImages?: string[] } }) {
  const hasImages = album.coverImages && album.coverImages.length > 0;

  return (
    <Link href={`/catalog/albums/${album.publicSlug}`}>
      <article className="group relative overflow-hidden rounded-xl bg-card border border-border/50 transition-all duration-300 hover:shadow-xl hover:-translate-y-0.5">
        {/* Image */}
        <div className="aspect-[4/3] relative overflow-hidden bg-gradient-to-br from-muted to-muted/50">
          {hasImages ? (
            album.coverImages!.length === 1 ? (
              <Image
                src={`/api/files/${encodeURIComponent(album.coverImages![0])}`}
                alt={album.name}
                fill
                className="object-cover transition-transform duration-500 group-hover:scale-105"
              />
            ) : (
              <div className="grid grid-cols-2 grid-rows-2 h-full gap-px bg-border/20">
                {[0, 1, 2, 3].map((index) => {
                  const image = album.coverImages?.[index];
                  if (image) {
                    return (
                      <div key={index} className="relative overflow-hidden">
                        <Image
                          src={`/api/files/${encodeURIComponent(image)}`}
                          alt=""
                          fill
                          className="object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                      </div>
                    );
                  }
                  return (
                    <div
                      key={index}
                      className="bg-muted/50 flex items-center justify-center"
                    >
                      <FolderOpen className="h-4 w-4 text-muted-foreground/20" />
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <FolderOpen className="h-12 w-12 text-muted-foreground/20" />
            </div>
          )}
        </div>

        {/* Content */}
        <div className="p-4">
          <h3 className="font-semibold truncate group-hover:text-primary transition-colors">
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

