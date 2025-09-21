"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Construction,
  User,
  Shield,
  Settings,
  Clock,
} from "lucide-react";
import { useTranslation } from "@/lib/i18n";

export function AccountPageClient() {
  const { t } = useTranslation();

  return (
    <div className="min-h-[calc(100vh-4rem)] flex-col items-center justify-center p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-4xl mx-auto">
        {/* Bouton retour */}
        <Button variant="ghost" className="mb-4 sm:mb-6 text-sm" asChild>
          <a href="/">
            <ArrowLeft className="h-3 w-3 sm:h-4 sm:w-4 mr-2" />
            {t("common.back")}
          </a>
        </Button>

        {/* Header */}
        <div className="text-center mb-8 sm:mb-12">
          <div className="flex items-center justify-center mb-4">
            <div className="p-3 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full">
              <User className="h-8 w-8 sm:h-12 sm:w-12 text-white" />
            </div>
          </div>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-4">
            {t("account.title")}
          </h1>
          <p className="text-muted-foreground text-sm sm:text-base lg:text-lg max-w-2xl mx-auto">
            {t("account.description")}
          </p>
        </div>

        {/* Cartes de fonctionnalités */}
        <div className="grid gap-6 sm:gap-8 md:grid-cols-2">
          {/* Profil utilisateur */}
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader className="p-4 sm:p-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/20 rounded-lg">
                  <User className="h-5 w-5 sm:h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
                <CardTitle className="text-lg sm:text-xl">
                  {t("account.profile.title")}
                </CardTitle>
              </div>
              <CardDescription className="text-sm">
                {t("account.profile.description")}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-0">
              <Alert>
                <Construction className="h-4 w-4" />
                <AlertDescription className="text-sm">
                  {t("account.coming_soon.description")}
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>

          {/* Sécurité */}
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader className="p-4 sm:p-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-green-100 dark:bg-green-900/20 rounded-lg">
                  <Shield className="h-5 w-5 sm:h-6 w-6 text-green-600 dark:text-green-400" />
                </div>
                <CardTitle className="text-lg sm:text-xl">
                  {t("account.security.title")}
                </CardTitle>
              </div>
              <CardDescription className="text-sm">
                {t("account.security.description")}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-0">
              <Alert>
                <Construction className="h-4 w-4" />
                <AlertDescription className="text-sm">
                  {t("account.coming_soon.description")}
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>

          {/* Préférences */}
          <Card className="hover:shadow-lg transition-shadow md:col-span-2">
            <CardHeader className="p-4 sm:p-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-purple-100 dark:bg-purple-900/20 rounded-lg">
                  <Settings className="h-5 w-5 sm:h-6 w-6 text-purple-600 dark:text-purple-400" />
                </div>
                <CardTitle className="text-lg sm:text-xl">
                  {t("account.preferences.title")}
                </CardTitle>
              </div>
              <CardDescription className="text-sm">
                {t("account.preferences.description")}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    {t("account.coming_soon.description")}
                  </span>
                </div>
                <Button variant="outline" size="sm" disabled>
                  <Settings className="h-3 w-3 mr-2" />
                  Bientôt
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
