"use client";

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Settings, Users, Database, Shield, Upload } from "lucide-react";
import Link from "next/link";

export function AdminPageClient() {
  const adminSections = [
    {
      title: "Gestion des utilisateurs",
      description: "Gérez les utilisateurs et leurs permissions",
      icon: Users,
      href: "/admin/users",
      color: "text-blue-500",
    },
    {
      title: "Logs système",
      description: "Consultez les logs et l'activité du système",
      icon: Database,
      href: "/admin/logs",
      color: "text-green-500",
    },
    {
      title: "Configuration système",
      description:
        "Gérez les paramètres système et la configuration des uploads",
      icon: Settings,
      href: "/admin/system",
      color: "text-yellow-500",
    },
    {
      title: "Sécurité (Bientôt disponible)",
      description: "Configurez les paramètres de sécurité avancés",
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
          Administration
        </h1>
        <p className="text-muted-foreground mt-2">
          Gérez les paramètres d'administration de votre application ShareX
          Manager
        </p>
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
