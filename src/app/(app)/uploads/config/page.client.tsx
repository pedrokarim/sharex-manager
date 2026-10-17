"use client";

import { useEffect } from "react";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { uploadConfigSchema, type UploadConfig } from "@/schemas/upload-config";
import { Form } from "@/components/ui/form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";
import { LoadingState } from "@/components/loading";
import { useUploadConfig } from "@/hooks/use-upload-config";
import { ActionStatus, FormStatus, useFeedback, type FeedbackState } from "@/components/feedback";
import { GeneralTab } from "../_components/general-tab";
import { ThumbnailsTab } from "../_components/thumbnails-tab";
import { StorageTab } from "../_components/storage-tab";
import { useTranslation } from "@/lib/i18n";

const CONFIG_TABS = ["general", "thumbnails", "storage"] as const;

export function ConfigPageClient() {
  const { t } = useTranslation();
  // Onglet gardé dans l'adresse (?tab=) : un lien ou le bouton Retour rouvrent le même.
  const [tab, setTab] = useQueryState("tab", parseAsStringLiteral(CONFIG_TABS).withDefault("general").withOptions({ history: "push" }));
  const { config, isLoading, isSaving, loadError, saveConfig } = useUploadConfig();
  // Enregistrement : l'erreur au-dessus du bouton, la réussite à côté.
  const saveFeedback = useFeedback();
  // Échec du chargement : un état durable de la page, en tête du formulaire.
  const loadStatus: FeedbackState | null = loadError ? { tone: "error", message: loadError, id: 0 } : null;

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
    saveFeedback.clear();
    const result = await saveConfig(data);
    if (result.ok) saveFeedback.success("Enregistré");
    else saveFeedback.error(result.error);
  };

  if (isLoading) {
    return (
      <main className="flex flex-1 flex-col p-4 sm:p-6 lg:p-8">
        <LoadingState fill />
      </main>
    );
  }

  return (
    <main className="w-full space-y-6">
      <section className="rounded-2xl border border-border/70 bg-gradient-to-br from-card via-card to-muted/25 p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-2">
          <h1 className="flex items-center gap-3 text-2xl font-bold tracking-tight sm:text-3xl">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-background/80 text-muted-foreground shadow-sm sm:h-11 sm:w-11">
              <Upload className="h-5 w-5" />
            </span>
            {t("uploads.config.title")}
          </h1>
          <p className="text-muted-foreground text-sm sm:text-base">
            {t("uploads.config.description")}
          </p>
        </div>
      </section>

      <FormStatus state={loadStatus} />

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          // Corriger un réglage retire l'erreur d'enregistrement.
          onChange={saveFeedback.state?.tone === "error" ? saveFeedback.clear : undefined}
          className="space-y-6 sm:space-y-8"
        >
          <Tabs value={tab} onValueChange={(next) => void setTab(next === "general" ? null : (next as (typeof CONFIG_TABS)[number]))} className="space-y-5">
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
              {/* Défilement horizontal seulement (téléphone) : overflow-x-auto rend aussi l'axe vertical
                  défilable. La barre prend la hauteur de ses onglets (h-auto) : à 36 px, le bas du
                  cadre de l'onglet actif était rogné. */}
              <div className="overflow-x-auto overflow-y-hidden">
                <TabsList indicator="none" className="flex h-auto min-w-max group-data-[orientation=horizontal]/tabs:h-auto justify-start gap-1 bg-transparent p-0 sm:grid sm:min-w-0 sm:w-full sm:grid-cols-3 sm:gap-2">
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

          <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
            <FormStatus
              state={saveFeedback.state?.tone === "error" ? saveFeedback.state : null}
              className="pb-3"
            />
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 space-y-1">
                <p className="text-sm font-medium sm:text-base">
                  Validation des réglages
                </p>
                <p className="text-xs text-muted-foreground sm:text-sm">
                  Enregistrez une fois les trois onglets relus pour garder un
                  comportement cohérent sur l&apos;ensemble du service.
                </p>
              </div>
              {/* Le bouton reste à droite ; « Enregistré » apparaît à sa gauche. */}
              <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 sm:flex-row-reverse">
                <Button type="submit" loading={isSaving} className="text-sm">
                  {t("common.save")}
                </Button>
                <ActionStatus
                  state={saveFeedback.state?.tone === "success" ? saveFeedback.state : null}
                />
              </div>
            </div>
          </div>
        </form>
      </Form>
    </main>
  );
}
