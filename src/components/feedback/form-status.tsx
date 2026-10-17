"use client";

import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { CircleAlert, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { DrawnCheck } from "./drawn-check";
import type { FeedbackState, FeedbackTone } from "./use-feedback";

/**
 * Message d'un formulaire, d'une fenêtre ou d'un panneau : il s'ouvre à
 * l'endroit où l'utilisateur regarde (en général juste au-dessus du bouton
 * d'envoi), pousse doucement ce qui suit, et se referme quand il n'a plus
 * lieu d'être. Une erreur arrive avec une brève secousse (motif « Error
 * state shake » de transitions.dev) ; le mouvement réduit l'en dispense.
 */

const TONES: Record<FeedbackTone, string> = {
  error: "bg-destructive/10 text-destructive",
  success: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  info: "bg-muted text-foreground",
};

// La réussite se dessine (`DrawnCheck`) ; les autres tons gardent leur icône.
const ICONS = { error: CircleAlert, success: DrawnCheck, info: Info } as const;

export function FormStatus({ state, className }: { state: FeedbackState | null; className?: string }) {
  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence initial={false}>
        {state ? (
          <motion.div
            key="form-status"
            className="min-w-0 overflow-hidden"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* L'espacement se règle ici (`className="pb-3"`) : il s'ouvre et se
                referme avec le message, sans à-coup. */}
            <div className={className}>
              <FormStatusBody state={state} />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </MotionConfig>
  );
}

function FormStatusBody({ state }: { state: FeedbackState }) {
  const Icon = ICONS[state.tone];
  return (
    <motion.div
      // Un nouveau message rejoue l'entrée, même si le texte est identique.
      key={state.id}
      role={state.tone === "error" ? "alert" : "status"}
      data-slot="form-status"
      data-tone={state.tone}
      className={cn("flex items-start gap-2.5 rounded-lg px-3 py-2.5 text-sm", TONES[state.tone])}
      initial={state.tone === "error" ? { x: 0 } : { opacity: 0 }}
      animate={state.tone === "error" ? { x: [0, -5, 5, -3, 3, 0] } : { opacity: 1 }}
      transition={{ duration: state.tone === "error" ? 0.36 : 0.2, ease: "easeInOut" }}
    >
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <p className="min-w-0 flex-1 break-words">{state.message}</p>
    </motion.div>
  );
}
