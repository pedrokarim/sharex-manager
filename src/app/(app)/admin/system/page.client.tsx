"use client";

import {
  Settings,
  Upload,
  Database,
  Package,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n";
import { useState } from "react";
import { toast } from "sonner";

interface ModuleDependencyResult {
  name: string;
  success: boolean;
  message: string;
}

export default function SystemPageClient() {
  const { t } = useTranslation();
  const [isInstallingDependencies, setIsInstallingDependencies] =
    useState(false);
  const [dependencyResults, setDependencyResults] = useState<
    ModuleDependencyResult[]
  >([]);
  const installAllModuleDependencies = async () => {
    setIsInstallingDependencies(true);
    setDependencyResults([]);

    try {
      const response = await fetch("/api/modules/install-all-dependencies", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Une erreur est survenue lors de l'installation des dépendances",
        );
      }

      setDependencyResults(data.results || []);

      if (data.success) {
        toast.success("Installation des dépendances terminée");
      } else {
        toast.error("Erreur lors de l'installation des dépendances");
      }
    } catch (error) {
      console.error("Erreur lors de l'installation des dépendances:", error);
      toast.error("Erreur lors de l'installation des dépendances");
    } finally {
      setIsInstallingDependencies(false);
    }
  };

  return (
    <div className="w-full space-y-6">
      <AdminPageHeader icon={Settings} title={t("admin.system.title")} description={t("admin.system.description")} />

      <div className="grid gap-6 xl:grid-cols-2">
        {/* Gestion des modules */}
        <Card className="gap-0 rounded-2xl border-border/70 py-0 shadow-sm">
          <CardHeader className="border-b border-border/60 p-5 sm:p-6">
            <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
              <Package className="h-4 w-4 sm:h-5 sm:w-5" />
              Gestion des modules
            </CardTitle>
            <CardDescription className="text-sm">
              Gérez les modules et leurs dépendances
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5 sm:p-6">
            <div className="space-y-4">
              <p className="text-sm">
                Installez les dépendances NPM de tous les modules en une seule
                fois.
              </p>
              <Button
                onClick={installAllModuleDependencies}
                disabled={isInstallingDependencies}
                className="text-sm"
              >
                {isInstallingDependencies ? (
                  <>
                    <Loader2 className="mr-2 h-3 w-3 sm:h-4 sm:w-4 animate-spin" />
                    Installation en cours...
                  </>
                ) : (
                  "Installer toutes les dépendances"
                )}
              </Button>

              {dependencyResults.length > 0 && (
                <div className="mt-4 rounded-xl border border-border/60 bg-background p-3 sm:p-4">
                  <h3 className="text-sm font-medium mb-2">
                    Résultats de l'installation
                  </h3>
                  <div className="space-y-2">
                    {dependencyResults.map((result, index) => (
                      <div
                        key={index}
                        className={`text-xs sm:text-sm p-2 rounded-md ${
                          result.success
                            ? "bg-green-50 text-green-700"
                            : "bg-red-50 text-red-700"
                        }`}
                      >
                        <span className="font-medium">{result.name}:</span>{" "}
                        {result.message}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Configuration des uploads */}
        <Card className="gap-0 rounded-2xl border-border/70 py-0 shadow-sm">
          <CardHeader className="border-b border-border/60 p-5 sm:p-6">
            <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
              <Upload className="h-4 w-4 sm:h-5 sm:w-5" />
              {t("admin.system.upload_config.title")}
            </CardTitle>
            <CardDescription className="text-sm">
              {t("admin.system.upload_config.subtitle")}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5 sm:p-6">
            <div className="space-y-4">
              <p className="text-sm">
                {t("admin.system.upload_config.description")}
              </p>
              <Button asChild className="text-sm">
                <Link href="/uploads/config">
                  {t("admin.system.upload_config.button")}
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Configuration système */}
        <Card className="gap-0 rounded-2xl border-border/70 py-0 shadow-sm xl:col-span-2">
          <CardHeader className="border-b border-border/60 p-5 sm:p-6">
            <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
              <Database className="h-4 w-4 sm:h-5 sm:w-5" />
              {t("admin.system.advanced_config.title")}
            </CardTitle>
            <CardDescription className="text-sm">
              {t("admin.system.advanced_config.subtitle")}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5 sm:p-6">
            <div className="space-y-4">
              <p className="text-sm">
                {t("admin.system.advanced_config.description")}
              </p>
              <ul className="list-disc pl-4 sm:pl-6 space-y-1 sm:space-y-2 text-sm">
                <li>{t("admin.system.features.database")}</li>
                <li>{t("admin.system.features.cache")}</li>
                <li>{t("admin.system.features.performance")}</li>
                <li>{t("admin.system.features.backup")}</li>
                <li>{t("admin.system.features.scheduled_tasks")}</li>
                <li>{t("admin.system.features.notifications")}</li>
              </ul>
              <p className="text-muted-foreground mt-4 text-sm">
                {t("admin.system.advanced_config.coming_soon")}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
