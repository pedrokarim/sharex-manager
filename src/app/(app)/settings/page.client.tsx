"use client";

import {
  Globe2,
} from "lucide-react";

import { NavCard, type NavCardAccent } from "@/components/nav-card";
import { useTranslation } from "@/lib/i18n";

import { THEMED_ICONS, type IconComponent } from "@/components/icon-theme";
import { PageTitleIcon } from "@/components/page-title-icon";
interface SettingsItem {
  href: string;
  icon: IconComponent;
  accent: NavCardAccent;
  /** Clés de traduction, données explicitement : les libellés de ces liens
      vivent sous des espaces de noms différents (`settings`, `uploads`). */
  titleKey: string;
  descriptionKey: string;
  badgeKey: string;
}

interface SettingsGroup {
  key: string;
  items: SettingsItem[];
}

export function SettingsPageClient() {
  const { t } = useTranslation();

  const groups: SettingsGroup[] = [
    {
      key: "personalisation",
      items: [
        {
          href: "/settings/preferences",
          icon: THEMED_ICONS.preferences,
          accent: "slate",
          titleKey: "settings.preferences",
          descriptionKey: "settings.preferences_description",
          badgeKey: "settings.preferences_badge",
        },
      ],
    },
    {
      key: "publication",
      items: [
        {
          href: "/uploads/config",
          icon: THEMED_ICONS.uploadConfig,
          accent: "blue",
          titleKey: "settings.sections.upload_config.title",
          descriptionKey: "settings.sections.upload_config.description",
          badgeKey: "settings.sections.upload_config.badge",
        },
        {
          href: "/settings/domains",
          icon: Globe2,
          accent: "emerald",
          titleKey: "settings.sections.domains.title",
          descriptionKey: "settings.sections.domains.description",
          badgeKey: "settings.sections.domains.badge",
        },
        {
          href: "/settings/api-keys",
          icon: THEMED_ICONS.apiKeys,
          accent: "amber",
          titleKey: "settings.sections.api_keys.title",
          descriptionKey: "settings.sections.api_keys.description",
          badgeKey: "settings.sections.api_keys.badge",
        },
      ],
    },
    {
      key: "monitoring",
      items: [
        {
          href: "/uploads/history",
          icon: THEMED_ICONS.history,
          accent: "violet",
          titleKey: "uploads.history.title",
          descriptionKey: "uploads.history.description",
          badgeKey: "uploads.history.badge",
        },
        {
          href: "/uploads/stats",
          icon: THEMED_ICONS.stats,
          accent: "rose",
          titleKey: "uploads.stats.title",
          descriptionKey: "uploads.stats.description",
          badgeKey: "uploads.stats.badge",
        },
      ],
    },
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border/70 bg-gradient-to-br from-card via-card to-muted/25 p-5 shadow-sm sm:p-6">
        <div className="space-y-2">
          <h1 className="flex items-center gap-3 text-2xl font-semibold tracking-tight sm:text-3xl">
            <PageTitleIcon icon={THEMED_ICONS.settings} />
            {t("settings.title")}
          </h1>
          <p className="max-w-3xl text-sm text-muted-foreground sm:text-base">
            {t("settings.description")}
          </p>
        </div>
      </section>

      <div className="grid gap-10">
        {groups.map((group) => (
          <section key={group.key} className="space-y-4">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold sm:text-xl">
                {t(`settings.groups.${group.key}.title`)}
              </h2>
              <p className="max-w-3xl text-sm text-muted-foreground">
                {t(`settings.groups.${group.key}.description`)}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {group.items.map((item) => (
                <NavCard
                  key={item.href}
                  href={item.href}
                  icon={item.icon}
                  accent={item.accent}
                  badge={t(item.badgeKey)}
                  title={t(item.titleKey)}
                  description={t(item.descriptionKey)}
                  action={t("common.open")}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
