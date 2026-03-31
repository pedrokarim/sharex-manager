"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
} from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { UseFormReturn } from "react-hook-form";
import { UploadConfig } from "@/schemas/upload-config";
import { useTranslation } from "@/lib/i18n";
import { CalendarDays, HardDrive, Layers3, ShieldCheck } from "lucide-react";

interface StorageTabProps {
  form: UseFormReturn<UploadConfig>;
}

export function StorageTab({ form }: StorageTabProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4 sm:space-y-6">
      <Card className="rounded-2xl border-border/70 shadow-sm">
        <CardHeader className="border-b border-border/60 p-4 sm:p-6">
          <CardTitle className="text-base sm:text-lg">
            {t("uploads.config.storage.title")}
          </CardTitle>
          <CardDescription className="text-sm">
            {t("uploads.config.storage.description")}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 pt-0">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
            <div className="space-y-4">
              <div className="space-y-4 rounded-xl border border-border/60 bg-muted/20 p-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <HardDrive className="h-4 w-4" />
                    <p className="text-sm font-medium sm:text-base">
                      Emplacements de stockage
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground sm:text-sm">
                    Centralisez ici les chemins principaux utilisés par le
                    service d&apos;upload.
                  </p>
                </div>

                <FormField
                  control={form.control}
                  name="storage.path"
                  render={({ field }) => (
                    <FormItem className="rounded-xl border border-border/60 bg-background p-4">
                      <FormLabel className="text-sm">
                        {t("uploads.config.storage.path")}
                      </FormLabel>
                      <FormControl>
                        <Input
                          value={field.value ?? ""}
                          onChange={field.onChange}
                          className="text-sm"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="storage.thumbnailsPath"
                  render={({ field }) => (
                    <FormItem className="rounded-xl border border-border/60 bg-background p-4">
                      <FormLabel className="text-sm">
                        {t("uploads.config.storage.thumbnails_path")}
                      </FormLabel>
                      <FormControl>
                        <Input
                          value={field.value ?? ""}
                          onChange={field.onChange}
                          className="text-sm"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              <div className="space-y-4 rounded-xl border border-border/60 bg-muted/20 p-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Layers3 className="h-4 w-4" />
                    <p className="text-sm font-medium sm:text-base">
                      Organisation des fichiers
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground sm:text-sm">
                    Choisissez une structure claire pour éviter des dossiers
                    illisibles au fil du temps.
                  </p>
                </div>

                <FormField
                  control={form.control}
                  name="storage.structure"
                  render={({ field }) => (
                    <FormItem className="space-y-3">
                      <FormLabel className="text-sm">
                        {t("uploads.config.storage.structure.label")}
                      </FormLabel>
                      <FormControl>
                        <RadioGroup
                          value={field.value}
                          onValueChange={field.onChange}
                          className="grid gap-3 sm:grid-cols-3"
                        >
                          <Label
                            htmlFor="storage-structure-flat"
                            className="flex cursor-pointer items-center gap-3 rounded-xl border border-border/60 bg-background px-4 py-3"
                          >
                            <RadioGroupItem
                              value="flat"
                              id="storage-structure-flat"
                            />
                            <span className="text-sm">
                              {t("uploads.config.storage.structure.flat")}
                            </span>
                          </Label>
                          <Label
                            htmlFor="storage-structure-date"
                            className="flex cursor-pointer items-center gap-3 rounded-xl border border-border/60 bg-background px-4 py-3"
                          >
                            <RadioGroupItem
                              value="date"
                              id="storage-structure-date"
                            />
                            <span className="text-sm">
                              {t("uploads.config.storage.structure.date")}
                            </span>
                          </Label>
                          <Label
                            htmlFor="storage-structure-type"
                            className="flex cursor-pointer items-center gap-3 rounded-xl border border-border/60 bg-background px-4 py-3"
                          >
                            <RadioGroupItem
                              value="type"
                              id="storage-structure-type"
                            />
                            <span className="text-sm">
                              {t("uploads.config.storage.structure.type")}
                            </span>
                          </Label>
                        </RadioGroup>
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              <div className="space-y-3 rounded-xl border border-border/60 bg-muted/20 p-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium sm:text-base">
                    Règles d&apos;écriture
                  </p>
                  <p className="text-xs text-muted-foreground sm:text-sm">
                    Gardez un comportement stable lors des remplacements ou des
                    imports déjà nommés.
                  </p>
                </div>

                <FormField
                  control={form.control}
                  name="storage.preserveFilenames"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-xl border border-border/60 bg-background px-4 py-3">
                      <FormLabel className="text-sm">
                        {t("uploads.config.storage.preserve_filenames")}
                      </FormLabel>
                      <FormControl>
                        <Switch
                          checked={field.value ?? false}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="storage.replaceExisting"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-xl border border-border/60 bg-background px-4 py-3">
                      <FormLabel className="text-sm">
                        {t("uploads.config.storage.replace_existing")}
                      </FormLabel>
                      <FormControl>
                        <Switch
                          checked={field.value ?? false}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-4 rounded-xl border border-border/60 bg-muted/20 p-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <CalendarDays className="h-4 w-4" />
                    <p className="text-sm font-medium sm:text-base">
                      Structure calendaire
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground sm:text-sm">
                    Harmonisez le découpage par date pour que les dossiers
                    restent lisibles.
                  </p>
                </div>

                <FormField
                  control={form.control}
                  name="storage.dateFormat.folderStructure"
                  render={({ field }) => (
                    <FormItem className="rounded-xl border border-border/60 bg-background p-4">
                      <FormLabel className="text-sm">
                        {t(
                          "uploads.config.storage.date_format.folder_structure",
                        )}
                      </FormLabel>
                      <FormControl>
                        <Input
                          value={field.value ?? ""}
                          onChange={field.onChange}
                        />
                      </FormControl>
                      <FormDescription>
                        {t(
                          "uploads.config.storage.date_format.folder_structure_example",
                        )}
                      </FormDescription>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="storage.dateFormat.timezone"
                  render={({ field }) => (
                    <FormItem className="rounded-xl border border-border/60 bg-background p-4">
                      <FormLabel className="text-sm">
                        {t("uploads.config.storage.date_format.timezone")}
                      </FormLabel>
                      <FormControl>
                        <Input
                          value={field.value ?? ""}
                          onChange={field.onChange}
                        />
                      </FormControl>
                      <FormDescription>
                        {t(
                          "uploads.config.storage.date_format.timezone_example",
                        )}
                      </FormDescription>
                    </FormItem>
                  )}
                />
              </div>

              <div className="space-y-4 rounded-xl border border-border/60 bg-muted/20 p-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4" />
                    <p className="text-sm font-medium sm:text-base">
                      Permissions de sortie
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground sm:text-sm">
                    Définissez les droits appliqués aux fichiers et aux
                    répertoires créés.
                  </p>
                </div>

                <FormField
                  control={form.control}
                  name="storage.permissions.files"
                  render={({ field }) => (
                    <FormItem className="rounded-xl border border-border/60 bg-background p-4">
                      <FormLabel className="text-sm">
                        {t("uploads.config.storage.permissions.files")}
                      </FormLabel>
                      <FormControl>
                        <Input
                          value={field.value ?? ""}
                          onChange={field.onChange}
                        />
                      </FormControl>
                      <FormDescription>
                        {t("uploads.config.storage.permissions.files_example")}
                      </FormDescription>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="storage.permissions.directories"
                  render={({ field }) => (
                    <FormItem className="rounded-xl border border-border/60 bg-background p-4">
                      <FormLabel className="text-sm">
                        {t("uploads.config.storage.permissions.directories")}
                      </FormLabel>
                      <FormControl>
                        <Input
                          value={field.value ?? ""}
                          onChange={field.onChange}
                        />
                      </FormControl>
                      <FormDescription>
                        {t(
                          "uploads.config.storage.permissions.directories_example",
                        )}
                      </FormDescription>
                    </FormItem>
                  )}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
