import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { HOME_CONTAINER, HOME_SECTION_PADDING } from "@/components/home/container";
import { cn } from "@/lib/utils";

interface TeaserService {
  name: string;
  tagline: string;
  logo: string;
  /** Classes d'accent écrites en toutes lettres pour que Tailwind les génère. */
  glow: string;
}

interface ToolsTeaserProps {
  kicker: string;
  title: string;
  description: string;
  cta: { label: string; href: string };
  services: TeaserService[];
  className?: string;
}

/**
 * Renvoi vers la page des services annexes.
 *
 * Les cartes mènent toutes à `/tools` plutôt qu'aux services directement : la
 * page passerelle présente chacun d'eux avec sa capture et son contenu, ce
 * qu'une ligne sur l'accueil ne peut pas faire.
 */
export function ToolsTeaser({
  kicker,
  title,
  description,
  cta,
  services,
  className,
}: ToolsTeaserProps) {
  return (
    <section className={cn("border-t border-border/60", className)}>
      <div
        className={cn(
          HOME_CONTAINER,
          HOME_SECTION_PADDING,
          "grid items-center gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-20",
        )}
      >
        <div className="min-w-0">
          <p className="text-xs font-bold tracking-[0.14em] text-primary uppercase">
            {kicker}
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tighter text-balance sm:text-4xl">
            {title}
          </h2>
          <p className="mt-5 max-w-[50ch] text-pretty text-muted-foreground sm:text-lg">
            {description}
          </p>

          <Link
            href={cta.href}
            className="group mt-9 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition hover:bg-primary/90 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            {cta.label}
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>

        <div className="grid min-w-0 gap-4">
          {services.map((service) => (
            <Link
              key={service.name}
              href={cta.href}
              className="group relative flex items-center gap-5 overflow-hidden rounded-2xl border border-border/70 bg-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none sm:p-6"
            >
              <span
                aria-hidden
                className={cn(
                  "pointer-events-none absolute -top-16 -right-10 size-40 rounded-full opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-100",
                  service.glow,
                )}
              />
              <Image
                src={service.logo}
                alt=""
                width={56}
                height={56}
                className="relative size-14 shrink-0 rounded-xl border border-border/60 bg-background/60 object-contain p-2 shadow-sm"
              />
              <div className="relative min-w-0 flex-1">
                <h3 className="text-lg font-semibold tracking-tight">
                  {service.name}
                </h3>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {service.tagline}
                </p>
              </div>
              <ArrowRight className="relative size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-foreground" />
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
