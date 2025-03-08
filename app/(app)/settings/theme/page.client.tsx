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
import { useThemeConfig } from "@/hooks/use-theme-config";
import type { ColorVars } from "@/hooks/use-theme-config";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { presets, type PresetTheme, type ThemeCategory } from "@/themes";

export function ThemeConfigClient() {
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [activeTheme, setActiveTheme] = useState<"light" | "dark">("light");
  const [selectedCategory, setSelectedCategory] =
    useState<keyof typeof presets>("Thèmes par défaut");
  const [config, setConfig] = useThemeConfig();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const handleColorChange = (
    key: keyof ColorVars,
    value: string,
    theme: "light" | "dark"
  ) => {
    const hslValue = hexToHsl(value);

    setConfig((prev) => ({
      ...prev,
      cssVars: {
        ...prev.cssVars,
        [theme]: {
          ...prev.cssVars[theme],
          [key]: hslValue,
        },
      },
    }));
  };

  const getHexColor = (hslString: string) => {
    const [h, s, l] = hslString.split(" ").map((v) => parseFloat(v));
    return hslToHex(h, s, l);
  };

  const handlePresetChange = (preset: string) => {
    for (const [category, themes] of Object.entries(presets)) {
      if (preset in themes) {
        const presetColors = themes[preset] as PresetTheme;
        setConfig((prev) => ({
          ...prev,
          theme: preset,
          cssVars: {
            light: {
              ...prev.cssVars.light,
              ...presetColors.light,
            },
            dark: {
              ...prev.cssVars.dark,
              ...presetColors.dark,
            },
          },
        }));
        toast.success(`Preset ${preset} appliqué avec succès`);
        return;
      }
    }
  };

  const handleReset = () => {
    const defaultPreset = presets["Thèmes intégrés"]["Rose (Défaut)"];
    setConfig((prev) => ({
      ...prev,
      theme: "default",
      cssVars: {
        light: { ...defaultPreset.light },
        dark: { ...defaultPreset.dark },
      },
    }));
    toast.success("Thème réinitialisé avec succès");
  };

  const handleRadiusChange = (value: number) => {
    setConfig((prev) => ({
      ...prev,
      cssVars: {
        light: {
          ...prev.cssVars.light,
          radius: value.toString(),
        },
        dark: {
          ...prev.cssVars.dark,
          radius: value.toString(),
        },
      },
    }));
    document.documentElement.style.setProperty("--radius", `${value}rem`);
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
          <Select
            onValueChange={(value: keyof typeof presets) =>
              setSelectedCategory(value)
            }
            value={selectedCategory}
          >
            <SelectTrigger className="w-[180px]">
              <Palette className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Choisir une catégorie" />
            </SelectTrigger>
            <SelectContent>
              {Object.keys(presets).map((category) => (
                <SelectItem key={category} value={category}>
                  {category}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={handleReset}>
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
            <div className="flex items-center gap-2 mb-6">
              <Select
                onValueChange={(value: keyof typeof presets) =>
                  setSelectedCategory(value)
                }
                value={selectedCategory}
              >
                <SelectTrigger className="w-[180px]">
                  <Palette className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Choisir une catégorie" />
                </SelectTrigger>
                <SelectContent>
                  {Object.keys(presets).map((category) => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={handleReset}>
                <Settings2 className="h-4 w-4 mr-2" />
                Réinitialiser
              </Button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
              {Object.entries(presets[selectedCategory]).map(
                ([name, preset]) => (
                  <div
                    key={name}
                    className={cn(
                      "flex flex-col gap-2 p-4 rounded-lg border cursor-pointer hover:bg-accent transition-colors",
                      {
                        "border-primary": config.theme === name,
                      }
                    )}
                    onClick={() => handlePresetChange(name)}
                  >
                    <div className="grid grid-cols-2 gap-1 aspect-square">
                      {preset.preview.map((color: string, i: number) => (
                        <div
                          key={i}
                          className="rounded-md w-full h-full"
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                    <p className="text-sm font-medium text-center truncate">
                      {name}
                    </p>
                  </div>
                )
              )}
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
                <Label>Radius des coins (rem)</Label>
                <div className="pt-2">
                  <SliderWithStops
                    value={[parseFloat(config.cssVars[activeTheme].radius)]}
                    min={0}
                    max={2}
                    step={0.1}
                    stopInterval={0.5}
                    className="w-full"
                    onValueChange={([value]) => handleRadiusChange(value)}
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
                          backgroundColor: `hsl(${
                            config.cssVars[activeTheme][
                              colorKey as keyof ColorVars
                            ]
                          })`,
                        }}
                      />
                      <Input
                        id={colorKey}
                        type="color"
                        value={getHexColor(
                          config.cssVars[activeTheme][
                            colorKey as keyof ColorVars
                          ]
                        )}
                        className="w-[100px]"
                        onChange={(e) =>
                          handleColorChange(
                            colorKey as keyof ColorVars,
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
