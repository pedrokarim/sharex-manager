"use client";

import type { ReactNode } from "react";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";

/**
 * Passage du squelette au contenu (motif « Skeleton loader and reveal » de
 * transitions.dev) : le squelette s'efface en se floutant, le contenu arrive
 * net. Un contenu déjà prêt au premier affichage apparaît sans animation.
 */

interface LoadingRevealProps {
  loading: boolean;
  /** Ce qui s'affiche pendant l'attente : en général des `Skeleton`. */
  fallback: ReactNode;
  children: ReactNode;
  className?: string;
}

export function LoadingReveal({ loading, fallback, children, className }: LoadingRevealProps) {
  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence mode="wait" initial={false}>
        {loading ? (
          <motion.div
            key="fallback"
            aria-busy="true"
            className={className}
            exit={{ opacity: 0, filter: "blur(2px)" }}
            transition={{ duration: 0.15, ease: "easeIn" }}
          >
            {fallback}
          </motion.div>
        ) : (
          <motion.div
            key="content"
            className={className}
            initial={{ opacity: 0, filter: "blur(2px)" }}
            animate={{ opacity: 1, filter: "blur(0px)" }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </MotionConfig>
  );
}
