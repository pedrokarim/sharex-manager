"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useAtomValue } from "jotai";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { languageAtom } from "@/lib/atoms/preferences";
import type { GalleryHighlight } from "@/lib/gallery-highlights";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { GallerySourceItem, GallerySourcePage } from "@/types/modules";

interface HighlightCard {
  id: string;
  href: string;
  image: string;
  /** L'illustration est une vidéo : on en montre la première image. */
  video?: boolean;
  title: string;
  subtitle?: string;
  /** Logo du module qui fournit la carte. */
  logo?: string;
}

interface ModuleSource {
  module: string;
  id: string;
  label: string;
  description?: string;
  logo?: string;
  list: string;
}

const CARD = "w-[78%] shrink-0 snap-start sm:w-[46%] lg:w-[31.5%] xl:w-[23.8%]";

/**
 * « À la une » : une rangée de raccourcis illustrés, en tête de la galerie.
 *
 * Les cartes de la galerie elle-même (souvenir, favoris, fichiers privés,
 * dernier album) viennent de `/api/gallery/highlights`. Celles des modules ne
 * sont pas connues d'avance : chaque module activé qui déclare une source
 * (`gallerySources`) fournit son dernier élément. Un module qu'on coupe
 * disparaît donc du bandeau sans que la galerie ait à le savoir.
 */
export function GalleryHighlights() {
  const { t } = useTranslation();
  const locale = useAtomValue(languageAtom);
  const [cards, setCards] = useState<HighlightCard[] | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });

  useEffect(() => {
    let alive = true;

    const years = (count: number) => (count === 1 ? t("gallery.highlights.one_year_ago") : t("gallery.highlights.years_ago", { count }));
    const files = (count: number) => (count === 1 ? t("gallery.highlights.one_file") : t("gallery.highlights.files", { count }));
    const thumbnail = (file: string) => `/api/thumbnails/${encodeURIComponent(file)}?size=large`;

    const fromGallery = async (): Promise<HighlightCard[]> => {
      const response = await fetch(`/api/gallery/highlights?tz=${new Date().getTimezoneOffset()}`);
      if (!response.ok) return [];
      const payload = (await response.json()) as { highlights?: GalleryHighlight[] };
      return (payload.highlights ?? []).map((highlight): HighlightCard => {
        const base = { id: highlight.kind, href: highlight.href, image: thumbnail(highlight.file) };
        switch (highlight.kind) {
          case "memory":
            return { ...base, title: t("gallery.highlights.memory"), subtitle: years(highlight.years) };
          case "month": {
            const month = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(highlight.date));
            return { ...base, title: month.charAt(0).toUpperCase() + month.slice(1), subtitle: years(highlight.years) };
          }
          case "starred":
            return { ...base, title: t("gallery.highlights.starred"), subtitle: files(highlight.count) };
          case "secure":
            return { ...base, title: t("gallery.highlights.secure"), subtitle: files(highlight.count) };
          case "album":
            return { ...base, title: highlight.name, subtitle: t("gallery.highlights.album") };
        }
      });
    };

    const fromModules = async (): Promise<HighlightCard[]> => {
      const response = await fetch("/api/modules/gallery-sources");
      if (!response.ok) return [];
      const payload = (await response.json()) as { sources?: ModuleSource[] };
      const latest = await Promise.all(
        (payload.sources ?? []).map(async (source): Promise<HighlightCard | null> => {
          const answer = await fetch("/api/modules/call-function", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ moduleName: source.module, functionName: source.list, args: [{ offset: 0, limit: 1 }] }),
          });
          const result = await answer.json().catch(() => null);
          if (!answer.ok || result?.success === false) return null;
          const item = (result?.data as GallerySourcePage | undefined)?.items?.[0] as GallerySourceItem | undefined;
          if (!item?.thumbnail) return null;
          return {
            id: `${source.module}.${source.id}`,
            href: `/m/${source.module}`,
            image: item.thumbnail,
            video: item.kind === "video",
            title: source.label,
            subtitle: source.description,
            logo: source.logo,
          };
        }),
      );
      return latest.filter((card): card is HighlightCard => card !== null);
    };

    // Une source qui échoue ne prive pas le bandeau des autres.
    Promise.all([fromGallery().catch(() => []), fromModules().catch(() => [])]).then(([gallery, modules]) => {
      if (!alive) return;
      // Le souvenir d'abord, puis ce que les modules ont produit, puis les raccourcis.
      const [first, ...rest] = gallery;
      const memoryFirst = first && (first.id === "memory" || first.id === "month");
      setCards(memoryFirst ? [first, ...modules, ...rest] : [...modules, ...gallery]);
    });

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chargé une fois à l'ouverture de la galerie
  }, [locale]);

  // Flèches : visibles seulement s'il reste des cartes de ce côté.
  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const update = () =>
      setEdges({
        start: element.scrollLeft <= 4,
        end: element.scrollLeft + element.clientWidth >= element.scrollWidth - 4,
      });
    update();
    element.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => {
      element.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [cards]);

  if (cards !== null && cards.length === 0) return null;

  const slide = (direction: 1 | -1) => {
    const element = scroller.current;
    if (element) element.scrollBy({ left: direction * element.clientWidth * 0.85, behavior: "smooth" });
  };

  return (
    <section aria-label={t("gallery.highlights.title")} className="relative mb-6 sm:mb-8">
      <div
        ref={scroller}
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth [scrollbar-width:none] sm:gap-4 [&::-webkit-scrollbar]:hidden"
      >
        {cards === null
          ? Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className={cn(CARD, "aspect-[3/2] rounded-2xl")} />)
          : cards.map((card) => (
              <Link
                key={card.id}
                href={card.href}
                className={cn(
                  CARD,
                  "group relative aspect-[3/2] overflow-hidden rounded-2xl bg-muted",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                )}
              >
                {card.video ? (
                  <video
                    src={`${card.image}#t=0.1`}
                    muted
                    playsInline
                    preload="metadata"
                    tabIndex={-1}
                    aria-hidden
                    className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element -- vignette déjà dimensionnée par le serveur ou par le module
                  <img
                    src={card.image}
                    alt=""
                    loading="lazy"
                    className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 flex items-end gap-3 p-4 text-white">
                  {card.logo && (
                    <Image src={card.logo} alt="" width={36} height={36} unoptimized className="size-9 shrink-0 drop-shadow" />
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-lg font-semibold leading-tight tracking-tight">{card.title}</p>
                    {card.subtitle && <p className="truncate text-sm text-white/80">{card.subtitle}</p>}
                  </div>
                </div>
              </Link>
            ))}
      </div>

      {!edges.start && (
        <button
          type="button"
          onClick={() => slide(-1)}
          aria-label={t("gallery.highlights.previous")}
          className="absolute left-2 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-background/90 shadow-lg backdrop-blur transition hover:bg-background"
        >
          <ChevronLeft className="size-5" />
        </button>
      )}
      {!edges.end && (
        <button
          type="button"
          onClick={() => slide(1)}
          aria-label={t("gallery.highlights.next")}
          className="absolute right-2 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-background/90 shadow-lg backdrop-blur transition hover:bg-background"
        >
          <ChevronRight className="size-5" />
        </button>
      )}
    </section>
  );
}
