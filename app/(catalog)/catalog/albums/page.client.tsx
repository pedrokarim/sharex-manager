"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, FolderOpen, Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Loading } from "@/components/ui/loading";
import { CatalogAlbumCard } from "@/components/catalog/catalog-album-card";
import type { Album } from "@/types/albums";

export function CatalogAlbumsPage() {
  const [albums, setAlbums] = useState<(Album & { coverImages?: string[] })[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const fetchAlbums = async () => {
      try {
        const response = await fetch(
          "/api/public/catalog?includeImages=true&limit=200",
        );
        if (response.ok) {
          const result = await response.json();
          setAlbums(result.albums ?? []);
        }
      } catch (error) {
        console.error("Erreur lors du chargement du catalogue:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchAlbums();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return albums;
    return albums.filter(
      (album) =>
        album.name.toLowerCase().includes(q) ||
        (album.description ?? "").toLowerCase().includes(q),
    );
  }, [albums, search]);

  if (loading) {
    return (
      <div className="flex min-h-[calc(100vh-6rem)] items-center justify-center pt-24">
        <Loading />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 pb-20 pt-24 sm:px-6 lg:px-8">
      <header>
        <span className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          {albums.length} {albums.length > 1 ? "albums publics" : "album public"}
        </span>
        <h1 className="mt-4 max-w-[18ch] text-3xl font-bold tracking-tighter text-balance sm:text-4xl lg:text-5xl">
          Chaque série, prise à part.
        </h1>
        <p className="mt-3 max-w-[54ch] text-base leading-relaxed text-muted-foreground">
          Les albums regroupent les captures par sujet. Ouvrez-en un pour le
          parcourir seul, ou passez par la galerie pour tout voir d&apos;un bloc.
        </p>

        <div className="relative mt-6 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Rechercher un album…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="pl-10"
          />
        </div>
        <p className="mt-3 font-mono text-xs text-muted-foreground">
          {filtered.length === 0
            ? "aucun résultat"
            : `${filtered.length} ${filtered.length > 1 ? "albums" : "album"}`}
        </p>
      </header>

      <div className="mt-8">
        {filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed py-20 text-center">
            <FolderOpen className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
            <h3 className="font-semibold">
              {search ? "Aucun album ne correspond" : "Aucun album public"}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {search
                ? "Essayez un autre terme, ou effacez la recherche."
                : "Aucun album n'est partagé pour le moment."}
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((album) => (
              <CatalogAlbumCard key={album.id} album={album} />
            ))}
          </div>
        )}
      </div>

      <section className="mt-14 border-t pt-8">
        <div className="flex flex-wrap items-baseline gap-3">
          <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            Raccourci
          </span>
          <h2 className="text-xl font-semibold tracking-tight">
            Vous cherchez une image précise ?
          </h2>
          <Link
            href="/catalog/gallery"
            className="ml-auto inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Ouvrir la galerie
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <p className="mt-2 max-w-[56ch] text-sm text-muted-foreground">
          La galerie réunit les images de tous les albums, de la plus récente à
          la plus ancienne.
        </p>
      </section>
    </div>
  );
}
