"use client";

import Link from "next/link";
import {
  ArrowRight,
  Database,
  Package,
  Settings,
  Shield,
  Users,
} from "lucide-react";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useTranslation } from "@/lib/i18n";

export function AdminPageClient() {
  const { t } = useTranslation();

  const adminSections = [
    {
      title: t("admin.sections.users.title"),
      description: t("admin.sections.users.description"),
      icon: Users,
      href: "/admin/users",
      meta: "Utilisateurs",
      accent: "from-blue-500/15 via-blue-500/5 to-transparent",
    },
    {
      title: t("admin.sections.logs.title"),
      description: t("admin.sections.logs.description"),
      icon: Database,
      href: "/admin/logs",
      meta: "Observabilité",
      accent: "from-emerald-500/15 via-emerald-500/5 to-transparent",
    },
    {
      title: "Thème global",
      description:
        "Publier la base visuelle du site et préparer les futures extensions de branding.",
      icon: Settings,
      href: "/admin/theme",
      meta: "Design system",
      accent: "from-cyan-500/15 via-cyan-500/5 to-transparent",
    },
    {
      title: t("admin.sections.system.title"),
      description: t("admin.sections.system.description"),
      icon: Settings,
      href: "/admin/system",
      meta: "Infrastructure",
      accent: "from-amber-500/15 via-amber-500/5 to-transparent",
    },
    {
      title: "Gestion des modules",
      description: "Gérer les modules installés et leurs dépendances.",
      icon: Package,
      href: "/admin/modules",
      meta: "Extensions",
      accent: "from-violet-500/15 via-violet-500/5 to-transparent",
    },
    {
      title: t("admin.sections.security.title"),
      description: t("admin.sections.security.description"),
      icon: Shield,
      href: "/admin/security",
      meta: "Protection",
      accent: "from-indigo-500/15 via-indigo-500/5 to-transparent",
    },
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border/70 bg-gradient-to-br from-card via-card to-muted/25 p-5 shadow-sm sm:p-6">
        <div className="space-y-2">
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
        </div>
      </section>

      <div className="grid items-start gap-4 xl:grid-cols-2">
        {adminSections.map((section) => {
          const Icon = section.icon;

          return (
            <Link
              key={section.href}
              href={section.href}
              className="group block self-start"
            >
              <Card className="overflow-hidden rounded-2xl border-border/70 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-border hover:shadow-md active:scale-[0.995]">
                <CardHeader className="relative overflow-hidden space-y-0 px-5 py-4 sm:p-6">
                  <div
                    className={`absolute inset-0 bg-gradient-to-br ${section.accent}`}
                  />
                  <div className="relative flex min-w-0 items-start justify-between gap-3 sm:gap-4">
                    <div className="min-w-0 space-y-2.5">
                      <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/85 px-3 py-1 text-xs font-medium text-muted-foreground">
                        <Icon className="h-3.5 w-3.5" />
                        {section.meta}
                      </div>
                      <div className="min-w-0 space-y-1 pr-2 sm:pr-4">
                        <CardTitle className="text-lg sm:text-xl">
                          {section.title}
                        </CardTitle>
                        <CardDescription className="text-sm leading-relaxed">
                          {section.description}
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
    </div>
  );
}
