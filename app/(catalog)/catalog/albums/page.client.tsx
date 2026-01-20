"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FolderOpen, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Loading } from "@/components/ui/loading";
import { AlbumStackCard } from "@/components/catalog/album-stack-card";
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
      <div className="pt-24 min-h-[calc(100vh-6rem)] flex items-center justify-center">
        <Loading />
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
              <AlbumStackCard key={album.id} album={album} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
