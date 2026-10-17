"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Orb, type OrbState } from "./orb";

/**
 * Ligne d'état d'un travail en cours : une petite orbe et un texte qui
 * scintille. Avec plusieurs messages, ils se relaient – l'ancien monte et
 * s'efface, le suivant arrive par le bas (motif « Thinking states » de
 * transitions.dev). La largeur suit le message le plus long : rien ne bouge
 * autour pendant les relais.
 *
 * Pour un avancement réel (pourcentage, étape), passer un seul message mis à
 * jour : le texte change sur place, sans relais.
 */

interface ThinkingStatusProps {
  /** Un message, ou plusieurs qui se relaient. */
  messages: string | readonly string[];
  state?: OrbState;
  /** Temps d'affichage de chaque message, en millisecondes. */
  interval?: number;
  /** Masque l'orbe, quand une autre est déjà affichée à côté. */
  hideOrb?: boolean;
  className?: string;
}

export function ThinkingStatus({
  messages,
  state = "working",
  interval = 2400,
  hideOrb = false,
  className,
}: ThinkingStatusProps) {
  const list = typeof messages === "string" ? [messages] : messages;
  const [index, setIndex] = useState(0);
  const cycling = list.length > 1;

  useEffect(() => {
    if (!cycling) return;
    const timer = window.setInterval(
      () => setIndex((value) => (value + 1) % list.length),
      interval
    );
    return () => window.clearInterval(timer);
  }, [cycling, interval, list.length]);

  const message = list[index % list.length] ?? "";
  const longest = cycling
    ? list.reduce((best, item) => (item.length > best.length ? item : best), "")
    : message;

  return (
    <span
      role="status"
      aria-live="polite"
      data-slot="thinking-status"
      className={cn("inline-flex min-w-0 max-w-full items-center gap-2 text-sm", className)}
    >
      {hideOrb ? null : <Orb size="sm" state={state} className="text-primary" />}
      <MotionConfig reducedMotion="user">
        {/* Tous les messages occupent la même case : l'entrant et le sortant
            se croisent sans se pousser. */}
        <span className="grid min-w-0 grid-cols-[minmax(0,auto)] overflow-hidden">
          <span aria-hidden className="invisible col-start-1 row-start-1 truncate">
            {longest}
          </span>
          <AnimatePresence initial={false}>
            <motion.span
              key={cycling ? index : "message"}
              title={message}
              className="col-start-1 row-start-1 truncate shimmer"
              initial={{ opacity: 0, y: 8, filter: "blur(2px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -8, filter: "blur(2px)" }}
              transition={{ duration: 0.18, ease: "easeInOut" }}
            >
              {message}
            </motion.span>
          </AnimatePresence>
        </span>
      </MotionConfig>
    </span>
  );
}
