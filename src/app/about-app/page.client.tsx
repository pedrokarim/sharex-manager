"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Mail, Globe, ArrowLeft, Heart, ExternalLink } from "lucide-react";
import { appConfig } from "@/lib/constant";
import { Separator } from "@/components/ui/separator";
import { useTranslation } from "@/lib/i18n";

export function AboutPageClient() {
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
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-4">
            {t("about.title")}
          </h1>
          <p className="text-muted-foreground text-sm sm:text-base lg:text-lg max-w-2xl mx-auto">
            {t("about.description")}
          </p>
        </div>

        {/* Carte principale */}
        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader className="text-center p-4 sm:p-6">
            <CardTitle className="text-2xl sm:text-4xl font-bold">
              {appConfig.name}
            </CardTitle>
            <CardDescription className="mt-2 text-sm sm:text-lg">
              {appConfig.description}
            </CardDescription>
            <Badge variant="secondary" className="mt-2 text-xs sm:text-sm">
              Version {appConfig.version}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-4 sm:space-y-6 p-4 sm:p-6">
            <Separator />

            {/* À propos du projet */}
            <div className="space-y-3 sm:space-y-4">
              <h2 className="text-lg sm:text-2xl font-semibold">
                {t("about.project.title")}
              </h2>
              <p className="text-sm sm:text-base text-muted-foreground">
                {t("about.project.description")}
              </p>
            </div>

            <Separator />

            {/* Contact */}
            <div className="space-y-3 sm:space-y-4">
              <h2 className="text-lg sm:text-2xl font-semibold">
                {t("about.contact.title")}
              </h2>
              <div className="flex flex-col gap-2 sm:flex-row sm:gap-4">
                <Button
                  variant="outline"
                  className="flex items-center gap-2 text-sm w-full sm:w-auto"
                  asChild
                >
                  <a
                    href={appConfig.authorUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Globe className="h-3 w-3 sm:h-4 sm:w-4" />
                    {t("about.contact.website")}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </Button>
                <Button
                  variant="outline"
                  className="flex items-center gap-2 text-sm w-full sm:w-auto"
                  asChild
                >
                  <a href={`mailto:${appConfig.authorEmail}`}>
                    <Mail className="h-3 w-3 sm:h-4 sm:w-4" />
                    {t("about.contact.email")}
                  </a>
                </Button>
              </div>
            </div>

            <Separator />

            {/* Footer */}
            <div className="text-center text-xs sm:text-sm text-muted-foreground">
              {t("about.footer")}{" "}
              <a
                href={appConfig.authorUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium underline underline-offset-4 hover:text-foreground transition-colors"
              >
                {appConfig.author}
              </a>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
