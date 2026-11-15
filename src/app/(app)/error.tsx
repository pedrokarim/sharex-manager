"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RotateCcw, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Erreur dans une page de l'espace connecté. Ce fichier ne remplace que la
 * page : la barre latérale et le fil d'Ariane restent, on peut aller ailleurs
 * sans recharger. Le code de l'erreur (`digest`) retrouve la trace côté
 * serveur ; le message de l'erreur, lui, n'est jamais montré (il peut
 * contenir des détails internes).
 */
export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-full shrink-0 items-center justify-center px-4 py-16">
      <div className="flex w-full max-w-md min-w-0 flex-col items-center text-center" role="alert">
        <TriangleAlert aria-hidden className="size-8 text-amber-600 dark:text-amber-400" />
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">Cette page n’a pas pu s’afficher</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Une erreur s’est produite en la préparant. Réessayez ; si elle revient, indiquez ce code au support.
        </p>
        <p className="mt-3 max-w-full text-xs break-all text-muted-foreground">
          {error.digest ? (
            <>
              Code de l’erreur{" "}: <span className="font-medium text-foreground">{error.digest}</span>
            </>
          ) : (
            "Aucun code n’a été donné pour cette erreur."
          )}
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <Button onClick={() => retry()}>
            <RotateCcw aria-hidden className="mr-2 size-4" />
            Réessayer
          </Button>
          <Button variant="outline" asChild>
            <Link href="/gallery">Ouvrir la galerie</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
