"use client";

import React, { useState, useRef } from "react";
import ReactCrop, {
  centerCrop,
  makeAspectCrop,
  Crop,
  PixelCrop,
} from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTranslation, useModuleTranslations } from "@/lib/i18n";
import moduleTranslations from "./translations";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface CropUIProps {
  fileInfo: {
    name: string;
    url: string;
    size: number;
    type: string;
  };
  onComplete: (result: any) => void;
}

// Fonction pour centrer le recadrage initial
function centerAspectCrop(
  mediaWidth: number,
  mediaHeight: number,
  aspect: number
) {
  return centerCrop(
    makeAspectCrop(
      {
        unit: "%",
        width: 90,
      },
      aspect,
      mediaWidth,
      mediaHeight
    ),
    mediaWidth,
    mediaHeight
  );
}

export default function CropUI({ fileInfo, onComplete }: CropUIProps) {
  // Enregistrer les traductions du module
  useModuleTranslations("crop", moduleTranslations);

  const { t } = useTranslation();
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [aspect, setAspect] = useState<number | undefined>(undefined);
  const [circularCrop, setCircularCrop] = useState(false);
  const [quality, setQuality] = useState(90);
  const [activeTab, setActiveTab] = useState("basic");
  const [gridOverlay, setGridOverlay] = useState(false);
  const [gridType, setGridType] = useState("rule_of_thirds");
  const imgRef = useRef<HTMLImageElement>(null);
  const [imgWidth, setImgWidth] = useState(0);
  const [imgHeight, setImgHeight] = useState(0);

  // Gérer le chargement de l'image
  function onImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const { width, height } = e.currentTarget;
    setImgWidth(width);
    setImgHeight(height);

    // Définir un recadrage initial centré
    if (aspect) {
      setCrop(centerAspectCrop(width, height, aspect));
    }
  }

  // Gérer le changement de ratio d'aspect
  function handleAspectChange(value: string) {
    if (value === "free") {
      setAspect(undefined);
    } else {
      const [width, height] = value.split(":").map(Number);
      const newAspect = width / height;
      setAspect(newAspect);

      if (imgRef.current && newAspect) {
        const { width: imgWidth, height: imgHeight } = imgRef.current;
        setCrop(centerAspectCrop(imgWidth, imgHeight, newAspect));
      }
    }
  }

  // Appliquer le recadrage
  function handleApply() {
    if (!completedCrop) {
      // Si aucun recadrage n'est sélectionné, utiliser l'image entière
      onComplete({
        crop: {
          x: 0,
          y: 0,
          width: imgWidth,
          height: imgHeight,
          unit: "px",
        },
        circularCrop,
        quality,
      });
      return;
    }

    // Envoyer les données de recadrage
    onComplete({
      crop: completedCrop,
      circularCrop,
      quality,
      gridOverlay,
      gridType,
    });
  }

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-2">
          <TabsTrigger value="basic">{t("modules.crop.title")}</TabsTrigger>
          <TabsTrigger value="advanced">
            {t("modules.crop.advanced.title")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="basic" className="space-y-6">
          <div className="flex flex-col items-center">
            <ReactCrop
              crop={crop}
              onChange={(c) => setCrop(c)}
              onComplete={(c) => setCompletedCrop(c)}
              aspect={aspect}
              circularCrop={circularCrop}
              className="max-h-[400px] overflow-hidden rounded-md"
            >
              <img
                ref={imgRef}
                src={fileInfo.url}
                alt={fileInfo.name}
                onLoad={onImageLoad}
                className="max-h-[400px] w-auto"
              />
            </ReactCrop>

            {gridOverlay && (
              <div className="text-xs text-muted-foreground mt-2">
                {t("modules.crop.help.drag")}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("modules.crop.aspect_ratio")}</Label>
              <Select defaultValue="free" onValueChange={handleAspectChange}>
                <SelectTrigger>
                  <SelectValue placeholder={t("modules.crop.aspect_ratio")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="free">
                    {t("modules.crop.aspect_ratios.free")}
                  </SelectItem>
                  <SelectItem value="1:1">
                    {t("modules.crop.aspect_ratios.square")}
                  </SelectItem>
                  <SelectItem value="4:3">
                    {t("modules.crop.aspect_ratios.landscape")}
                  </SelectItem>
                  <SelectItem value="16:9">
                    {t("modules.crop.aspect_ratios.widescreen")}
                  </SelectItem>
                  <SelectItem value="3:2">3:2</SelectItem>
                  <SelectItem value="2:3">
                    {t("modules.crop.aspect_ratios.portrait")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="circular-crop"
                checked={circularCrop}
                onCheckedChange={setCircularCrop}
              />
              <Label htmlFor="circular-crop">
                {t("modules.crop.circular_crop")}
              </Label>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between">
                <Label>{t("modules.crop.quality")}</Label>
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
            </div>
          </div>
        </TabsContent>

        <TabsContent value="advanced" className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Switch
                id="grid-overlay"
                checked={gridOverlay}
                onCheckedChange={setGridOverlay}
              />
              <Label htmlFor="grid-overlay">
                {t("modules.crop.advanced.grid_overlay")}
              </Label>
            </div>

            {gridOverlay && (
              <div className="space-y-2">
                <Label>{t("modules.crop.advanced.grid_type")}</Label>
                <Select value={gridType} onValueChange={setGridType}>
                  <SelectTrigger>
                    <SelectValue
                      placeholder={t("modules.crop.advanced.grid_type")}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rule_of_thirds">
                      {t("modules.crop.advanced.grid_types.rule_of_thirds")}
                    </SelectItem>
                    <SelectItem value="golden_ratio">
                      {t("modules.crop.advanced.grid_types.golden_ratio")}
                    </SelectItem>
                    <SelectItem value="diagonal">
                      {t("modules.crop.advanced.grid_types.diagonal")}
                    </SelectItem>
                    <SelectItem value="center">
                      {t("modules.crop.advanced.grid_types.center")}
                    </SelectItem>
                    <SelectItem value="none">
                      {t("modules.crop.advanced.grid_types.none")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="pt-4 text-sm text-muted-foreground">
              <p>{t("modules.crop.help.resize")}</p>
              <p className="mt-1">{t("modules.crop.help.apply")}</p>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <div className="flex justify-end pt-4">
        <Button onClick={handleApply}>{t("modules.crop.apply")}</Button>
      </div>
    </div>
  );
}
