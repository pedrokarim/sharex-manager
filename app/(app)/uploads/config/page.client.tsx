"use client";

import { useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { uploadConfigSchema, type UploadConfig } from "@/schemas/upload-config";
import { Form } from "@/components/ui/form";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useUploadConfig } from "@/hooks/use-upload-config";
import { GeneralTab } from "../_components/general-tab";
import { ThumbnailsTab } from "../_components/thumbnails-tab";
import { StorageTab } from "../_components/storage-tab";

export function ConfigPageClient() {
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
      <main className="flex items-center justify-center flex-1">
        <Loader2 className="h-8 w-8 animate-spin" />
      </main>
    );
  }

  return (
    <main className="p-8">
      <div className="bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex flex-col gap-4 py-4">
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-bold tracking-tight">
              Configuration des uploads
            </h1>
            <p className="text-muted-foreground">
              Configurez les paramètres de vos uploads ShareX
            </p>
          </div>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <Tabs defaultValue="general" className="space-y-4">
          <TabsList>
            <TabsTrigger value="general">Général</TabsTrigger>
            <TabsTrigger value="thumbnails">Miniatures</TabsTrigger>
            <TabsTrigger value="storage">Stockage</TabsTrigger>
          </TabsList>

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

          <div className="flex justify-end">
            <Button type="submit" disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Sauvegarder
            </Button>
      </div>
        </form>
      </Form>
    </main>
  );
}
