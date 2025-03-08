import { Shield } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useTranslation } from "@/lib/i18n";

export default function SecurityPage() {
  const { t } = useTranslation();

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Shield className="h-8 w-8" />
          {t("admin.security.title")}
        </h1>
        <p className="text-muted-foreground mt-2">
          {t("admin.security.description")}
        </p>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            {t("admin.security.coming_soon.title")}
          </CardTitle>
          <CardDescription>
            {t("admin.security.coming_soon.subtitle")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <p>{t("admin.security.coming_soon.description")}</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>{t("admin.security.features.password_policies")}</li>
              <li>{t("admin.security.features.two_factor")}</li>
              <li>{t("admin.security.features.ip_restrictions")}</li>
              <li>{t("admin.security.features.sessions")}</li>
              <li>{t("admin.security.features.login_attempts")}</li>
              <li>{t("admin.security.features.security_alerts")}</li>
            </ul>
            <p className="text-muted-foreground mt-4">
              {t("admin.security.coming_soon.check_back")}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
