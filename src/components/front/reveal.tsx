"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";

const EASE = [0.22, 1, 0.36, 1] as const;

interface RevealProps {
  children: ReactNode;
  className?: string;
  /** Retard, en secondes : pour faire entrer plusieurs blocs l'un après l'autre. */
  delay?: number;
  /** D'où vient le bloc, en pixels. */
  x?: number;
  y?: number;
  /** Entre dès le chargement plutôt qu'à son arrivée à l'écran : pour le héros. */
  immediate?: boolean;
  as?: "div" | "li" | "section";
}

/**
 * Fait entrer un bloc en douceur : il monte de quelques pixels en
 * s'éclaircissant, une seule fois, quand il arrive à l'écran. Rien ne bouge
 * pour qui a demandé moins d'animations ; et sans JavaScript, une règle
 * `<noscript>` de la page rend tout visible.
 */
export function Reveal({ children, className, delay = 0, x = 0, y = 28, immediate, as = "div" }: RevealProps) {
  const reduced = useReducedMotion();
  const Component = motion[as];
  if (reduced) {
    const Static = as;
    return <Static className={className}>{children}</Static>;
  }
  const shown = { opacity: 1, x: 0, y: 0 };
  return (
    <Component
      data-reveal
      className={className}
      initial={{ opacity: 0, x, y }}
      {...(immediate ? { animate: shown } : { whileInView: shown, viewport: { once: true, margin: "0px 0px -12% 0px" } })}
      transition={{ duration: 0.8, delay, ease: EASE }}
    >
      {children}
    </Component>
  );
}
