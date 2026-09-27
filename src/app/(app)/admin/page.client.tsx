"use client";

import {
  Database,
  Package,
  Palette,
  Server,
  Shield,
  Users,
} from "lucide-react";

import { NavCard, type NavCardAccent } from "@/components/nav-card";
import { useTranslation } from "@/lib/i18n";

export function AdminPageClient() {
  const { t } = useTranslation();

  const adminSections: Array<{
    key: string;
    href: string;
    icon: typeof Users;
    accent: NavCardAccent;
    tag?: string;
  }> = [
    { key: "users", href: "/admin/users", icon: Users, accent: "blue" },
    { key: "logs", href: "/admin/logs", icon: Database, accent: "emerald" },
    { key: "theme", href: "/admin/theme", icon: Palette, accent: "cyan" },
    { key: "system", href: "/admin/system", icon: Server, accent: "amber" },
    { key: "modules", href: "/admin/modules", icon: Package, accent: "violet" },
    {
      key: "security",
      href: "/admin/security",
      icon: Shield,
      accent: "indigo",
      tag: t("admin.soon"),
    },
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border/70 bg-gradient-to-br from-card via-card to-muted/25 p-5 shadow-sm sm:p-6">
        <div className="space-y-2">
          <h1 className="flex items-center gap-3 text-2xl font-semibold tracking-tight sm:text-3xl">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-background/80 text-muted-foreground shadow-sm sm:h-11 sm:w-11">
              <Shield className="h-5 w-5" />
            </span>
            {t("admin.title")}
          </h1>
          <p className="max-w-3xl text-sm text-muted-foreground sm:text-base">
            {t("admin.description")}
          </p>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {adminSections.map((section) => (
          <NavCard
            key={section.href}
            href={section.href}
            icon={section.icon}
            accent={section.accent}
            tag={section.tag}
            badge={t(`admin.sections.${section.key}.badge`)}
            title={t(`admin.sections.${section.key}.title`)}
            description={t(`admin.sections.${section.key}.description`)}
            action={t("common.open")}
          />
        ))}
      </div>
    </div>
  );
}
