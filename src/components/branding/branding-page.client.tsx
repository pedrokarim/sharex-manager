"use client";

import { useTranslation } from "@/lib/i18n";
import { LogoSection } from "@/components/branding/logo-section";
import { ColorPalette } from "@/components/branding/color-palette";
import { TypographySection } from "@/components/branding/typography-section";
import { ComponentsShowcase } from "@/components/branding/components-showcase";
import { DownloadAssets } from "@/components/branding/download-assets";
import { PhotoHeader } from "@/components/front/photo-header";

export const BrandingPageClient = () => {
  const { t } = useTranslation();

  return (
    <div className="relative pb-16">
      <PhotoHeader
        photo="pines"
        kicker={t("branding.title")}
        title={t("branding.hero.title")}
        description={t("branding.subtitle")}
      />

      <LogoSection
        title={t("branding.logo.title")}
        description={t("branding.logo.description")}
        simplifiedLabel={t("branding.logo.simplified")}
        svgLabel={t("branding.logo.svg")}
        downloadLabel={t("branding.logo.download")}
      />

      <ColorPalette
        title={t("branding.colors.title")}
        description={t("branding.colors.description")}
        groupMain={t("branding.colors.groups.main")}
        groupBackground={t("branding.colors.groups.background")}
        groupText={t("branding.colors.groups.text")}
        groupUi={t("branding.colors.groups.ui")}
      />

      <TypographySection
        title={t("branding.typography.title")}
        description={t("branding.typography.description")}
      />

      <ComponentsShowcase
        title={t("branding.components.title")}
        description={t("branding.components.description")}
      />

      <DownloadAssets
        title={t("branding.assets.title")}
        description={t("branding.assets.description")}
        downloadKitLabel={t("branding.assets.download_kit")}
        downloadLogoSimplePngLabel={t("branding.assets.download_logo_simple_png")}
        downloadLogoSvgLabel={t("branding.assets.download_logo_svg")}
      />
    </div>
  );
};

