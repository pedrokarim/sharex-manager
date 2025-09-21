"use client";

import { Shield } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useTranslation } from "@/lib/i18n";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function SecurityPageClient() {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);

  const handleSecurityScan = async () => {
    setIsLoading(true);
    try {
      // Simulation d'une analyse de sécurité
      await new Promise((resolve) => setTimeout(resolve, 2000));
      toast.success(t("admin.security.scan.success"));
    } catch (error) {
      toast.error(t("admin.security.scan.error"));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
          <Shield className="h-6 w-6 sm:h-8 sm:w-8" />
          {t("admin.security.title")}
        </h1>
        <p className="text-muted-foreground mt-2 text-sm sm:text-base">
          {t("admin.security.description")}
        </p>
      </div>

      <Card className="max-w-2xl mb-4 sm:mb-6">
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Shield className="h-4 w-4 sm:h-5 sm:w-5" />
            {t("admin.security.scan.title")}
          </CardTitle>
          <CardDescription className="text-sm">
            {t("admin.security.scan.subtitle")}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 pt-0">
          <div className="space-y-4">
            <p className="text-sm sm:text-base">
              {t("admin.security.scan.description")}
            </p>
            <Button
              onClick={handleSecurityScan}
              disabled={isLoading}
              className="w-full sm:w-auto text-sm"
            >
              {isLoading ? (
                <>
                  <span className="animate-spin mr-2">⚙️</span>
                  {t("admin.security.scan.running")}
                </>
              ) : (
                t("admin.security.scan.button")
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="max-w-2xl">
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Shield className="h-4 w-4 sm:h-5 sm:w-5" />
            {t("admin.security.coming_soon.title")}
          </CardTitle>
          <CardDescription className="text-sm">
            {t("admin.security.coming_soon.subtitle")}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 pt-0">
          <div className="space-y-4">
            <p className="text-sm sm:text-base">
              {t("admin.security.coming_soon.description")}
            </p>
            <ul className="list-disc pl-4 sm:pl-6 space-y-1 sm:space-y-2 text-sm sm:text-base">
              <li>{t("admin.security.features.password_policies")}</li>
              <li>{t("admin.security.features.two_factor")}</li>
              <li>{t("admin.security.features.ip_restrictions")}</li>
              <li>{t("admin.security.features.sessions")}</li>
              <li>{t("admin.security.features.login_attempts")}</li>
              <li>{t("admin.security.features.security_alerts")}</li>
            </ul>
            <p className="text-muted-foreground mt-4 text-sm sm:text-base">
              {t("admin.security.coming_soon.check_back")}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
