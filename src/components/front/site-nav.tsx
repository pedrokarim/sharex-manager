"use client";

import { usePathname } from "next/navigation";

import { FrontNav } from "@/components/front/front-nav";
import { useSession } from "@/lib/auth-client";
import { useTranslation } from "@/lib/i18n";

/**
 * Barre de navigation des pages du site vitrine hors accueil : outils, à
 * propos, contact, pages légales. La même que celle de l'accueil, avec des
 * liens vers les rubriques plutôt que vers les ancres de la page.
 */
export function SiteNav() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { t } = useTranslation();

  const links = [
    { href: "/catalog", label: t("home.landing.nav.catalog") },
    { href: "/tools", label: t("home.landing.nav.tools") },
    { href: "/about", label: t("home.landing.nav.about") },
    { href: "/contact", label: t("home.landing.nav.contact") },
  ];

  return (
    <FrontNav
      brand={{ href: "/", logo: "/images/logo-sxm-simple.png", name: "ShareX Manager" }}
      links={links.map((link) => ({ ...link, active: pathname.startsWith(link.href) }))}
      action={
        session?.user
          ? { href: "/gallery", label: t("home.cta.gallery") }
          : { href: "/login", label: t("home.landing.hero.cta_secondary") }
      }
    />
  );
}
