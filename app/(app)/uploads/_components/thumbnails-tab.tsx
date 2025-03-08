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
import { Pipette } from "lucide-react";
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
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{t("uploads.config.thumbnails.title")}</CardTitle>
          <CardDescription>
            {t("uploads.config.thumbnails.description")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FormField
            control={form.control}
            name="thumbnails.enabled"
            render={({ field }) => (
              <FormItem className="flex items-center justify-between">
                <FormLabel>{t("uploads.config.thumbnails.enable")}</FormLabel>
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
            name="thumbnails.format"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("uploads.config.thumbnails.format")}</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  value={field.value ?? "auto"}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue
                        placeholder={t(
                          "uploads.config.thumbnails.select_format"
                        )}
                      />
                    </SelectTrigger>
                  </FormControl>
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
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="thumbnails.preserveFormat"
            render={({ field }) => (
              <FormItem className="flex items-center justify-between">
                <FormLabel>
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

          <FormField
            control={form.control}
            name="thumbnails.fit"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("uploads.config.thumbnails.fit_mode")}</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  value={field.value ?? "cover"}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue
                        placeholder={t("uploads.config.thumbnails.select_mode")}
                      />
                    </SelectTrigger>
                  </FormControl>
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
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="thumbnails.background"
            render={({ field }) => (
              <FormItem className="flex flex-col gap-2">
                <FormLabel>
                  {t("uploads.config.thumbnails.background_color")}
                </FormLabel>
                <FormControl>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-[200px] justify-start text-left font-normal",
                          !field.value && "text-muted-foreground"
                        )}
                      >
                        <div
                          className="h-5 w-5 rounded-md mr-2 ring-1 ring-inset ring-gray-200"
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
                      className="w-fit p-0 border-none shadow-xl"
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

          <FormField
            control={form.control}
            name="thumbnails.blur"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
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
                <div className="aspect-video rounded-lg overflow-hidden relative w-full md:w-[250px] h-[250px] border border-black">
                  <img
                    src="/preview-image.png"
                    alt={t("uploads.config.thumbnails.blur_preview")}
                    className="w-full h-full object-cover"
                    style={{
                      filter: `blur(${field.value ?? 0}px)`,
                      transform: "scale(1.1)",
                    }}
                  />
                </div>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="thumbnails.sharpen"
            render={({ field }) => (
              <FormItem className="flex items-center justify-between">
                <FormLabel>{t("uploads.config.thumbnails.sharpen")}</FormLabel>
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
              <FormItem className="flex items-center justify-between">
                <FormLabel>
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

          <FormField
            control={form.control}
            name="thumbnails.maxWidth"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {t("uploads.config.thumbnails.max_width")}
                </FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(Number(e.target.value))}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="thumbnails.maxHeight"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {t("uploads.config.thumbnails.max_height")}
                </FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(Number(e.target.value))}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="thumbnails.quality"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("uploads.config.thumbnails.quality")}</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(Number(e.target.value))}
                  />
                </FormControl>
              </FormItem>
            )}
          />
        </CardContent>
      </Card>
    </div>
  );
}
