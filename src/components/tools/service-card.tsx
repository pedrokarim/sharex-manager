import Image from "next/image";
import { ArrowUpRight } from "lucide-react";

import { DISPLAY } from "@/components/front/fonts";
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
    button: string;
  };
  className?: string;
}

/**
 * Tuile d'un service externe, sans contour : un fond teinté suffit à la poser.
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
        "group relative isolate flex flex-col overflow-hidden rounded-[28px] bg-foreground/[0.045] transition-transform duration-500",
        "hover:-translate-y-1 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
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

      <div className="relative overflow-hidden">
        <Image
          src={preview.src}
          alt={preview.alt}
          width={1600}
          height={720}
          sizes="(min-width: 1024px) 50vw, 100vw"
          className="aspect-[16/8] w-full object-cover object-top transition-transform duration-500 group-hover:scale-[1.03]"
        />
      </div>

      <div className="relative flex flex-1 flex-col p-6 sm:p-7">
        <div className="flex items-start gap-4">
          <Image
            src={logo.src}
            alt={logo.alt}
            width={52}
            height={52}
            className="size-13 shrink-0 object-contain"
          />
          <div className="min-w-0">
            <h2 className={cn(DISPLAY, "text-3xl")}>{name}</h2>
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
              className="rounded-full bg-foreground/[0.06] px-3 py-1 text-xs font-medium text-muted-foreground"
            >
              {highlight}
            </li>
          ))}
        </ul>

        <div className="mt-auto flex items-center justify-between gap-4 pt-7">
          <span
            className={cn(
              "inline-flex h-11 items-center gap-2 rounded-full px-5 text-sm font-semibold text-white transition-transform group-hover:scale-[1.02]",
              accent.button,
            )}
          >
            {`Ouvrir ${name}`}
            <ArrowUpRight className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </span>
          <span className="truncate text-sm text-muted-foreground">
            {domain}
          </span>
        </div>
      </div>
    </a>
  );
}
