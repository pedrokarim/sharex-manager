"use client";

import { motion } from "framer-motion";
import { useTranslation } from "@/lib/i18n";
import { LogoSection } from "@/components/branding/logo-section";
import { ColorPalette } from "@/components/branding/color-palette";
import { TypographySection } from "@/components/branding/typography-section";
import { ComponentsShowcase } from "@/components/branding/components-showcase";
import { DownloadAssets } from "@/components/branding/download-assets";
import { Badge } from "@/components/ui/badge";

export const BrandingPageClient = () => {
  const { t } = useTranslation();

  return (
    <div className="relative">
      <section className="relative overflow-hidden border-b">
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-gradient-to-b from-primary/10 via-background to-background" />
          <div className="absolute -top-24 left-1/3 h-72 w-72 rounded-full bg-primary/20 blur-3xl" />
          <div className="absolute -bottom-28 right-0 h-72 w-72 rounded-full bg-accent/25 blur-3xl" />
        </div>

        <div className="container relative mx-auto px-4 py-12 sm:py-16">
          <div className="mx-auto max-w-3xl text-center">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="mb-4 flex justify-center"
            >
              <Badge variant="secondary">{t("branding.title")}</Badge>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7 }}
              className="text-balance text-3xl font-bold tracking-tight sm:text-5xl"
            >
              {t("branding.hero.title")}
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.06 }}
              className="mx-auto mt-4 max-w-2xl text-pretty text-muted-foreground sm:text-xl"
            >
              {t("branding.subtitle")}
            </motion.p>
          </div>
        </div>
      </section>

      <LogoSection
        title={t("branding.logo.title")}
        description={t("branding.logo.description")}
        primaryLabel={t("branding.logo.primary")}
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
        downloadLogoPngLabel={t("branding.assets.download_logo_png")}
        downloadLogoSimplePngLabel={t("branding.assets.download_logo_simple_png")}
        downloadLogoSvgLabel={t("branding.assets.download_logo_svg")}
      />
    </div>
  );
};

