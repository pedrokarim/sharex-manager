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
  CardContent,
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
        <div className="space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/80 px-3 py-1 text-xs font-medium text-muted-foreground">
            <Shield className="h-3.5 w-3.5" />
            Centre d’administration
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {t("admin.title")}
            </h1>
            <p className="max-w-3xl text-sm text-muted-foreground sm:text-base">
              {t("admin.description")}
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-border/60 bg-background/80 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                Supervision
              </p>
              <p className="mt-1 text-sm">
                Gardez une vision claire des utilisateurs, des journaux et de
                l’état global du service.
              </p>
            </div>
            <div className="rounded-xl border border-border/60 bg-background/80 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                Organisation
              </p>
              <p className="mt-1 text-sm">
                Chaque panneau isole un métier précis au lieu d’empiler les
                actions dans une seule vue.
              </p>
            </div>
            <div className="rounded-xl border border-border/60 bg-background/80 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                Fiabilité
              </p>
              <p className="mt-1 text-sm">
                Les actions critiques restent visibles, compactes et faciles à
                relire avant validation.
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        {adminSections.map((section) => {
          const Icon = section.icon;

          return (
            <Link key={section.href} href={section.href} className="group">
              <Card className="h-full overflow-hidden rounded-2xl border-border/70 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-border hover:shadow-md">
                <CardHeader className="relative overflow-hidden border-b border-border/60 p-5 sm:p-6">
                  <div
                    className={`absolute inset-0 bg-gradient-to-br ${section.accent}`}
                  />
                  <div className="relative flex items-start justify-between gap-4">
                    <div className="space-y-3">
                      <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/85 px-3 py-1 text-xs font-medium text-muted-foreground">
                        <Icon className="h-3.5 w-3.5" />
                        {section.meta}
                      </div>
                      <div className="space-y-1">
                        <CardTitle className="text-lg sm:text-xl">
                          {section.title}
                        </CardTitle>
                        <CardDescription className="text-sm leading-relaxed">
                          {section.description}
                        </CardDescription>
                      </div>
                    </div>
                    <div className="rounded-full border border-border/60 bg-background/85 p-2 text-muted-foreground transition-transform duration-200 group-hover:translate-x-1">
                      <ArrowRight className="h-4 w-4" />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-5 sm:p-6">
                  <div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                    Ouvrir ce panneau pour intervenir sans perdre le contexte
                    administratif global.
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
