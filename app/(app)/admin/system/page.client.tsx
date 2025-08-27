"use client";

import {
  Settings,
  Upload,
  Database,
  RefreshCw,
  Server,
  Package,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n";
import { useState } from "react";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";

interface SystemStats {
  cpuUsage: number;
  memoryUsage: number;
  diskUsage: number;
  uptime: string;
}

interface ModuleDependencyResult {
  name: string;
  success: boolean;
  message: string;
}

export default function SystemPageClient() {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const [isInstallingDependencies, setIsInstallingDependencies] =
    useState(false);
  const [dependencyResults, setDependencyResults] = useState<
    ModuleDependencyResult[]
  >([]);
  const [systemStats, setSystemStats] = useState<SystemStats>({
    cpuUsage: 12,
    memoryUsage: 45,
    diskUsage: 38,
    uptime: "3d 7h 22m",
  });

  const refreshSystemStats = async () => {
    setIsLoading(true);
    try {
      // Simulation d'une requête pour obtenir les statistiques système
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Simuler de nouvelles valeurs
      setSystemStats({
        cpuUsage: Math.floor(Math.random() * 30) + 5,
        memoryUsage: Math.floor(Math.random() * 60) + 20,
        diskUsage: Math.floor(Math.random() * 20) + 30,
        uptime: "3d 7h " + Math.floor(Math.random() * 59) + "m",
      });

      toast.success(t("admin.system.stats.refresh_success"));
    } catch (error) {
      toast.error(t("admin.system.stats.refresh_error"));
    } finally {
      setIsLoading(false);
    }
  };

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
            "Une erreur est survenue lors de l'installation des dépendances"
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
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Settings className="h-8 w-8" />
          {t("admin.system.title")}
        </h1>
        <p className="text-muted-foreground mt-2">
          {t("admin.system.description")}
        </p>
      </div>

      {/* Statistiques système */}
      <Card className="mb-6 max-w-4xl">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5" />
              {t("admin.system.stats.title")}
            </CardTitle>
            <CardDescription>
              {t("admin.system.stats.subtitle")}
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={refreshSystemStats}
            disabled={isLoading}
          >
            <RefreshCw
              className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
            />
          </Button>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <div className="space-y-2">
              <div className="flex justify-between">
                <span>{t("admin.system.stats.cpu")}</span>
                <span>{systemStats.cpuUsage}%</span>
              </div>
              <Progress value={systemStats.cpuUsage} className="h-2" />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between">
                <span>{t("admin.system.stats.memory")}</span>
                <span>{systemStats.memoryUsage}%</span>
              </div>
              <Progress value={systemStats.memoryUsage} className="h-2" />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between">
                <span>{t("admin.system.stats.disk")}</span>
                <span>{systemStats.diskUsage}%</span>
              </div>
              <Progress value={systemStats.diskUsage} className="h-2" />
            </div>
          </div>
        </CardContent>
        <CardFooter>
          <div className="text-sm text-muted-foreground">
            {t("admin.system.stats.uptime")}: {systemStats.uptime}
          </div>
        </CardFooter>
      </Card>

      <div className="grid gap-6 max-w-4xl">
        {/* Gestion des modules */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Gestion des modules
            </CardTitle>
            <CardDescription>
              Gérez les modules et leurs dépendances
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <p>
                Installez les dépendances NPM de tous les modules en une seule
                fois.
              </p>
              <Button
                onClick={installAllModuleDependencies}
                disabled={isInstallingDependencies}
              >
                {isInstallingDependencies ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Installation en cours...
                  </>
                ) : (
                  "Installer toutes les dépendances"
                )}
              </Button>

              {dependencyResults.length > 0 && (
                <div className="mt-4 border rounded-md p-4">
                  <h3 className="text-sm font-medium mb-2">
                    Résultats de l'installation
                  </h3>
                  <div className="space-y-2">
                    {dependencyResults.map((result, index) => (
                      <div
                        key={index}
                        className={`text-sm p-2 rounded-md ${
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
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              {t("admin.system.upload_config.title")}
            </CardTitle>
            <CardDescription>
              {t("admin.system.upload_config.subtitle")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <p>{t("admin.system.upload_config.description")}</p>
              <Button asChild>
                <Link href="/uploads/config">
                  {t("admin.system.upload_config.button")}
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Configuration système */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              {t("admin.system.advanced_config.title")}
            </CardTitle>
            <CardDescription>
              {t("admin.system.advanced_config.subtitle")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <p>{t("admin.system.advanced_config.description")}</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>{t("admin.system.features.database")}</li>
                <li>{t("admin.system.features.cache")}</li>
                <li>{t("admin.system.features.performance")}</li>
                <li>{t("admin.system.features.backup")}</li>
                <li>{t("admin.system.features.scheduled_tasks")}</li>
                <li>{t("admin.system.features.notifications")}</li>
              </ul>
              <p className="text-muted-foreground mt-4">
                {t("admin.system.advanced_config.coming_soon")}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
