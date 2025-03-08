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
    toast.success("Préférences réinitialisées avec succès");
  };

  const themeIcons = {
    light: Sun,
    dark: Moon,
    system: Monitor,
    "time-based": Clock,
  };

  const themeLabels = {
    light: "Clair",
    dark: "Sombre",
    system: "Système",
    "time-based": "Automatique",
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
    large: "Très grandes icônes",
    medium: "Grandes icônes",
    small: "Icônes moyennes",
    tiny: "Petites icônes",
  } as const;

  const handleThemeChange = (newTheme: ThemeMode) => {
    setPreferredThemeMode(newTheme);

    if (newTheme !== "time-based") {
      setTheme(newTheme);
    }
  };

  return (
    <div className="flex flex-col h-full p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Settings2 className="h-8 w-8" />
            Préférences utilisateur
          </h1>
          <p className="text-muted-foreground mt-2">
            Personnalisez votre expérience ShareX Manager
          </p>
        </div>
        <Button variant="outline" onClick={handleReset}>
          <RotateCcw className="h-4 w-4 mr-2" />
          Réinitialiser
        </Button>
      </div>

      <div className="grid gap-6 flex-1">
        {/* Apparence */}
        <Card>
          <CardHeader>
            <CardTitle>Apparence</CardTitle>
            <CardDescription>
              Personnalisez l'apparence de l'interface
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <div className="space-y-4">
                <Label>Thème</Label>
                <div className="flex gap-4 max-w-md">
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
                            className="flex-1"
                            onClick={() => {
                              handleThemeChange(themeKey as ThemeMode);
                            }}
                          >
                            <Icon className="h-4 w-4 mr-2" />
                            {themeLabels[themeKey as keyof typeof themeLabels]}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>
                            {themeKey === "time-based"
                              ? `Thème automatique (${timeBasedTheme.dayStartHour}h-${timeBasedTheme.dayEndHour}h)`
                              : `Thème ${
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
                  <div className="space-y-4 mt-4 border rounded-lg p-4">
                    <div className="flex items-center gap-2">
                      <Sun className="h-4 w-4" />
                      <Label>Heures du thème clair</Label>
                    </div>
                    <div className="flex gap-4">
                      <div className="flex-1">
                        <TimePicker
                          label="Début"
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
                          label="Fin"
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
                    <p className="text-sm text-muted-foreground mt-2">
                      Le thème clair sera actif de {timeBasedTheme.dayStartHour}
                      h00 à {timeBasedTheme.dayEndHour}h00. En dehors de ces
                      heures, le thème sombre sera utilisé.
                    </p>
                  </div>
                )}

                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => router.push("/settings/theme")}
                >
                  <Settings2 className="h-4 w-4 mr-2" />
                  Configuration avancée du thème
                </Button>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Languages className="h-4 w-4" />
                  <Label>Langue</Label>
                </div>
                <Select
                  value={language}
                  onValueChange={(value) => setLanguage(value as Language)}
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Sélectionner une langue" />
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
          <CardHeader>
            <CardTitle>Galerie</CardTitle>
            <CardDescription>
              Configurez l'affichage de la galerie d'images
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <Label>Mode d'affichage</Label>
              <div className="flex gap-4 max-w-md">
                {Object.entries(viewModeIcons).map(([mode, Icon]) => (
                  <TooltipProvider key={mode}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant={
                            galleryViewMode === mode ? "default" : "outline"
                          }
                          className="flex-1"
                          onClick={() =>
                            setGalleryViewMode(mode as GalleryViewMode)
                          }
                        >
                          <Icon className="h-4 w-4 mr-2" />
                          {mode.charAt(0).toUpperCase() + mode.slice(1)}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Mode {mode}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ))}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="thumbnailSize">Taille des vignettes</Label>
                <Select
                  value={thumbnailSize}
                  onValueChange={(value: ThumbnailSize) =>
                    setThumbnailSize(value)
                  }
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Sélectionnez une taille" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(thumbnailSizeOptions).map(
                      ([value, label]) => {
                        const Icon = thumbnailSizeIcons[value as ThumbnailSize];
                        return (
                          <SelectItem key={value} value={value}>
                            <div className="flex items-center gap-2">
                              <Icon className="h-4 w-4 shrink-0" />
                              <span>{label}</span>
                            </div>
                          </SelectItem>
                        );
                      }
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    <Label>Informations des fichiers</Label>
                  </div>
                  <Switch
                    checked={showFileInfo}
                    onCheckedChange={setShowFileInfo}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ArrowUpDown className="h-4 w-4" />
                    <Label>Taille des fichiers</Label>
                  </div>
                  <Switch
                    checked={showFileSize}
                    onCheckedChange={setShowFileSize}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    <Label>Date d'upload</Label>
                  </div>
                  <Switch
                    checked={showUploadDate}
                    onCheckedChange={setShowUploadDate}
                  />
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <Label>Tri par défaut</Label>
                <div className="flex gap-4">
                  <Select
                    value={sortBy}
                    onValueChange={(value) => setSortBy(value as SortBy)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Trier par" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="name">Nom</SelectItem>
                      <SelectItem value="date">Date</SelectItem>
                      <SelectItem value="size">Taille</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select
                    value={sortOrder}
                    onValueChange={(value) => setSortOrder(value as SortOrder)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Ordre" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="asc">Croissant</SelectItem>
                      <SelectItem value="desc">Décroissant</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card>
          <CardHeader>
            <CardTitle>Notifications</CardTitle>
            <CardDescription>
              Configurez les notifications de l'application
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4" />
                <Label>Notifications</Label>
              </div>
              <Switch
                checked={showNotifications}
                onCheckedChange={setShowNotifications}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <RefreshCcw className="h-4 w-4" />
                <Label>Intervalle de rafraîchissement (secondes)</Label>
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
                <div className="flex justify-between mt-1 text-sm text-muted-foreground">
                  <span>Désactivé</span>
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
