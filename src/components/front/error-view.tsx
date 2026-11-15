"use client";

import Link from "next/link";

import { PhotoHeader } from "@/components/front/photo-header";
import { PILL_ON_PHOTO } from "@/components/front/styles";

/** Bouton secondaire sur la photo : un contour clair, comme sur la page 404. */
const OUTLINE_ON_PHOTO =
  "inline-flex h-12 items-center rounded-full px-6 text-sm font-semibold text-white ring-1 ring-white/45 ring-inset transition-colors hover:bg-white/10 focus-visible:ring-[3px] focus-visible:ring-white/50 focus-visible:outline-none";

/**
 * Corps d'une page d'erreur publique : l'en-tête photographique des pages
 * publiques, ce qui s'est passé, et deux sorties (réessayer, revenir à
 * l'accueil). Le code de l'erreur (`digest`) permet de retrouver la trace
 * côté serveur : il est montré pour être cité au support, jamais le message
 * de l'erreur, qui peut contenir des détails internes.
 */
export function ErrorView({ digest, onRetry }: { digest?: string; onRetry: () => void }) {
  return (
    <PhotoHeader
      photo="mist"
      title="Cette page n’a pas pu s’afficher"
      description={
        <>
          Une erreur s’est produite de notre côté. Réessayez dans un instant ; si elle revient, indiquez ce code au
          support{" "}
          {digest ? <span className="font-medium break-all text-white">{digest}</span> : "(aucun code n’a été donné)"}.
        </>
      }
    >
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button type="button" onClick={onRetry} className={PILL_ON_PHOTO}>
          Réessayer
        </button>
        <Link href="/" className={OUTLINE_ON_PHOTO}>
          Revenir à l’accueil
        </Link>
      </div>
    </PhotoHeader>
  );
}
