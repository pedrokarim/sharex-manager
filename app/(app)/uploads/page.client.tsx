"use client";

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import {
  History,
  BarChart,
  Settings,
  ArrowRight,
  Clock,
  TrendingUp,
  Cog,
} from "lucide-react";
import { useTranslation } from "@/lib/i18n";

export function UploadsPageClient() {
  const { t } = useTranslation();

  const features = [
    {
      title: t("uploads.features.history.title"),
      description: t("uploads.features.history.description"),
      icon: History,
      href: "/uploads/history",
      color: "text-blue-500",
      gradient: "from-blue-500/20 to-blue-600/20",
      badge: t("uploads.features.history.badge"),
      badgeColor:
        "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
      actionIcon: Clock,
    },
    {
      title: t("uploads.features.stats.title"),
      description: t("uploads.features.stats.description"),
      icon: BarChart,
      href: "/uploads/stats",
      color: "text-green-500",
      gradient: "from-green-500/20 to-green-600/20",
      badge: t("uploads.features.stats.badge"),
      badgeColor:
        "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
      actionIcon: TrendingUp,
    },
    {
      title: t("uploads.features.config.title"),
      description: t("uploads.features.config.description"),
      icon: Settings,
      href: "/uploads/config",
      color: "text-purple-500",
      gradient: "from-purple-500/20 to-purple-600/20",
      badge: t("uploads.features.config.badge"),
      badgeColor:
        "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
      actionIcon: Cog,
    },
  ];

  return (
    <main className="flex flex-col h-full">
      <div className="bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex flex-col gap-4 py-4">
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              {t("uploads.title")}
            </h1>
            <p className="text-muted-foreground text-sm sm:text-base">
              {t("uploads.description")}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mt-6 sm:mt-8">
        {features.map((feature) => (
          <Link key={feature.href} href={feature.href}>
            <Card
              className={`group relative h-full overflow-hidden border-0 bg-gradient-to-br ${feature.gradient} transition-all duration-300 hover:scale-[1.02] hover:shadow-lg`}
            >
              <CardHeader className="relative">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-3 flex-1">
                    <div className="flex items-center gap-3">
                      <div
                        className={`rounded-lg bg-white/80 p-2 shadow-sm ${feature.color}`}
                      >
                        <feature.icon className="h-4 w-4 sm:h-5 sm:w-5" />
                      </div>
                      <div className="space-y-1">
                        <CardTitle className="text-base sm:text-lg font-semibold">
                          {feature.title}
                        </CardTitle>
                        <Badge
                          variant="secondary"
                          className={`text-xs ${feature.badgeColor}`}
                        >
                          {feature.badge}
                        </Badge>
                      </div>
                    </div>
                    <CardDescription className="text-sm leading-relaxed">
                      {feature.description}
                    </CardDescription>
                  </div>
                  <div
                    className={`rounded-full bg-white/60 p-2 transition-transform group-hover:translate-x-1 ${feature.color}`}
                  >
                    <ArrowRight className="h-3 w-3" />
                  </div>
                </div>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </main>
  );
}
