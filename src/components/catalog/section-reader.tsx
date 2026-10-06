"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import Link from "next/link";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, ImageOff } from "lucide-react";

import { FRONT_NARROW } from "@/components/front/container";
import { DISPLAY } from "@/components/front/fonts";
import { CHIP, CHIP_ACTIVE, PILL_SOFT, PILL_SOLID } from "@/components/front/styles";
import { cn } from "@/lib/utils";
import type { CatalogSectionItem } from "@/types/modules";

type ReaderPage = CatalogSectionItem["pages"][number];
type Neighbour = { href: string; title: string };

interface SectionReaderProps {
  title: string;
  reading: CatalogSectionItem["reading"];
  pages: ReaderPage[];
  /** Éléments voisins de la même collection, quand ils sont publics eux aussi. */
  previous?: Neighbour;
  next?: Neighbour;
  /** Retour à la collection, quand elle a une page. */
  collection?: Neighbour;
}

/** Distance, en pixels, à partir de laquelle un glissement du doigt tourne la page. */
const SWIPE_DISTANCE = 48;
const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * Lecteur public d'une suite d'images, dans le mode de lecture de son format :
 * une page à la fois, de droite à gauche ou de gauche à droite, ou une bande
 * continue. Le lecteur peut passer d'un mode à l'autre.
 *
 * - Page par page : flèches du clavier dans le sens de lecture, Espace, Page
 *   suivante et précédente, Début et Fin ; au doigt, un glissement ou un appui
 *   sur un bord de la page. Les pages voisines sont préparées d'avance.
 * - En bande : les images se suivent et ne se chargent qu'à l'approche.
 *
 * Chaque image a sa place réservée d'après ses dimensions : rien ne saute
 * pendant le chargement, et une image qui n'est plus servie le dit.
 */
export function SectionReader({ title, reading, pages, previous, next, collection }: SectionReaderProps) {
  const [strip, setStrip] = useState(reading === "scroll");
  const rightToLeft = reading === "paged-rtl";

  return (
    <MotionConfig reducedMotion="user">
      <div className="pb-20">
        <div className={cn(FRONT_NARROW, "flex flex-wrap items-center justify-between gap-3 py-5")}>
          <p className="text-sm text-muted-foreground tabular-nums">
            {pages.length} {pages.length > 1 ? "pages" : "page"}
            {!strip && rightToLeft ? " · lecture de droite à gauche" : ""}
          </p>
          <div className="flex shrink-0 rounded-full bg-foreground/[0.06] p-1" role="group" aria-label="Mode de lecture">
            {[
              { value: false, label: "Page par page" },
              { value: true, label: "En bande" },
            ].map((mode) => (
              <button
                key={mode.label}
                type="button"
                onClick={() => setStrip(mode.value)}
                aria-pressed={strip === mode.value}
                className={cn(CHIP, "h-8 px-3.5", strip === mode.value ? CHIP_ACTIVE : "text-muted-foreground hover:text-foreground")}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>

        {strip ? <StripReader title={title} pages={pages} /> : <PagedReader title={title} pages={pages} rightToLeft={rightToLeft} next={next} />}

        <nav aria-label="Autres chapitres" className={cn(FRONT_NARROW, "mt-12 flex flex-wrap items-center justify-between gap-3")}>
          {previous ? (
            <Link href={previous.href} className={cn(PILL_SOFT, "max-w-full")}>
              <ArrowLeft className="size-4 shrink-0" />
              <span className="truncate">{previous.title}</span>
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link href={next.href} className={cn(PILL_SOLID, "max-w-full")}>
              <span className="truncate">{next.title}</span>
              <ArrowRight className="size-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
            </Link>
          ) : collection ? (
            <Link href={collection.href} className={cn(PILL_SOFT, "max-w-full")}>
              <span className="truncate">{collection.title}</span>
            </Link>
          ) : null}
        </nav>
      </div>
    </MotionConfig>
  );
}

/** Une image du lecteur, à sa place dès avant son chargement. */
function ReaderImage({ page, alt, eager, className }: { page: ReaderPage; alt: string; eager?: boolean; className?: string }) {
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");
  const image = useRef<HTMLImageElement>(null);
  const known = page.width > 0 && page.height > 0;

  // Une image déjà dans le cache du navigateur est prête avant que React n'écoute.
  useEffect(() => {
    if (image.current?.complete) setState(image.current.naturalWidth > 0 ? "ready" : "missing");
  }, [page.url]);

  return (
    <div
      className={cn("relative mx-auto w-full overflow-hidden bg-foreground/[0.045]", state === "loading" && "animate-pulse", className)}
      style={{ aspectRatio: known ? `${page.width} / ${page.height}` : "2 / 3", maxWidth: known ? page.width : undefined }}
    >
      {state === "missing" ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center text-muted-foreground">
          <ImageOff aria-hidden className="size-6" strokeWidth={1.5} />
          <p className="text-sm">Cette page n’est plus disponible.</p>
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- image servie par la route des sections, qui vérifie la visibilité à chaque demande
        <img
          ref={image}
          src={page.url}
          alt={alt}
          width={known ? page.width : undefined}
          height={known ? page.height : undefined}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          draggable={false}
          onLoad={() => setState("ready")}
          onError={() => setState("missing")}
          className={cn("block h-full w-full select-none object-contain transition-opacity duration-300", state === "ready" ? "opacity-100" : "opacity-0")}
        />
      )}
    </div>
  );
}

/** La bande continue : les pages l'une sous l'autre, sans intervalle. */
function StripReader({ title, pages }: { title: string; pages: ReaderPage[] }) {
  return (
    <ol className="mx-auto flex w-full max-w-3xl flex-col" aria-label={`Pages de ${title}`}>
      {pages.map((page, index) => (
        <li key={page.url}>
          <ReaderImage page={page} alt={`Page ${index + 1} sur ${pages.length}`} eager={index < 2} />
        </li>
      ))}
    </ol>
  );
}

function PagedReader({ title, pages, rightToLeft, next }: { title: string; pages: ReaderPage[]; rightToLeft: boolean; next?: Neighbour }) {
  const [index, setIndex] = useState(0);
  /** Sens du dernier déplacement, pour l'entrée de la page : 1 vers la suite, -1 vers le début. */
  const [direction, setDirection] = useState(1);
  const frame = useRef<HTMLDivElement>(null);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const last = pages.length - 1;

  const go = useCallback(
    (target: number) => {
      const bounded = Math.max(0, Math.min(last, target));
      setIndex((current) => {
        if (bounded !== current) setDirection(bounded > current ? 1 : -1);
        return bounded;
      });
    },
    [last],
  );

  // À chaque page, le haut de l'image revient sous la barre de navigation.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const top = frame.current?.getBoundingClientRect().top ?? 0;
    if (top < 0 || top > window.innerHeight * 0.4) {
      const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.scrollTo({ top: window.scrollY + top - 88, behavior: calm ? "auto" : "smooth" });
    }
  }, [index]);

  // Les deux pages suivantes sont demandées d'avance : tourner la page ne fait pas attendre.
  useEffect(() => {
    for (const page of pages.slice(index + 1, index + 3)) {
      const preload = new window.Image();
      preload.decoding = "async";
      preload.src = page.url;
    }
  }, [index, pages]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A"].includes(target.tagName)) && event.key === " ") return;
      if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      // Les flèches suivent le sens de lecture : dans un manga, la suite est à gauche.
      const forward = rightToLeft ? "ArrowLeft" : "ArrowRight";
      const backward = rightToLeft ? "ArrowRight" : "ArrowLeft";
      let handled = true;
      if (event.key === forward || event.key === "PageDown" || (event.key === " " && !event.shiftKey)) setIndexBy(1);
      else if (event.key === backward || event.key === "PageUp" || (event.key === " " && event.shiftKey)) setIndexBy(-1);
      else if (event.key === "Home") go(0);
      else if (event.key === "End") go(last);
      else handled = false;
      if (handled) event.preventDefault();
    };
    const setIndexBy = (offset: number) => {
      setIndex((current) => {
        const bounded = Math.max(0, Math.min(last, current + offset));
        if (bounded !== current) setDirection(offset);
        return bounded;
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, last, rightToLeft]);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    swipe.current = event.pointerType === "mouse" ? null : { x: event.clientX, y: event.clientY };
  };
  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = swipe.current;
    swipe.current = null;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    // Un glissement surtout vertical est un défilement, pas un changement de page.
    if (Math.abs(dx) < SWIPE_DISTANCE || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    // Le doigt tire la page suivante depuis le côté où elle se trouve.
    const towardNext = rightToLeft ? dx > 0 : dx < 0;
    go(index + (towardNext ? 1 : -1));
  };

  const page = pages[index];
  const atEnd = index === last;
  // À l'écran, la suite est à gauche dans un manga, à droite ailleurs.
  const leftStep = rightToLeft ? 1 : -1;
  const edge = "absolute inset-y-0 z-10 w-1/3 cursor-pointer focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50 disabled:cursor-default";
  const control = cn(CHIP, "bg-foreground/[0.06] hover:bg-foreground/10 disabled:pointer-events-none disabled:opacity-40");
  const enter = direction * (rightToLeft ? -1 : 1) * 28;

  return (
    <div ref={frame} className="mx-auto w-full max-w-5xl px-0 sm:px-8">
      <div
        role="group"
        aria-roledescription="lecteur page par page"
        aria-label={`${title}, page ${index + 1} sur ${pages.length}`}
        className="relative touch-pan-y"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (swipe.current = null)}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={page.url}
            initial={{ opacity: 0, x: enter }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22, ease: EASE }}
          >
            <ReaderImage page={page} alt={`Page ${index + 1} sur ${pages.length}`} eager className="max-h-[calc(100svh-7rem)]" />
          </motion.div>
        </AnimatePresence>
        <button
          type="button"
          className={cn(edge, "left-0")}
          onClick={() => go(index + leftStep)}
          disabled={leftStep === 1 ? atEnd : index === 0}
          aria-label={leftStep === 1 ? "Page suivante" : "Page précédente"}
        />
        <button
          type="button"
          className={cn(edge, "right-0")}
          onClick={() => go(index - leftStep)}
          disabled={leftStep === 1 ? index === 0 : atEnd}
          aria-label={leftStep === 1 ? "Page précédente" : "Page suivante"}
        />
      </div>

      <div className="mt-5 flex items-center justify-center gap-3 px-5">
        <button type="button" className={control} onClick={() => go(index + leftStep)} disabled={leftStep === 1 ? atEnd : index === 0}>
          <ChevronLeft aria-hidden className="size-4" />
          {leftStep === 1 ? "Suivante" : "Précédente"}
        </button>
        <p className="min-w-20 text-center text-sm font-medium tabular-nums" aria-live="polite">
          {index + 1} / {pages.length}
        </p>
        <button type="button" className={control} onClick={() => go(index - leftStep)} disabled={leftStep === 1 ? index === 0 : atEnd}>
          {leftStep === 1 ? "Précédente" : "Suivante"}
          <ChevronRight aria-hidden className="size-4" />
        </button>
      </div>

      {atEnd && pages.length > 1 ? (
        <p className={cn(DISPLAY, "mt-10 px-5 text-center text-2xl text-balance")}>
          Fin du chapitre.
          {next ? (
            <>
              {" "}
              <Link href={next.href} className="underline decoration-1 underline-offset-4 hover:opacity-80">
                Lire la suite
              </Link>
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
