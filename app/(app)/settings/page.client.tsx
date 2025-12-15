"use client";

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Settings,
  Upload,
  Users,
  History,
  BarChart,
  Key,
  Trash2,
  Shield,
  Globe,
  Palette,
  ArrowRight,
  Sparkles,
  Zap,
  Database,
  UserCheck,
  TrendingUp,
  Code,
  Globe as WorldIcon,
  ShieldCheck,
  Palette as PaletteIcon,
} from "lucide-react";
import Link from "next/link";
import { useTranslation } from "@/lib/i18n";

export function SettingsPageClient() {
  const { t } = useTranslation();

  const settingsSections = [
    {
      title: t("settings.sections.upload_config.title"),
      description: t("settings.sections.upload_config.description"),
      icon: Upload,
      href: "/uploads/config",
      color: "text-blue-500",
      gradient: "from-blue-500/20 to-blue-600/20",
      badge: t("settings.sections.upload_config.badge"),
      badgeColor:
        "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
      actionIcon: Database,
    },
    {
      title: t("admin.sections.users.title"),
      description: t("admin.sections.users.description"),
      icon: Users,
      href: "/admin/users",
      color: "text-green-500",
      gradient: "from-green-500/20 to-green-600/20",
      badge: t("admin.sections.users.badge"),
      badgeColor:
        "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
      actionIcon: UserCheck,
    },
    {
      title: t("uploads.history.title"),
      description: t("uploads.history.description"),
      icon: History,
      href: "/uploads/history",
      color: "text-purple-500",
      gradient: "from-purple-500/20 to-purple-600/20",
      badge: t("uploads.history.badge"),
      badgeColor:
        "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
      actionIcon: TrendingUp,
    },
    {
      title: t("uploads.stats.title"),
      description: t("uploads.stats.description"),
      icon: BarChart,
      href: "/uploads/stats",
      color: "text-yellow-500",
      gradient: "from-yellow-500/20 to-yellow-600/20",
      badge: t("uploads.stats.badge"),
      badgeColor:
        "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
      actionIcon: BarChart,
    },
    {
      title: t("settings.sections.api_keys.title"),
      description: t("settings.sections.api_keys.description"),
      icon: Key,
      href: "/settings/api-keys",
      color: "text-red-500",
      gradient: "from-red-500/20 to-red-600/20",
      badge: t("settings.sections.api_keys.badge"),
      badgeColor: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
      actionIcon: Code,
    },
    {
      title: t("settings.sections.domains.title"),
      description: t("settings.sections.domains.description"),
      icon: Globe,
      href: "/settings/domains",
      color: "text-pink-500",
      gradient: "from-pink-500/20 to-pink-600/20",
      badge: t("settings.sections.domains.badge"),
      badgeColor:
        "bg-pink-100 text-pink-700 dark:bg-pink-900 dark:text-pink-300",
      actionIcon: WorldIcon,
    },
    {
      title: t("settings.sections.cleanup.title"),
      description: t("settings.sections.cleanup.description"),
      icon: Trash2,
      href: "/cleanup",
      color: "text-orange-500",
      gradient: "from-orange-500/20 to-orange-600/20",
      badge: t("settings.sections.cleanup.badge"),
      badgeColor:
        "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
      actionIcon: Zap,
    },
    {
      title: t("settings.sections.security.title"),
      description: t("settings.sections.security.description"),
      icon: Shield,
      href: "/security",
      color: "text-indigo-500",
      gradient: "from-indigo-500/20 to-indigo-600/20",
      badge: t("settings.sections.security.badge"),
      badgeColor:
        "bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300",
      actionIcon: ShieldCheck,
    },
    {
      title: "Éditeur de thème",
      description: "Personnalisez l'apparence de votre application",
      icon: Palette,
      href: "/themes",
      color: "text-cyan-500",
      gradient: "from-cyan-500/20 to-cyan-600/20",
      badge: t("settings.sections.theme_editor.badge"),
      badgeColor:
        "bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300",
      actionIcon: Sparkles,
    },
  ];

  return (
    <div>
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
          <Settings className="h-6 w-6 sm:h-8 sm:w-8" />
          {t("settings.title")}
        </h1>
        <p className="text-muted-foreground mt-2 text-sm sm:text-base">
          {t("settings.description")}
        </p>
      </div>

      <div className="grid gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-3">
        {settingsSections.map((section) => (
          <Link key={section.href} href={section.href}>
            <Card
              className={`group relative h-full overflow-hidden border-0 bg-gradient-to-br ${section.gradient} transition-all duration-300 hover:scale-[1.02] hover:shadow-lg`}
            >
              <CardHeader className="relative">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-3 flex-1">
                    <div className="flex items-center gap-3">
                      <div
                        className={`rounded-lg bg-white/80 p-2 shadow-sm ${section.color}`}
                      >
                        <section.icon className="h-4 w-4 sm:h-5 sm:w-5" />
                      </div>
                      <div className="space-y-1">
                        <CardTitle className="text-base sm:text-lg font-semibold">
                          {section.title}
                        </CardTitle>
                        <Badge
                          variant="secondary"
                          className={`text-xs ${section.badgeColor}`}
                        >
                          {section.badge}
                        </Badge>
                      </div>
                    </div>
                    <CardDescription className="text-sm leading-relaxed">
                      {section.description}
                    </CardDescription>
                  </div>
                  <div
                    className={`rounded-full bg-white/60 p-2 transition-transform group-hover:translate-x-1 ${section.color}`}
                  >
                    <ArrowRight className="h-3 w-3" />
                  </div>
                </div>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
