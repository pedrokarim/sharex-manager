"use client";

import { useTheme } from "next-themes";
import { useState, useEffect } from "react";
import {
  Settings2,
  ArrowLeft,
  Paintbrush,
  Moon,
  Sun,
  Palette,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { SliderWithStops } from "@/components/ui/slider-with-stops";
import { toast } from "sonner";
import { cn, hslToHex, hexToHsl } from "@/lib/utils";
import { usePreferences } from "@/lib/stores/preferences";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const presets = {
  Défaut: {
    light: {
      background: "0 0% 100%",
      foreground: "240 10% 3.9%",
      primary: "346.8 77.2% 49.8%",
      "primary-foreground": "355.7 100% 97.3%",
      secondary: "240 4.8% 95.9%",
      "secondary-foreground": "240 5.9% 10%",
      muted: "240 4.8% 95.9%",
      "muted-foreground": "240 3.8% 46.1%",
      accent: "240 4.8% 95.9%",
      "accent-foreground": "240 5.9% 10%",
      destructive: "0 84.2% 60.2%",
      "destructive-foreground": "0 0% 98%",
      border: "240 5.9% 90%",
      input: "240 5.9% 90%",
      ring: "346.8 77.2% 49.8%",
    },
    dark: {
      background: "20 14.3% 4.1%",
      foreground: "0 0% 95%",
      primary: "346.8 77.2% 49.8%",
      "primary-foreground": "355.7 100% 97.3%",
      secondary: "240 3.7% 15.9%",
      "secondary-foreground": "0 0% 98%",
      muted: "0 0% 15%",
      "muted-foreground": "240 5% 64.9%",
      accent: "12 6.5% 15.1%",
      "accent-foreground": "0 0% 98%",
      destructive: "0 62.8% 30.6%",
      "destructive-foreground": "0 85.7% 97.3%",
      border: "240 3.7% 15.9%",
      input: "240 3.7% 15.9%",
      ring: "346.8 77.2% 49.8%",
    },
    preview: ["#dc2626", "#f8fafc", "#171717", "#dc2626"],
  },
  "Modern Blue": {
    light: {
      primary: "201 96% 32%",
      "primary-foreground": "210 40% 98%",
      secondary: "210 40% 96.1%",
      accent: "210 40% 90%",
    },
    dark: {
      primary: "201 96% 32%",
      "primary-foreground": "0 0% 100%",
      secondary: "217 32% 17%",
      accent: "215 25% 27%",
    },
    preview: ["#0369a1", "#f8fafc", "#1e293b", "#0c4a6e"],
  },
  "Forest Green": {
    light: {
      primary: "142 76% 36%",
      "primary-foreground": "355.7 100% 97.3%",
      secondary: "140 84% 97%",
      accent: "140 84% 92%",
    },
    dark: {
      primary: "142 76% 36%",
      "primary-foreground": "355.7 100% 97.3%",
      secondary: "140 30% 20%",
      accent: "140 30% 25%",
    },
    preview: ["#15803d", "#f0fdf4", "#14532d", "#16a34a"],
  },
  "Royal Purple": {
    light: {
      primary: "270 95% 75%",
      "primary-foreground": "0 0% 100%",
      secondary: "270 80% 96%",
      accent: "270 80% 92%",
    },
    dark: {
      primary: "270 95% 75%",
      "primary-foreground": "0 0% 100%",
      secondary: "270 30% 20%",
      accent: "270 30% 25%",
    },
    preview: ["#a855f7", "#f3e8ff", "#2d1b43", "#9333ea"],
  },
  "Sunset Orange": {
    light: {
      primary: "24.6 95% 53.1%",
      "primary-foreground": "60 9.1% 97.8%",
      secondary: "24.6 95% 97%",
      accent: "24.6 95% 92%",
    },
    dark: {
      primary: "24.6 95% 53.1%",
      "primary-foreground": "0 0% 100%",
      secondary: "24.6 30% 20%",
      accent: "24.6 30% 25%",
    },
    preview: ["#f97316", "#fff7ed", "#431407", "#ea580c"],
  },
  "Rose Garden": {
    light: {
      primary: "346.8 77.2% 49.8%",
      "primary-foreground": "355.7 100% 97.3%",
      secondary: "346.8 77.2% 97%",
      accent: "346.8 77.2% 92%",
    },
    dark: {
      primary: "346.8 77.2% 49.8%",
      "primary-foreground": "355.7 100% 97.3%",
      secondary: "346.8 30% 20%",
      accent: "346.8 30% 25%",
    },
    preview: ["#e11d48", "#fff1f2", "#881337", "#be123c"],
  },
  "Ocean Blue": {
    light: {
      primary: "198.6 88.7% 48.4%",
      "primary-foreground": "198.6 100% 97%",
      secondary: "198.6 88.7% 97%",
      accent: "198.6 88.7% 92%",
    },
    dark: {
      primary: "198.6 88.7% 48.4%",
      "primary-foreground": "198.6 100% 97%",
      secondary: "198.6 30% 20%",
      accent: "198.6 30% 25%",
    },
    preview: ["#0ea5e9", "#f0f9ff", "#075985", "#0284c7"],
  },
  Emerald: {
    light: {
      primary: "160 84% 39%",
      "primary-foreground": "160 100% 97%",
      secondary: "160 84% 97%",
      accent: "160 84% 92%",
    },
    dark: {
      primary: "160 84% 39%",
      "primary-foreground": "160 100% 97%",
      secondary: "160 30% 20%",
      accent: "160 30% 25%",
    },
    preview: ["#059669", "#ecfdf5", "#064e3b", "#10b981"],
  },
};

export function ThemeConfigClient() {
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [activeTheme, setActiveTheme] = useState<"light" | "dark">("light");
  const preferences = usePreferences();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const handleColorChange = (
    key: string,
    value: string,
    theme: "light" | "dark"
  ) => {
    const colors =
      theme === "light"
        ? { ...preferences.lightColors }
        : { ...preferences.darkColors };

    // Convertir la valeur hex en HSL
    const hslValue = hexToHsl(value);
    colors[key] = hslValue;
    preferences.applyThemeColors(colors, theme);
  };

  const getHexColor = (hslString: string) => {
    const [h, s, l] = hslString.split(" ").map((v) => parseFloat(v));
    return hslToHex(h, s, l);
  };

  const handlePresetChange = (preset: string) => {
    const presetColors = presets[preset as keyof typeof presets];
    preferences.applyThemeColors(
      { ...preferences.lightColors, ...presetColors.light },
      "light"
    );
    preferences.applyThemeColors(
      { ...preferences.darkColors, ...presetColors.dark },
      "dark"
    );
    toast.success(`Preset ${preset} appliqué avec succès`);
  };

  const handleReset = (theme: "light" | "dark") => {
    preferences.resetPreferences();
    toast.success(`Thème ${theme} réinitialisé avec succès`);
  };

  const colorGroups = [
    {
      title: "Couleurs principales",
      colors: ["background", "foreground", "primary", "primary-foreground"],
    },
    {
      title: "Composants",
      colors: ["card", "card-foreground", "popover", "popover-foreground"],
    },
    {
      title: "Actions",
      colors: [
        "secondary",
        "secondary-foreground",
        "accent",
        "accent-foreground",
        "destructive",
        "destructive-foreground",
      ],
    },
    {
      title: "États",
      colors: ["muted", "muted-foreground", "border", "input", "ring"],
    },
  ];

  return (
    <div className="flex flex-col h-full p-8">
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Paintbrush className="h-8 w-8" />
              Configuration avancée du thème
            </h1>
            <p className="text-muted-foreground mt-2">
              Personnalisez les couleurs de l'interface
            </p>
          </div>
        </div>
      </div>

      <div className="flex gap-4 mb-6">
        <Button
          variant={activeTheme === "light" ? "default" : "outline"}
          onClick={() => setActiveTheme("light")}
        >
          <Sun className="h-4 w-4 mr-2" />
          Thème clair
        </Button>
        <Button
          variant={activeTheme === "dark" ? "default" : "outline"}
          onClick={() => setActiveTheme("dark")}
        >
          <Moon className="h-4 w-4 mr-2" />
          Thème sombre
        </Button>
        <div className="flex items-center gap-2 ml-auto">
          <Select onValueChange={handlePresetChange}>
            <SelectTrigger className="w-[180px]">
              <Palette className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Choisir un preset" />
            </SelectTrigger>
            <SelectContent>
              {Object.keys(presets).map((preset) => (
                <SelectItem key={preset} value={preset}>
                  {preset}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => handleReset(activeTheme)}>
            <Settings2 className="h-4 w-4 mr-2" />
            Réinitialiser
          </Button>
        </div>
      </div>

      <div className="grid gap-6 flex-1">
        <Card>
          <CardHeader>
            <CardTitle>Presets de thèmes</CardTitle>
            <CardDescription>
              Choisissez parmi nos thèmes prédéfinis
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
              {Object.entries(presets).map(([name, preset]) => (
                <div
                  key={name}
                  className="flex flex-col gap-1 p-1.5 rounded-lg border cursor-pointer hover:bg-accent transition-colors"
                  onClick={() => handlePresetChange(name)}
                >
                  <div className="grid grid-cols-2 gap-0.5">
                    {preset.preview.map((color, i) => (
                      <div
                        key={i}
                        className="aspect-square rounded-[2px] w-full"
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                  <p className="text-xs font-medium text-center mt-0.5 truncate">
                    {name}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Général</CardTitle>
            <CardDescription>
              Configurez les paramètres généraux du thème
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Radius des coins (px)</Label>
                <div className="pt-2">
                  <SliderWithStops
                    value={[preferences.radius]}
                    min={0}
                    max={20}
                    step={4}
                    stopInterval={4}
                    className="w-full"
                    onValueChange={([value]) => {
                      preferences.updatePreferences({ radius: value });
                      document.documentElement.style.setProperty(
                        "--radius",
                        `${value}px`
                      );
                    }}
                  />
                  <div className="flex justify-between mt-4 text-sm text-muted-foreground">
                    <span>Carré</span>
                    <span>Arrondi</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {colorGroups.map((group) => (
          <Card key={group.title}>
            <CardHeader>
              <CardTitle>{group.title}</CardTitle>
              <CardDescription>
                Configurez les {group.title.toLowerCase()}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4">
                {group.colors.map((colorKey) => (
                  <div key={colorKey} className="flex items-center gap-4">
                    <div className="flex-1">
                      <Label htmlFor={colorKey} className="text-sm font-medium">
                        {colorKey}
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <div
                        className="w-6 h-6 rounded border"
                        style={{
                          backgroundColor:
                            activeTheme === "light"
                              ? preferences.lightColors[colorKey]
                              : preferences.darkColors[colorKey],
                        }}
                      />
                      <Input
                        id={colorKey}
                        type="color"
                        value={getHexColor(
                          activeTheme === "light"
                            ? preferences.lightColors[colorKey]
                            : preferences.darkColors[colorKey]
                        )}
                        className="w-[100px]"
                        onChange={(e) =>
                          handleColorChange(
                            colorKey,
                            e.target.value,
                            activeTheme
                          )
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
