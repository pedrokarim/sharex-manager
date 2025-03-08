"use client";

import { usePreferences } from "@/lib/stores/preferences";
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

export function PreferencesPageClient() {
  const preferences = usePreferences();
  const { setTheme } = useTheme();
  const router = useRouter();

  const handleReset = () => {
    preferences.resetPreferences();
    setTheme("system");
    toast.success("Préférences réinitialisées avec succès");
  };

  const themeIcons = {
    light: Sun,
    dark: Moon,
    system: Monitor,
  };

  const viewModeIcons = {
    grid: Grid2X2,
    list: List,
    details: LayoutList,
  };

  const thumbnailSizes = {
    small: 100,
    medium: 150,
    large: 200,
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
                  {Object.entries(themeIcons).map(([theme, Icon]) => (
                    <TooltipProvider key={theme}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant={
                              preferences.theme === theme
                                ? "default"
                                : "outline"
                            }
                            className="flex-1"
                            onClick={() => {
                              preferences.updatePreferences({
                                theme: theme as "light" | "dark" | "system",
                              });
                              setTheme(theme);
                            }}
                          >
                            <Icon className="h-4 w-4 mr-2" />
                            {theme.charAt(0).toUpperCase() + theme.slice(1)}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Thème {theme}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ))}
                </div>
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
                  value={preferences.language}
                  onValueChange={(value) =>
                    preferences.updatePreferences({
                      language: value as "fr" | "en",
                    })
                  }
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
                            preferences.galleryViewMode === mode
                              ? "default"
                              : "outline"
                          }
                          className="flex-1"
                          onClick={() =>
                            preferences.updatePreferences({
                              galleryViewMode: mode as
                                | "grid"
                                | "list"
                                | "details",
                            })
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

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <ImageIcon className="h-4 w-4" />
                  <Label>Taille des vignettes</Label>
                </div>
                <div className="pt-2">
                  <Slider
                    value={[thumbnailSizes[preferences.thumbnailSize]]}
                    min={thumbnailSizes.small}
                    max={thumbnailSizes.large}
                    step={50}
                    className="w-full"
                    onValueChange={([value]) => {
                      const size = Object.entries(thumbnailSizes).find(
                        ([, size]) => size === value
                      )?.[0] as "small" | "medium" | "large";
                      if (size) {
                        preferences.updatePreferences({ thumbnailSize: size });
                      }
                    }}
                  />
                  <div className="flex justify-between mt-1 text-sm text-muted-foreground">
                    <span>Petite</span>
                    <span>Moyenne</span>
                    <span>Grande</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ArrowUpDown className="h-4 w-4" />
                  <div>
                    <Label>Tri des fichiers</Label>
                    <p className="text-sm text-muted-foreground">
                      Ordre d'affichage des fichiers
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Select
                    value={preferences.sortBy}
                    onValueChange={(value) =>
                      preferences.updatePreferences({
                        sortBy: value as "date" | "name" | "size",
                      })
                    }
                  >
                    <SelectTrigger className="w-[140px]">
                      <SelectValue placeholder="Trier par" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="date">
                        <Clock className="h-4 w-4 mr-2 inline-block" />
                        Date
                      </SelectItem>
                      <SelectItem value="name">
                        <FileText className="h-4 w-4 mr-2 inline-block" />
                        Nom
                      </SelectItem>
                      <SelectItem value="size">
                        <ArrowUpDown className="h-4 w-4 mr-2 inline-block" />
                        Taille
                      </SelectItem>
                    </SelectContent>
                  </Select>

                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() =>
                      preferences.updatePreferences({
                        sortOrder:
                          preferences.sortOrder === "asc" ? "desc" : "asc",
                      })
                    }
                  >
                    <ArrowUpDown
                      className={cn(
                        "h-4 w-4 transition-transform",
                        preferences.sortOrder === "asc"
                          ? "rotate-0"
                          : "rotate-180"
                      )}
                    />
                  </Button>
                </div>
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ImageIcon className="h-4 w-4" />
                  <div className="space-y-0.5">
                    <Label>Afficher les vignettes</Label>
                    <p className="text-sm text-muted-foreground">
                      Afficher les vignettes des images dans la galerie
                    </p>
                  </div>
                </div>
                <Switch
                  checked={preferences.showThumbnails}
                  onCheckedChange={(checked) =>
                    preferences.updatePreferences({ showThumbnails: checked })
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ArrowUpDown className="h-4 w-4" />
                  <div className="space-y-0.5">
                    <Label>Afficher la taille des fichiers</Label>
                    <p className="text-sm text-muted-foreground">
                      Afficher la taille des fichiers dans la galerie
                    </p>
                  </div>
                </div>
                <Switch
                  checked={preferences.showFileSize}
                  onCheckedChange={(checked) =>
                    preferences.updatePreferences({ showFileSize: checked })
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  <div className="space-y-0.5">
                    <Label>Afficher la date d'upload</Label>
                    <p className="text-sm text-muted-foreground">
                      Afficher la date d'upload des fichiers dans la galerie
                    </p>
                  </div>
                </div>
                <Switch
                  checked={preferences.showUploadDate}
                  onCheckedChange={(checked) =>
                    preferences.updatePreferences({ showUploadDate: checked })
                  }
                />
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
                <div className="space-y-0.5">
                  <Label>Notifications d'upload</Label>
                  <p className="text-sm text-muted-foreground">
                    Recevoir une notification lors de l'upload d'un fichier
                  </p>
                </div>
              </div>
              <Switch
                checked={preferences.enableUploadNotifications}
                onCheckedChange={(checked) =>
                  preferences.updatePreferences({
                    enableUploadNotifications: checked,
                  })
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <RefreshCcw className="h-4 w-4" />
                <div className="space-y-0.5">
                  <Label>Intervalle de rafraîchissement</Label>
                  <p className="text-sm text-muted-foreground">
                    Rafraîchir automatiquement la galerie
                  </p>
                </div>
              </div>
              <Select
                value={preferences.autoRefreshInterval.toString()}
                onValueChange={(value) =>
                  preferences.updatePreferences({
                    autoRefreshInterval: parseInt(value),
                  })
                }
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Intervalle" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Désactivé</SelectItem>
                  <SelectItem value="5">5 secondes</SelectItem>
                  <SelectItem value="10">10 secondes</SelectItem>
                  <SelectItem value="15">15 secondes</SelectItem>
                  <SelectItem value="30">30 secondes</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
