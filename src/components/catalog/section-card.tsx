import Link from "next/link";
import { ArrowUpRight, BookOpen } from "lucide-react";

import { DISPLAY } from "@/components/front/fonts";
import { cn } from "@/lib/utils";
import type { CatalogSectionCard as SectionCard } from "@/types/modules";

interface CatalogSectionCardProps {
  card: SectionCard;
  href: string;
  /** Ce que compte la carte : « chapitre », « page ». */
  unit: [singular: string, plural: string];
}

/**
 * Carte d'une section de module dans le catalogue : une collection (une
 * série), ou un élément d'une collection (un chapitre). Même dessin que les
 * albums, sans cadre : la couverture fait la carte, le titre se lit dessous.
 * Les couvertures sont des pages, donc en hauteur.
 */
export function CatalogSectionCard({ card, href, unit }: CatalogSectionCardProps) {
  return (
    <Link href={href} className="group block rounded-[22px] focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none">
      <div className="relative aspect-[3/4] overflow-hidden rounded-[22px] bg-foreground/[0.045]">
        {card.cover ? (
          // eslint-disable-next-line @next/next/no-img-element -- image servie par la route des sections, qui vérifie la visibilité à chaque demande
          <img
            src={card.cover}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover object-top transition-transform duration-700 ease-out group-hover:scale-[1.04]"
          />
        ) : (
          <BookOpen aria-hidden className="absolute inset-0 m-auto size-7 text-muted-foreground/50" strokeWidth={1.5} />
        )}
      </div>
      <div className="flex items-start gap-3 px-1 pt-4">
        <div className="min-w-0 flex-1">
          <h3 className={cn(DISPLAY, "line-clamp-2 text-2xl leading-tight text-balance")}>{card.title}</h3>
          {card.subtitle ? <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">{card.subtitle}</p> : null}
          {card.count !== undefined ? (
            <p className="mt-1 text-sm tabular-nums text-muted-foreground">
              {card.count} {card.count > 1 ? unit[1] : unit[0]}
            </p>
          ) : null}
        </div>
        <ArrowUpRight className="mt-1.5 size-5 shrink-0 text-muted-foreground transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-foreground" />
      </div>
    </Link>
  );
}
