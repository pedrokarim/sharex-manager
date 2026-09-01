import Link from "next/link";
import Image from "next/image";
import { FolderOpen } from "lucide-react";

import type { Album } from "@/types/albums";

interface CatalogAlbumCardProps {
  album: Album & { coverImages?: string[] };
}

const thumb = (name: string) => `/api/thumbnails/${encodeURIComponent(name)}`;

/**
 * Carte d'album du catalogue : une grande couverture flanquée de deux
 * vignettes, qui donne un aperçu du contenu plutôt qu'une seule image.
 *
 * Les albums vides sont affichés comme tels – auparavant ils produisaient une
 * pile de cadres sans image, qu'on pouvait prendre pour un chargement en cours.
 */
export function CatalogAlbumCard({ album }: CatalogAlbumCardProps) {
  const covers = (album.coverImages ?? []).slice(0, 3);
  const isEmpty = covers.length === 0;

  return (
    <Link
      href={`/catalog/albums/${album.publicSlug}`}
      className="group block overflow-hidden rounded-xl border bg-card transition-colors hover:border-foreground/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="relative grid aspect-[16/10] grid-cols-[2fr_1fr] grid-rows-2 gap-0.5 bg-muted">
        {isEmpty ? (
          <div className="col-span-2 row-span-2 flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <FolderOpen className="h-6 w-6 opacity-50" />
            <span className="text-xs">Album vide</span>
          </div>
        ) : (
          <>
            <div className="relative row-span-2 overflow-hidden bg-muted">
              <Image
                src={thumb(covers[0])}
                alt=""
                fill
                sizes="(max-width: 640px) 100vw, 33vw"
                className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
              />
            </div>
            {[covers[1], covers[2]].map((name, i) => (
              <div key={i} className="relative overflow-hidden bg-muted">
                {name ? (
                  <Image
                    src={thumb(name)}
                    alt=""
                    fill
                    sizes="20vw"
                    className="object-cover"
                  />
                ) : null}
              </div>
            ))}
          </>
        )}
      </div>

      <div className="flex items-baseline gap-3 px-4 py-3.5">
        <h3 className="truncate font-semibold tracking-tight transition-colors group-hover:text-primary">
          {album.name}
        </h3>
        <span className="ml-auto shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
          {album.fileCount > 0 ? `${album.fileCount} img` : "vide"}
        </span>
      </div>
    </Link>
  );
}
