"use client";

import Link from "next/link";
import { ArrowLeft, Boxes, Wrench } from "lucide-react";

import { ServiceCard } from "@/components/tools/service-card";
import { useTranslation } from "@/lib/i18n";

/**
 * Services annexes présentés sur la page.
 *
 * Les couleurs sont écrites en toutes lettres : Tailwind scanne les sources,
 * une classe assemblée dynamiquement ne serait pas générée.
 */
const SERVICES = [
  {
    key: "just_tools",
    name: "Just Tools",
    href: "https://just-tools.ascencia.re",
    domain: "just-tools.ascencia.re",
    logo: "/images/tools/just-tools-logo.png",
    preview: "/images/tools/just-tools.jpg",
    accent: {
      glow: "bg-indigo-500/30",
      border: "hover:border-indigo-500/50",
      button: "bg-indigo-600 shadow-indigo-600/30 hover:bg-indigo-600/90",
    },
  },
  {
    key: "mcinfo",
    name: "MCInfo",
    href: "https://mcinfo.ascencia.re",
    domain: "mcinfo.ascencia.re",
    logo: "/images/tools/mcinfo-logo.png",
    preview: "/images/tools/mcinfo.jpg",
    accent: {
      glow: "bg-amber-500/30",
      border: "hover:border-amber-500/50",
      button: "bg-amber-600 shadow-amber-600/30 hover:bg-amber-600/90",
    },
  },
] as const;

export function ToolsPageClient() {
  const { t } = useTranslation();

  const asList = (key: string): string[] => {
    const value = t(key);
    return Array.isArray(value) ? value : [];
  };

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Halo de fond, sous le titre. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl"
      />

      <div className="relative mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <Link
          href="/"
          className="group mb-10 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5" />
          {t("tools.hub.back")}
        </Link>

        <header className="max-w-2xl">
          <p className="flex items-center gap-2 text-xs font-bold tracking-[0.14em] text-primary uppercase">
            <Wrench className="size-3.5" />
            {t("tools.hub.kicker")}
          </p>
          <h1 className="mt-4 text-3xl font-bold tracking-tighter text-balance sm:text-4xl lg:text-5xl">
            {t("tools.hub.title")}
          </h1>
          <p className="mt-5 text-pretty text-muted-foreground sm:text-lg">
            {t("tools.hub.subtitle")}
          </p>
        </header>

        <div className="mt-12 grid gap-6 lg:mt-16 lg:grid-cols-2 lg:gap-8">
          {SERVICES.map((service) => (
            <ServiceCard
              key={service.key}
              name={service.name}
              tagline={t(`tools.hub.services.${service.key}.tagline`)}
              description={t(`tools.hub.services.${service.key}.description`)}
              highlights={asList(`tools.hub.services.${service.key}.highlights`)}
              href={service.href}
              domain={service.domain}
              logo={{
                src: service.logo,
                alt: `Logo ${service.name}`,
              }}
              preview={{
                src: service.preview,
                alt: t(`tools.hub.services.${service.key}.preview_alt`),
              }}
              accent={service.accent}
            />
          ))}
        </div>

        <footer className="mt-14 flex items-start gap-3 rounded-2xl border border-border/70 bg-muted/40 p-5 text-sm text-muted-foreground">
          <Boxes className="mt-0.5 size-4 shrink-0 text-primary" />
          <p className="text-pretty">{t("tools.hub.note")}</p>
        </footer>
      </div>
    </div>
  );
}
