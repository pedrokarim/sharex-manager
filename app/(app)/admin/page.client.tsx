"use client";

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Settings, Users, Database, Shield, Upload } from "lucide-react";
import Link from "next/link";
import { useTranslation } from "@/lib/i18n";

export function AdminPageClient() {
  const { t } = useTranslation();

  const adminSections = [
    {
      title: t("admin.sections.users.title"),
      description: t("admin.sections.users.description"),
      icon: Users,
      href: "/admin/users",
      color: "text-blue-500",
    },
    {
      title: t("admin.sections.logs.title"),
      description: t("admin.sections.logs.description"),
      icon: Database,
      href: "/admin/logs",
      color: "text-green-500",
    },
    {
      title: t("admin.sections.system.title"),
      description: t("admin.sections.system.description"),
      icon: Settings,
      href: "/admin/system",
      color: "text-yellow-500",
    },
    {
      title: t("admin.sections.security.title"),
      description: t("admin.sections.security.description"),
      icon: Shield,
      href: "/admin/security",
      color: "text-purple-500",
      disabled: true,
    },
  ];

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Shield className="h-8 w-8" />
          {t("admin.title")}
        </h1>
        <p className="text-muted-foreground mt-2">{t("admin.description")}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {adminSections.map((section) => (
          <Link
            key={section.href}
            href={section.disabled ? "#" : section.href}
            className={section.disabled ? "cursor-not-allowed" : ""}
          >
            <Card
              className={`h-full transition-colors ${
                section.disabled ? "opacity-60" : "hover:bg-muted/50"
              }`}
            >
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
