"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export interface HeroStat {
  value: string;
  label: string;
}

interface HeroProductProps {
  title: string;
  /** Seconde partie du titre, mise en avant. */
  titleAccent: string;
  subtitle: string;
  /** Ligne de compatibilité, en texte simple sous les boutons. */
  compatibility: string;
  primaryCta: { label: string; href: string };
  secondaryCta?: { label: string; href: string };
  stats: HeroStat[];
  screenshot: { src: string; alt: string; width: number; height: number };
}

/**
 * Héros de la page d'accueil : l'argument à gauche, l'application à droite.
 *
 * Rendu en dur, sans apparition au scroll : c'est le premier écran, il doit
 * exister même sans JavaScript.
 */
export function HeroProduct({
  title,
  titleAccent,
  subtitle,
  compatibility,
  primaryCta,
  secondaryCta,
  stats,
  screenshot,
}: HeroProductProps) {
  return (
    <section className="relative overflow-hidden">
      {/* Halo de marque, sous le texte, décalé vers la gauche pour ne pas
          concurrencer la capture. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-1/3 -left-1/4 h-[620px] w-[70%] rounded-full bg-primary/15 blur-3xl"
      />

      <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-16 lg:py-28">
        <div className="min-w-0">
          <h1 className="text-4xl leading-[1.02] font-bold tracking-tighter text-balance sm:text-5xl lg:text-6xl">
            {title}
            <br />
            <span className="bg-gradient-to-r from-primary to-primary/55 bg-clip-text text-transparent">
              {titleAccent}
            </span>
          </h1>

          <p className="mt-6 max-w-[46ch] text-pretty text-muted-foreground sm:text-lg">
            {subtitle}
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href={primaryCta.href}
              className="group inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition hover:bg-primary/90 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              {primaryCta.label}
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>

            {secondaryCta ? (
              <Link
                href={secondaryCta.href}
                className="inline-flex items-center rounded-xl border border-border bg-card px-5 py-3 text-sm font-semibold transition hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                {secondaryCta.label}
              </Link>
            ) : null}
          </div>

          <p className="mt-6 text-sm font-medium text-muted-foreground">
            {compatibility}
          </p>

          {stats.length > 0 ? (
            <dl className="mt-10 flex flex-wrap gap-x-12 gap-y-6 border-t border-border/70 pt-7">
              {stats.map((stat) => (
                <div key={stat.label}>
                  <dt className="text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                    {stat.label}
                  </dt>
                  <dd className="mt-1.5 text-2xl font-bold tracking-tight tabular-nums">
                    {stat.value}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>

        {/* Capture posée librement : ni bordure ni fausse barre de navigateur.
            Elle déborde vers le bord de page et penche légèrement, pour se lire
            comme un objet dans la page plutôt que comme une vignette encadrée. */}
        <div className="min-w-0 [perspective:1800px] lg:-mr-32 xl:-mr-44">
          <Image
            src={screenshot.src}
            alt={screenshot.alt}
            width={screenshot.width}
            height={screenshot.height}
            sizes="(min-width: 1024px) 62vw, 100vw"
            priority
            className="w-full rounded-2xl shadow-2xl shadow-black/20 lg:origin-left lg:[transform:rotateX(2deg)_rotateY(-9deg)] dark:shadow-black/60"
          />
        </div>
      </div>
    </section>
  );
}
