"use client";

import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { CircleAlert, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { DrawnCheck } from "./drawn-check";
import type { FeedbackState, FeedbackTone } from "./use-feedback";

/**
 * Retour bref posé à côté de l'action qui l'a produit : « Enregistré » près
 * du bouton Enregistrer, « Copié » près du lien copié, l'erreur d'une ligne
 * sur cette ligne. Il apparaît et s'efface en fondu flouté (motif « Text
 * states swap » de transitions.dev) sans déplacer ses voisins : réserver sa
 * place ou le poser au bout d'une rangée.
 */

const TONES: Record<FeedbackTone, string> = {
  error: "text-destructive",
  success: "text-emerald-700 dark:text-emerald-400",
  info: "text-muted-foreground",
};

// La réussite se dessine (`DrawnCheck`) ; les autres tons gardent leur icône.
const ICONS = { error: CircleAlert, success: DrawnCheck, info: Info } as const;

export function ActionStatus({ state, className }: { state: FeedbackState | null; className?: string }) {
  return (
    <span
      aria-live="polite"
      data-slot="action-status"
      className={cn("inline-flex min-w-0 items-center text-xs font-medium", className)}
    >
      <MotionConfig reducedMotion="user">
        <AnimatePresence mode="wait" initial={false}>
          {state ? (
            <ActionStatusBody key={state.id} state={state} />
          ) : null}
        </AnimatePresence>
      </MotionConfig>
    </span>
  );
}

function ActionStatusBody({ state }: { state: FeedbackState }) {
  const Icon = ICONS[state.tone];
  return (
    <motion.span
      role={state.tone === "error" ? "alert" : undefined}
      title={state.message}
      className={cn("inline-flex min-w-0 items-center gap-1.5", TONES[state.tone])}
      initial={{ opacity: 0, filter: "blur(2px)", y: 2 }}
      animate={{ opacity: 1, filter: "blur(0px)", y: 0 }}
      exit={{ opacity: 0, filter: "blur(2px)" }}
      transition={{ duration: 0.18, ease: "easeOut" }}
    >
      <Icon aria-hidden className="size-3.5 shrink-0" />
      <span className="truncate">{state.message}</span>
    </motion.span>
  );
}
