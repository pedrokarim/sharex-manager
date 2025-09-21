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
import { ArrowLeft, Construction, Crown, Check, Star } from "lucide-react";
import { useTranslation } from "@/lib/i18n";

export function UpgradePageClient() {
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
            <div className="p-3 bg-gradient-to-r from-yellow-400 to-orange-500 rounded-full">
              <Crown className="h-8 w-8 sm:h-12 sm:w-12 text-white" />
            </div>
          </div>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-4">
            {t("upgrade.title")}
          </h1>
          <p className="text-muted-foreground text-sm sm:text-base lg:text-lg max-w-2xl mx-auto">
            {t("upgrade.description")}
          </p>
        </div>

        {/* Carte principale */}
        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="text-xl sm:text-2xl flex items-center gap-2">
              <Crown className="h-5 w-5 sm:h-6 w-6 text-yellow-500" />
              {t("upgrade.title")}
            </CardTitle>
            <CardDescription className="text-sm sm:text-base">
              {t("upgrade.description")}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0">
            {/* Fonctionnalités Pro */}
            <div className="mb-6">
              <h3 className="text-lg sm:text-xl font-semibold mb-4 flex items-center gap-2">
                <Star className="h-5 w-5 text-yellow-500" />
                {t("upgrade.features.title")}
              </h3>
              <div className="grid gap-3 sm:gap-4">
                {t("upgrade.features.list").map(
                  (feature: string, index: number) => (
                    <div
                      key={index}
                      className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg"
                    >
                      <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                      <span className="text-sm sm:text-base">{feature}</span>
                    </div>
                  )
                )}
              </div>
            </div>

            {/* Coming Soon Alert */}
            <Alert>
              <Construction className="h-4 w-4" />
              <AlertDescription className="text-sm">
                {t("upgrade.coming_soon.description")}
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
