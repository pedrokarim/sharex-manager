"use client";

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
    },
    {
      title: t("admin.sections.users.title"),
      description: t("admin.sections.users.description"),
      icon: Users,
      href: "/admin/users",
      color: "text-green-500",
    },
    {
      title: t("uploads.history.title"),
      description: t("uploads.history.description"),
      icon: History,
      href: "/uploads/history",
      color: "text-purple-500",
    },
    {
      title: t("uploads.stats.title"),
      description: t("uploads.stats.description"),
      icon: BarChart,
      href: "/uploads/stats",
      color: "text-yellow-500",
    },
    {
      title: t("settings.sections.api_keys.title"),
      description: t("settings.sections.api_keys.description"),
      icon: Key,
      href: "/settings/api-keys",
      color: "text-red-500",
    },
    {
      title: t("settings.sections.domains.title"),
      description: t("settings.sections.domains.description"),
      icon: Globe,
      href: "/settings/domains",
      color: "text-pink-500",
    },
    {
      title: t("settings.sections.cleanup.title"),
      description: t("settings.sections.cleanup.description"),
      icon: Trash2,
      href: "/cleanup",
      color: "text-orange-500",
    },
    {
      title: t("settings.sections.security.title"),
      description: t("settings.sections.security.description"),
      icon: Shield,
      href: "/security",
      color: "text-indigo-500",
    },
  ];

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Settings className="h-8 w-8" />
          {t("settings.title")}
        </h1>
        <p className="text-muted-foreground mt-2">
          {t("settings.description")}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {settingsSections.map((section) => (
          <Link key={section.href} href={section.href}>
            <Card className="h-full transition-colors hover:bg-muted/50">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <section.icon className={`h-5 w-5 ${section.color}`} />
                  <CardTitle>{section.title}</CardTitle>
                </div>
                <CardDescription>{section.description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
