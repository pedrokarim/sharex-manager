"use client";

import { BadgeCheck, Clapperboard, FolderOpen, Images, Link2, ScanSearch, Sparkles } from "lucide-react";

import { frontDisplay } from "@/components/front/fonts";
import { FrontNav } from "@/components/front/front-nav";
import { NatureHero } from "@/components/home/nature-hero";
import { CatalogBand, ClosingBand, FlowSection, ModuleMosaic, ToolsList } from "@/components/home/sections";
import { SetupSection, type SetupStep } from "@/components/home/setup-section";
import { Footer } from "@/components/layout/footer";
import { useSession } from "@/lib/auth-client";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";
// Les logos sont rangés avec leurs modules : la page d'accueil va les y chercher.
import studioLogo from "@/modules/ai-image-gen/branding/logo.png";
import clipLogo from "@/modules/clip-studio/branding/logo.png";
import searchLogo from "@/modules/reverse-search/branding/logo.png";

export interface HomeShowcase {
  /** Vignettes du mur de bas de page. */
  wallImages: string[];
  imagesTotal: number;
  albumsTotal: number;
  bytesTotal: number;
}

interface HomePageClientProps {
  showcase: HomeShowcase;
  apiBaseUrl: string;
}

const formatCount = (value: number) =>
  new Intl.NumberFormat("fr-FR").format(value);

const formatBytes = (bytes: number) => {
  if (bytes <= 0) return "0 Mo";
  const units = ["o", "Ko", "Mo", "Go", "To"];
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** exponent;
  return `${new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: value >= 100 || exponent < 2 ? 0 : 1,
  }).format(value)} ${units[exponent]}`;
};

export function HomePageClient({ showcase, apiBaseUrl }: HomePageClientProps) {
  const { data: session } = useSession();
  const { t } = useTranslation();

  const isAuthenticated = Boolean(session?.user);

  const stats = [
    {
      value: formatCount(showcase.imagesTotal),
      label: t("home.landing.hero.stat_images"),
    },
    {
      value: formatBytes(showcase.bytesTotal),
      label: t("home.landing.hero.stat_storage"),
    },
    {
      value: formatCount(showcase.albumsTotal),
      label: t("home.landing.hero.stat_albums"),
    },
  ];

  // `t()` renvoie la valeur brute pour les tableaux : on garde un repli vide si
  // une clé venait à manquer dans une locale.
  const asList = (key: string): string[] => {
    const value = t(key);
    return Array.isArray(value) ? value : [];
  };

  const rawSteps = t("home.landing.setup.steps");
  const steps: SetupStep[] = Array.isArray(rawSteps) ? rawSteps : [];

  const sessionCta = {
    label: isAuthenticated ? t("home.cta.gallery") : t("home.landing.hero.cta_secondary"),
    href: isAuthenticated ? "/gallery" : "/login",
  };
  const flowIcons = [Link2, Images, FolderOpen];

  return (
    <div className={cn(frontDisplay.variable, "relative flex min-h-screen flex-col")}>
      {/* Les apparitions partent d'un état invisible : sans JavaScript, on l'annule. */}
      <noscript>
        <style>{"[data-reveal]{opacity:1!important;transform:none!important}"}</style>
      </noscript>
      <FrontNav
        brand={{ href: "/", logo: "/images/logo-sxm-simple.png", name: "ShareX Manager" }}
        links={[
          { label: t("home.landing.nav.modules"), href: "#modules" },
          { label: t("home.landing.nav.catalog"), href: "/catalog" },
          { label: t("home.landing.nav.tools"), href: "/tools" },
          { label: t("home.landing.nav.setup"), href: "#demarrer" },
        ]}
        action={sessionCta}
      />

      <main className="flex-1">
        <NatureHero
          title={t("home.landing.hero.title")}
          titleAccent={t("home.landing.hero.title_accent")}
          subtitle={t("home.landing.hero.subtitle")}
          worksWith={t("home.landing.hero.works_with")}
          clients={[
            { name: "ShareX", logo: "sharex" },
            { name: "Flameshot", logo: "flameshot" },
            { name: "Android", logo: "android" },
          ]}
          promises={asList("home.landing.hero.promises")}
          primaryCta={{ label: t("home.landing.hero.cta_primary"), href: "/catalog" }}
          secondaryCta={sessionCta}
          stats={showcase.imagesTotal > 0 ? stats : []}
          screenshot={{
            src: "/images/home/app-gallery-v2.jpg",
            alt: t("home.landing.hero.screenshot_alt"),
            width: 2400,
            height: 1350,
          }}
        />

        <FlowSection
          kicker={t("home.landing.flow.kicker")}
          title={t("home.landing.flow.title")}
          description={t("home.landing.flow.description")}
          points={asList("home.landing.flow.bullets").map((text, index) => ({
            icon: flowIcons[index % flowIcons.length],
            text,
          }))}
          image={{
            src: "/images/home/app-history-v2.jpg",
            alt: t("home.landing.flow.image_alt"),
            width: 2400,
            height: 1350,
          }}
        />

        <CatalogBand
          kicker={t("home.landing.catalog.kicker")}
          title={t("home.landing.catalog.title")}
          description={t("home.landing.catalog.description")}
          bullets={asList("home.landing.catalog.bullets")}
          cta={{ label: t("home.landing.catalog.cta"), href: "/catalog" }}
          image={{
            src: "/images/home/catalog-v2.jpg",
            alt: t("home.landing.catalog.image_alt"),
            width: 2400,
            height: 1350,
          }}
        />

        <ModuleMosaic
          id="modules"
          kicker={t("home.landing.modules.kicker")}
          title={t("home.landing.modules.title")}
          description={t("home.landing.modules.description")}
          modules={[
            { icon: Sparkles, logo: studioLogo, key: "ai" },
            { icon: Clapperboard, logo: clipLogo, key: "clip" },
            { icon: ScanSearch, logo: searchLogo, key: "reverse" },
            { icon: BadgeCheck, key: "origin", href: "/tools/origine-image" },
          ].map(({ icon, logo, key, href }) => ({
            icon,
            logo,
            name: t(`home.landing.modules.items.${key}.name`),
            description: t(`home.landing.modules.items.${key}.description`),
            points: asList(`home.landing.modules.items.${key}.points`),
            link: href ? { label: t("home.landing.modules.try"), href } : undefined,
          }))}
        />

        <ToolsList
          id="outils"
          kicker={t("home.landing.tools.kicker")}
          title={t("home.landing.tools.title")}
          description={t("home.landing.tools.description")}
          tools={[
            {
              name: t("tools.hub.origin.name"),
              tagline: t("home.landing.tools.origin_tagline"),
              icon: ScanSearch,
              badge: t("tools.hub.local_title"),
              href: "/tools/origine-image",
            },
            {
              name: "Just Tools",
              tagline: t("tools.hub.services.just_tools.tagline"),
              logo: "/images/tools/just-tools-logo.png",
              href: "/tools",
            },
            {
              name: "MCInfo",
              tagline: t("tools.hub.services.mcinfo.tagline"),
              logo: "/images/tools/mcinfo-logo.png",
              href: "/tools",
            },
          ]}
        />

        <SetupSection
          kicker={t("home.landing.setup.kicker")}
          title={t("home.landing.setup.title")}
          subtitle={t("home.landing.setup.subtitle")}
          steps={steps}
          apiBaseUrl={apiBaseUrl}
          windowTitle={t("home.landing.setup.window_title")}
          tabSharexLabel={t("home.new.code_tab_sharex")}
          tabCurlLabel={t("home.new.code_tab_curl")}
          copySharexAriaLabel={t("home.new.code_copy_sharex")}
          copyCurlAriaLabel={t("home.new.code_copy_curl")}
        />

        <ClosingBand
          images={showcase.wallImages}
          kicker={t("home.landing.wall.kicker")}
          title={t("home.landing.wall.title", { count: formatCount(showcase.imagesTotal) })}
          primaryCta={{ label: t("home.landing.wall.cta"), href: "/catalog/gallery" }}
          secondaryCta={sessionCta}
        />
      </main>

      <Footer />
    </div>
  );
}
