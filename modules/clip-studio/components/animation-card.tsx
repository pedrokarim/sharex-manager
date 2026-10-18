"use client";

import { memo, useEffect, useRef, useState, type RefObject } from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { cardDetail, type GalleryEntry } from "../lib/motion-gallery";
import { MotionThumbnail } from "./motion-thumbnail";
import { SceneThumbnail } from "./scene-thumbnail";

// ─── Observateurs partagés ───────────────────────────────────────

type Listener = (inside: boolean) => void;

interface SharedObserver {
  observer: IntersectionObserver;
  listeners: Map<Element, Listener>;
}

/** Un observateur par zone de défilement et par marge, partagé par toutes les cartes. */
const sharedObservers = new Map<Element | null, Map<string, SharedObserver>>();

/** Plus proche ancêtre qui défile : la zone de contenu de l'application, sinon la fenêtre. */
function scrollParentOf(element: Element): Element | null {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === "auto" || overflowY === "scroll") return node;
  }
  return null;
}

function observe(element: Element, rootMargin: string, listener: Listener): () => void {
  const root = scrollParentOf(element);
  let byMargin = sharedObservers.get(root);
  if (!byMargin) {
    byMargin = new Map();
    sharedObservers.set(root, byMargin);
  }
  let shared = byMargin.get(rootMargin);
  if (!shared) {
    const listeners = new Map<Element, Listener>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) listeners.get(entry.target)?.(entry.isIntersecting);
      },
      { root, rootMargin }
    );
    shared = { observer, listeners };
    byMargin.set(rootMargin, shared);
  }
  shared.listeners.set(element, listener);
  shared.observer.observe(element);
  const current = shared;
  return () => {
    current.listeners.delete(element);
    current.observer.unobserve(element);
  };
}

/**
 * Vrai tant que l'élément est dans la zone visible, élargie de `rootMargin`.
 * Tous les éléments d'une même marge partagent un seul observateur.
 */
export function useInViewport(ref: RefObject<Element | null>, rootMargin = "0px"): boolean {
  const [inside, setInside] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (typeof IntersectionObserver === "undefined") {
      setInside(true);
      return;
    }
    return observe(element, rootMargin, setInside);
  }, [ref, rootMargin]);
  return inside;
}

/** Marge où une vignette se prépare : son canevas existe un peu avant d'entrer à l'écran. */
const NEAR_MARGIN = "320px 0px";

// ─── Vignette d'une entrée ───────────────────────────────────────

/** Vignette d'une animation, d'une transition, d'un mouvement ou d'un effet, au dessin du sélecteur de l'éditeur. */
export function EntryThumbnail({
  entry,
  playing,
  resolution,
  className,
}: {
  entry: GalleryEntry;
  playing: boolean;
  resolution?: [number, number];
  className?: string;
}) {
  if (entry.source === "scene") return <SceneThumbnail kind={entry.kind} id={entry.id} playing={playing} resolution={resolution} className={className} />;
  return (
    <MotionThumbnail
      preset={entry.preset}
      phase={entry.pickerPhase}
      itemType={entry.itemType}
      text={entry.sampleText}
      playing={playing}
      resolution={resolution}
      className={className}
    />
  );
}

// ─── Carte ───────────────────────────────────────────────────────

interface AnimationCardProps {
  entry: GalleryEntry;
  favorite: boolean;
  /** « Tout lire » : la carte joue dès qu'elle est à l'écran, sinon au survol ou au clavier. */
  playAll: boolean;
  onOpen: (entry: GalleryEntry) => void;
  onToggleFavorite: (id: string) => void;
}

/**
 * Carte de la galerie : vignette vivante, nom, phase et durée, étoile des
 * favoris. Le canevas n'existe que près de l'écran ; il joue au survol ou au
 * focus, ou dès qu'il est visible avec « Tout lire », sur l'horloge partagée
 * des vignettes.
 */
export const AnimationCard = memo(function AnimationCard({ entry, favorite, playAll, onOpen, onToggleFavorite }: AnimationCardProps) {
  const boxRef = useRef<HTMLSpanElement>(null);
  const near = useInViewport(boxRef, NEAR_MARGIN);
  const visible = useInViewport(boxRef);
  const [engaged, setEngaged] = useState(false);
  const detail = cardDetail(entry);
  const playing = playAll ? visible : engaged;

  return (
    <div className="group/card relative min-w-0 rounded-lg border bg-card transition-colors hover:border-foreground/25 has-[button:focus-visible]:border-ring">
      <button
        type="button"
        onClick={() => onOpen(entry)}
        onPointerEnter={() => setEngaged(true)}
        onPointerLeave={() => setEngaged(false)}
        onFocus={() => setEngaged(true)}
        onBlur={() => setEngaged(false)}
        aria-label={`${entry.label}, ${detail}. Ouvrir la fiche`}
        className="flex w-full min-w-0 flex-col gap-1.5 rounded-lg p-1.5 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <span ref={boxRef} className="block aspect-[8/5] w-full min-w-0 overflow-hidden rounded-md bg-muted/60" data-gallery-thumb={entry.key}>
          {near ? <EntryThumbnail entry={entry} playing={playing} resolution={[240, 150]} /> : null}
        </span>
        <span className="block min-w-0 px-0.5">
          <span className="line-clamp-2 text-sm leading-snug font-medium [overflow-wrap:anywhere]" title={entry.label}>
            {entry.label}
          </span>
          <span className="block truncate text-xs text-muted-foreground" title={detail}>
            {detail}
          </span>
        </span>
      </button>
      <button
        type="button"
        aria-label={favorite ? `Retirer « ${entry.label} » des favoris` : `Ajouter « ${entry.label} » aux favoris`}
        aria-pressed={favorite}
        title={favorite ? "Retirer des favoris" : "Ajouter aux favoris"}
        onClick={() => onToggleFavorite(entry.id)}
        className={cn(
          "absolute top-2.5 right-2.5 flex size-7 items-center justify-center rounded-md bg-background/85 backdrop-blur transition-opacity outline-none hover:bg-background focus-visible:ring-[3px] focus-visible:ring-ring/50",
          favorite ? "opacity-100" : "opacity-0 group-hover/card:opacity-100 group-has-[button:focus-visible]/card:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
        )}
      >
        <Star className={cn("size-4", favorite ? "fill-amber-400 text-amber-500" : "text-muted-foreground")} />
      </button>
    </div>
  );
});
