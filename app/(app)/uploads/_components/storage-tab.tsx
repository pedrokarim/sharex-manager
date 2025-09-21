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
import { UseFormReturn } from "react-hook-form";
import { UploadConfig } from "@/schemas/upload-config";
import { useTranslation } from "@/lib/i18n";

interface StorageTabProps {
  form: UseFormReturn<UploadConfig>;
}

export function StorageTab({ form }: StorageTabProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4 sm:space-y-6">
      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-base sm:text-lg">
            {t("uploads.config.storage.title")}
          </CardTitle>
          <CardDescription className="text-sm">
            {t("uploads.config.storage.description")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 p-4 sm:p-6 pt-0">
          <FormField
            control={form.control}
            name="storage.path"
            render={({ field }) => (
              <FormItem>
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
            name="storage.structure"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {t("uploads.config.storage.structure.label")}
                </FormLabel>
                <FormControl>
                  <div className="flex gap-4">
                    <div className="flex items-center space-x-2">
                      <input
                        type="radio"
                        id="flat"
                        value="flat"
                        checked={field.value === "flat"}
                        onChange={(e) =>
                          field.onChange(
                            e.target.value as "flat" | "date" | "type"
                          )
                        }
                      />
                      <Label htmlFor="flat">
                        {t("uploads.config.storage.structure.flat")}
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input
                        type="radio"
                        id="date"
                        value="date"
                        checked={field.value === "date"}
                        onChange={(e) =>
                          field.onChange(
                            e.target.value as "flat" | "date" | "type"
                          )
                        }
                      />
                      <Label htmlFor="date">
                        {t("uploads.config.storage.structure.date")}
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input
                        type="radio"
                        id="type"
                        value="type"
                        checked={field.value === "type"}
                        onChange={(e) =>
                          field.onChange(
                            e.target.value as "flat" | "date" | "type"
                          )
                        }
                      />
                      <Label htmlFor="type">
                        {t("uploads.config.storage.structure.type")}
                      </Label>
                    </div>
                  </div>
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="storage.preserveFilenames"
            render={({ field }) => (
              <FormItem className="flex items-center justify-between">
                <FormLabel>
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
              <FormItem className="flex items-center justify-between">
                <FormLabel>
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

          <FormField
            control={form.control}
            name="storage.thumbnailsPath"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {t("uploads.config.storage.thumbnails_path")}
                </FormLabel>
                <FormControl>
                  <Input value={field.value ?? ""} onChange={field.onChange} />
                </FormControl>
              </FormItem>
            )}
          />

          <div className="grid gap-4">
            <FormField
              control={form.control}
              name="storage.dateFormat.folderStructure"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {t("uploads.config.storage.date_format.folder_structure")}
                  </FormLabel>
                  <FormControl>
                    <Input
                      value={field.value ?? ""}
                      onChange={field.onChange}
                    />
                  </FormControl>
                  <FormDescription>
                    {t(
                      "uploads.config.storage.date_format.folder_structure_example"
                    )}
                  </FormDescription>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="storage.dateFormat.timezone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {t("uploads.config.storage.date_format.timezone")}
                  </FormLabel>
                  <FormControl>
                    <Input
                      value={field.value ?? ""}
                      onChange={field.onChange}
                    />
                  </FormControl>
                  <FormDescription>
                    {t("uploads.config.storage.date_format.timezone_example")}
                  </FormDescription>
                </FormItem>
              )}
            />
          </div>

          <div className="grid gap-4">
            <FormField
              control={form.control}
              name="storage.permissions.files"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
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
                <FormItem>
                  <FormLabel>
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
                      "uploads.config.storage.permissions.directories_example"
                    )}
                  </FormDescription>
                </FormItem>
              )}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
