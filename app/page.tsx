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
} from "lucide-react";
import Link from "next/link";
import { Footer } from "@/components/layout/footer";
import { useSession } from "next-auth/react";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "@/lib/i18n";

export default function HomePage() {
  const { data: session } = useSession();
  const { t } = useTranslation();

  return (
    <div className="relative min-h-screen flex flex-col">
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
          <div className="mb-8 sm:mb-16 grid gap-6 sm:gap-8 grid-cols-1 md:grid-cols-3">
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
