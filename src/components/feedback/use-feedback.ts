"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type FeedbackTone = "success" | "error" | "info";

export interface FeedbackState {
  tone: FeedbackTone;
  message: string;
  /** Change à chaque message : un même texte répété se rejoue. */
  id: number;
}

export interface Feedback {
  state: FeedbackState | null;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  clear: () => void;
}

/**
 * Retour d'une action, affiché là où l'action a eu lieu (`FormStatus`,
 * `ActionStatus`) plutôt que dans un toast au coin de l'écran.
 *
 * Une réussite s'efface d'elle-même après `successDuration` ; une erreur
 * reste jusqu'à la prochaine action ou jusqu'à `clear()` – à appeler quand
 * l'utilisateur corrige sa saisie.
 */
export function useFeedback({ successDuration = 2600 }: { successDuration?: number } = {}): Feedback {
  const [state, setState] = useState<FeedbackState | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const counter = useRef(0);

  const show = useCallback(
    (tone: FeedbackTone, message: string) => {
      window.clearTimeout(timer.current);
      counter.current += 1;
      setState({ tone, message, id: counter.current });
      if (tone === "success") {
        timer.current = window.setTimeout(() => setState(null), successDuration);
      }
    },
    [successDuration]
  );

  const clear = useCallback(() => {
    window.clearTimeout(timer.current);
    setState((current) => (current ? null : current));
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  // Les fonctions restent les mêmes d'un rendu à l'autre : elles peuvent
  // figurer dans les dépendances d'un effet sans le relancer.
  const actions = useMemo(
    () => ({
      success: (message: string) => show("success", message),
      error: (message: string) => show("error", message),
      info: (message: string) => show("info", message),
      clear,
    }),
    [show, clear]
  );

  return useMemo(() => ({ ...actions, state }), [actions, state]);
}

/** Le texte d'une erreur attrapée, ou `fallback` s'il n'y en a pas d'utile. */
export function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}
