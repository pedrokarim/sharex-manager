"use client";

import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Globe2,
  History,
  KeyRound,
  Settings2,
  SlidersHorizontal,
  Upload,
} from "lucide-react";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useTranslation } from "@/lib/i18n";

export function SettingsPageClient() {
  const { t } = useTranslation();

  const groups = [
    {
      title: "Personnalisation",
      description:
        "Les réglages qui définissent l’apparence, le rythme et le confort de navigation.",
      items: [
        {
          title: t("settings.preferences"),
          description: t("settings.preferences_description"),
          href: "/settings/preferences",
          icon: Settings2,
          accent: "from-slate-500/15 via-slate-500/5 to-transparent",
          meta: "Interface",
        },
      ],
    },
    {
      title: "Publication",
      description:
        "Tout ce qui touche au pipeline de diffusion, aux accès et aux adresses publiques.",
      items: [
        {
          title: t("settings.sections.upload_config.title"),
          description: t("settings.sections.upload_config.description"),
          href: "/uploads/config",
          icon: Upload,
          accent: "from-blue-500/15 via-blue-500/5 to-transparent",
          meta: "Pipeline",
        },
        {
          title: t("settings.sections.domains.title"),
          description: t("settings.sections.domains.description"),
          href: "/settings/domains",
          icon: Globe2,
          accent: "from-emerald-500/15 via-emerald-500/5 to-transparent",
          meta: "Routage",
        },
        {
          title: t("settings.sections.api_keys.title"),
          description: t("settings.sections.api_keys.description"),
          href: "/settings/api-keys",
          icon: KeyRound,
          accent: "from-amber-500/15 via-amber-500/5 to-transparent",
          meta: "Accès",
        },
      ],
    },
    {
      title: "Pilotage",
      description:
        "Les vues qui permettent de comprendre l’activité, les tendances et l’historique.",
      items: [
        {
          title: t("uploads.history.title"),
          description: t("uploads.history.description"),
          href: "/uploads/history",
          icon: History,
          accent: "from-violet-500/15 via-violet-500/5 to-transparent",
          meta: "Historique",
        },
        {
          title: t("uploads.stats.title"),
          description: t("uploads.stats.description"),
          href: "/uploads/stats",
          icon: BarChart3,
          accent: "from-rose-500/15 via-rose-500/5 to-transparent",
          meta: "Analytique",
        },
      ],
    },
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border/70 bg-gradient-to-br from-card via-card to-muted/25 p-5 shadow-sm sm:p-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <h1 className="flex items-center gap-3 text-2xl font-semibold tracking-tight sm:text-3xl">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-background/80 text-muted-foreground shadow-sm sm:h-11 sm:w-11">
                <SlidersHorizontal className="h-5 w-5" />
              </span>
              {t("settings.title")}
            </h1>
            <p className="max-w-3xl text-sm text-muted-foreground sm:text-base">
              {t("settings.description")}
            </p>
          </div>
        </div>
      </section>

      <div className="grid gap-6">
        {groups.map((group) => (
          <section key={group.title} className="space-y-4 px-1 sm:px-0">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold sm:text-xl">
                {group.title}
              </h2>
              <p className="text-sm text-muted-foreground">
                {group.description}
              </p>
            </div>

            <div className="grid items-start gap-4 lg:grid-cols-2">
              {group.items.map((item) => {
                const Icon = item.icon;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="group block self-start"
                  >
                    <Card className="overflow-hidden rounded-2xl border-border/70 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-border hover:shadow-md active:scale-[0.995]">
                      <CardHeader className="relative overflow-hidden space-y-0 px-5 py-4 sm:p-6">
                        <div
                          className={`absolute inset-0 bg-gradient-to-br ${item.accent}`}
                        />
                        <div className="relative flex min-w-0 items-start justify-between gap-3 sm:gap-4">
                          <div className="min-w-0 space-y-2.5">
                            <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/85 px-3 py-1 text-xs font-medium text-muted-foreground">
                              <Icon className="h-3.5 w-3.5" />
                              {item.meta}
                            </div>
                            <div className="min-w-0 space-y-1 pr-2 sm:pr-4">
                              <CardTitle className="text-lg sm:text-xl">
                                {item.title}
                              </CardTitle>
                              <CardDescription className="max-w-xl text-sm leading-relaxed">
                                {item.description}
                              </CardDescription>
                            </div>
                          </div>
                          <div className="shrink-0 pt-0.5">
                            <div className="rounded-full border border-border/60 bg-background/85 p-2 text-muted-foreground transition-transform duration-200 group-hover:translate-x-1">
                              <ArrowRight className="h-4 w-4" />
                            </div>
                          </div>
                        </div>
                      </CardHeader>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
