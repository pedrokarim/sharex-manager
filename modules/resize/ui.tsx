"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useTranslation, useModuleTranslations } from "@/lib/i18n";
import moduleTranslations from "./translations";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Interface pour les props du composant
interface ResizeUIProps {
  fileInfo: {
    name: string;
    url: string;
    size: number;
    type: string;
  };
  onComplete: (result: any) => void;
}

export default function ResizeUI({ fileInfo, onComplete }: ResizeUIProps) {
  // Enregistrer les traductions du module
  useModuleTranslations("resize", moduleTranslations);

  const { t } = useTranslation();
  const [maxWidth, setMaxWidth] = useState(1920);
  const [maxHeight, setMaxHeight] = useState(1080);
  const [quality, setQuality] = useState(90);
  const [maintainAspectRatio, setMaintainAspectRatio] = useState(true);
  const [activeTab, setActiveTab] = useState("basic");
  const [selectedPreset, setSelectedPreset] = useState("custom");
  const [fitMode, setFitMode] = useState("contain");
  const [keepMetadata, setKeepMetadata] = useState(true);
  const [originalDimensions, setOriginalDimensions] = useState({
    width: 0,
    height: 0,
  });
  const [previewDimensions, setPreviewDimensions] = useState({
    width: 0,
    height: 0,
  });

  // Charger les dimensions originales de l'image
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      setOriginalDimensions({ width: img.width, height: img.height });
      updatePreviewDimensions(
        img.width,
        img.height,
        maxWidth,
        maxHeight,
        maintainAspectRatio
      );
    };
    img.src = fileInfo.url;
  }, [fileInfo.url]);

  // Mettre à jour les dimensions de prévisualisation
  const updatePreviewDimensions = (
    originalWidth: number,
    originalHeight: number,
    maxW: number,
    maxH: number,
    maintain: boolean
  ) => {
    if (originalWidth === 0 || originalHeight === 0) return;

    let newWidth = originalWidth;
    let newHeight = originalHeight;

    if (maintain) {
      // Maintenir le ratio d'aspect
      const ratio = originalWidth / originalHeight;

      if (originalWidth > maxW) {
        newWidth = maxW;
        newHeight = maxW / ratio;
      }

      if (newHeight > maxH) {
        newHeight = maxH;
        newWidth = maxH * ratio;
      }
    } else {
      // Ne pas maintenir le ratio d'aspect
      newWidth = Math.min(originalWidth, maxW);
      newHeight = Math.min(originalHeight, maxH);
    }

    setPreviewDimensions({
      width: Math.round(newWidth),
      height: Math.round(newHeight),
    });
  };

  // Gérer le changement de préréglage
  const handlePresetChange = (value: string) => {
    setSelectedPreset(value);

    switch (value) {
      case "hd":
        setMaxWidth(1280);
        setMaxHeight(720);
        break;
      case "full_hd":
        setMaxWidth(1920);
        setMaxHeight(1080);
        break;
      case "4k":
        setMaxWidth(3840);
        setMaxHeight(2160);
        break;
      case "thumbnail":
        setMaxWidth(300);
        setMaxHeight(300);
        break;
      case "social_media":
        setMaxWidth(1200);
        setMaxHeight(630);
        break;
    }

    updatePreviewDimensions(
      originalDimensions.width,
      originalDimensions.height,
      maxWidth,
      maxHeight,
      maintainAspectRatio
    );
  };

  // Gérer le changement de largeur maximale
  const handleMaxWidthChange = (value: string) => {
    const newMaxWidth = parseInt(value, 10) || 0;
    setMaxWidth(newMaxWidth);
    setSelectedPreset("custom");
    updatePreviewDimensions(
      originalDimensions.width,
      originalDimensions.height,
      newMaxWidth,
      maxHeight,
      maintainAspectRatio
    );
  };

  // Gérer le changement de hauteur maximale
  const handleMaxHeightChange = (value: string) => {
    const newMaxHeight = parseInt(value, 10) || 0;
    setMaxHeight(newMaxHeight);
    setSelectedPreset("custom");
    updatePreviewDimensions(
      originalDimensions.width,
      originalDimensions.height,
      maxWidth,
      newMaxHeight,
      maintainAspectRatio
    );
  };

  // Gérer le changement de maintien du ratio d'aspect
  const handleMaintainAspectRatioChange = (checked: boolean) => {
    setMaintainAspectRatio(checked);
    updatePreviewDimensions(
      originalDimensions.width,
      originalDimensions.height,
      maxWidth,
      maxHeight,
      checked
    );
  };

  // Appliquer le redimensionnement
  const handleApply = () => {
    onComplete({
      maxWidth,
      maxHeight,
      quality,
      maintainAspectRatio,
      fitMode,
      keepMetadata,
    });
  };

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-2">
          <TabsTrigger value="basic">{t("modules.resize.title")}</TabsTrigger>
          <TabsTrigger value="advanced">
            {t("modules.resize.advanced.title")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="basic" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>{t("modules.resize.presets.title")}</Label>
                <Select
                  value={selectedPreset}
                  onValueChange={handlePresetChange}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={t("modules.resize.presets.title")}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="custom">
                      {t("modules.resize.presets.custom")}
                    </SelectItem>
                    <SelectItem value="hd">
                      {t("modules.resize.presets.hd")}
                    </SelectItem>
                    <SelectItem value="full_hd">
                      {t("modules.resize.presets.full_hd")}
                    </SelectItem>
                    <SelectItem value="4k">
                      {t("modules.resize.presets.4k")}
                    </SelectItem>
                    <SelectItem value="thumbnail">
                      {t("modules.resize.presets.thumbnail")}
                    </SelectItem>
                    <SelectItem value="social_media">
                      {t("modules.resize.presets.social_media")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="max-width">
                  {t("modules.resize.max_width")}
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="max-width"
                    type="number"
                    min="1"
                    max="10000"
                    value={maxWidth}
                    onChange={(e) => handleMaxWidthChange(e.target.value)}
                  />
                  <span className="text-sm text-muted-foreground">px</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="max-height">
                  {t("modules.resize.max_height")}
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="max-height"
                    type="number"
                    min="1"
                    max="10000"
                    value={maxHeight}
                    onChange={(e) => handleMaxHeightChange(e.target.value)}
                  />
                  <span className="text-sm text-muted-foreground">px</span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label>{t("modules.resize.quality")}</Label>
                  <span className="text-sm text-muted-foreground">
                    {quality}%
                  </span>
                </div>
                <Slider
                  value={[quality]}
                  min={10}
                  max={100}
                  step={1}
                  onValueChange={(values) => setQuality(values[0])}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {t("modules.resize.help.quality_tip")}
                </p>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="maintain-aspect-ratio"
                  checked={maintainAspectRatio}
                  onCheckedChange={handleMaintainAspectRatioChange}
                />
                <Label htmlFor="maintain-aspect-ratio">
                  {t("modules.resize.maintain_aspect_ratio")}
                </Label>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("modules.resize.help.aspect_ratio_tip")}
              </p>
            </div>

            <div className="space-y-4">
              <Card className="p-4">
                <h3 className="text-sm font-medium mb-2">
                  {t("modules.resize.help.preview")}
                </h3>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>{t("modules.resize.dimensions.original")}:</span>
                    <span>
                      {originalDimensions.width} × {originalDimensions.height}{" "}
                      px
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>{t("modules.resize.dimensions.new")}:</span>
                    <span>
                      {previewDimensions.width} × {previewDimensions.height} px
                    </span>
                  </div>
                  {originalDimensions.width > 0 && (
                    <div className="flex justify-between text-sm">
                      <span>{t("modules.resize.dimensions.reduction")}:</span>
                      <span>
                        {Math.round(
                          (1 -
                            (previewDimensions.width *
                              previewDimensions.height) /
                              (originalDimensions.width *
                                originalDimensions.height)) *
                            100
                        )}
                        %
                      </span>
                    </div>
                  )}
                </div>
              </Card>

              <div className="relative aspect-video bg-muted rounded-md overflow-hidden">
                <div className="absolute inset-0 flex items-center justify-center">
                  <img
                    src={fileInfo.url}
                    alt="Aperçu"
                    className="max-w-full max-h-full object-contain"
                  />
                </div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div
                    className="border-2 border-primary"
                    style={{
                      width: `${Math.min(
                        100,
                        (previewDimensions.width / originalDimensions.width) *
                          100
                      )}%`,
                      height: `${Math.min(
                        100,
                        (previewDimensions.height / originalDimensions.height) *
                          100
                      )}%`,
                    }}
                  ></div>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="advanced" className="space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("modules.resize.advanced.fit_mode")}</Label>
              <Select value={fitMode} onValueChange={setFitMode}>
                <SelectTrigger>
                  <SelectValue
                    placeholder={t("modules.resize.advanced.fit_mode")}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cover">
                    {t("modules.resize.advanced.fit_modes.cover")}
                  </SelectItem>
                  <SelectItem value="contain">
                    {t("modules.resize.advanced.fit_modes.contain")}
                  </SelectItem>
                  <SelectItem value="fill">
                    {t("modules.resize.advanced.fit_modes.fill")}
                  </SelectItem>
                  <SelectItem value="inside">
                    {t("modules.resize.advanced.fit_modes.inside")}
                  </SelectItem>
                  <SelectItem value="outside">
                    {t("modules.resize.advanced.fit_modes.outside")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="keep-metadata"
                checked={keepMetadata}
                onCheckedChange={setKeepMetadata}
              />
              <Label htmlFor="keep-metadata">
                {t("modules.resize.advanced.keep_metadata")}
              </Label>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <div className="flex justify-end">
        <Button onClick={handleApply}>{t("modules.resize.apply")}</Button>
      </div>
    </div>
  );
}
