import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";

import { cn } from "@/lib/utils";

interface FeatureSplitProps {
  kicker: string;
  title: string;
  description: string;
  bullets: string[];
  image: { src: string; alt: string; width: number; height: number };
  cta?: { label: string; href: string };
  /** Inverse l'ordre : visuel à gauche, texte à droite. */
  reversed?: boolean;
  className?: string;
}

/**
 * Bloc « un argument, une capture ». Alterné d'une section à l'autre pour
 * casser le rythme centré de l'ancienne page d'accueil.
 *
 * La capture n'est pas encadrée : pas de bordure, pas de fausse barre de
 * navigateur. Elle déborde légèrement vers le bord de page, ce qui la fait
 * respirer au lieu de la poser dans une boîte de plus.
 */
export function FeatureSplit({
  kicker,
  title,
  description,
  bullets,
  image,
  cta,
  reversed = false,
  className,
}: FeatureSplitProps) {
  return (
    <section className={cn("overflow-hidden border-t border-border/60", className)}>
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-20 lg:py-28">
        <div className={cn("min-w-0", reversed && "lg:order-2")}>
          <p className="text-xs font-bold tracking-[0.14em] text-primary uppercase">
            {kicker}
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tighter text-balance sm:text-4xl">
            {title}
          </h2>
          <p className="mt-5 max-w-[50ch] text-pretty text-muted-foreground sm:text-lg">
            {description}
          </p>

          <ul className="mt-8 grid gap-3.5">
            {bullets.map((bullet) => (
              <li key={bullet} className="flex items-start gap-3 sm:text-lg">
                <Check className="mt-1.5 size-4 shrink-0 text-primary" />
                <span>{bullet}</span>
              </li>
            ))}
          </ul>

          {cta ? (
            <Link
              href={cta.href}
              className="group mt-9 inline-flex items-center gap-2 font-semibold text-primary"
            >
              {cta.label}
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          ) : null}
        </div>

        <div
          className={cn(
            "min-w-0",
            reversed ? "lg:order-1 lg:-ml-20" : "lg:-mr-20",
          )}
        >
          <Image
            src={image.src}
            alt={image.alt}
            width={image.width}
            height={image.height}
            sizes="(min-width: 1024px) 56vw, 100vw"
            className="w-full rounded-2xl shadow-2xl shadow-black/15 dark:shadow-black/50"
          />
        </div>
      </div>
    </section>
  );
}
