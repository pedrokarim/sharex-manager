import Image from "next/image";
import { ArrowUpRight } from "lucide-react";

import { cn } from "@/lib/utils";

export interface ServiceHighlight {
  label: string;
}

interface ServiceCardProps {
  name: string;
  tagline: string;
  description: string;
  /** Ce que le service contient, en pastilles. */
  highlights: string[];
  href: string;
  /** Domaine affiché sous le bouton, sans le protocole. */
  domain: string;
  logo: { src: string; alt: string };
  preview: { src: string; alt: string };
  /** Couleur d'accent du service, en classes Tailwind explicites. */
  accent: {
    glow: string;
    border: string;
    button: string;
  };
  className?: string;
}

/**
 * Carte d'un service externe.
 *
 * La capture du site occupe la moitié haute : c'est elle qui donne envie de
 * cliquer, bien plus qu'une icône et trois lignes de texte. Elle se rapproche
 * au survol pour signaler que la carte entière est cliquable.
 */
export function ServiceCard({
  name,
  tagline,
  description,
  highlights,
  href,
  domain,
  logo,
  preview,
  accent,
  className,
}: ServiceCardProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-3xl border border-border/70 bg-card shadow-xl transition-all duration-300",
        "hover:-translate-y-1 hover:shadow-2xl focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
        accent.border,
        className,
      )}
    >
      {/* Halo de la couleur du service, révélé au survol. */}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute -top-32 -right-24 size-72 rounded-full opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-100",
          accent.glow,
        )}
      />

      <div className="relative overflow-hidden border-b border-border/60">
        <Image
          src={preview.src}
          alt={preview.alt}
          width={1600}
          height={720}
          sizes="(min-width: 1024px) 50vw, 100vw"
          className="aspect-[16/8] w-full object-cover object-top transition-transform duration-500 group-hover:scale-[1.03]"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-card to-transparent"
        />
      </div>

      <div className="relative flex flex-1 flex-col p-6 sm:p-7">
        <div className="flex items-start gap-4">
          <Image
            src={logo.src}
            alt={logo.alt}
            width={52}
            height={52}
            className="size-13 shrink-0 rounded-xl border border-border/60 bg-background/60 object-contain p-1.5 shadow-sm"
          />
          <div className="min-w-0">
            <h2 className="text-xl font-bold tracking-tight">{name}</h2>
            <p className="mt-0.5 text-sm font-medium text-muted-foreground">
              {tagline}
            </p>
          </div>
        </div>

        <p className="mt-5 text-pretty text-muted-foreground">{description}</p>

        <ul className="mt-5 flex flex-wrap gap-2">
          {highlights.map((highlight) => (
            <li
              key={highlight}
              className="rounded-lg border border-border/60 bg-muted/60 px-2.5 py-1 text-xs font-medium text-muted-foreground"
            >
              {highlight}
            </li>
          ))}
        </ul>

        <div className="mt-auto flex items-center justify-between gap-4 pt-7">
          <span
            className={cn(
              "inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition-transform group-hover:scale-[1.02]",
              accent.button,
            )}
          >
            {`Ouvrir ${name}`}
            <ArrowUpRight className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </span>
          <span className="truncate font-mono text-xs text-muted-foreground">
            {domain}
          </span>
        </div>
      </div>
    </a>
  );
}
