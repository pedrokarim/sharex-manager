"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { PhotoHeader } from "@/components/front/photo-header";
import { PILL_ON_PHOTO } from "@/components/front/styles";

/** Bouton secondaire sur la photo : un contour clair, sans verre dépoli. */
const OUTLINE_ON_PHOTO =
  "inline-flex h-12 items-center rounded-full px-6 text-sm font-semibold text-white ring-1 ring-white/45 ring-inset transition-colors hover:bg-white/10 focus-visible:ring-[3px] focus-visible:ring-white/50 focus-visible:outline-none";

/**
 * Corps de la page 404 : l'en-tête photographique des pages publiques, la
 * phrase qui dit ce qui s'est passé (avec l'adresse demandée) et les chemins
 * de retour. La galerie n'est proposée qu'à un compte connecté.
 */
export function NotFoundView({ signedIn }: { signedIn: boolean }) {
  const pathname = usePathname();

  return (
    <PhotoHeader
      photo="path"
      title="Cette page n’existe pas"
      description={
        <>
          Rien ne répond à l’adresse{" "}
          {pathname ? <span className="font-medium break-all text-white">{pathname}</span> : "demandée"}. Le lien est
          peut-être incomplet, ou la page a été déplacée.
        </>
      }
    >
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link href="/" className={PILL_ON_PHOTO}>
          Revenir à l’accueil
        </Link>
        {signedIn ? (
          <Link href="/gallery" className={OUTLINE_ON_PHOTO}>
            Ouvrir la galerie
          </Link>
        ) : null}
      </div>
    </PhotoHeader>
  );
}
