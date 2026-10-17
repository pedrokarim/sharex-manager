"use client";

import { MotionConfig, motion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * Valeur dont chaque chiffre défile comme un rouleau de compteur jusqu'à sa
 * place, de gauche à droite (motif « Spinning counter » de transitions.dev).
 * Accepte un nombre (formaté en français) ou un texte déjà formaté – « 12,4 Mo »,
 * « 17/10/26 » : seuls les chiffres défilent, le reste est posé tel quel.
 *
 * Les colonnes sont repérées depuis la droite : quand la valeur change, les
 * unités restent les unités et seuls les chiffres qui changent bougent. Le
 * mouvement réduit pose directement la valeur.
 */

const CELL = 1.2; // hauteur d'une case, en em
const DIGITS = Array.from({ length: 10 }, (_, digit) => digit);

export function RollingNumber({ value, className }: { value: number | string; className?: string }) {
  const text = typeof value === "number" ? value.toLocaleString("fr-FR") : value;
  const chars = [...text];

  return (
    <span className={cn("relative inline-flex items-center tabular-nums", className)}>
      <span className="sr-only">{text}</span>
      <MotionConfig reducedMotion="user">
        <span aria-hidden className="inline-flex items-center">
          {chars.map((char, index) => {
            const fromRight = chars.length - index;
            const digit = Number(char);
            if (!/\d/.test(char)) {
              return (
                <span key={`c-${fromRight}`} className="whitespace-pre">
                  {char}
                </span>
              );
            }
            return (
              <span
                key={`d-${fromRight}`}
                className="relative inline-block overflow-hidden [mask-image:linear-gradient(to_bottom,transparent,#000_22%,#000_78%,transparent)]"
                style={{ height: `${CELL}em` }}
              >
                <motion.span
                  className="flex flex-col"
                  initial={{ y: "0em" }}
                  animate={{ y: `${-digit * CELL}em` }}
                  transition={{ duration: 0.9, delay: index * 0.06, ease: [0.16, 1, 0.3, 1] }}
                >
                  {DIGITS.map((cell) => (
                    <span key={cell} className="flex items-center justify-center" style={{ height: `${CELL}em` }}>
                      {cell}
                    </span>
                  ))}
                </motion.span>
              </span>
            );
          })}
        </span>
      </MotionConfig>
    </span>
  );
}
