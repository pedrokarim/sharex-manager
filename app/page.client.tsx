"use client";

import { CatalogAccessButton } from "@/components/catalog/catalog-access-button";
import { FeatureSplit } from "@/components/home/feature-split";
import { HeroProduct } from "@/components/home/hero-product";
import { ImageWall } from "@/components/home/image-wall";
import { SetupSection, type SetupStep } from "@/components/home/setup-section";
import { Footer } from "@/components/layout/footer";
import { useSession } from "@/lib/auth-client";
import { useTranslation } from "@/lib/i18n";

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

  return (
    <div className="relative flex min-h-screen flex-col">
      <CatalogAccessButton />

      <main className="flex-1">
        <HeroProduct
          title={t("home.landing.hero.title")}
          titleAccent={t("home.landing.hero.title_accent")}
          subtitle={t("home.landing.hero.subtitle")}
          compatibility={t("home.landing.hero.compatibility")}
          primaryCta={{
            label: t("home.landing.hero.cta_primary"),
            href: "/catalog",
          }}
          secondaryCta={{
            label: isAuthenticated
              ? t("home.cta.gallery")
              : t("home.landing.hero.cta_secondary"),
            href: isAuthenticated ? "/gallery" : "/login",
          }}
          stats={showcase.imagesTotal > 0 ? stats : []}
          screenshot={{
            src: "/images/home/app-gallery.jpg",
            alt: t("home.landing.hero.screenshot_alt"),
            width: 1600,
            height: 900,
          }}
        />

        <FeatureSplit
          kicker={t("home.landing.flow.kicker")}
          title={t("home.landing.flow.title")}
          description={t("home.landing.flow.description")}
          bullets={asList("home.landing.flow.bullets")}
          image={{
            src: "/images/home/app-history.jpg",
            alt: t("home.landing.flow.image_alt"),
            width: 1600,
            height: 900,
          }}
        />

        <FeatureSplit
          reversed
          className="bg-muted/40"
          kicker={t("home.landing.catalog.kicker")}
          title={t("home.landing.catalog.title")}
          description={t("home.landing.catalog.description")}
          bullets={asList("home.landing.catalog.bullets")}
          cta={{
            label: t("home.landing.catalog.cta"),
            href: "/catalog",
          }}
          image={{
            src: "/images/home/catalog.jpg",
            alt: t("home.landing.catalog.image_alt"),
            width: 1600,
            height: 900,
          }}
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
        <ImageWall
          images={showcase.wallImages}
          kicker={t("home.landing.wall.kicker")}
          title={t("home.landing.wall.title", {
            count: formatCount(showcase.imagesTotal),
          })}
          cta={{
            label: t("home.landing.wall.cta"),
            href: "/catalog/gallery",
          }}
        />

      </main>

      <Footer />
    </div>
  );
}
