import { headers } from "next/headers";

import { frontDisplay } from "@/components/front/fonts";
import { NotFoundView } from "@/components/front/not-found-view";
import { SiteNav } from "@/components/front/site-nav";
import { Footer } from "@/components/layout/footer";
import { auth } from "@/lib/auth";
import { cn } from "@/lib/utils";

/**
 * Page 404 de tout le site : une adresse inconnue, ou un `notFound()` levé
 * par une page. Elle prend le gabarit des pages publiques (barre, en-tête
 * photo, pied) même quand l'adresse visait l'espace connecté.
 */
export default async function NotFound() {
  const session = await auth.api.getSession({ headers: await headers() }).catch(() => null);

  return (
    <div className={cn(frontDisplay.variable, "relative flex min-h-screen flex-col")}>
      {/* Les apparitions partent d'un état invisible : sans JavaScript, on l'annule. */}
      <noscript>
        <style>{"[data-reveal]{opacity:1!important;transform:none!important}"}</style>
      </noscript>
      <SiteNav />
      {/* La photo descend jusqu'au pied de page, sans bande vide entre les deux. */}
      <div className="flex flex-1 flex-col [&>section]:flex-1">
        <NotFoundView signedIn={Boolean(session?.user)} />
      </div>
      <Footer />
    </div>
  );
}
