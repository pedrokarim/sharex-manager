import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight, FolderOpen } from "lucide-react";

import { DISPLAY } from "@/components/front/fonts";
import { cn } from "@/lib/utils";
import type { Album } from "@/types/albums";

interface CatalogAlbumCardProps {
  album: Album & { coverImages?: string[] };
  /** Hauteur de la couverture : la grille qui reçoit la carte en décide. */
  coverClassName?: string;
}

const thumb = (name: string) => `/api/thumbnails/${encodeURIComponent(name)}`;
/** La couverture s'affiche en grand : la vignette ordinaire y serait floue. */
const cover = (name: string) => `${thumb(name)}?size=large`;

/**
 * Album du catalogue : une grande couverture flanquée de deux vignettes, qui
 * donne un aperçu du contenu plutôt qu'une seule image. Pas de cadre : la
 * couverture fait la carte, le nom se lit dessous.
 *
 * Les albums vides sont affichés comme tels – auparavant ils produisaient une
 * pile de cadres sans image, qu'on pouvait prendre pour un chargement en cours.
 */
export function CatalogAlbumCard({ album, coverClassName = "aspect-[16/10]" }: CatalogAlbumCardProps) {
  const covers = (album.coverImages ?? []).slice(0, 3);
  const isEmpty = covers.length === 0;
  const alone = covers.length === 1;

  return (
    <Link
      href={`/catalog/albums/${album.publicSlug}`}
      className="group block rounded-[26px] focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <div
        className={cn(
          "relative grid grid-rows-2 gap-1 overflow-hidden rounded-[26px] bg-foreground/[0.045]",
          alone || isEmpty ? "grid-cols-1" : "grid-cols-[2fr_1fr]",
          coverClassName,
        )}
      >
        {isEmpty ? (
          <div className="row-span-2 flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <FolderOpen className="size-6 opacity-50" strokeWidth={1.5} />
            <span className="text-sm">Album vide</span>
          </div>
        ) : (
          <>
            <div className="relative row-span-2 overflow-hidden">
              <Image
                src={cover(covers[0])}
                alt=""
                fill
                sizes="(max-width: 640px) 100vw, 50vw"
                className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
              />
            </div>
            {alone
              ? null
              : [covers[1], covers[2]].map((name, i) => (
                  <div key={i} className="relative overflow-hidden">
                    {name ? (
                      <Image
                        src={thumb(name)}
                        alt=""
                        fill
                        sizes="20vw"
                        className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
                      />
                    ) : null}
                  </div>
                ))}
          </>
        )}
      </div>

      <div className="flex items-baseline gap-3 px-1 pt-4">
        <h3 className={cn(DISPLAY, "truncate text-2xl")}>{album.name}</h3>
        <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
          {album.fileCount > 0 ? `${album.fileCount} ${album.fileCount > 1 ? "images" : "image"}` : "vide"}
        </span>
        <ArrowUpRight className="ml-auto size-5 shrink-0 self-center text-muted-foreground transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-foreground" />
      </div>
    </Link>
  );
}
