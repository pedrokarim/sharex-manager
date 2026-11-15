"use client";

import { useEffect } from "react";

import { ErrorView } from "@/components/front/error-view";
import { frontDisplay } from "@/components/front/fonts";
import { cn } from "@/lib/utils";

/**
 * Erreur dans une page publique (ou hors de l'espace connecté) : la page
 * d'erreur dans le style des pages publiques, à la place de l'écran anglais de
 * Next.js. L'espace connecté a la sienne (`(app)/error.tsx`), qui garde la
 * barre latérale ; une erreur dans la mise en page racine passe par
 * `global-error.tsx`.
 */
export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className={cn(frontDisplay.variable, "relative flex min-h-screen flex-col [&>section]:flex-1")}>
      <ErrorView digest={error.digest} onRetry={retry} />
    </div>
  );
}
