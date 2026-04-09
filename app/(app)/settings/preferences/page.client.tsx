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
  type GalleryViewMode,
  type ThumbnailSize,
  type Language,
  type SortBy,
  type SortOrder,
} from "@/lib/atoms/preferences";
import {
  Settings2,
  RotateCcw,
  Grid2X2,
  List,
  LayoutList,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Slider } from "@/components/ui/slider";
import { useTranslation } from "@/lib/i18n";
import { ThemeModePreferencesPanel } from "@/components/settings/theme-mode-preferences-panel";

const settingsPanelClassName =
  "rounded-2xl border border-border/70 bg-card px-4 py-4 shadow-sm sm:px-5 sm:py-5";
const settingsBlockClassName =
  "space-y-4 rounded-2xl border border-border/70 bg-card px-4 py-4 shadow-sm sm:px-5 sm:py-5";

export function PreferencesPageClient() {
  const [, setPreferences] = useAtom(preferencesAtom);
  const [language, setLanguage] = useAtom(languageAtom);
  const [galleryViewMode, setGalleryViewMode] = useAtom(galleryViewModeAtom);
  const [thumbnailSize, setThumbnailSize] = useAtom(thumbnailSizeAtom);
  const [showFileInfo, setShowFileInfo] = useAtom(showFileInfoAtom);
  const [showFileSize, setShowFileSize] = useAtom(showFileSizeAtom);
  const [showUploadDate, setShowUploadDate] = useAtom(showUploadDateAtom);
  const [sortBy, setSortBy] = useAtom(sortByAtom);
  const [sortOrder, setSortOrder] = useAtom(sortOrderAtom);
  const [autoRefreshInterval, setAutoRefreshInterval] = useAtom(
    autoRefreshIntervalAtom,
  );
  const [showNotifications, setShowNotifications] = useAtom(
    showNotificationsAtom,
  );

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
    });
    toast.success(t("settings.save_success"));
  };

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

  return (
    <div className="flex h-full flex-col gap-6">
      <section className="rounded-2xl border border-border/70 bg-gradient-to-br from-card via-card to-muted/25 p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <h1 className="flex items-center gap-3 text-2xl font-semibold tracking-tight sm:text-3xl">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-background/80 text-muted-foreground shadow-sm sm:h-11 sm:w-11">
                <Settings2 className="h-5 w-5" />
              </span>
              {t("settings.preferences")}
            </h1>
            <p className="max-w-3xl text-sm text-muted-foreground sm:text-base">
              {t("settings.preferences_description")}
            </p>
          </div>
          <Button
            variant="outline"
            onClick={handleReset}
            className="w-full text-xs sm:w-auto sm:text-sm"
          >
            <RotateCcw className="mr-2 h-3 w-3 sm:h-4 sm:w-4" />
            {t("settings.reset")}
          </Button>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <div className="space-y-6">
          <section className="space-y-4">
            <div className="space-y-2 px-1">
              <h2 className="text-xl font-semibold">
                {t("settings.appearance")}
              </h2>
              <p className="text-sm text-muted-foreground">
                {t("settings.appearance_description")}
              </p>
            </div>

            <ThemeModePreferencesPanel />

            <div
              className={`${settingsPanelClassName} flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between`}
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Languages className="h-4 w-4" />
                  <Label className="text-sm font-medium sm:text-base">
                    {t("settings.language")}
                  </Label>
                </div>
                <p className="text-xs text-muted-foreground sm:text-sm">
                  Définissez la langue affichée dans l'application.
                </p>
              </div>
              <Select
                value={language}
                onValueChange={(value) => setLanguage(value as Language)}
              >
                <SelectTrigger className="w-full sm:w-[220px]">
                  <SelectValue placeholder={t("settings.language_select")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fr">Français</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </section>

          <section className="space-y-4">
            <div className="space-y-2 px-1">
              <h2 className="text-xl font-semibold">
                {t("navigation.gallery")}
              </h2>
              <p className="text-sm text-muted-foreground">
                {t("settings.gallery_description")}
              </p>
            </div>

            <div className={settingsBlockClassName}>
              <div className="space-y-1">
                <Label className="text-sm font-medium sm:text-base">
                  {t("settings.gallery.view_mode")}
                </Label>
                <p className="text-xs text-muted-foreground sm:text-sm">
                  Choisissez la densité de lecture la plus confortable pour
                  votre galerie.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(viewModeIcons).map(([mode, Icon]) => (
                  <TooltipProvider key={mode}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant={
                            galleryViewMode === mode ? "default" : "outline"
                          }
                          className="min-w-[9rem] justify-start text-xs sm:min-w-0 sm:justify-center sm:text-sm"
                          onClick={() =>
                            setGalleryViewMode(mode as GalleryViewMode)
                          }
                        >
                          <Icon className="mr-1 h-3 w-3 sm:mr-2 sm:h-4 sm:w-4" />
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
            </div>

            <div
              className={`${settingsPanelClassName} flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between`}
            >
              <div className="space-y-1">
                <Label
                  htmlFor="thumbnailSize"
                  className="text-sm font-medium sm:text-base"
                >
                  {t("settings.gallery.thumbnail_size")}
                </Label>
                <p className="text-xs text-muted-foreground sm:text-sm">
                  Ajustez la densité des cartes et la place donnée à l'aperçu.
                </p>
              </div>
              <Select
                value={thumbnailSize}
                onValueChange={(value: ThumbnailSize) =>
                  setThumbnailSize(value)
                }
              >
                <SelectTrigger className="w-full sm:w-[240px]">
                  <SelectValue placeholder={t("settings.select_size")} />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(thumbnailSizeOptions).map(
                    ([value, label]) => {
                      const Icon = thumbnailSizeIcons[value as ThumbnailSize];
                      return (
                        <SelectItem key={value} value={value}>
                          <div className="flex items-center gap-2">
                            <Icon className="h-3 w-3 shrink-0 sm:h-4 sm:w-4" />
                            <span className="text-sm">{label}</span>
                          </div>
                        </SelectItem>
                      );
                    },
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className={settingsBlockClassName}>
              <div className="space-y-1">
                <Label className="text-sm font-medium sm:text-base">
                  Détails affichés
                </Label>
                <p className="text-xs text-muted-foreground sm:text-sm">
                  Activez uniquement les métadonnées utiles pour alléger la
                  lecture visuelle.
                </p>
              </div>
              <div className="space-y-2">
                <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-background px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    <Label className="text-sm sm:text-base">
                      {t("settings.gallery.show_file_info")}
                    </Label>
                  </div>
                  <Switch
                    checked={showFileInfo}
                    onCheckedChange={setShowFileInfo}
                  />
                </div>
                <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-background px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2">
                    <ArrowUpDown className="h-4 w-4" />
                    <Label className="text-sm sm:text-base">
                      {t("settings.gallery.show_file_size")}
                    </Label>
                  </div>
                  <Switch
                    checked={showFileSize}
                    onCheckedChange={setShowFileSize}
                  />
                </div>
                <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-background px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
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
            </div>

            <div className={settingsBlockClassName}>
              <div className="space-y-1">
                <Label className="text-sm font-medium sm:text-base">
                  {t("settings.gallery.sort_by")}
                </Label>
                <p className="text-xs text-muted-foreground sm:text-sm">
                  Organisez la galerie avec un tri clair et prévisible.
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Select
                  value={sortBy}
                  onValueChange={(value) => setSortBy(value as SortBy)}
                >
                  <SelectTrigger className="w-full sm:w-[240px]">
                    <SelectValue placeholder={t("settings.gallery.sort_by")} />
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
                  <SelectTrigger className="w-full sm:w-[240px]">
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
          </section>
        </div>

        <div className="space-y-6 xl:sticky xl:top-4">
          <section className="space-y-4">
            <div className="space-y-2 px-1">
              <h2 className="text-xl font-semibold">
                {t("settings.notifications")}
              </h2>
              <p className="text-sm text-muted-foreground">
                {t("settings.notifications_description")}
              </p>
            </div>

            <div
              className={`${settingsPanelClassName} flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between`}
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Bell className="h-4 w-4" />
                  <Label className="text-sm font-medium sm:text-base">
                    {t("settings.notifications")}
                  </Label>
                </div>
                <p className="text-xs text-muted-foreground sm:text-sm">
                  Affiche les retours utiles sans surcharger l&apos;interface.
                </p>
              </div>
              <Switch
                checked={showNotifications}
                onCheckedChange={setShowNotifications}
              />
            </div>

            <div className={settingsBlockClassName}>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <RefreshCcw className="h-4 w-4" />
                  <Label className="text-sm font-medium sm:text-base">
                    {t("settings.gallery.auto_refresh")}
                  </Label>
                </div>
                <p className="text-xs text-muted-foreground sm:text-sm">
                  Définissez un rythme de mise à jour sans distraire la
                  navigation.
                </p>
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
                <div className="mt-2 flex justify-between text-xs text-muted-foreground sm:text-sm">
                  <span>{t("common.disabled")}</span>
                  <span>30s</span>
                  <span>60s</span>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
