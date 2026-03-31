"use client";

import { useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { uploadConfigSchema, type UploadConfig } from "@/schemas/upload-config";
import { Form } from "@/components/ui/form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Loader2, Upload } from "lucide-react";
import { useUploadConfig } from "@/hooks/use-upload-config";
import { GeneralTab } from "../_components/general-tab";
import { ThumbnailsTab } from "../_components/thumbnails-tab";
import { StorageTab } from "../_components/storage-tab";
import { useTranslation } from "@/lib/i18n";

export function ConfigPageClient() {
  const { t } = useTranslation();
  const { config, isLoading, isSaving, saveConfig } = useUploadConfig();

  const form = useForm<UploadConfig>({
    resolver: zodResolver(uploadConfigSchema),
    defaultValues: config,
  });

  useEffect(() => {
    if (config) {
      form.reset(config);
    }
  }, [config, form]);

  const onSubmit = async (data: UploadConfig) => {
    await saveConfig(data);
  };

  if (isLoading) {
    return (
      <main className="flex items-center justify-center flex-1 p-4 sm:p-6 lg:p-8">
        <Loader2 className="h-6 w-6 sm:h-8 sm:w-8 animate-spin" />
      </main>
    );
  }

  return (
    <main className="w-full space-y-6">
      <section className="rounded-2xl border border-border/70 bg-gradient-to-br from-card via-card to-muted/25 p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/80 px-3 py-1 text-xs font-medium text-muted-foreground">
            <Upload className="h-3.5 w-3.5" />
            Configuration des uploads
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            {t("uploads.config.title")}
          </h1>
          <p className="text-muted-foreground text-sm sm:text-base">
            {t("uploads.config.description")}
          </p>
        </div>
      </section>

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="space-y-6 sm:space-y-8"
        >
          <Tabs defaultValue="general" className="space-y-5">
            <div className="space-y-4 rounded-2xl border border-border/70 bg-card p-4 shadow-sm sm:p-5">
              <div className="space-y-1">
                <p className="text-sm font-medium sm:text-base">
                  Atelier de configuration
                </p>
                <p className="text-xs text-muted-foreground sm:text-sm">
                  Structurez le pipeline d&apos;upload par usage: règles
                  globales, génération de vignettes et stratégie de stockage.
                </p>
              </div>
              <div className="overflow-x-auto">
                <TabsList className="flex h-auto min-w-max justify-start gap-1 bg-transparent p-0 sm:grid sm:min-w-0 sm:w-full sm:grid-cols-3 sm:gap-2">
                  <TabsTrigger
                    value="general"
                    className="shrink-0 rounded-xl border border-transparent px-4 py-2 text-xs sm:text-sm data-[state=active]:border-border/70 data-[state=active]:bg-muted/50"
                  >
                    {t("uploads.config.tabs.general")}
                  </TabsTrigger>
                  <TabsTrigger
                    value="thumbnails"
                    className="shrink-0 rounded-xl border border-transparent px-4 py-2 text-xs sm:text-sm data-[state=active]:border-border/70 data-[state=active]:bg-muted/50"
                  >
                    {t("uploads.config.tabs.thumbnails")}
                  </TabsTrigger>
                  <TabsTrigger
                    value="storage"
                    className="shrink-0 rounded-xl border border-transparent px-4 py-2 text-xs sm:text-sm data-[state=active]:border-border/70 data-[state=active]:bg-muted/50"
                  >
                    {t("uploads.config.tabs.storage")}
                  </TabsTrigger>
                </TabsList>
              </div>
            </div>

            <TabsContent value="general">
              <GeneralTab form={form} />
            </TabsContent>

            <TabsContent value="thumbnails">
              <ThumbnailsTab form={form} />
            </TabsContent>

            <TabsContent value="storage">
              <StorageTab form={form} />
            </TabsContent>
          </Tabs>

          <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium sm:text-base">
                Validation des réglages
              </p>
              <p className="text-xs text-muted-foreground sm:text-sm">
                Enregistrez une fois les trois onglets relus pour garder un
                comportement cohérent sur l&apos;ensemble du service.
              </p>
            </div>
            <Button type="submit" disabled={isSaving} className="text-sm">
              {isSaving && (
                <Loader2 className="mr-2 h-3 w-3 sm:h-4 sm:w-4 animate-spin" />
              )}
              {t("common.save")}
            </Button>
          </div>
        </form>
      </Form>
    </main>
  );
}
