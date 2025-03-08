import { Settings, Upload, Database } from "lucide-react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n";

export default function SystemPage() {
  const { t } = useTranslation();

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

      <div className="grid gap-6 max-w-4xl">
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
