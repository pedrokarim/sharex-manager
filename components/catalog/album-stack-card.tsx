"use client";

import Link from "next/link";
import Image from "next/image";
import { FolderOpen, Images } from "lucide-react";
import type { Album } from "@/types/albums";

interface AlbumStackCardProps {
  album: Album & { coverImages?: string[] };
}

const getTransforms = (stackCount: number, layerIndex: number) => {
  // layerIndex: 0 = top, higher = deeper
  const isFour = stackCount === 4;

  // Base: léger empilement (fermé)
  const base = isFour
    ? [
        "[transform:translate3d(0px,0px,60px)_rotateZ(0deg)]",
        "[transform:translate3d(-10px,10px,35px)_rotateZ(-6deg)]",
        "[transform:translate3d(10px,16px,15px)_rotateZ(6deg)]",
        "[transform:translate3d(0px,22px,0px)_rotateZ(0deg)]",
      ]
    : [
        "[transform:translate3d(0px,0px,50px)_rotateZ(0deg)]",
        "[transform:translate3d(-10px,12px,20px)_rotateZ(-7deg)]",
        "[transform:translate3d(10px,22px,0px)_rotateZ(7deg)]",
      ];

  // Hover/Focus: éventail (ouverture)
  const open = isFour
    ? [
        "group-hover:[transform:translate3d(-8px,-10px,110px)_rotateZ(-2deg)] group-focus-visible:[transform:translate3d(-8px,-10px,110px)_rotateZ(-2deg)]",
        "group-hover:[transform:translate3d(-28px,10px,70px)_rotateZ(-16deg)] group-focus-visible:[transform:translate3d(-28px,10px,70px)_rotateZ(-16deg)]",
        "group-hover:[transform:translate3d(30px,18px,40px)_rotateZ(16deg)] group-focus-visible:[transform:translate3d(30px,18px,40px)_rotateZ(16deg)]",
        "group-hover:[transform:translate3d(8px,30px,16px)_rotateZ(2deg)] group-focus-visible:[transform:translate3d(8px,30px,16px)_rotateZ(2deg)]",
      ]
    : [
        "group-hover:[transform:translate3d(-6px,-10px,100px)_rotateZ(-2deg)] group-focus-visible:[transform:translate3d(-6px,-10px,100px)_rotateZ(-2deg)]",
        "group-hover:[transform:translate3d(-28px,12px,55px)_rotateZ(-18deg)] group-focus-visible:[transform:translate3d(-28px,12px,55px)_rotateZ(-18deg)]",
        "group-hover:[transform:translate3d(30px,26px,20px)_rotateZ(18deg)] group-focus-visible:[transform:translate3d(30px,26px,20px)_rotateZ(18deg)]",
      ];

  const idx = Math.min(layerIndex, base.length - 1);
  return `${base[idx]} ${open[idx]}`;
};

export const AlbumStackCard = ({ album }: AlbumStackCardProps) => {
  const images = album.coverImages ?? [];
  const stackCount = Math.min(4, Math.max(3, images.length));
  const zClasses = ["z-40", "z-30", "z-20", "z-10"] as const;

  return (
    <Link
      href={`/catalog/albums/${album.publicSlug}`}
      className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-2xl"
      aria-label={`Ouvrir l'album ${album.name}`}
    >
      {/* Pas de “carte” englobante: uniquement des éléments flottants */}
      <div className="relative aspect-[4/3] overflow-visible">
        {/* Rotation/float au repos, pause au hover/focus */}
        <div className="absolute inset-0 animate-sxm-album-float motion-reduce:animate-none group-hover:[animation-play-state:paused] group-focus-visible:[animation-play-state:paused]">
          <div className="absolute inset-0 animate-sxm-album-rotate motion-reduce:animate-none group-hover:[animation-play-state:paused] group-focus-visible:[animation-play-state:paused]">
            <div className="absolute inset-0 [perspective:1200px]">
              <div className="absolute inset-0 [transform-style:preserve-3d]">
                {Array.from({ length: stackCount })
                  .map((_, i) => i)
                  .reverse()
                  .map((reversedIndex) => {
                    const layerIndex = stackCount - 1 - reversedIndex; // 0 = top
                    const image = images[layerIndex];

                    return (
                      <div
                        key={`layer-${layerIndex}`}
                        className={[
                          "absolute inset-0 rounded-xl overflow-hidden border border-border/40 bg-background/40 shadow-lg shadow-black/10 backdrop-blur-[1px]",
                          "transition-transform duration-500 will-change-transform transform-gpu",
                          "motion-reduce:transition-none motion-reduce:transform-none",
                          zClasses[layerIndex] ?? "z-10",
                          getTransforms(stackCount, layerIndex),
                        ].join(" ")}
                        aria-hidden={layerIndex !== 0}
                      >
                        {image ? (
                          <Image
                            src={`/api/files/${encodeURIComponent(image)}`}
                            alt={layerIndex === 0 ? album.name : ""}
                            fill
                            className="object-cover"
                            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                          />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-muted/70 to-muted/20">
                            <FolderOpen className="h-12 w-12 text-muted-foreground/30" />
                          </div>
                        )}

                        {/* Gloss léger */}
                        <div className="absolute inset-0 bg-gradient-to-br from-white/12 via-transparent to-black/10 opacity-80" />
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        </div>

        {/* “Icône” (la poignée) - centrée */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 transition-all duration-300 group-hover:opacity-0 group-hover:scale-90 group-focus-visible:opacity-0 group-focus-visible:scale-90 motion-reduce:transition-none">
          <div className="h-11 w-11 rounded-full bg-background/20 backdrop-blur-xl border border-white/10 grid place-items-center shadow-lg shadow-black/10 transition-all duration-300 group-hover:bg-background/30 group-hover:scale-105 motion-reduce:transition-none">
            <FolderOpen className="h-5 w-5 text-foreground/80" />
          </div>
        </div>

        {/* “Nuage” (brouillard) radial qui ENGLOBE la stack (au hover/focus) */}
        <div className="pointer-events-none absolute inset-[-18%] sm:inset-[-22%] z-40 opacity-0 scale-95 transition-all duration-300 group-hover:opacity-100 group-hover:scale-100 group-focus-visible:opacity-100 group-focus-visible:scale-100 motion-reduce:transition-none">
          {/* Diffusion très douce vers transparent (stop à 85% = pas de bord visible) */}
          <div className="absolute inset-0 rounded-[999px] blur-[60px] opacity-55 bg-[radial-gradient(ellipse_at_center,color-mix(in_oklch,var(--primary)_55%,var(--background))_0%,color-mix(in_oklch,var(--primary)_38%,var(--background))_18%,color-mix(in_oklch,var(--primary)_22%,var(--background))_34%,color-mix(in_oklch,var(--primary)_10%,var(--background))_55%,color-mix(in_oklch,var(--primary)_3%,var(--background))_72%,transparent_85%)]" />
          <div className="absolute inset-0 rounded-[999px] blur-[28px] opacity-45 bg-[radial-gradient(ellipse_at_center,color-mix(in_oklch,var(--primary)_62%,var(--background))_0%,color-mix(in_oklch,var(--primary)_44%,var(--background))_16%,color-mix(in_oklch,var(--primary)_26%,var(--background))_32%,color-mix(in_oklch,var(--primary)_12%,var(--background))_54%,color-mix(in_oklch,var(--primary)_4%,var(--background))_72%,transparent_85%)]" />

          {/* Noyau (plus présent au centre) */}
          <div className="absolute inset-0 rounded-[999px] blur-[14px] opacity-55 bg-[radial-gradient(ellipse_at_center,color-mix(in_oklch,var(--primary)_70%,var(--background))_0%,color-mix(in_oklch,var(--primary)_50%,var(--background))_22%,color-mix(in_oklch,var(--primary)_24%,var(--background))_40%,transparent_58%)]" />
        </div>

        {/* Points + texte centrés (dans le nuage) */}
        <div className="pointer-events-none absolute inset-0 z-50 grid place-items-center opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none">
          {/* Points centraux */}
          <div className="absolute inset-0 grid place-items-center">
            <div className="relative h-14 w-14">
              <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/70 blur-[0.5px]" />
              <div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-[140%] -translate-y-[40%] rounded-full bg-white/45 blur-[0.5px]" />
              <div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-[-40%] -translate-y-[120%] rounded-full bg-white/40 blur-[0.5px]" />
              <div className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-[-140%] -translate-y-[-110%] rounded-full bg-white/25 blur-[0.5px]" />
              <div className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-[120%] -translate-y-[-10%] rounded-full bg-white/25 blur-[0.5px]" />
            </div>
          </div>

          <div className="flex flex-col items-center justify-center text-center px-6 max-w-[32rem]">
            <div className="flex items-center justify-center gap-2 text-foreground/90">
              <Images className="h-4 w-4" />
              <h3 className="font-semibold text-base line-clamp-1 max-w-full">
                {album.name}
              </h3>
            </div>

            <p className="mt-2 text-sm text-foreground/70 line-clamp-2 min-h-[2.5rem]">
              {album.description ?? ""}
            </p>

            <div className="mt-3 text-xs text-foreground/60">
              {album.fileCount} {album.fileCount === 1 ? "image" : "images"}
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
};

