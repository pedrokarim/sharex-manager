"use client";

import { ActionStatus, type FeedbackState } from "@/components/feedback";

/**
 * Résultat de la copie des URL de la sélection (bouton de la barre ou
 * Ctrl+C), posé juste au-dessus de la barre de sélection, fixée en bas au
 * centre : là où le regard est quand on vient de copier. Rien n'est rendu
 * sans message.
 */
export function SelectionCopyStatus({ state }: { state: FeedbackState | null }) {
  if (!state) return null;
  return (
    <div className="pointer-events-none fixed bottom-20 left-1/2 z-50 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 justify-center">
      <span className="flex min-w-0 max-w-full rounded-full border bg-background/95 px-3 py-1.5 shadow-sm backdrop-blur-sm">
        <ActionStatus state={state} />
      </span>
    </div>
  );
}
