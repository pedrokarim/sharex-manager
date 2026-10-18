"use client";

import {
  BrainCircuit,
  Database,
  Link2,
  Package,
  Palette,
  Server,
  Shield,
  Users,
} from "lucide-react";

import { NavCard, type NavCardAccent } from "@/components/nav-card";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { useTranslation } from "@/lib/i18n";

export function AdminPageClient() {
  const { t } = useTranslation();

  const adminSections: Array<{
    key: string;
    href: string;
    icon: typeof Users;
    accent: NavCardAccent;
    tag?: string;
    /** Libellés écrits ici plutôt que traduits. */
    title?: string;
    description?: string;
  }> = [
    { key: "users", href: "/admin/users", icon: Users, accent: "blue" },
    { key: "logs", href: "/admin/logs", icon: Database, accent: "emerald" },
    { key: "theme", href: "/admin/theme", icon: Palette, accent: "cyan" },
    { key: "system", href: "/admin/system", icon: Server, accent: "amber" },
    { key: "modules", href: "/admin/modules", icon: Package, accent: "violet" },
    {
      key: "connections",
      href: "/admin/connections",
      icon: Link2,
      accent: "rose",
      title: "Comptes connectés",
      description: "Chaînes YouTube et autres comptes où publier les clips, communs à tous les modules.",
    },
    {
      key: "ai",
      href: "/admin/ai",
      icon: BrainCircuit,
      accent: "slate",
      title: "Intelligence artificielle",
      description: "Consommation et quotas de chaque IA et service à quota, les limites qui approchent, les derniers appels.",
    },
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
      <AdminPageHeader icon={Shield} title={t("admin.title")} description={t("admin.description")} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {adminSections.map((section) => (
          <NavCard
            key={section.href}
            href={section.href}
            icon={section.icon}
            accent={section.accent}
            tag={section.tag}
            title={section.title ?? t(`admin.sections.${section.key}.title`)}
            description={section.description ?? t(`admin.sections.${section.key}.description`)}
            action={t("common.open")}
          />
        ))}
      </div>
    </div>
  );
}
