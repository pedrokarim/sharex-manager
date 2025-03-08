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
    <div className="flex flex-col h-full p-8">
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Paintbrush className="h-8 w-8" />
              {t("settings.theme_advanced")}
            </h1>
            <p className="text-muted-foreground mt-2">
              {t("settings.theme_advanced_description")}
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
          {t("settings.theme_options.light")}
        </Button>
        <Button
          variant={activeTheme === "dark" ? "default" : "outline"}
          onClick={() => setActiveTheme("dark")}
        >
          <Moon className="h-4 w-4 mr-2" />
          {t("settings.theme_options.dark")}
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
              <SelectValue
                placeholder={t("settings.theme_config.choose_category")}
              />
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
            {t("common.reset")}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 flex-1">
        <Card>
          <CardHeader>
            <CardTitle>{t("settings.theme_config.presets")}</CardTitle>
            <CardDescription>
              {t("settings.theme_config.presets_description")}
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
            <CardTitle>{t("settings.theme_config.general")}</CardTitle>
            <CardDescription>
              {t("settings.theme_config.general_description")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>{t("settings.theme_config.radius")}</Label>
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
            <CardHeader>
              <CardTitle>{group.title}</CardTitle>
              <CardDescription>
                {t("settings.theme_config.general_description")}
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
            <CardTitle>{t("settings.theme_config.chart_colors")}</CardTitle>
            <CardDescription>
              {t("settings.theme_config.chart_colors_description")}
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
                <Label className="text-sm font-medium">
                  {t("common.preview")}
                </Label>
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
