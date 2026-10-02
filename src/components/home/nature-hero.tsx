import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { ClientLogo, type ClientLogoName } from "@/components/home/client-logos";
import { FOREST, FRONT_CONTAINER, FRONT_WIDE } from "@/components/front/container";
import { DISPLAY } from "@/components/front/fonts";
import { Reveal } from "@/components/front/reveal";
import { cn } from "@/lib/utils";

export interface HeroStat {
  value: string;
  label: string;
}

interface NatureHeroProps {
  title: string;
  /** Seconde partie du titre, en italique. */
  titleAccent: string;
  subtitle: string;
  /** « Fonctionne avec », devant les logos des clients d'envoi. */
  worksWith: string;
  clients: { name: string; logo: ClientLogoName }[];
  /** Engagements, dits en deux mots chacun. */
  promises: string[];
  primaryCta: { label: string; href: string };
  secondaryCta: { label: string; href: string };
  stats: HeroStat[];
  screenshot: { src: string; alt: string; width: number; height: number };
}

/**
 * Héros : une photo de forêt dans la brume, d'un bord à l'autre de l'écran.
 *
 * Trois voiles la travaillent. Un dégradé sombre en haut porte la barre de
 * navigation ; un halo radial assombrit le centre, derrière le titre ; un
 * long fondu en bas la dissout dans le fond de la page, pour qu'elle ne
 * s'arrête jamais sur une ligne. La capture de l'application est posée sur ce
 * fondu, à cheval entre la photo et la page.
 */
export function NatureHero({
  title,
  titleAccent,
  subtitle,
  worksWith,
  clients,
  promises,
  primaryCta,
  secondaryCta,
  stats,
  screenshot,
}: NatureHeroProps) {
  return (
    <section className="relative isolate overflow-hidden">
      <div aria-hidden className="absolute inset-x-0 top-0 -z-10 h-[min(1040px,100%)]">
        <Image src="/images/home/nature-mist.webp" alt="" fill priority sizes="100vw" className="object-cover object-[50%_35%]" />
        <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, ${FOREST}cc 0%, ${FOREST}40 22%, transparent 45%)` }} />
        <div
          className="absolute inset-0"
          style={{ background: `radial-gradient(ellipse 62% 46% at 50% 34%, ${FOREST}b3 0%, ${FOREST}59 45%, transparent 75%)` }}
        />
        <div className="absolute inset-x-0 bottom-0 h-[58%] bg-gradient-to-b from-transparent via-background/70 to-background" />
      </div>

      <div className={cn(FRONT_CONTAINER, "pt-40 text-center text-white sm:pt-48")}>
        {/* Le héros entre en cascade au chargement : titre, texte, boutons, puis la capture. */}
        <Reveal immediate>
          <h1 className={cn(DISPLAY, "text-5xl leading-[0.98] text-balance sm:text-7xl lg:text-[100px]")}>
            {title} <em className="text-[#bfe6c9]">{titleAccent}</em>
          </h1>
        </Reveal>
        <Reveal immediate delay={0.12}>
          <p className="mx-auto mt-7 max-w-[56ch] text-pretty text-white/80 sm:text-lg">{subtitle}</p>
        </Reveal>

        <Reveal immediate delay={0.22} className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Link
            href={primaryCta.href}
            className="group inline-flex h-12 items-center gap-2 rounded-full bg-white px-6 text-sm font-semibold text-[#08150e] transition hover:bg-white/90 focus-visible:ring-[3px] focus-visible:ring-white/50 focus-visible:outline-none"
          >
            {primaryCta.label}
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <Link
            href={secondaryCta.href}
            className="inline-flex h-12 items-center rounded-full bg-white/12 px-6 text-sm font-semibold text-white backdrop-blur-md transition hover:bg-white/20 focus-visible:ring-[3px] focus-visible:ring-white/50 focus-visible:outline-none"
          >
            {secondaryCta.label}
          </Link>
        </Reveal>

        {/* Avec quoi ça marche : les logos des clients, sur une ligne, sans
            étiquette ni pastille. Puis, après un filet, ce à quoi on s'engage. */}
        <Reveal immediate delay={0.32} y={16} className="mt-14 flex flex-wrap items-center justify-center gap-x-7 gap-y-3 text-sm text-white/65">
          <span>{worksWith}</span>
          {clients.map((client) => (
            <span key={client.name} className="flex items-center gap-2 font-medium text-white">
              <ClientLogo name={client.logo} />
              {client.name}
            </span>
          ))}
          <span aria-hidden className="hidden h-4 w-px bg-white/30 sm:block" />
          {promises.map((promise) => (
            <span key={promise}>{promise}</span>
          ))}
        </Reveal>
      </div>

      {/* La capture, plus large que le texte, sur le fondu de la photo. */}
      <Reveal immediate delay={0.4} y={70} className={cn(FRONT_WIDE, "mt-16 sm:mt-20")}>
        <Image
          src={screenshot.src}
          alt={screenshot.alt}
          width={screenshot.width}
          height={screenshot.height}
          sizes="(min-width: 1440px) 1376px, 100vw"
          priority
          className="w-full rounded-2xl shadow-[0_40px_120px_-30px_rgba(8,21,14,0.55)] sm:rounded-3xl"
        />
      </Reveal>

      {stats.length > 0 ? (
        <dl className={cn(FRONT_CONTAINER, "grid grid-cols-3 gap-6 py-16 text-center sm:py-20")}>
          {stats.map((stat, index) => (
            <Reveal key={stat.label} delay={index * 0.1}>
              <dd className={cn(DISPLAY, "text-4xl tabular-nums sm:text-6xl")}>{stat.value}</dd>
              <dt className="mt-2 text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase sm:text-sm">
                {stat.label}
              </dt>
            </Reveal>
          ))}
        </dl>
      ) : (
        <div className="h-16" />
      )}
    </section>
  );
}
