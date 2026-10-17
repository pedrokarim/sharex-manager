"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Étoile d'un favori. En passant à « favori », elle se creuse, rebondit et
 * lâche une gerbe de huit éclats (motif « Like button » de transitions.dev) ;
 * en revenant, elle se vide simplement. Rien ne bouge au premier affichage.
 *
 * `className` règle la taille (`size-4`) ; `activeClassName` la couleur du
 * favori, qui colore aussi les éclats.
 */

const PARTICLES = Array.from({ length: 8 }, (_, index) => {
  // Une gerbe un peu irrégulière : angle décalé, distance et taille variables.
  const angle = (index / 8) * Math.PI * 2 + (index % 2 ? 0.25 : -0.1);
  const distance = 11 + (index % 3) * 3;
  return {
    x: Math.cos(angle) * distance,
    y: Math.sin(angle) * distance,
    size: index % 3 === 0 ? 3 : 2,
    delay: (index % 4) * 0.02,
  };
});

export function FavoriteStar({
  active,
  className,
  activeClassName = "fill-amber-400 text-amber-400",
}: {
  active: boolean;
  className?: string;
  activeClassName?: string;
}) {
  const reducedMotion = useReducedMotion();
  const previous = useRef(active);
  const [burst, setBurst] = useState(0);

  useEffect(() => {
    if (active && !previous.current && !reducedMotion) setBurst((value) => value + 1);
    previous.current = active;
  }, [active, reducedMotion]);

  return (
    <span aria-hidden className={cn("relative inline-flex shrink-0", active && activeClassName)}>
      {/* Le rebond porte sur l'enveloppe, jamais sur le <svg> : Chromium le
          pixeliserait en haute densité. */}
      <motion.span
        key={burst}
        className="inline-flex"
        initial={burst ? { scale: 1 } : false}
        animate={burst ? { scale: [1, 0.78, 1.12, 1] } : undefined}
        transition={{ duration: 0.38, ease: [0.34, 1.56, 0.64, 1] }}
      >
        <Star className={cn(!className && "size-4", "transition-colors duration-150", active && "fill-current", className)} />
      </motion.span>
      {burst ? (
        <span key={`burst-${burst}`} className="pointer-events-none absolute top-1/2 left-1/2">
          {PARTICLES.map((particle, index) => (
            <motion.i
              key={index}
              className="absolute block rounded-full bg-current"
              style={{
                width: particle.size,
                height: particle.size,
                left: -particle.size / 2,
                top: -particle.size / 2,
              }}
              initial={{ opacity: 0, x: 0, y: 0, scale: 0.4 }}
              animate={{
                opacity: [0, 1, 0],
                x: [0, particle.x * 0.3, particle.x],
                y: [0, particle.y * 0.3, particle.y],
                scale: [0.4, 1, 0.6],
              }}
              transition={{ duration: 0.6, delay: particle.delay, ease: "easeOut", times: [0, 0.2, 1] }}
            />
          ))}
        </span>
      ) : null}
    </span>
  );
}
