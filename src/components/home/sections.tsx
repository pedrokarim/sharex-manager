import Image, { type StaticImageData } from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, type LucideIcon } from "lucide-react";

import { FOREST, FRONT_CONTAINER, FRONT_NARROW, FRONT_WIDE } from "@/components/front/container";
import { DISPLAY } from "@/components/front/fonts";
import { Reveal } from "@/components/front/reveal";
import { cn } from "@/lib/utils";

const KICKER = "text-xs font-semibold tracking-[0.18em] uppercase";
const ACCENT = "text-emerald-700 dark:text-emerald-400";

interface Shot {
  src: string;
  alt: string;
  width: number;
  height: number;
}

// ─── Le flux : un texte étroit, puis une capture large ───────────

interface FlowSectionProps {
  kicker: string;
  title: string;
  description: string;
  points: { icon: LucideIcon; text: string }[];
  image: Shot;
}

/**
 * Le titre se lit dans une colonne étroite, centrée ; les trois arguments
 * s'étalent en dessous sans cadre ; la capture, elle, prend la colonne large,
 * posée sur un halo de couleur plutôt que dans une boîte.
 */
export function FlowSection({ kicker, title, description, points, image }: FlowSectionProps) {
  return (
    <section className="relative isolate overflow-hidden pb-24 sm:pb-32">
      <Reveal className={cn(FRONT_NARROW, "text-center")}>
        <p className={cn(KICKER, ACCENT)}>{kicker}</p>
        <h2 className={cn(DISPLAY, "mt-4 text-5xl leading-[1.02] text-balance sm:text-6xl")}>{title}</h2>
        <p className="mt-6 text-pretty text-muted-foreground sm:text-lg">{description}</p>
      </Reveal>

      <ul className={cn(FRONT_CONTAINER, "mt-14 grid gap-10 sm:grid-cols-3")}>
        {points.map((point, index) => (
          <Reveal as="li" key={point.text} delay={index * 0.1} className="flex flex-col items-center gap-4 text-center">
            <point.icon className={cn("size-6", ACCENT)} strokeWidth={1.75} />
            <p className="max-w-[26ch] text-pretty font-medium">{point.text}</p>
          </Reveal>
        ))}
      </ul>

      <Reveal y={56} className={cn(FRONT_WIDE, "relative mt-16")}>
        <div
          aria-hidden
          className="absolute inset-x-[8%] -top-10 -bottom-10 -z-10 rounded-[50%] opacity-70 blur-3xl"
          style={{ background: "radial-gradient(closest-side, rgba(52,140,88,0.35), transparent)" }}
        />
        <Image
          src={image.src}
          alt={image.alt}
          width={image.width}
          height={image.height}
          sizes="(min-width: 1440px) 1376px, 100vw"
          className="w-full rounded-2xl shadow-[0_30px_90px_-30px_rgba(8,21,14,0.45)] sm:rounded-3xl"
        />
      </Reveal>
    </section>
  );
}

// ─── Le catalogue : une bande photographique ─────────────────────

interface CatalogBandProps {
  kicker: string;
  title: string;
  description: string;
  bullets: string[];
  cta: { label: string; href: string };
  image: Shot;
}

/**
 * Bande d'un bord à l'autre de l'écran, sur un sous-bois. La photo est
 * assombrie à gauche, là où se lit le texte, et fondue dans la page en haut
 * et en bas.
 */
export function CatalogBand({ kicker, title, description, bullets, cta, image }: CatalogBandProps) {
  return (
    <section className="relative isolate overflow-hidden text-white">
      <div aria-hidden className="absolute inset-0 -z-10">
        <Image src="/images/home/nature-path.webp" alt="" fill sizes="100vw" className="object-cover" />
        <div className="absolute inset-0" style={{ background: `linear-gradient(100deg, ${FOREST}f2 0%, ${FOREST}cc 38%, ${FOREST}59 70%, ${FOREST}33 100%)` }} />
        <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-background to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-background to-transparent" />
      </div>

      <div className={cn(FRONT_WIDE, "grid items-center gap-12 py-36 lg:grid-cols-12 lg:gap-10 lg:py-48")}>
        <Reveal x={-36} y={0} className="lg:col-span-5">
          <p className={cn(KICKER, "text-[#bfe6c9]")}>{kicker}</p>
          <h2 className={cn(DISPLAY, "mt-4 text-5xl leading-[1.02] text-balance sm:text-6xl")}>{title}</h2>
          <p className="mt-6 max-w-[46ch] text-pretty text-white/75 sm:text-lg">{description}</p>
          <ul className="mt-8 space-y-3 text-white/90">
            {bullets.map((bullet) => (
              <li key={bullet} className="flex items-baseline gap-3">
                <span aria-hidden className="size-1.5 shrink-0 translate-y-[-2px] rounded-full bg-[#bfe6c9]" />
                {bullet}
              </li>
            ))}
          </ul>
          <Link
            href={cta.href}
            className="group mt-10 inline-flex h-12 items-center gap-2 rounded-full bg-white px-6 text-sm font-semibold text-[#08150e] transition hover:bg-white/90"
          >
            {cta.label}
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </Reveal>
        <Reveal x={36} y={0} delay={0.12} className="lg:col-span-7">
          <Image
            src={image.src}
            alt={image.alt}
            width={image.width}
            height={image.height}
            sizes="(min-width: 1024px) 58vw, 100vw"
            className="w-full rounded-2xl shadow-[0_40px_120px_-20px_rgba(0,0,0,0.7)] sm:rounded-3xl"
          />
        </Reveal>
      </div>
    </section>
  );
}

// ─── Les modules : une mosaïque de tuiles inégales ───────────────

export interface ModuleTile {
  icon: LucideIcon;
  /** Logo du module, lu dans son dossier `branding/` : il remplace l'icône. */
  logo?: StaticImageData;
  name: string;
  description: string;
  points: string[];
  link?: { label: string; href: string };
}

interface ModuleMosaicProps {
  id?: string;
  kicker: string;
  title: string;
  description: string;
  /** La première tuile est la grande. */
  modules: ModuleTile[];
}

/** Largeur de chaque tuile, sur six colonnes : une grande, une étroite, puis deux moyennes. */
const SPANS = ["lg:col-span-4", "lg:col-span-2", "lg:col-span-3", "lg:col-span-3"];

export function ModuleMosaic({ id, kicker, title, description, modules }: ModuleMosaicProps) {
  return (
    <section id={id} className="scroll-mt-24 py-24 sm:py-32">
      <Reveal className={cn(FRONT_CONTAINER, "grid gap-6 lg:grid-cols-2 lg:items-end")}>
        <div>
          <p className={cn(KICKER, ACCENT)}>{kicker}</p>
          <h2 className={cn(DISPLAY, "mt-4 text-5xl leading-[1.02] text-balance sm:text-6xl")}>{title}</h2>
        </div>
        <p className="text-pretty text-muted-foreground sm:text-lg lg:pb-2">{description}</p>
      </Reveal>

      <ul className={cn(FRONT_CONTAINER, "mt-14 grid gap-4 lg:grid-cols-6")}>
        {modules.map((module, index) => {
          const featured = index === 0;
          return (
            <Reveal
              as="li"
              key={module.name}
              delay={index * 0.08}
              className={cn("flex", SPANS[index % SPANS.length])}
            >
            <div
              className={cn(
                "relative isolate flex min-h-[280px] w-full flex-col overflow-hidden rounded-[28px] p-8",
                featured ? "text-white" : "bg-foreground/[0.045]",
              )}
              style={
                featured
                  ? { background: `radial-gradient(120% 140% at 100% 0%, #2f7d55 0%, #14402b 45%, ${FOREST} 100%)` }
                  : undefined
              }
            >
              {/* L'icône en grand, en filigrane dans le coin : la tuile n'a pas besoin de cadre. */}
              <module.icon
                aria-hidden
                strokeWidth={1}
                className={cn("absolute -right-6 -bottom-8 -z-10 size-48", featured ? "text-white/10" : "text-foreground/[0.05]")}
              />
              {module.logo ? (
                <Image src={module.logo} alt="" width={72} height={72} className="size-[72px]" />
              ) : (
                <module.icon className={cn("size-7", featured ? "text-[#bfe6c9]" : ACCENT)} strokeWidth={1.75} />
              )}
              <h3 className={cn(DISPLAY, "mt-6 text-3xl sm:text-4xl")}>{module.name}</h3>
              <p className={cn("mt-3 max-w-[44ch] text-pretty", featured ? "text-white/75" : "text-muted-foreground")}>
                {module.description}
              </p>
              <p className={cn("mt-auto pt-8 text-sm", featured ? "text-white/60" : "text-muted-foreground")}>
                {module.points.join("  ·  ")}
              </p>
              {module.link ? (
                <Link href={module.link.href} className={cn("group mt-4 inline-flex w-fit items-center gap-1.5 text-sm font-semibold", ACCENT)}>
                  {module.link.label}
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
              ) : null}
            </div>
            </Reveal>
          );
        })}
      </ul>
    </section>
  );
}

// ─── Les outils : une liste étroite ──────────────────────────────

export interface ToolRow {
  name: string;
  tagline: string;
  href: string;
  logo?: string;
  icon?: LucideIcon;
  badge?: string;
}

interface ToolsListProps {
  id?: string;
  kicker: string;
  title: string;
  description: string;
  tools: ToolRow[];
}

/** Trois lignes séparées par un simple filet : une liste, pas une rangée de cartes. */
export function ToolsList({ id, kicker, title, description, tools }: ToolsListProps) {
  return (
    <section id={id} className="scroll-mt-24 pb-24 sm:pb-32">
      <Reveal className={cn(FRONT_NARROW, "text-center")}>
        <p className={cn(KICKER, ACCENT)}>{kicker}</p>
        <h2 className={cn(DISPLAY, "mt-4 text-4xl leading-[1.05] text-balance sm:text-5xl")}>{title}</h2>
        <p className="mt-5 text-pretty text-muted-foreground">{description}</p>
      </Reveal>

      <ul className={cn(FRONT_NARROW, "mt-10")}>
        {tools.map((tool, index) => (
          <Reveal as="li" key={tool.name} delay={index * 0.08} y={18} className="border-b border-border/70 first:border-t">
            <Link href={tool.href} className="group flex items-center gap-5 py-6 transition-colors">
              {tool.logo ? (
                <Image src={tool.logo} alt="" width={44} height={44} className="size-11 shrink-0 object-contain" />
              ) : tool.icon ? (
                <tool.icon className={cn("size-11 shrink-0 p-1.5", ACCENT)} strokeWidth={1.5} />
              ) : null}
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2.5 text-lg font-semibold tracking-tight">
                  {tool.name}
                  {tool.badge ? <span className={cn("text-xs font-medium", ACCENT)}>{tool.badge}</span> : null}
                </span>
                <span className="mt-0.5 block text-sm text-muted-foreground">{tool.tagline}</span>
              </span>
              <ArrowUpRight className="size-5 shrink-0 text-muted-foreground transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-foreground" />
            </Link>
          </Reveal>
        ))}
      </ul>
    </section>
  );
}

// ─── La clôture : le mur d'images et l'invitation ────────────────

interface ClosingBandProps {
  /** Noms de fichiers publics, servis par /api/thumbnails. */
  images: string[];
  kicker: string;
  title: string;
  primaryCta: { label: string; href: string };
  secondaryCta: { label: string; href: string };
}

/**
 * Dernière image de la page : des sapins dans le brouillard, d'un bord à
 * l'autre. Les vignettes du catalogue passent devant, en une frise continue,
 * et la photo se dissout dans la page par le haut.
 */
export function ClosingBand({ images, kicker, title, primaryCta, secondaryCta }: ClosingBandProps) {
  const tiles = images.slice(0, 12);
  return (
    <section className="relative isolate overflow-hidden text-white">
      <div aria-hidden className="absolute inset-0 -z-10">
        <Image src="/images/home/nature-pines.webp" alt="" fill sizes="100vw" className="object-cover object-bottom" />
        <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse 70% 60% at 50% 55%, ${FOREST}a6 0%, ${FOREST}66 60%, ${FOREST}33 100%)` }} />
        <div className="absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-background to-transparent" />
      </div>

      <Reveal className={cn(FRONT_NARROW, "pt-44 text-center sm:pt-56")}>
        <p className={cn(KICKER, "text-[#bfe6c9]")}>{kicker}</p>
        <h2 className={cn(DISPLAY, "mt-4 text-5xl leading-[1.0] text-balance sm:text-7xl")}>{title}</h2>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Link
            href={primaryCta.href}
            className="group inline-flex h-12 items-center gap-2 rounded-full bg-white px-6 text-sm font-semibold text-[#08150e] transition hover:bg-white/90"
          >
            {primaryCta.label}
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <Link
            href={secondaryCta.href}
            className="inline-flex h-12 items-center rounded-full bg-white/12 px-6 text-sm font-semibold backdrop-blur-md transition hover:bg-white/20"
          >
            {secondaryCta.label}
          </Link>
        </div>
      </Reveal>

      {tiles.length >= 6 ? (
        <div aria-hidden className="mt-20 grid grid-cols-3 gap-1 pb-1 sm:grid-cols-6 lg:grid-cols-12">
          {tiles.map((name) => (
            // eslint-disable-next-line @next/next/no-img-element -- vignettes déjà redimensionnées par /api/thumbnails
            <img
              key={name}
              src={`/api/thumbnails/${encodeURIComponent(name)}`}
              alt=""
              loading="lazy"
              decoding="async"
              className="aspect-square w-full object-cover"
            />
          ))}
        </div>
      ) : (
        <div className="h-32" />
      )}
    </section>
  );
}
