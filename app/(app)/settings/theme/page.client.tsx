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
import { useTranslation } from "@/lib/i18n";

export function ThemeConfigClient() {
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [activeTheme, setActiveTheme] = useState<"light" | "dark">("light");
  const [selectedCategory, setSelectedCategory] =
    useState<keyof typeof presets>("Thèmes par défaut");
  const [config, setConfig] = useThemeConfig();
  const { t } = useTranslation();

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
            ...prev.cssVars,
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
        break;
      }
    }
  };

  const handleReset = () => {
    setConfig((prev) => ({
      ...prev,
      theme: "default",
      cssVars: {
        light: { ...prev.cssVars.light, radius: prev.cssVars.light.radius },
        dark: { ...prev.cssVars.dark, radius: prev.cssVars.dark.radius },
      },
    }));
    setSelectedCategory("Thèmes par défaut");
    toast.success(t("settings.save_success"));
  };

  const handleRadiusChange = (value: number) => {
    setConfig((prev) => ({
      ...prev,
      cssVars: {
        ...prev.cssVars,
        [activeTheme]: {
          ...prev.cssVars[activeTheme],
          radius: value.toString(),
        },
      },
    }));
  };

  const colorGroups = [
    {
      title: t("settings.theme_config.color_groups.main"),
      colors: ["background", "foreground", "primary", "primary-foreground"],
    },
    {
      title: t("settings.theme_config.color_groups.components"),
      colors: ["card", "card-foreground", "popover", "popover-foreground"],
    },
    {
      title: t("settings.theme_config.color_groups.actions"),
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
      title: t("settings.theme_config.color_groups.states"),
      colors: ["muted", "muted-foreground", "border", "input", "ring"],
    },
  ];

  const chartColors = ["chart-1", "chart-2", "chart-3", "chart-4", "chart-5"];

  const getChartColor = (index: number) => {
    const colorKey = `chart-${index + 1}` as keyof ColorVars;
    return `hsl(${config.cssVars[activeTheme][colorKey]})`;
  };

  const chartExamples = [
    {
      title: t("settings.theme_config.chart_examples.line_chart"),
      render: (className: string) => (
        <div className={className}>
          <LineChart
            width={300}
            height={200}
            data={[
              {
                name: "Jan",
                [t("settings.theme_config.chart_examples.series") + " 1"]: 400,
                [t("settings.theme_config.chart_examples.series") + " 2"]: 240,
              },
              {
                name: "Feb",
                [t("settings.theme_config.chart_examples.series") + " 1"]: 300,
                [t("settings.theme_config.chart_examples.series") + " 2"]: 139,
              },
              {
                name: "Mar",
                [t("settings.theme_config.chart_examples.series") + " 1"]: 200,
                [t("settings.theme_config.chart_examples.series") + " 2"]: 980,
              },
              {
                name: "Apr",
                [t("settings.theme_config.chart_examples.series") + " 1"]: 278,
                [t("settings.theme_config.chart_examples.series") + " 2"]: 390,
              },
              {
                name: "May",
                [t("settings.theme_config.chart_examples.series") + " 1"]: 189,
                [t("settings.theme_config.chart_examples.series") + " 2"]: 480,
              },
            ]}
            margin={{ top: 5, right: 20, bottom: 5, left: 0 }}
          >
            <Line
              type="monotone"
              dataKey={t("settings.theme_config.chart_examples.series") + " 1"}
              stroke={getChartColor(0)}
              strokeWidth={2}
            />
            <Line
              type="monotone"
              dataKey={t("settings.theme_config.chart_examples.series") + " 2"}
              stroke={getChartColor(1)}
              strokeWidth={2}
            />
            <CartesianGrid stroke="var(--border)" strokeDasharray="5 5" />
            <XAxis
              dataKey="name"
              stroke="var(--muted-foreground)"
              fontSize={12}
            />
            <YAxis stroke="var(--muted-foreground)" fontSize={12} />
          </LineChart>
        </div>
      ),
    },
    {
      title: t("settings.theme_config.chart_examples.bar_chart"),
      render: (className: string) => (
        <div className={className}>
          <BarChart
            width={300}
            height={200}
            data={[
              {
                name: "A",
                [t("settings.theme_config.chart_examples.series") + " 1"]: 120,
                [t("settings.theme_config.chart_examples.series") + " 2"]: 80,
              },
              {
                name: "B",
                [t("settings.theme_config.chart_examples.series") + " 1"]: 100,
                [t("settings.theme_config.chart_examples.series") + " 2"]: 130,
              },
              {
                name: "C",
                [t("settings.theme_config.chart_examples.series") + " 1"]: 86,
                [t("settings.theme_config.chart_examples.series") + " 2"]: 130,
              },
              {
                name: "D",
                [t("settings.theme_config.chart_examples.series") + " 1"]: 99,
                [t("settings.theme_config.chart_examples.series") + " 2"]: 100,
              },
            ]}
            margin={{ top: 5, right: 20, bottom: 5, left: 0 }}
          >
            <CartesianGrid stroke="var(--border)" strokeDasharray="5 5" />
            <XAxis
              dataKey="name"
              stroke="var(--muted-foreground)"
              fontSize={12}
            />
            <YAxis stroke="var(--muted-foreground)" fontSize={12} />
            <Bar
              dataKey={t("settings.theme_config.chart_examples.series") + " 1"}
              fill={getChartColor(0)}
              radius={[4, 4, 0, 0]}
            />
            <Bar
              dataKey={t("settings.theme_config.chart_examples.series") + " 2"}
              fill={getChartColor(1)}
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </div>
      ),
    },
    {
      title: t("settings.theme_config.chart_examples.radial_chart"),
      render: (className: string) => (
        <div className={className}>
          <RadialBarChart
            width={300}
            height={200}
            innerRadius="10%"
            outerRadius="80%"
            data={[
              {
                activity:
                  t("settings.theme_config.chart_examples.series") + " 1",
                value: 65,
                fill: getChartColor(0),
              },
              {
                activity:
                  t("settings.theme_config.chart_examples.series") + " 1",
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
    return t(`settings.theme_config.colors.${colorKey}`) || colorKey;
  };

  return (
    <div className="flex flex-col h-full p-4 sm:p-6 lg:p-8">
      <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2 sm:gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.back()}
            className="h-8 w-8 sm:h-9 sm:w-9"
          >
            <ArrowLeft className="h-3 w-3 sm:h-4 sm:w-4" />
          </Button>
          <div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold flex items-center gap-2">
              <Paintbrush className="h-5 w-5 sm:h-6 sm:w-6 lg:h-8 lg:w-8" />
              {t("settings.theme_advanced")}
            </h1>
            <p className="text-muted-foreground mt-2 text-sm sm:text-base">
              {t("settings.theme_advanced_description")}
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mb-4 sm:mb-6">
        <div className="flex gap-2 sm:gap-4">
          <Button
            variant={activeTheme === "light" ? "default" : "outline"}
            onClick={() => setActiveTheme("light")}
            className="flex-1 sm:flex-none text-sm"
          >
            <Sun className="h-3 w-3 sm:h-4 sm:w-4 mr-2" />
            {t("settings.theme_options.light")}
          </Button>
          <Button
            variant={activeTheme === "dark" ? "default" : "outline"}
            onClick={() => setActiveTheme("dark")}
            className="flex-1 sm:flex-none text-sm"
          >
            <Moon className="h-3 w-3 sm:h-4 sm:w-4 mr-2" />
            {t("settings.theme_options.dark")}
          </Button>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-2 sm:ml-auto">
          <Select
            onValueChange={(value: keyof typeof presets) =>
              setSelectedCategory(value)
            }
            value={selectedCategory}
          >
            <SelectTrigger className="w-full sm:w-[180px] text-sm">
              <Palette className="h-3 w-3 sm:h-4 sm:w-4 mr-2" />
              <SelectValue
                placeholder={t("settings.theme_config.choose_category")}
              />
            </SelectTrigger>
            <SelectContent>
              {Object.keys(presets).map((category) => (
                <SelectItem key={category} value={category} className="text-sm">
                  {category}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            onClick={handleReset}
            className="w-full sm:w-auto text-sm"
          >
            <Settings2 className="h-3 w-3 sm:h-4 sm:w-4 mr-2" />
            {t("common.reset")}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:gap-6 flex-1">
        <Card>
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="text-lg sm:text-xl">
              {t("settings.theme_config.presets")}
            </CardTitle>
            <CardDescription className="text-sm">
              {t("settings.theme_config.presets_description")}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-2 sm:gap-3">
              {Object.entries(presets[selectedCategory]).map(
                ([name, preset]) => (
                  <div
                    key={name}
                    className={cn(
                      "flex flex-col gap-1.5 p-2 sm:p-3 rounded-lg border cursor-pointer hover:bg-accent transition-colors",
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
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="text-lg sm:text-xl">
              {t("settings.theme_config.general")}
            </CardTitle>
            <CardDescription className="text-sm">
              {t("settings.theme_config.general_description")}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0">
            <div className="space-y-4 sm:space-y-6">
              <div className="space-y-2 sm:space-y-3">
                <Label className="text-sm sm:text-base">
                  {t("settings.theme_config.radius")}
                </Label>
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
                  <div className="flex justify-between mt-4 text-xs sm:text-sm text-muted-foreground">
                    <span>{t("settings.theme_config.square")}</span>
                    <span>{t("settings.theme_config.rounded")}</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {colorGroups.map((group) => (
          <Card key={group.title}>
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="text-lg sm:text-xl">
                {group.title}
              </CardTitle>
              <CardDescription className="text-sm">
                {t("settings.theme_config.general_description")}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-0">
              <div className="grid gap-3 sm:gap-4">
                {group.colors.map((colorKey) => (
                  <div
                    key={colorKey}
                    className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4"
                  >
                    <div className="flex-1 min-w-0">
                      <Label htmlFor={colorKey} className="text-sm font-medium">
                        {getColorLabel(colorKey)}{" "}
                        <code className="text-xs px-1 py-0.5 rounded bg-muted">
                          {colorKey}
                        </code>
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <div
                        className="w-6 h-6 rounded border flex-shrink-0"
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
                        className="w-[80px] sm:w-[100px]"
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
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="text-lg sm:text-xl">
              {t("settings.theme_config.chart_colors")}
            </CardTitle>
            <CardDescription className="text-sm">
              {t("settings.theme_config.chart_colors_description")}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0">
            <div className="grid gap-4 sm:gap-6">
              <div className="grid gap-3 sm:gap-4">
                {chartColors.map((colorKey) => (
                  <div
                    key={colorKey}
                    className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4"
                  >
                    <div className="flex-1 min-w-0">
                      <Label htmlFor={colorKey} className="text-sm font-medium">
                        {getColorLabel(colorKey)}{" "}
                        <code className="text-xs px-1 py-0.5 rounded bg-muted">
                          {colorKey}
                        </code>
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <div
                        className="w-6 h-6 rounded border flex-shrink-0"
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
                        className="w-[80px] sm:w-[100px]"
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

              <div className="mt-4 sm:mt-6 space-y-4">
                <Label className="text-sm font-medium">
                  {t("common.preview")}
                </Label>
                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
                  {chartExamples.map((example, i) => (
                    <div
                      key={i}
                      className={cn(
                        "rounded-lg border p-3 sm:p-4",
                        i > 1 && "hidden xl:block"
                      )}
                    >
                      <p className="text-xs sm:text-sm font-medium mb-3 sm:mb-4">
                        {example.title}
                      </p>
                      <div className="overflow-x-auto">
                        {example.render("w-full min-w-[250px]")}
                      </div>
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
