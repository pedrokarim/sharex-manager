"use client";

import Link from "next/link";
import { ArrowRight, ScanSearch } from "lucide-react";

import { FRONT_CONTAINER, FRONT_NARROW, FRONT_WIDE } from "@/components/front/container";
import { DISPLAY } from "@/components/front/fonts";
import { PhotoHeader } from "@/components/front/photo-header";
import { Reveal } from "@/components/front/reveal";
import { ACCENT, KICKER } from "@/components/front/styles";
import { ServiceCard } from "@/components/tools/service-card";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";

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
      button: "bg-indigo-600 hover:bg-indigo-600/90",
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
      button: "bg-amber-600 hover:bg-amber-600/90",
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
    <>
      <PhotoHeader
        photo="path"
        kicker={t("tools.hub.kicker")}
        title={t("tools.hub.title")}
        description={t("tools.hub.subtitle")}
      />

      {/* L'outil hébergé ici même, sans compte : une ligne, pas un encadré. */}
      <section className={cn(FRONT_NARROW, "pt-6")}>
        <Reveal>
          <p className={cn(KICKER, ACCENT)}>{t("tools.hub.local_title")}</p>
          <Link href="/tools/origine-image" className="group mt-4 flex items-center gap-5 border-y border-border/70 py-6">
            <ScanSearch className={cn("size-11 shrink-0 p-1.5", ACCENT)} strokeWidth={1.5} />
            <span className="min-w-0 flex-1">
              <span className={cn(DISPLAY, "block text-2xl sm:text-3xl")}>{t("tools.hub.origin.name")}</span>
              <span className="mt-1.5 block text-sm text-pretty text-muted-foreground sm:text-base">
                {t("tools.hub.origin.description")}
              </span>
            </span>
            <ArrowRight className="size-5 shrink-0 text-muted-foreground transition-all group-hover:translate-x-0.5 group-hover:text-foreground" />
          </Link>
        </Reveal>
      </section>

      <section className="pt-24 pb-24 sm:pt-28 sm:pb-32">
        <Reveal className={cn(FRONT_CONTAINER, "text-center")}>
          <p className={cn(KICKER, ACCENT)}>{t("tools.hub.external_title")}</p>
        </Reveal>
        <div className={cn(FRONT_WIDE, "mt-8 grid gap-6 lg:grid-cols-2 lg:gap-8")}>
          {SERVICES.map((service, index) => (
            <Reveal key={service.key} delay={index * 0.1} className="flex">
              <ServiceCard
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
                className="w-full"
              />
            </Reveal>
          ))}
        </div>
        <p className={cn(FRONT_NARROW, "mt-12 text-center text-sm text-pretty text-muted-foreground")}>{t("tools.hub.note")}</p>
      </section>
    </>
  );
}
