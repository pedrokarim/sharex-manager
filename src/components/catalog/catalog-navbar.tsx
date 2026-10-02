"use client";

import { usePathname } from "next/navigation";

import { FrontNav } from "@/components/front/front-nav";
import { useSession } from "@/lib/auth-client";

const NAV_ITEMS = [
  { href: "/catalog", label: "Accueil" },
  { href: "/catalog/albums", label: "Albums" },
  { href: "/catalog/gallery", label: "Galerie" },
];

/**
 * Barre de navigation du catalogue : la même que celle de l'accueil, avec ses
 * propres rubriques. Toutes les pages du catalogue s'ouvrent sur une photo ou
 * une mosaïque, sur laquelle elle se pose en clair.
 */
export function CatalogNavbar() {
  const pathname = usePathname();
  const { data: session } = useSession();

  return (
    <FrontNav
      brand={{ href: "/catalog", logo: "/images/logo-sxm-catalog.png", name: "SXM Catalog" }}
      links={NAV_ITEMS.map((item) => ({
        ...item,
        // Un album ouvert reste dans la rubrique « Albums ».
        active: item.href === "/catalog" ? pathname === item.href : pathname.startsWith(item.href),
      }))}
      secondary={{ href: "/", label: "ShareX Manager" }}
      action={session?.user ? { href: "/gallery", label: "Mon espace" } : { href: "/login", label: "Se connecter" }}
    />
  );
}
