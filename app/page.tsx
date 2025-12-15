"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ArrowRight,
  Upload,
  Shield,
  Image as ImageIcon,
  Zap,
  Settings,
  LineChart,
  Key,
  History,
  Lock,
  Wrench,
  Gamepad2,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { Footer } from "@/components/layout/footer";
import { useSession } from "next-auth/react";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "@/lib/i18n";
import { CatalogAccessButton } from "@/components/catalog/catalog-access-button";

export default function HomePage() {
  const { data: session } = useSession();
  const { t } = useTranslation();

  return (
    <div className="relative min-h-screen flex flex-col">
      {/* Bouton d'accès au catalogue public */}
      <CatalogAccessButton />

      <main className="flex-1">
        {/* Hero Section avec un design plus moderne */}
        <div className="container mx-auto px-4 py-8 sm:py-16">
          <div className="text-center p-3">
            <Image
              src="/images/logo-sxm-simple.png"
              alt="ShareX Manager Logo"
              width={80}
              height={80}
              className="mx-auto"
            />
          </div>
          <div className="mb-8 sm:mb-16 text-center">
            <h1 className="mb-4 text-2xl sm:text-4xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              {t("home.title")}
            </h1>
            <p className="mb-6 sm:mb-8 text-base sm:text-xl text-muted-foreground max-w-2xl mx-auto px-4">
              {t("home.subtitle")}
            </p>
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center items-center px-4">
              <Link href="/gallery" className="w-full sm:w-auto">
                <Button size="lg" className="gap-2 w-full sm:w-auto">
                  {t("home.cta.gallery")}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              {session?.user && (
                <Link href="/settings/api-keys" className="w-full sm:w-auto">
                  <Button
                    size="lg"
                    variant="outline"
                    className="gap-2 w-full sm:w-auto"
                  >
                    {t("home.cta.configure")}
                    <Settings className="h-4 w-4" />
                  </Button>
                </Link>
              )}
            </div>
          </div>

          {/* Features avec plus de détails */}
          <div className="mb-8 sm:mb-16 grid gap-6 sm:gap-8 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
            <Card className="group hover:shadow-lg transition-all">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Upload className="h-5 w-5 text-primary group-hover:scale-110 transition-transform" />
                  {t("home.features.upload.title")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  {t("home.features.upload.description")}
                </p>
                <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-primary" />
                    {t("home.features.upload.fast")}
                  </li>
                  <li className="flex items-center gap-2">
                    <History className="h-4 w-4 text-primary" />
                    {t("home.features.upload.history")}
                  </li>
                </ul>
              </CardContent>
            </Card>

            <Card className="group hover:shadow-lg transition-all">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-primary group-hover:scale-110 transition-transform" />
                  {t("home.features.security.title")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  {t("home.features.security.description")}
                </p>
                <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <Lock className="h-4 w-4 text-primary" />
                    {t("home.features.security.private")}
                  </li>
                  <li className="flex items-center gap-2">
                    <Key className="h-4 w-4 text-primary" />
                    {t("home.features.security.api_keys")}
                  </li>
                </ul>
              </CardContent>
            </Card>

            <Card className="group hover:shadow-lg transition-all">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ImageIcon className="h-5 w-5 text-primary group-hover:scale-110 transition-transform" />
                  {t("home.features.management.title")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  {t("home.features.management.description")}
                </p>
                <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <Settings className="h-4 w-4 text-primary" />
                    {t("home.features.management.customization")}
                  </li>
                  <li className="flex items-center gap-2">
                    <LineChart className="h-4 w-4 text-primary" />
                    {t("home.features.management.stats")}
                  </li>
                </ul>
              </CardContent>
            </Card>

            <Card className="group hover:shadow-lg transition-all">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wrench className="h-5 w-5 text-primary group-hover:scale-110 transition-transform" />
                  {t("home.features.tools.title")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  {t("home.features.tools.description")}
                </p>
                <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <Gamepad2 className="h-4 w-4 text-primary" />
                    {t("home.features.tools.minecraft")}
                  </li>
                  <li className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    {t("home.features.tools.more")}
                  </li>
                </ul>
              </CardContent>
            </Card>
          </div>

          {/* Section Outils */}
          <div className="mb-8 sm:mb-16">
            <div className="text-center mb-8">
              <h2 className="text-2xl sm:text-3xl font-bold mb-4">
                {t("home.tools_section.title")}
              </h2>
              <p className="text-muted-foreground text-lg max-w-2xl mx-auto px-4">
                {t("home.tools_section.subtitle")}
              </p>
            </div>

            <div className="grid gap-6 sm:gap-8 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 max-w-6xl mx-auto px-4">
              {/* Minecraft Skin Tool */}
              <Card className="group hover:shadow-lg transition-all border-2 hover:border-primary/20">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-primary/10 rounded-lg group-hover:bg-primary/20 transition-colors">
                        <Gamepad2 className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">
                          {t("tools.minecraft_skin.title")}
                        </CardTitle>
                        <p className="text-sm text-muted-foreground">Gaming</p>
                      </div>
                    </div>
                    <Badge
                      variant="default"
                      className="bg-green-100 text-green-800"
                    >
                      Disponible
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground mb-4">
                    {t("tools.minecraft_skin.description")}
                  </p>
                  <Link href="/tools/minecraft-skin" className="w-full">
                    <Button className="w-full group-hover:bg-primary/90 transition-colors">
                      {t("tools.minecraft_skin.use_tool")}
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </Link>
                </CardContent>
              </Card>

              {/* Coming Soon Tools */}
              <Card className="group hover:shadow-lg transition-all border-2 border-dashed border-muted-foreground/25">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-muted/50 rounded-lg">
                        <Sparkles className="h-6 w-6 text-muted-foreground" />
                      </div>
                      <div>
                        <CardTitle className="text-lg text-muted-foreground">
                          Plus d'outils
                        </CardTitle>
                        <p className="text-sm text-muted-foreground">Bientôt</p>
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className="bg-gray-100 text-gray-600"
                    >
                      Bientôt
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground mb-4">
                    D'autres outils géniaux arrivent bientôt pour améliorer
                    votre expérience !
                  </p>
                  <Button variant="outline" className="w-full" disabled>
                    Bientôt disponible
                  </Button>
                </CardContent>
              </Card>

              {/* View All Tools */}
              <Card className="group hover:shadow-lg transition-all border-2 hover:border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/20 rounded-lg group-hover:bg-primary/30 transition-colors">
                      <Wrench className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">Tous les outils</CardTitle>
                      <p className="text-sm text-muted-foreground">Découvrir</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground mb-4">
                    Explorez tous nos outils et fonctionnalités supplémentaires
                  </p>
                  <Link href="/tools" className="w-full">
                    <Button
                      variant="outline"
                      className="w-full group-hover:bg-primary group-hover:text-primary-foreground transition-colors"
                    >
                      {t("home.tools_section.cta")}
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Configuration ShareX avec un design amélioré */}
          <div className="mx-auto max-w-2xl px-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-3">
              <h2 className="text-xl sm:text-2xl font-bold">
                {t("home.configuration.title")}
              </h2>
              <Badge variant="outline" className="text-xs">
                {t("home.configuration.badge")}
              </Badge>
            </div>
            <Card className="group hover:shadow-lg transition-all">
              <CardContent className="p-4 sm:p-6">
                <p className="mb-4 text-muted-foreground text-sm sm:text-base">
                  {t("home.configuration.intro")}
                </p>
                <ol className="list-decimal space-y-3 sm:space-y-4 pl-4 text-sm sm:text-base">
                  <li className="text-muted-foreground">
                    {t("home.configuration.steps.step1")}
                  </li>
                  <li className="text-muted-foreground">
                    {t("home.configuration.steps.step2")}
                  </li>
                  <li className="text-muted-foreground">
                    {t("home.configuration.steps.step3")}
                    <div className="mt-3 sm:mt-4 space-y-2 bg-muted/50 p-3 sm:p-4 rounded-lg">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <span className="font-medium text-xs sm:text-sm">
                          {t("home.configuration.config_items.request_url")}
                        </span>
                        <code className="rounded bg-background px-2 py-1 text-xs sm:text-sm break-all">
                          {`${
                            process.env.NEXT_PUBLIC_API_URL ||
                            "http://localhost:3000"
                          }/api/upload`}
                        </code>
                      </div>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <span className="font-medium text-xs sm:text-sm">
                          {t("home.configuration.config_items.method")}
                        </span>
                        <code className="rounded bg-background px-2 py-1 text-xs sm:text-sm">
                          POST
                        </code>
                      </div>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <span className="font-medium text-xs sm:text-sm">
                          {t("home.configuration.config_items.file_form")}
                        </span>
                        <code className="rounded bg-background px-2 py-1 text-xs sm:text-sm">
                          file
                        </code>
                      </div>
                    </div>
                  </li>
                  <li className="text-muted-foreground">
                    {t("home.configuration.steps.step4")}
                  </li>
                </ol>
                <div className="mt-6 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full sm:w-auto"
                  >
                    {t("home.configuration.download_config")}
                  </Button>
                  {session?.user && (
                    <Link
                      href="/settings/api-keys"
                      className="w-full sm:w-auto"
                    >
                      <Button size="sm" className="w-full sm:w-auto">
                        {t("home.configuration.get_api_key")}
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    </Link>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
