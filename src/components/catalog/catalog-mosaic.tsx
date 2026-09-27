"use client";

import { useEffect, useRef } from "react";

interface CatalogMosaicProps {
  /** Noms de fichiers servant à alimenter la mosaïque. */
  images: string[];
  /** Bascules par seconde, en moyenne. */
  rate?: number;
  /** Durée du fondu croisé, en millisecondes. */
  fade?: number;
  /** Nombre de tuiles basculées à chaque tirage. */
  burst?: number;
}

const columnsFor = (width: number) =>
  width < 520 ? 4 : width < 900 ? 6 : width < 1400 ? 8 : 10;

const thumb = (name: string) => `/api/thumbnails/${encodeURIComponent(name)}`;

/**
 * Fond du héros : une mosaïque de vignettes qui se renouvelle en continu.
 *
 * Chaque case porte deux couches superposées. Pour changer d'image, on peint la
 * couche cachée puis on croise les opacités : les deux se recouvrant pendant la
 * transition, aucun fond ne transparaît – c'est ce qui distingue un vrai fondu
 * d'un simple remplacement de source.
 *
 * Le DOM est piloté à la main plutôt que par l'état React : une bascule par
 * seconde déclencherait autant de rendus pour ne changer qu'un attribut de style.
 */
export function CatalogMosaic({
  images,
  rate = 1.5,
  fade = 1600,
  burst = 1,
}: CatalogMosaicProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    const grid = gridRef.current;
    if (!host || !grid || images.length === 0) return;

    interface Cell {
      el: HTMLDivElement;
      layers: [HTMLElement, HTMLElement];
      front: 0 | 1;
      busy: boolean;
    }

    const cells: Cell[] = [];
    let active = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let pick = 0;

    // Parcours décalé de la liste : deux cases voisines ne montrent pas
    // la même image, même quand le catalogue en compte peu.
    const nextImage = () => images[pick++ % images.length];

    const build = () => {
      const cols = columnsFor(host.clientWidth);
      grid.style.setProperty("--cols", String(cols));
      const size = host.clientWidth / cols;
      const rows = Math.ceil(host.clientHeight / size) + 1;
      const need = cols * rows;

      while (cells.length < need) {
        const el = document.createElement("div");
        el.className = "sxm-cell";
        const a = document.createElement("span");
        const b = document.createElement("span");
        a.style.backgroundImage = `url("${thumb(nextImage())}")`;
        a.classList.add("on");
        b.style.backgroundImage = `url("${thumb(nextImage())}")`;
        el.append(a, b);
        grid.appendChild(el);
        cells.push({ el, layers: [a, b], front: 0, busy: false });
      }
      cells.forEach((c, i) => {
        c.el.style.display = i < need ? "" : "none";
      });
      active = need;
    };

    const swap = (index: number) => {
      const cell = cells[index];
      if (!cell || cell.busy || cell.el.style.display === "none") return;
      cell.busy = true;
      const back = cell.layers[1 - cell.front];
      back.style.backgroundImage = `url("${thumb(nextImage())}")`;
      // Forcer un reflow : sans ça la transition peut être ignorée lorsque la
      // classe est ajoutée dans la même frame que le changement de source.
      void back.offsetWidth;
      back.classList.add("on");
      cell.layers[cell.front].classList.remove("on");
      cell.front = (1 - cell.front) as 0 | 1;
      window.setTimeout(() => {
        cell.busy = false;
      }, fade + 60);
    };

    const schedule = () => {
      if (timer) clearTimeout(timer);
      // Intervalle irrégulier : une cadence fixe se repère au bout de quelques
      // secondes et donne un rythme mécanique.
      const base = 1000 / rate;
      timer = setTimeout(() => {
        for (let i = 0; i < burst; i++) {
          swap(Math.floor(Math.random() * active));
        }
        schedule();
      }, base * (0.55 + Math.random() * 0.9));
    };

    build();
    const observer = new ResizeObserver(build);
    observer.observe(host);

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!reduced.matches) schedule();

    // Inutile d'animer un onglet que personne ne regarde.
    const onVisibility = () => {
      if (document.hidden) {
        if (timer) clearTimeout(timer);
      } else if (!reduced.matches) {
        schedule();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      if (timer) clearTimeout(timer);
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      grid.replaceChildren();
    };
  }, [images, rate, fade, burst]);

  return (
    <div ref={hostRef} className="absolute inset-0 overflow-hidden" aria-hidden>
      <div
        ref={gridRef}
        className="sxm-mosaic absolute inset-0"
        style={{ ["--fade" as string]: `${fade}ms` }}
      />
      {/*
        Voile sombre indépendant du thème : les images doivent rester lisibles
        sous du texte clair, y compris en thème clair où un voile blanc les
        délaverait.
      */}
      <div className="absolute inset-0 bg-[linear-gradient(to_top,rgba(0,0,0,0.86)_28%,rgba(0,0,0,0.62)_62%,rgba(0,0,0,0.34)_100%)]" />

      {/* Renfort sous la navigation : sans lui, les liens se perdent dès qu'une
          vignette claire passe derrière eux. */}
      <div className="absolute inset-x-0 top-0 h-36 bg-[linear-gradient(to_bottom,rgba(0,0,0,0.72),transparent)]" />

      {/* Raccord avec le reste de la page. Le contenu du héros doit rester
          au-dessus de cette bande, sinon il se délave en thème clair. */}
      <div className="absolute inset-x-0 bottom-0 h-24 bg-[linear-gradient(to_top,var(--background),transparent)]" />
    </div>
  );
}
