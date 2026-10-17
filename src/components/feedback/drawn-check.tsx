"use client";

import type { ComponentProps } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * Coche de réussite qui se dessine : le cercle arrive en tournant et se
 * précise, puis le trait de la coche se trace (motif « Success check » de
 * transitions.dev). Taille et couleur viennent de la classe (`size-*`,
 * `text-*`).
 */
export function DrawnCheck({ className }: Pick<ComponentProps<"span">, "className" | "aria-hidden">) {
  return (
    <motion.span
      aria-hidden
      className={cn("inline-flex shrink-0", className)}
      initial={{ opacity: 0, rotate: 70, filter: "blur(3px)" }}
      animate={{ opacity: 1, rotate: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-full overflow-visible"
      >
        <circle cx="12" cy="12" r="10" />
        <motion.path
          d="m8 12.5 2.8 2.8L16 10"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.4, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
    </motion.span>
  );
}
