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
  CardFooter,
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
import {
  Bar,
  BarChart,
  Line,
  LineChart,
  CartesianGrid,
  XAxis,
  YAxis,
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  Rectangle,
  ReferenceLine,
  Label as RechartLabel,
} from "recharts";

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
    if (!hslString) return "#000000";
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
    const defaultPreset = presets["Thèmes par défaut"]["Rose (Défaut)"];
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

  const chartColors = ["chart-1", "chart-2", "chart-3", "chart-4", "chart-5"];

  const getChartColor = (index: number) => {
    const colorKey = `chart-${index}` as keyof ColorVars;
    const hslValue = config.cssVars[activeTheme][colorKey];
    return `hsl(${hslValue || "0 0% 0%"})`;
  };

  const chartExamples = [
    {
      title: "Graphique en barres",
      render: (className: string) => (
        <div className={cn("h-48", className)}>
          <BarChart
            width={300}
            height={180}
            data={[
              { date: "Lun", steps: 2000 },
              { date: "Mar", steps: 2100 },
              { date: "Mer", steps: 2200 },
              { date: "Jeu", steps: 1300 },
              { date: "Ven", steps: 1400 },
              { date: "Sam", steps: 2500 },
              { date: "Dim", steps: 1600 },
            ]}
            margin={{ top: 10, right: 10, left: 0, bottom: 20 }}
          >
            <Bar
              dataKey="steps"
              fill={getChartColor(1)}
              radius={5}
              fillOpacity={0.6}
              activeBar={<Rectangle fillOpacity={0.8} />}
            />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={4}
              tick={{ fill: "currentColor", fontSize: 12 }}
            />
            <ReferenceLine
              y={1800}
              stroke={getChartColor(2)}
              strokeDasharray="3 3"
              strokeWidth={1}
            >
              <RechartLabel
                position="insideBottomLeft"
                value="Moyenne"
                offset={10}
                fill="currentColor"
                fontSize={10}
              />
            </ReferenceLine>
          </BarChart>
        </div>
      ),
    },
    {
      title: "Graphique en lignes",
      render: (className: string) => (
        <div className={cn("h-48", className)}>
          <LineChart
            width={300}
            height={180}
            data={[
              { date: "Lun", resting: 62 },
              { date: "Mar", resting: 72 },
              { date: "Mer", resting: 35 },
              { date: "Jeu", resting: 62 },
              { date: "Ven", resting: 52 },
              { date: "Sam", resting: 62 },
              { date: "Dim", resting: 70 },
            ]}
            margin={{ top: 10, right: 10, left: 10, bottom: 20 }}
          >
            <CartesianGrid
              strokeDasharray="4 4"
              vertical={false}
              stroke={getChartColor(3)}
              strokeOpacity={0.5}
            />
            <YAxis hide domain={["dataMin - 10", "dataMax + 10"]} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tick={{ fill: "currentColor", fontSize: 12 }}
            />
            <Line
              dataKey="resting"
              type="natural"
              stroke={getChartColor(2)}
              strokeWidth={2}
              dot={false}
              activeDot={{
                fill: getChartColor(2),
                stroke: getChartColor(2),
                r: 4,
              }}
            />
          </LineChart>
        </div>
      ),
    },
    {
      title: "Graphique radial",
      render: (className: string) => (
        <div className={cn("h-48", className)}>
          <RadialBarChart
            width={300}
            height={180}
            innerRadius="20%"
            outerRadius="80%"
            data={[
              {
                activity: "Série 3",
                value: 65,
                fill: getChartColor(3),
              },
              {
                activity: "Série 2",
                value: 75,
                fill: getChartColor(2),
              },
              {
                activity: "Série 1",
                value: 85,
                fill: getChartColor(1),
              },
            ]}
            startAngle={90}
            endAngle={450}
            barSize={20}
          >
            <PolarAngleAxis
              type="number"
              domain={[0, 100]}
              dataKey="value"
              tick={false}
            />
            <RadialBar
              dataKey="value"
              background={{ fill: "var(--background)" }}
              cornerRadius={5}
            />
          </RadialBarChart>
        </div>
      ),
    },
  ];

  const getColorLabel = (colorKey: string) => {
    const labels: Record<string, string> = {
      // Couleurs principales
      background: "Couleur du fond",
      foreground: "Couleur du texte",
      primary: "Couleur principale",
      "primary-foreground": "Texte sur couleur principale",

      // Composants
      card: "Fond des cartes",
      "card-foreground": "Texte des cartes",
      popover: "Fond des pop-ups",
      "popover-foreground": "Texte des pop-ups",

      // Actions
      secondary: "Couleur secondaire",
      "secondary-foreground": "Texte sur couleur secondaire",
      accent: "Couleur d'accentuation",
      "accent-foreground": "Texte sur accentuation",
      destructive: "Couleur de suppression",
      "destructive-foreground": "Texte sur suppression",

      // États
      muted: "Couleur atténuée",
      "muted-foreground": "Texte atténué",
      border: "Couleur des bordures",
      input: "Couleur des champs",
      ring: "Couleur de focus",

      // Graphiques
      "chart-1": "Graphique - Série 1",
      "chart-2": "Graphique - Série 2",
      "chart-3": "Graphique - Série 3",
      "chart-4": "Graphique - Série 4",
      "chart-5": "Graphique - Série 5",
    };

    return labels[colorKey] || colorKey;
  };

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
            <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-2">
              {Object.entries(presets[selectedCategory]).map(
                ([name, preset]) => (
                  <div
                    key={name}
                    className={cn(
                      "flex flex-col gap-1.5 p-2 rounded-lg border cursor-pointer hover:bg-accent transition-colors",
                      {
                        "border-primary": config.theme === name,
                      }
                    )}
                    onClick={() => handlePresetChange(name)}
                  >
                    <div className="grid grid-cols-2 gap-0.5 aspect-square">
                      {preset.preview.map((color: string, i: number) => (
                        <div
                          key={i}
                          className="rounded-sm w-full h-full"
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                    <p className="text-xs font-medium text-center truncate">
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
                        {getColorLabel(colorKey)}{" "}
                        <code className="text-xs px-1 py-0.5 rounded bg-muted">
                          {colorKey}
                        </code>
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
                          ] as string
                        )}
                        className="w-[100px]"
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
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

        <Card>
          <CardHeader>
            <CardTitle>Couleurs des graphiques</CardTitle>
            <CardDescription>
              Configurez les couleurs utilisées dans les graphiques et
              visualisations
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6">
              <div className="grid gap-4">
                {chartColors.map((colorKey) => (
                  <div key={colorKey} className="flex items-center gap-4">
                    <div className="flex-1">
                      <Label htmlFor={colorKey} className="text-sm font-medium">
                        {getColorLabel(colorKey)}{" "}
                        <code className="text-xs px-1 py-0.5 rounded bg-muted">
                          {colorKey}
                        </code>
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
                          ] as string
                        )}
                        className="w-[100px]"
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
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

              <div className="mt-6 space-y-4">
                <Label className="text-sm font-medium">Aperçu</Label>
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                  {chartExamples.map((example, i) => (
                    <div
                      key={i}
                      className={cn(
                        "rounded-lg border p-4",
                        i > 0 && "hidden xl:block"
                      )}
                    >
                      <p className="text-sm font-medium mb-4">
                        {example.title}
                      </p>
                      {example.render("w-full")}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
