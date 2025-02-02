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

export function SettingsPageClient() {
  const settingsSections = [
    {
      title: "Configuration des uploads",
      description: "Gérez les paramètres de vos uploads ShareX",
      icon: Upload,
      href: "/uploads/config",
      color: "text-blue-500",
    },
    {
      title: "Gestion des utilisateurs",
      description: "Gérez les utilisateurs et leurs permissions",
      icon: Users,
      href: "/admin/users",
      color: "text-green-500",
    },
    {
      title: "Historique des uploads",
      description: "Consultez l'historique des fichiers uploadés",
      icon: History,
      href: "/uploads/history",
      color: "text-purple-500",
    },
    {
      title: "Statistiques",
      description: "Visualisez les statistiques d'utilisation",
      icon: BarChart,
      href: "/uploads/stats",
      color: "text-yellow-500",
    },
    {
      title: "Clés API",
      description: "Gérez vos clés API pour ShareX",
      icon: Key,
      href: "/settings/api-keys",
      color: "text-red-500",
    },
    {
      title: "Domaines",
      description: "Gérez les domaines pour vos fichiers",
      icon: Globe,
      href: "/settings/domains",
      color: "text-pink-500",
    },
    {
      title: "Nettoyage",
      description: "Supprimez les fichiers inutilisés",
      icon: Trash2,
      href: "/cleanup",
      color: "text-orange-500",
    },
    {
      title: "Sécurité",
      description: "Configurez les paramètres de sécurité",
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
          Paramètres
        </h1>
        <p className="text-muted-foreground mt-2">
          Gérez tous les paramètres de votre application ShareX Manager
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
