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
} from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { ImageIcon, Pipette, SlidersHorizontal, Sparkles } from "lucide-react";
import { UseFormReturn } from "react-hook-form";
import { UploadConfig } from "@/schemas/upload-config";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BlockPicker } from "react-color";
import { useTranslation } from "@/lib/i18n";

interface ThumbnailsTabProps {
  form: UseFormReturn<UploadConfig>;
}

export function ThumbnailsTab({ form }: ThumbnailsTabProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4 sm:space-y-6">
      <Card className="rounded-2xl border-border/70 shadow-sm">
        <CardHeader className="border-b border-border/60 p-4 sm:p-6">
          <CardTitle className="text-base sm:text-lg">
            {t("uploads.config.thumbnails.title")}
          </CardTitle>
          <CardDescription className="text-sm">
            {t("uploads.config.thumbnails.description")}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 pt-0">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_320px]">
            <div className="space-y-4">
              <div className="space-y-4 rounded-xl border border-border/60 bg-muted/20 p-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <ImageIcon className="h-4 w-4" />
                    <p className="text-sm font-medium sm:text-base">
                      Moteur de génération
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground sm:text-sm">
                    Définissez quand et comment les vignettes sont créées.
                  </p>
                </div>

                <FormField
                  control={form.control}
                  name="thumbnails.enabled"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-xl border border-border/60 bg-background px-4 py-3">
                      <FormLabel className="text-sm">
                        {t("uploads.config.thumbnails.enable")}
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
                  name="thumbnails.preserveFormat"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-xl border border-border/60 bg-background px-4 py-3">
                      <FormLabel className="text-sm">
                        {t("uploads.config.thumbnails.preserve_format")}
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

              <div className="grid gap-4 lg:grid-cols-2">
                <FormField
                  control={form.control}
                  name="thumbnails.format"
                  render={({ field }) => (
                    <FormItem className="rounded-xl border border-border/60 bg-muted/20 p-4">
                      <FormLabel className="text-sm">
                        {t("uploads.config.thumbnails.format")}
                      </FormLabel>
                      <FormControl>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value ?? "auto"}
                        >
                          <SelectTrigger>
                            <SelectValue
                              placeholder={t(
                                "uploads.config.thumbnails.select_format",
                              )}
                            />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="auto">
                              {t("uploads.config.thumbnails.formats.auto")}
                            </SelectItem>
                            <SelectItem value="jpeg">
                              {t("uploads.config.thumbnails.formats.jpeg")}
                            </SelectItem>
                            <SelectItem value="png">
                              {t("uploads.config.thumbnails.formats.png")}
                            </SelectItem>
                            <SelectItem value="webp">
                              {t("uploads.config.thumbnails.formats.webp")}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="thumbnails.fit"
                  render={({ field }) => (
                    <FormItem className="rounded-xl border border-border/60 bg-muted/20 p-4">
                      <FormLabel className="text-sm">
                        {t("uploads.config.thumbnails.fit_mode")}
                      </FormLabel>
                      <FormControl>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value ?? "cover"}
                        >
                          <SelectTrigger>
                            <SelectValue
                              placeholder={t(
                                "uploads.config.thumbnails.select_mode",
                              )}
                            />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="cover">
                              {t("uploads.config.thumbnails.fit_modes.cover")}
                            </SelectItem>
                            <SelectItem value="contain">
                              {t("uploads.config.thumbnails.fit_modes.contain")}
                            </SelectItem>
                            <SelectItem value="fill">
                              {t("uploads.config.thumbnails.fit_modes.fill")}
                            </SelectItem>
                            <SelectItem value="inside">
                              {t("uploads.config.thumbnails.fit_modes.inside")}
                            </SelectItem>
                            <SelectItem value="outside">
                              {t("uploads.config.thumbnails.fit_modes.outside")}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="thumbnails.background"
                render={({ field }) => (
                  <FormItem className="rounded-xl border border-border/60 bg-muted/20 p-4">
                    <div className="space-y-1">
                      <FormLabel className="text-sm">
                        {t("uploads.config.thumbnails.background_color")}
                      </FormLabel>
                      <p className="text-xs text-muted-foreground sm:text-sm">
                        Couleur utilisée quand le mode d&apos;ajustement laisse
                        des marges visibles.
                      </p>
                    </div>
                    <FormControl>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full justify-start bg-background text-left font-normal sm:w-[220px]",
                              !field.value && "text-muted-foreground",
                            )}
                          >
                            <div
                              className="mr-2 h-5 w-5 rounded-md ring-1 ring-inset ring-gray-200"
                              style={{
                                backgroundColor: field.value ?? "#FFFFFF",
                              }}
                            />
                            <span className="font-mono">
                              {field.value ?? "#FFFFFF"}
                            </span>
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent
                          className="w-fit border-none p-0 shadow-xl"
                          sideOffset={5}
                        >
                          <BlockPicker
                            color={field.value ?? "#FFFFFF"}
                            onChange={(color) => field.onChange(color.hex)}
                            colors={[
                              "#1A1A1A",
                              "#FFFFFF",
                              "#2563EB",
                              "#16A34A",
                              "#DC2626",
                              "#CA8A04",
                              "#9333EA",
                              "#0891B2",
                              "#BE185D",
                              "#2DD4BF",
                            ]}
                            styles={{
                              default: {
                                card: {
                                  backgroundColor: "var(--popover)",
                                  border: "none",
                                  borderRadius: "var(--radius)",
                                  boxShadow: "none",
                                },
                                head: {
                                  backgroundColor: "transparent",
                                  borderBottom: "1px solid var(--border)",
                                },
                                input: {
                                  boxShadow: "none",
                                  border: "1px solid var(--border)",
                                  borderRadius: "var(--radius)",
                                },
                                hash: {
                                  color: "var(--muted-foreground)",
                                },
                              },
                            }}
                          />
                        </PopoverContent>
                      </Popover>
                    </FormControl>
                  </FormItem>
                )}
              />

              <div className="space-y-4 rounded-xl border border-border/60 bg-muted/20 p-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4" />
                    <p className="text-sm font-medium sm:text-base">
                      Traitement final
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground sm:text-sm">
                    Ajustez les effets appliqués après le redimensionnement.
                  </p>
                </div>

                <FormField
                  control={form.control}
                  name="thumbnails.sharpen"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-xl border border-border/60 bg-background px-4 py-3">
                      <FormLabel className="text-sm">
                        {t("uploads.config.thumbnails.sharpen")}
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
                  name="thumbnails.metadata"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-xl border border-border/60 bg-background px-4 py-3">
                      <FormLabel className="text-sm">
                        {t("uploads.config.thumbnails.keep_metadata")}
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

              <div className="grid gap-4 md:grid-cols-3">
                <FormField
                  control={form.control}
                  name="thumbnails.maxWidth"
                  render={({ field }) => (
                    <FormItem className="rounded-xl border border-border/60 bg-muted/20 p-4">
                      <FormLabel className="text-sm">
                        {t("uploads.config.thumbnails.max_width")}
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          value={field.value ?? ""}
                          onChange={(e) =>
                            field.onChange(Number(e.target.value))
                          }
                          className="max-w-[180px] bg-background"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="thumbnails.maxHeight"
                  render={({ field }) => (
                    <FormItem className="rounded-xl border border-border/60 bg-muted/20 p-4">
                      <FormLabel className="text-sm">
                        {t("uploads.config.thumbnails.max_height")}
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          value={field.value ?? ""}
                          onChange={(e) =>
                            field.onChange(Number(e.target.value))
                          }
                          className="max-w-[180px] bg-background"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="thumbnails.quality"
                  render={({ field }) => (
                    <FormItem className="rounded-xl border border-border/60 bg-muted/20 p-4">
                      <FormLabel className="text-sm">
                        {t("uploads.config.thumbnails.quality")}
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          value={field.value ?? ""}
                          onChange={(e) =>
                            field.onChange(Number(e.target.value))
                          }
                          className="max-w-[180px] bg-background"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <FormField
              control={form.control}
              name="thumbnails.blur"
              render={({ field }) => (
                <FormItem className="space-y-4 rounded-xl border border-border/60 bg-muted/20 p-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <SlidersHorizontal className="h-4 w-4" />
                      <p className="text-sm font-medium sm:text-base">
                        Aperçu du traitement
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground sm:text-sm">
                      Vérifiez le rendu du flou avant de l&apos;appliquer à
                      toute la galerie.
                    </p>
                  </div>

                  <div className="space-y-3 rounded-xl border border-border/60 bg-background p-4">
                    <FormLabel className="text-sm">
                      {t("uploads.config.thumbnails.blur", {
                        value: field.value ?? 0,
                      })}
                    </FormLabel>
                    <FormControl>
                      <Slider
                        min={0}
                        max={20}
                        step={0.5}
                        value={[field.value ?? 0]}
                        onValueChange={([value]) => field.onChange(value)}
                      />
                    </FormControl>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>0 px</span>
                      <span>20 px</span>
                    </div>
                  </div>

                  <div className="rounded-xl border border-border/60 bg-background p-3">
                    <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                      <Pipette className="h-3.5 w-3.5" />
                      {t("uploads.config.thumbnails.blur_preview")}
                    </div>
                    <div className="relative aspect-video overflow-hidden rounded-lg border border-border/60 bg-muted">
                      <img
                        src="/preview-image.png"
                        alt={t("uploads.config.thumbnails.blur_preview")}
                        className="h-full w-full object-cover"
                        style={{
                          filter: `blur(${field.value ?? 0}px)`,
                          transform: "scale(1.1)",
                        }}
                      />
                    </div>
                  </div>
                </FormItem>
              )}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
