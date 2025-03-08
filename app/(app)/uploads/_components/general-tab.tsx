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
import { UseFormReturn } from "react-hook-form";
import { UploadConfig } from "@/schemas/upload-config";
import { useTranslation } from "@/lib/i18n";

interface GeneralTabProps {
  form: UseFormReturn<UploadConfig>;
}

export function GeneralTab({ form }: GeneralTabProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>
            {t("uploads.config.general.allowed_types.title")}
          </CardTitle>
          <CardDescription>
            {t("uploads.config.general.allowed_types.description")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FormField
            control={form.control}
            name="allowedTypes.images"
            render={({ field }) => (
              <FormItem className="flex items-center justify-between">
                <FormLabel>
                  {t("uploads.config.general.allowed_types.images")}
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
            name="allowedTypes.documents"
            render={({ field }) => (
              <FormItem className="flex items-center justify-between">
                <FormLabel>
                  {t("uploads.config.general.allowed_types.documents")}
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
            name="allowedTypes.archives"
            render={({ field }) => (
              <FormItem className="flex items-center justify-between">
                <FormLabel>
                  {t("uploads.config.general.allowed_types.archives")}
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("uploads.config.general.limits.title")}</CardTitle>
          <CardDescription>
            {t("uploads.config.general.limits.description")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4">
            <FormField
              control={form.control}
              name="limits.maxFileSize"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {t("uploads.config.general.limits.max_file_size")}
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="1"
                      value={field.value ?? ""}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="limits.minFileSize"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {t("uploads.config.general.limits.min_file_size")}
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="1"
                      value={field.value ?? ""}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="limits.maxFilesPerUpload"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {t("uploads.config.general.limits.max_files_per_upload")}
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="1"
                      value={field.value ?? ""}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="limits.maxFilesPerType.images"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {t("uploads.config.general.limits.max_images")}
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="1"
                      value={field.value ?? ""}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="limits.maxFilesPerType.documents"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {t("uploads.config.general.limits.max_documents")}
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="1"
                      value={field.value ?? ""}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="limits.maxFilesPerType.archives"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {t("uploads.config.general.limits.max_archives")}
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="1"
                      value={field.value ?? ""}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("uploads.config.general.filename.title")}</CardTitle>
          <CardDescription>
            {t("uploads.config.general.filename.description")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FormField
            control={form.control}
            name="filenamePattern"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {t("uploads.config.general.filename.pattern")}
                </FormLabel>
                <FormControl>
                  <Input value={field.value ?? ""} onChange={field.onChange} />
                </FormControl>
                <FormDescription>
                  {t("uploads.config.general.filename.variables", {
                    variables: "{timestamp}, {original}, {random}",
                  })}
                </FormDescription>
              </FormItem>
            )}
          />
        </CardContent>
      </Card>
    </div>
  );
}
