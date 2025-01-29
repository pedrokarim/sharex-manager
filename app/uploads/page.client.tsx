'use client';

import { AppSidebar } from "@/components/sidebar/app-sidebar";
import { SidebarHeader } from "@/components/sidebar/sibebar-header";
import { SidebarInset } from "@/components/ui/sidebar";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import Link from "next/link";
import { History, BarChart, Settings } from "lucide-react";

const features = [
  {
    title: "Historique",
    description: "Consultez l'historique de tous vos uploads",
    icon: History,
    href: "/uploads/history",
    color: "text-blue-500",
  },
  {
    title: "Statistiques",
    description: "Visualisez les statistiques de vos uploads",
    icon: BarChart,
    href: "/uploads/stats",
    color: "text-green-500",
  },
  {
    title: "Configuration",
    description: "Configurez vos paramètres d'upload",
    icon: Settings,
    href: "/uploads/config",
    color: "text-purple-500",
  },
];

export function UploadsPageClient() {
  return (
    <div className="flex h-screen">
      <AppSidebar />
      <SidebarInset>
        <SidebarHeader title="Uploads" />

        <main className="p-8">
          <div className="bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="container flex flex-col gap-4 py-4">
              <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold tracking-tight">
                  Gestion des uploads
                </h1>
                <p className="text-muted-foreground">
                  Gérez vos uploads ShareX et accédez à toutes les fonctionnalités
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-8">
            {features.map((feature) => (
              <Link key={feature.href} href={feature.href}>
                <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <feature.icon className={`h-5 w-5 ${feature.color}`} />
                      <CardTitle>{feature.title}</CardTitle>
                    </div>
                    <CardDescription>{feature.description}</CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        </main>
      </SidebarInset>
    </div>
  );
} 
