"use client";

import {
  Upload,
  Shield,
  Image as ImageIcon,
  Zap,
  LineChart,
  Key,
  History,
  Lock,
  Gamepad2,
  Sparkles,
} from "lucide-react";
import { Footer } from "@/components/layout/footer";
import { useSession } from "next-auth/react";
import { useTranslation } from "@/lib/i18n";
import { CatalogAccessButton } from "@/components/catalog/catalog-access-button";
import { HeroSection } from "@/components/home/hero-section";
import { FeaturesGrid } from "@/components/home/features-grid";
import { CodePreviewSection } from "@/components/home/code-preview";
import { ShowcaseGallery } from "@/components/home/showcase-gallery";
import { ToolsSection } from "@/components/home/tools-section";
import { CtaSection } from "@/components/home/cta-section";

export default function HomePage() {
  const { data: session } = useSession();
  const { t } = useTranslation();

  const apiBaseUrl =
    process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

  return (
    <div className="relative min-h-screen flex flex-col">
      {/* Bouton d'accès au catalogue public */}
      <CatalogAccessButton />

      <main className="flex-1">
        <HeroSection
          title={t("home.title")}
          subtitle={t("home.subtitle")}
          ctaGalleryLabel={t("home.cta.gallery")}
          ctaConfigureLabel={t("home.cta.configure")}
          showConfigureCta={Boolean(session?.user)}
        />

        <FeaturesGrid
          eyebrow={t("home.new.features_eyebrow")}
          title={t("home.new.features_title")}
          subtitle={t("home.new.features_subtitle")}
          items={[
            {
              icon: <Upload className="h-4 w-4" />,
              title: t("home.features.upload.title"),
              description: t("home.features.upload.description"),
              bullets: [
                {
                  icon: <Zap className="h-4 w-4" />,
                  text: t("home.features.upload.fast"),
                },
                {
                  icon: <History className="h-4 w-4" />,
                  text: t("home.features.upload.history"),
                },
              ],
            },
            {
              icon: <Shield className="h-4 w-4" />,
              title: t("home.features.security.title"),
              description: t("home.features.security.description"),
              bullets: [
                {
                  icon: <Lock className="h-4 w-4" />,
                  text: t("home.features.security.private"),
                },
                {
                  icon: <Key className="h-4 w-4" />,
                  text: t("home.features.security.api_keys"),
                },
              ],
            },
            {
              icon: <ImageIcon className="h-4 w-4" />,
              title: t("home.features.management.title"),
              description: t("home.features.management.description"),
              bullets: [
                {
                  icon: <Sparkles className="h-4 w-4" />,
                  text: t("home.features.management.customization"),
                },
                {
                  icon: <LineChart className="h-4 w-4" />,
                  text: t("home.features.management.stats"),
                },
              ],
            },
            {
              icon: <Gamepad2 className="h-4 w-4" />,
              title: t("home.features.tools.title"),
              description: t("home.features.tools.description"),
              bullets: [
                {
                  icon: <Gamepad2 className="h-4 w-4" />,
                  text: t("home.features.tools.minecraft"),
                },
                {
                  icon: <Sparkles className="h-4 w-4" />,
                  text: t("home.features.tools.more"),
                },
              ],
            },
          ]}
        />

        <CodePreviewSection
          title={t("home.configuration.title")}
          subtitle={t("home.configuration.intro")}
          apiBaseUrl={apiBaseUrl}
          eyebrow={t("home.new.code_eyebrow")}
          windowTitle={t("home.new.code_window_title")}
          tabSharexLabel={t("home.new.code_tab_sharex")}
          tabCurlLabel={t("home.new.code_tab_curl")}
          copySharexAriaLabel={t("home.new.code_copy_sharex")}
          copyCurlAriaLabel={t("home.new.code_copy_curl")}
        />

        <ShowcaseGallery
          eyebrow={t("home.new.showcase_eyebrow")}
          title={t("home.new.showcase_title")}
          subtitle={t("home.new.showcase_subtitle")}
          ariaLabel={t("home.new.showcase_aria_label")}
          items={[
            { src: "/preview-image.png", alt: "Aperçu", label: "Preview" },
            { src: "/login_bg.jpg", alt: "Écran de connexion", label: "UI" },
            { src: "/unauthorized.png", alt: "Accès interdit", label: "Sécurité" },
            { src: "/file_not_found.png", alt: "Fichier introuvable", label: "Erreurs" },
          ]}
        />

        <ToolsSection
          title={t("home.tools_section.title")}
          subtitle={t("home.tools_section.subtitle")}
          minecraftTitle={t("tools.minecraft_skin.title")}
          minecraftDescription={t("tools.minecraft_skin.description")}
          minecraftUseToolLabel={t("tools.minecraft_skin.use_tool")}
          allToolsTitle={t("home.new.tools_all_title")}
          allToolsDescription={t("home.new.tools_all_description")}
          allToolsCta={t("home.tools_section.cta")}
          comingSoonTitle={t("home.new.coming_soon_title")}
          comingSoonDescription={t("home.new.coming_soon_description")}
          comingSoonBadge={t("home.new.coming_soon_badge")}
          availableBadge={t("home.new.available_badge")}
        />

        <CtaSection
          title={t("home.new.cta_title")}
          subtitle={t("home.new.cta_subtitle")}
          primaryCtaLabel={t("home.cta.gallery")}
          primaryCtaHref="/gallery"
          secondaryCtaLabel={session?.user ? t("home.cta.configure") : undefined}
          secondaryCtaHref={session?.user ? "/settings/api-keys" : undefined}
          stats={[
            { label: t("home.new.stats_uploads"), value: 1200, suffix: "+" },
            { label: t("home.new.stats_storage"), value: 48, suffix: "GB" },
            { label: t("home.new.stats_modules"), value: 12, suffix: "+" },
          ]}
        />
      </main>
      <Footer />
    </div>
  );
}
