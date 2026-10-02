"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, type MouseEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Menu, X } from "lucide-react";

import { FRONT_WIDE } from "@/components/front/container";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

export interface FrontNavLink {
  label: string;
  href: string;
  /** La page affichée : le lien est marqué d'un point. */
  active?: boolean;
}

interface FrontNavProps {
  brand: { href: string; logo: string; name: string };
  links: FrontNavLink[];
  /** Lien discret, à gauche du bouton : un retour, par exemple. */
  secondary?: { label: string; href: string };
  action: { label: string; href: string };
}

const EASE = [0.22, 1, 0.36, 1] as const;

/** Une ancre de la page : on y glisse, au lieu d'y sauter. */
function glideToAnchor(event: MouseEvent<HTMLAnchorElement>, href: string) {
  const target = document.getElementById(href.slice(1));
  if (!target) return;
  event.preventDefault();
  const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  target.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "start" });
  window.history.replaceState(null, "", href);
}

/**
 * Barre de navigation des pages publiques. Posée sur la photo qui ouvre la
 * page, elle est transparente et écrite en clair ; dès qu'on défile, ou que le
 * menu mobile s'ouvre, elle prend le fond de la page et ses couleurs.
 */
export function FrontNav({ brand, links, secondary, action }: FrontNavProps) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const solid = scrolled || open;
  const linkClass = "relative text-sm font-medium transition-opacity hover:opacity-100";

  const renderLink = (link: FrontNavLink, className: string, onNavigate?: () => void) =>
    link.href.startsWith("#") ? (
      <a
        key={link.href}
        href={link.href}
        onClick={(event) => {
          glideToAnchor(event, link.href);
          onNavigate?.();
        }}
        className={className}
      >
        {link.label}
      </a>
    ) : (
      <Link
        key={link.href}
        href={link.href}
        onClick={onNavigate}
        aria-current={link.active ? "page" : undefined}
        className={className}
      >
        {link.label}
        {link.active ? (
          // Le point glisse d'un lien à l'autre quand on change de page.
          <motion.span
            layoutId="front-nav-active"
            aria-hidden
            className="absolute -bottom-2.5 left-1/2 hidden size-1 -translate-x-1/2 rounded-full bg-current md:block"
            transition={{ duration: 0.5, ease: EASE }}
          />
        ) : null}
      </Link>
    );

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-[background-color,color,box-shadow] duration-300",
        solid ? "bg-background/80 text-foreground shadow-[0_1px_0_0_var(--border)] backdrop-blur-xl" : "text-white",
      )}
    >
      <div className={cn(FRONT_WIDE, "flex h-[72px] items-center gap-8")}>
        <Link href={brand.href} className="flex shrink-0 items-center gap-3">
          {/* Le pictogramme seul, en grand : ni carré ni cercle derrière lui. */}
          <Image src={brand.logo} alt="" width={40} height={40} className="size-10" priority />
          <span className="text-lg font-semibold tracking-tight">{brand.name}</span>
        </Link>

        <nav aria-label="Navigation principale" className="hidden items-center gap-7 md:flex">
          {links.map((link) => renderLink(link, cn(linkClass, link.active ? "opacity-100" : "opacity-75")))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {secondary ? (
            <Link
              href={secondary.href}
              className="mr-3 hidden text-sm font-medium opacity-75 transition-opacity hover:opacity-100 lg:block"
            >
              {secondary.label}
            </Link>
          ) : null}
          <ThemeToggle className={cn(!solid && "text-white hover:bg-white/15 hover:text-white")} />
          <Link
            href={action.href}
            className={cn(
              "hidden h-10 items-center rounded-full px-5 text-sm font-semibold transition focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none sm:inline-flex",
              solid ? "bg-foreground text-background hover:opacity-90" : "bg-white text-[#08150e] hover:bg-white/90",
            )}
          >
            {action.label}
          </Link>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}
            className={cn(
              "inline-flex size-10 items-center justify-center rounded-full transition-colors md:hidden",
              solid ? "hover:bg-foreground/10" : "hover:bg-white/15",
            )}
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {/* Menu mobile : il se déplie sous la barre, au lieu d'apparaître d'un coup. */}
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="menu"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: EASE }}
            className="overflow-hidden md:hidden"
          >
            <nav aria-label="Navigation principale" className={cn(FRONT_WIDE, "flex flex-col gap-1 pb-6")}>
              {links.map((link) =>
                renderLink(
                  link,
                  cn("py-3 text-lg font-medium", link.active ? "text-foreground" : "text-muted-foreground"),
                  () => setOpen(false),
                ),
              )}
              {secondary ? (
                <Link
                  href={secondary.href}
                  onClick={() => setOpen(false)}
                  className="py-3 text-lg font-medium text-muted-foreground"
                >
                  {secondary.label}
                </Link>
              ) : null}
              <Link
                href={action.href}
                onClick={() => setOpen(false)}
                className="mt-3 inline-flex h-12 items-center justify-center rounded-full bg-foreground px-6 text-sm font-semibold text-background"
              >
                {action.label}
              </Link>
            </nav>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </header>
  );
}
