"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ArrowLeft, MessageCircle, Github, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useTranslation } from "@/lib/i18n";

export function SupportPageClient() {
  const { t } = useTranslation();

  return (
    <div className="min-h-[calc(100vh-4rem)] flex-col items-center justify-center p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-4xl mx-auto">
        {/* Bouton retour */}
        <Link href="/" className="inline-block mb-4 sm:mb-6">
          <Button variant="ghost" className="text-sm">
            <ArrowLeft className="h-3 w-3 sm:h-4 sm:w-4 mr-2" />
            {t("common.back")}
          </Button>
        </Link>

        {/* Header */}
        <div className="text-center mb-8 sm:mb-12">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-4">
            {t("support.title")}
          </h1>
          <p className="text-muted-foreground text-sm sm:text-base lg:text-lg max-w-2xl mx-auto">
            {t("support.description")}
          </p>
        </div>

        {/* Cartes de support */}
        <div className="grid gap-6 sm:gap-8 md:grid-cols-2">
          {/* Discord Support */}
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader className="p-4 sm:p-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-indigo-100 dark:bg-indigo-900/20 rounded-lg">
                  <MessageCircle className="h-5 w-5 sm:h-6 sm:w-6 text-indigo-600 dark:text-indigo-400" />
                </div>
                <CardTitle className="text-lg sm:text-xl">
                  {t("support.discord.title")}
                </CardTitle>
              </div>
              <CardDescription className="text-sm">
                {t("support.discord.description")}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-0">
              <div className="space-y-4">
                <div className="bg-indigo-50 dark:bg-indigo-900/10 p-3 sm:p-4 rounded-lg">
                  <h4 className="font-medium text-sm sm:text-base mb-2">
                    {t("support.discord.benefits")}
                  </h4>
                  <ul className="text-xs sm:text-sm space-y-1 text-muted-foreground">
                    <li>• {t("support.discord.benefits_list.0")}</li>
                    <li>• {t("support.discord.benefits_list.1")}</li>
                    <li>• {t("support.discord.benefits_list.2")}</li>
                    <li>• {t("support.discord.benefits_list.3")}</li>
                  </ul>
                </div>
                <Button asChild className="w-full text-sm">
                  <a
                    href="https://discord.gg/rTd95UpUEb"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2"
                  >
                    <MessageCircle className="h-4 w-4" />
                    {t("support.discord.join_button")}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* GitHub Support */}
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader className="p-4 sm:p-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
                  <Github className="h-5 w-5 sm:h-6 sm:w-6 text-gray-600 dark:text-gray-400" />
                </div>
                <CardTitle className="text-lg sm:text-xl">
                  {t("support.github.title")}
                </CardTitle>
              </div>
              <CardDescription className="text-sm">
                {t("support.github.description")}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-0">
              <div className="space-y-4">
                <div className="bg-gray-50 dark:bg-gray-900/10 p-3 sm:p-4 rounded-lg">
                  <h4 className="font-medium text-sm sm:text-base mb-2">
                    {t("support.github.available")}
                  </h4>
                  <ul className="text-xs sm:text-sm space-y-1 text-muted-foreground">
                    <li>• {t("support.github.available_list.0")}</li>
                    <li>• {t("support.github.available_list.1")}</li>
                    <li>• {t("support.github.available_list.2")}</li>
                    <li>• {t("support.github.available_list.3")}</li>
                  </ul>
                </div>
                <Button asChild variant="outline" className="w-full text-sm">
                  <a
                    href="https://github.com/AliasPedroKarim/sharex-manager"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2"
                  >
                    <Github className="h-4 w-4" />
                    {t("support.github.view_button")}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Section FAQ rapide */}
        <Card className="mt-8 sm:mt-12">
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="text-lg sm:text-xl">
              {t("support.faq.title")}
            </CardTitle>
            <CardDescription className="text-sm">
              {t("support.faq.description")}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0">
            <div className="space-y-4">
              <div className="border-l-4 border-blue-500 pl-4">
                <h4 className="font-medium text-sm sm:text-base mb-1">
                  {t("support.faq.questions.0.question")}
                </h4>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {t("support.faq.questions.0.answer")}
                </p>
              </div>
              <div className="border-l-4 border-green-500 pl-4">
                <h4 className="font-medium text-sm sm:text-base mb-1">
                  {t("support.faq.questions.1.question")}
                </h4>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {t("support.faq.questions.1.answer")}
                </p>
              </div>
              <div className="border-l-4 border-purple-500 pl-4">
                <h4 className="font-medium text-sm sm:text-base mb-1">
                  {t("support.faq.questions.2.question")}
                </h4>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {t("support.faq.questions.2.answer")}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center mt-8 sm:mt-12 text-xs sm:text-sm text-muted-foreground">
          <p>{t("support.footer")}</p>
        </div>
      </div>
    </div>
  );
}
