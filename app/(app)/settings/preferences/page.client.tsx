"use client";

import { useAtom } from "jotai";
import {
  preferencesAtom,
  languageAtom,
  galleryViewModeAtom,
  thumbnailSizeAtom,
  showFileInfoAtom,
  showFileSizeAtom,
  showUploadDateAtom,
  sortByAtom,
  sortOrderAtom,
  autoRefreshIntervalAtom,
  showNotificationsAtom,
  timeBasedThemeAtom,
  preferredThemeModeAtom,
  type GalleryViewMode,
  type ThumbnailSize,
  type Language,
  type SortBy,
  type SortOrder,
  type ThemeMode,
} from "@/lib/atoms/preferences";
import {
  Settings2,
  RotateCcw,
  Sun,
  Moon,
  Monitor,
  Grid2X2,
  List,
  LayoutList,
  Image as ImageIcon,
  ArrowUpDown,
  Clock,
  FileText,
  Bell,
  Languages,
  RefreshCcw,
  Grid,
  LayoutGrid,
  Table2,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Slider } from "@/components/ui/slider";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { useTimeBasedTheme } from "@/hooks/use-time-based-theme";
import { TimePicker } from "@/components/ui/time-picker";
import { useTranslation } from "@/lib/i18n";
import { LanguageSelector } from "@/components/LanguageSelector";

export function PreferencesPageClient() {
  const [preferences, setPreferences] = useAtom(preferencesAtom);
  const [language, setLanguage] = useAtom(languageAtom);
  const [galleryViewMode, setGalleryViewMode] = useAtom(galleryViewModeAtom);
  const [thumbnailSize, setThumbnailSize] = useAtom(thumbnailSizeAtom);
  const [showFileInfo, setShowFileInfo] = useAtom(showFileInfoAtom);
  const [showFileSize, setShowFileSize] = useAtom(showFileSizeAtom);
  const [showUploadDate, setShowUploadDate] = useAtom(showUploadDateAtom);
  const [sortBy, setSortBy] = useAtom(sortByAtom);
  const [sortOrder, setSortOrder] = useAtom(sortOrderAtom);
  const [autoRefreshInterval, setAutoRefreshInterval] = useAtom(
    autoRefreshIntervalAtom
  );
  const [showNotifications, setShowNotifications] = useAtom(
    showNotificationsAtom
  );
  const [timeBasedTheme, setTimeBasedTheme] = useAtom(timeBasedThemeAtom);
  const [preferredThemeMode, setPreferredThemeMode] = useAtom(
    preferredThemeModeAtom
  );

  const { setTheme } = useTheme();
  const router = useRouter();
  const { t } = useTranslation();

  const handleReset = () => {
    setPreferences({
      language: "fr",
      galleryViewMode: "grid",
      thumbnailSize: "medium",
      showFileInfo: true,
      showFileSize: true,
      showUploadDate: true,
      sortBy: "date",
      sortOrder: "desc",
      autoRefreshInterval: 0,
      showNotifications: true,
      showThumbnails: true,
      defaultView: "grid",
      defaultSortBy: "date",
      defaultSortOrder: "desc",
      enableUploadNotifications: true,
      theme: "system",
      lightColors: {},
      darkColors: {},
      radius: 0,
      dayStartHour: 7,
      dayEndHour: 19,
    });
    setPreferredThemeMode("system");
    setTheme("system");
    toast.success(t("settings.save_success"));
  };

  const themeIcons = {
    light: Sun,
    dark: Moon,
    system: Monitor,
    "time-based": Clock,
  };

  const themeLabels = {
    light: t("settings.theme_options.light"),
    dark: t("settings.theme_options.dark"),
    system: t("settings.theme_options.system"),
    "time-based": t("settings.theme_options.time_based"),
  } as const;

  const viewModeIcons = {
    grid: Grid2X2,
    list: List,
    details: LayoutList,
  };

  const thumbnailSizeIcons = {
    large: LayoutGrid,
    medium: Grid,
    small: Grid2X2,
    tiny: Table2,
  } as const;

  const thumbnailSizeOptions = {
    large: t("settings.gallery.thumbnail_sizes.large"),
    medium: t("settings.gallery.thumbnail_sizes.medium"),
    small: t("settings.gallery.thumbnail_sizes.small"),
    tiny: t("settings.gallery.thumbnail_sizes.tiny"),
  } as const;

  const handleThemeChange = (newTheme: ThemeMode) => {
    setPreferredThemeMode(newTheme);

    if (newTheme !== "time-based") {
      setTheme(newTheme);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <Settings2 className="h-6 w-6 sm:h-8 sm:w-8" />
            {t("settings.preferences")}
          </h1>
          <p className="text-muted-foreground mt-2 text-sm sm:text-base">
            {t("settings.preferences_description")}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <LanguageSelector />
          <Button
            variant="outline"
            onClick={handleReset}
            className="text-xs sm:text-sm"
          >
            <RotateCcw className="h-3 w-3 sm:h-4 sm:w-4 mr-2" />
            {t("settings.reset")}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:gap-6 flex-1">
        {/* Apparence */}
        <Card>
          <CardHeader className="pb-3 sm:pb-6">
            <CardTitle className="text-lg sm:text-xl">
              {t("settings.appearance")}
            </CardTitle>
            <CardDescription className="text-sm">
              {t("settings.appearance_description")}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-4 sm:space-y-6">
              <div className="space-y-3 sm:space-y-4">
                <Label className="text-sm sm:text-base">
                  {t("settings.theme")}
                </Label>
                <div className="grid grid-cols-2 sm:flex gap-2 sm:gap-4 max-w-md">
                  {Object.entries(themeIcons).map(([themeKey, Icon]) => (
                    <TooltipProvider key={themeKey}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant={
                              preferredThemeMode === themeKey
                                ? "default"
                                : "outline"
                            }
                            className="flex-1 text-xs sm:text-sm"
                            onClick={() => {
                              handleThemeChange(themeKey as ThemeMode);
                            }}
                          >
                            <Icon className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                            <span className="text-xs sm:text-sm">
                              {
                                themeLabels[
                                  themeKey as keyof typeof themeLabels
                                ]
                              }
                            </span>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>
                            {themeKey === "time-based"
                              ? `${t("settings.theme_options.time_based")} (${
                                  timeBasedTheme.dayStartHour
                                }h-${timeBasedTheme.dayEndHour}h)`
                              : `${t("settings.theme")} ${
                                  themeLabels[
                                    themeKey as keyof typeof themeLabels
                                  ]
                                }`}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ))}
                </div>

                {preferredThemeMode === "time-based" && (
                  <div className="space-y-3 sm:space-y-4 mt-4 border rounded-lg p-3 sm:p-4">
                    <div className="flex items-center gap-2">
                      <Sun className="h-3 w-3 sm:h-4 sm:w-4" />
                      <Label className="text-sm sm:text-base">
                        {t("settings.theme_options.light")}
                      </Label>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                      <div className="flex-1">
                        <TimePicker
                          label={t("common.start")}
                          value={`${timeBasedTheme.dayStartHour
                            .toString()
                            .padStart(2, "0")}:00`}
                          onChange={(value) => {
                            const [hours] = value.split(":").map(Number);
                            setTimeBasedTheme({
                              ...timeBasedTheme,
                              dayStartHour: hours,
                            });
                          }}
                          format="24h"
                        />
                      </div>
                      <div className="flex-1">
                        <TimePicker
                          label={t("common.end")}
                          value={`${timeBasedTheme.dayEndHour
                            .toString()
                            .padStart(2, "0")}:00`}
                          onChange={(value) => {
                            const [hours] = value.split(":").map(Number);
                            setTimeBasedTheme({
                              ...timeBasedTheme,
                              dayEndHour: hours,
                            });
                          }}
                          format="24h"
                        />
                      </div>
                    </div>
                    <p className="text-xs sm:text-sm text-muted-foreground mt-2">
                      {t("settings.theme_options.time_based_description", {
                        start: timeBasedTheme.dayStartHour,
                        end: timeBasedTheme.dayEndHour,
                      })}
                    </p>
                  </div>
                )}

                <Button
                  variant="outline"
                  className="w-full text-xs sm:text-sm"
                  onClick={() => router.push("/settings/theme")}
                >
                  <Settings2 className="h-3 w-3 sm:h-4 sm:w-4 mr-2" />
                  {t("settings.theme_advanced")}
                </Button>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0">
                <div className="flex items-center gap-2">
                  <Languages className="h-3 w-3 sm:h-4 sm:w-4" />
                  <Label className="text-sm sm:text-base">
                    {t("settings.language")}
                  </Label>
                </div>
                <Select
                  value={language}
                  onValueChange={(value) => setLanguage(value as Language)}
                >
                  <SelectTrigger className="w-full sm:w-[180px]">
                    <SelectValue placeholder={t("settings.language_select")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fr">Français</SelectItem>
                    <SelectItem value="en">English</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Galerie */}
        <Card>
          <CardHeader className="pb-3 sm:pb-6">
            <CardTitle className="text-lg sm:text-xl">
              {t("navigation.gallery")}
            </CardTitle>
            <CardDescription className="text-sm">
              {t("settings.gallery_description")}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0 space-y-4 sm:space-y-6">
            <div className="space-y-3 sm:space-y-4">
              <Label className="text-sm sm:text-base">
                {t("settings.gallery.view_mode")}
              </Label>
              <div className="grid grid-cols-3 sm:flex gap-2 sm:gap-4 max-w-md">
                {Object.entries(viewModeIcons).map(([mode, Icon]) => (
                  <TooltipProvider key={mode}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant={
                            galleryViewMode === mode ? "default" : "outline"
                          }
                          className="flex-1 text-xs sm:text-sm"
                          onClick={() =>
                            setGalleryViewMode(mode as GalleryViewMode)
                          }
                        >
                          <Icon className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                          <span className="text-xs sm:text-sm">
                            {t(`gallery.view_modes.${mode}`)}
                          </span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{t(`gallery.view_modes.${mode}`)}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ))}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="thumbnailSize" className="text-sm sm:text-base">
                  {t("settings.gallery.thumbnail_size")}
                </Label>
                <Select
                  value={thumbnailSize}
                  onValueChange={(value: ThumbnailSize) =>
                    setThumbnailSize(value)
                  }
                >
                  <SelectTrigger className="w-full sm:w-[200px]">
                    <SelectValue placeholder={t("settings.select_size")} />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(thumbnailSizeOptions).map(
                      ([value, label]) => {
                        const Icon = thumbnailSizeIcons[value as ThumbnailSize];
                        return (
                          <SelectItem key={value} value={value}>
                            <div className="flex items-center gap-2">
                              <Icon className="h-3 w-3 sm:h-4 sm:w-4 shrink-0" />
                              <span className="text-sm">{label}</span>
                            </div>
                          </SelectItem>
                        );
                      }
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3 sm:space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="h-3 w-3 sm:h-4 sm:w-4" />
                    <Label className="text-sm sm:text-base">
                      {t("settings.gallery.show_file_info")}
                    </Label>
                  </div>
                  <Switch
                    checked={showFileInfo}
                    onCheckedChange={setShowFileInfo}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ArrowUpDown className="h-3 w-3 sm:h-4 sm:w-4" />
                    <Label className="text-sm sm:text-base">
                      {t("settings.gallery.show_file_size")}
                    </Label>
                  </div>
                  <Switch
                    checked={showFileSize}
                    onCheckedChange={setShowFileSize}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="h-3 w-3 sm:h-4 sm:w-4" />
                    <Label className="text-sm sm:text-base">
                      {t("settings.gallery.show_upload_date")}
                    </Label>
                  </div>
                  <Switch
                    checked={showUploadDate}
                    onCheckedChange={setShowUploadDate}
                  />
                </div>
              </div>

              <Separator />

              <div className="space-y-3 sm:space-y-4">
                <Label className="text-sm sm:text-base">
                  {t("settings.gallery.sort_by")}
                </Label>
                <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                  <Select
                    value={sortBy}
                    onValueChange={(value) => setSortBy(value as SortBy)}
                  >
                    <SelectTrigger className="w-full sm:flex-1">
                      <SelectValue
                        placeholder={t("settings.gallery.sort_by")}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="name">
                        {t("gallery.sort.name")}
                      </SelectItem>
                      <SelectItem value="date">
                        {t("gallery.sort.date")}
                      </SelectItem>
                      <SelectItem value="size">
                        {t("gallery.sort.size")}
                      </SelectItem>
                    </SelectContent>
                  </Select>

                  <Select
                    value={sortOrder}
                    onValueChange={(value) => setSortOrder(value as SortOrder)}
                  >
                    <SelectTrigger className="w-full sm:flex-1">
                      <SelectValue
                        placeholder={t("settings.gallery.sort_order")}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="asc">
                        {t("gallery.sort.asc")}
                      </SelectItem>
                      <SelectItem value="desc">
                        {t("gallery.sort.desc")}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card>
          <CardHeader className="pb-3 sm:pb-6">
            <CardTitle className="text-lg sm:text-xl">
              {t("settings.notifications")}
            </CardTitle>
            <CardDescription className="text-sm">
              {t("settings.notifications_description")}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0 space-y-4 sm:space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell className="h-3 w-3 sm:h-4 sm:w-4" />
                <Label className="text-sm sm:text-base">
                  {t("settings.notifications")}
                </Label>
              </div>
              <Switch
                checked={showNotifications}
                onCheckedChange={setShowNotifications}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <RefreshCcw className="h-3 w-3 sm:h-4 sm:w-4" />
                <Label className="text-sm sm:text-base">
                  {t("settings.gallery.auto_refresh")}
                </Label>
              </div>
              <div className="pt-2">
                <Slider
                  value={[autoRefreshInterval]}
                  min={0}
                  max={60}
                  step={5}
                  className="w-full"
                  onValueChange={([value]) => setAutoRefreshInterval(value)}
                />
                <div className="flex justify-between mt-1 text-xs sm:text-sm text-muted-foreground">
                  <span>{t("common.disabled")}</span>
                  <span>30s</span>
                  <span>60s</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
