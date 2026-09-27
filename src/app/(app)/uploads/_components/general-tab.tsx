"use client";

import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
} from "@/components/ui/form";
import { BoundedNumberControl } from "@/components/ui/bounded-number-control";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useTranslation } from "@/lib/i18n";
import { UploadConfig } from "@/schemas/upload-config";
import { UPLOAD_CONFIG_LIMITS } from "@/schemas/upload-config";
import { UseFormReturn } from "react-hook-form";

interface GeneralTabProps {
  form: UseFormReturn<UploadConfig>;
}

export function GeneralTab({ form }: GeneralTabProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4 sm:space-y-6">
      <section className="space-y-4">
        <div className="space-y-1 px-1">
          <h2 className="text-base font-semibold sm:text-lg">
            {t("uploads.config.general.allowed_types.title")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("uploads.config.general.allowed_types.description")}
          </p>
        </div>

        <div className="space-y-4">
          <FormField
            control={form.control}
            name="allowedTypes.images"
            render={({ field }) => (
              <FormItem className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/20 p-4">
                <FormLabel className="text-sm">
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
              <FormItem className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/20 p-4">
                <FormLabel className="text-sm">
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
              <FormItem className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/20 p-4">
                <FormLabel className="text-sm">
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
        </div>
      </section>

      <section className="space-y-4">
        <div className="space-y-1 px-1">
          <h2 className="text-base font-semibold sm:text-lg">
            {t("uploads.config.general.limits.title")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("uploads.config.general.limits.description")}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="limits.maxFileSize"
            render={({ field }) => (
              <FormItem className="rounded-xl border border-border/60 bg-muted/20 p-4">
                <FormLabel className="text-sm">
                  {t("uploads.config.general.limits.max_file_size")}
                </FormLabel>
                <FormControl>
                  <BoundedNumberControl
                    value={field.value}
                    onChange={field.onChange}
                    min={UPLOAD_CONFIG_LIMITS.maxFileSizeMb.min}
                    max={UPLOAD_CONFIG_LIMITS.maxFileSizeMb.max}
                    step={UPLOAD_CONFIG_LIMITS.maxFileSizeMb.step}
                    unit="MB"
                    ariaLabel={t("uploads.config.general.limits.max_file_size")}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="limits.minFileSize"
            render={({ field }) => (
              <FormItem className="rounded-xl border border-border/60 bg-muted/20 p-4">
                <FormLabel className="text-sm">
                  {t("uploads.config.general.limits.min_file_size")}
                </FormLabel>
                <FormControl>
                  <BoundedNumberControl
                    value={field.value}
                    onChange={field.onChange}
                    min={UPLOAD_CONFIG_LIMITS.minFileSizeKb.min}
                    max={UPLOAD_CONFIG_LIMITS.minFileSizeKb.max}
                    step={UPLOAD_CONFIG_LIMITS.minFileSizeKb.step}
                    unit="KB"
                    ariaLabel={t("uploads.config.general.limits.min_file_size")}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="limits.maxFilesPerUpload"
            render={({ field }) => (
              <FormItem className="rounded-xl border border-border/60 bg-muted/20 p-4">
                <FormLabel className="text-sm">
                  {t("uploads.config.general.limits.max_files_per_upload")}
                </FormLabel>
                <FormControl>
                  <BoundedNumberControl
                    value={field.value}
                    onChange={field.onChange}
                    min={UPLOAD_CONFIG_LIMITS.maxFilesPerUpload.min}
                    max={UPLOAD_CONFIG_LIMITS.maxFilesPerUpload.max}
                    step={UPLOAD_CONFIG_LIMITS.maxFilesPerUpload.step}
                    ariaLabel={t(
                      "uploads.config.general.limits.max_files_per_upload",
                    )}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="limits.maxFilesPerType.images"
            render={({ field }) => (
              <FormItem className="rounded-xl border border-border/60 bg-muted/20 p-4">
                <FormLabel className="text-sm">
                  {t("uploads.config.general.limits.max_images")}
                </FormLabel>
                <FormControl>
                  <BoundedNumberControl
                    value={field.value}
                    onChange={field.onChange}
                    min={UPLOAD_CONFIG_LIMITS.maxFilesPerType.min}
                    max={UPLOAD_CONFIG_LIMITS.maxFilesPerType.max}
                    step={UPLOAD_CONFIG_LIMITS.maxFilesPerType.step}
                    ariaLabel={t("uploads.config.general.limits.max_images")}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="limits.maxFilesPerType.documents"
            render={({ field }) => (
              <FormItem className="rounded-xl border border-border/60 bg-muted/20 p-4">
                <FormLabel className="text-sm">
                  {t("uploads.config.general.limits.max_documents")}
                </FormLabel>
                <FormControl>
                  <BoundedNumberControl
                    value={field.value}
                    onChange={field.onChange}
                    min={UPLOAD_CONFIG_LIMITS.maxFilesPerType.min}
                    max={UPLOAD_CONFIG_LIMITS.maxFilesPerType.max}
                    step={UPLOAD_CONFIG_LIMITS.maxFilesPerType.step}
                    ariaLabel={t("uploads.config.general.limits.max_documents")}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="limits.maxFilesPerType.archives"
            render={({ field }) => (
              <FormItem className="rounded-xl border border-border/60 bg-muted/20 p-4">
                <FormLabel className="text-sm">
                  {t("uploads.config.general.limits.max_archives")}
                </FormLabel>
                <FormControl>
                  <BoundedNumberControl
                    value={field.value}
                    onChange={field.onChange}
                    min={UPLOAD_CONFIG_LIMITS.maxFilesPerType.min}
                    max={UPLOAD_CONFIG_LIMITS.maxFilesPerType.max}
                    step={UPLOAD_CONFIG_LIMITS.maxFilesPerType.step}
                    ariaLabel={t("uploads.config.general.limits.max_archives")}
                  />
                </FormControl>
              </FormItem>
            )}
          />
        </div>
      </section>

      <section className="space-y-4">
        <div className="space-y-1 px-1">
          <h2 className="text-base font-semibold sm:text-lg">
            {t("uploads.config.general.filename.title")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("uploads.config.general.filename.description")}
          </p>
        </div>

        <div className="space-y-4">
          <FormField
            control={form.control}
            name="filenamePattern"
            render={({ field }) => (
              <FormItem className="rounded-xl border border-border/60 bg-muted/20 p-4">
                <FormLabel className="text-sm">
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
        </div>
      </section>
    </div>
  );
}
