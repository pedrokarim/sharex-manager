"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, FolderOpen, Search } from "lucide-react";

import { CatalogAlbumCard } from "@/components/catalog/catalog-album-card";
import { FRONT_NARROW, FRONT_WIDE } from "@/components/front/container";
import { DISPLAY } from "@/components/front/fonts";
import { PhotoHeader } from "@/components/front/photo-header";
import { Reveal } from "@/components/front/reveal";
import { ACCENT, KICKER, PILL_SOLID } from "@/components/front/styles";
import type { CatalogAlbum } from "@/lib/public-catalog";
import { cn } from "@/lib/utils";

interface CatalogAlbumsPageProps {
  albums: CatalogAlbum[];
}

const EASE = [0.22, 1, 0.36, 1] as const;

export function CatalogAlbumsPage({ albums }: CatalogAlbumsPageProps) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return albums;
    return albums.filter(
      (album) => album.name.toLowerCase().includes(q) || (album.description ?? "").toLowerCase().includes(q),
    );
  }, [albums, search]);

  return (
    <>
      <PhotoHeader
        photo="lake"
        kicker={`${albums.length} ${albums.length > 1 ? "albums publics" : "album public"}`}
        title="Chaque série,"
        titleAccent="prise à part."
        description="Les albums regroupent les captures par sujet. Ouvrez-en un pour le parcourir seul, ou passez par la galerie pour tout voir d'un bloc."
      >
        {/* Le champ de recherche est posé sur la photo, en verre dépoli. */}
        <label className="relative mx-auto block max-w-md">
          <span className="sr-only">Rechercher un album</span>
          <Search className="pointer-events-none absolute top-1/2 left-5 z-10 size-4 -translate-y-1/2 text-white/70" />
          <input
            type="search"
            placeholder="Rechercher un album…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="h-12 w-full rounded-full bg-white/12 pr-5 pl-12 text-sm text-white backdrop-blur-md transition outline-none placeholder:text-white/60 focus-visible:bg-white/20 focus-visible:ring-[3px] focus-visible:ring-white/40"
          />
        </label>
      </PhotoHeader>

      <section className={cn(FRONT_WIDE, "pt-4 pb-24 sm:pb-32")}>
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {filtered.length === 0
            ? "Aucun résultat"
            : `${filtered.length} ${filtered.length > 1 ? "albums" : "album"}${search.trim() ? " pour cette recherche" : ""}`}
        </p>

        {filtered.length === 0 ? (
          <div className="py-24 text-center">
            <FolderOpen className={cn("mx-auto size-9", ACCENT)} strokeWidth={1.5} />
            <h2 className={cn(DISPLAY, "mt-5 text-3xl")}>{search ? "Aucun album ne correspond" : "Aucun album public"}</h2>
            <p className="mt-2 text-muted-foreground">
              {search ? "Essayez un autre terme, ou effacez la recherche." : "Aucun album n'est partagé pour le moment."}
            </p>
          </div>
        ) : (
          <ul className="mt-6 grid gap-x-5 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {/* La liste suit la recherche : les albums glissent à leur nouvelle place. */}
            <AnimatePresence mode="popLayout" initial={false}>
              {filtered.map((album) => (
                <motion.li
                  key={album.id}
                  layout
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ duration: 0.4, ease: EASE }}
                >
                  <CatalogAlbumCard album={album} />
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </section>

      <section className="bg-foreground/[0.035] py-24 sm:py-28">
        <Reveal className={cn(FRONT_NARROW, "text-center")}>
          <p className={cn(KICKER, ACCENT)}>Raccourci</p>
          <h2 className={cn(DISPLAY, "mt-4 text-4xl leading-[1.05] text-balance sm:text-5xl")}>
            Vous cherchez une image précise ?
          </h2>
          <p className="mt-5 text-pretty text-muted-foreground sm:text-lg">
            La galerie réunit les images de tous les albums, de la plus récente à la plus ancienne.
          </p>
          <Link href="/catalog/gallery" className={cn(PILL_SOLID, "mt-9")}>
            Ouvrir la galerie
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </Reveal>
      </section>
    </>
  );
}
