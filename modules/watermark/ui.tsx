"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { HexColorPicker } from "react-colorful";
import { Card } from "@/components/ui/card";
import { useTranslation } from "@/lib/i18n";

// Interface pour les props du composant
interface WatermarkUIProps {
  fileInfo: {
    name: string;
    url: string;
    size: number;
    type: string;
  };
  onComplete: (result: any) => void;
}

export default function WatermarkUI({
  fileInfo,
  onComplete,
}: WatermarkUIProps) {
  const { t } = useTranslation();
  const [text, setText] = useState("© ShareX Manager");
  const [position, setPosition] = useState("bottom-right");
  const [opacity, setOpacity] = useState(70);
  const [fontSize, setFontSize] = useState(24);
  const [color, setColor] = useState("#ffffff");
  const [padding, setPadding] = useState(20);
  const [showColorPicker, setShowColorPicker] = useState(false);

  // Positions disponibles pour le filigrane
  const positions = [
    { value: "top-left", label: t("modules.watermark.positions.top_left") },
    { value: "top-center", label: t("modules.watermark.positions.top_center") },
    { value: "top-right", label: t("modules.watermark.positions.top_right") },
    {
      value: "middle-left",
      label: t("modules.watermark.positions.middle_left"),
    },
    {
      value: "middle-center",
      label: t("modules.watermark.positions.middle_center"),
    },
    {
      value: "middle-right",
      label: t("modules.watermark.positions.middle_right"),
    },
    {
      value: "bottom-left",
      label: t("modules.watermark.positions.bottom_left"),
    },
    {
      value: "bottom-center",
      label: t("modules.watermark.positions.bottom_center"),
    },
    {
      value: "bottom-right",
      label: t("modules.watermark.positions.bottom_right"),
    },
  ];

  // Appliquer le filigrane
  const handleApply = () => {
    onComplete({
      text,
      position,
      opacity: opacity / 100, // Convertir en valeur entre 0 et 1
      fontSize,
      color,
      padding,
    });
  };

  // Obtenir les coordonnées de prévisualisation en fonction de la position
  const getPreviewPosition = (pos: string) => {
    const positions: Record<
      string,
      { top: string; left: string; transform: string }
    > = {
      "top-left": { top: "0", left: "0", transform: "translate(0, 0)" },
      "top-center": { top: "0", left: "50%", transform: "translate(-50%, 0)" },
      "top-right": { top: "0", left: "100%", transform: "translate(-100%, 0)" },
      "middle-left": { top: "50%", left: "0", transform: "translate(0, -50%)" },
      "middle-center": {
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
      },
      "middle-right": {
        top: "50%",
        left: "100%",
        transform: "translate(-100%, -50%)",
      },
      "bottom-left": {
        top: "100%",
        left: "0",
        transform: "translate(0, -100%)",
      },
      "bottom-center": {
        top: "100%",
        left: "50%",
        transform: "translate(-50%, -100%)",
      },
      "bottom-right": {
        top: "100%",
        left: "100%",
        transform: "translate(-100%, -100%)",
      },
    };

    return positions[pos] || positions["bottom-right"];
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="watermark-text">
              {t("modules.watermark.text")}
            </Label>
            <Input
              id="watermark-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t("modules.watermark.text_placeholder")}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="watermark-position">
              {t("modules.watermark.position")}
            </Label>
            <Select value={position} onValueChange={setPosition}>
              <SelectTrigger id="watermark-position">
                <SelectValue
                  placeholder={t("modules.watermark.choose_position")}
                />
              </SelectTrigger>
              <SelectContent>
                {positions.map((pos) => (
                  <SelectItem key={pos.value} value={pos.value}>
                    {pos.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between">
              <Label>{t("modules.watermark.opacity")}</Label>
              <span className="text-sm text-muted-foreground">{opacity}%</span>
            </div>
            <Slider
              value={[opacity]}
              min={10}
              max={100}
              step={1}
              onValueChange={(values) => setOpacity(values[0])}
            />
          </div>

          <div className="space-y-2">
            <div className="flex justify-between">
              <Label>{t("modules.watermark.font_size")}</Label>
              <span className="text-sm text-muted-foreground">
                {fontSize}px
              </span>
            </div>
            <Slider
              value={[fontSize]}
              min={8}
              max={72}
              step={1}
              onValueChange={(values) => setFontSize(values[0])}
            />
          </div>

          <div className="space-y-2">
            <div className="flex justify-between">
              <Label>{t("modules.watermark.padding")}</Label>
              <span className="text-sm text-muted-foreground">{padding}px</span>
            </div>
            <Slider
              value={[padding]}
              min={0}
              max={100}
              step={1}
              onValueChange={(values) => setPadding(values[0])}
            />
          </div>

          <div className="space-y-2">
            <Label>{t("modules.watermark.color")}</Label>
            <div className="flex items-center gap-2">
              <div
                className="w-10 h-10 rounded-md cursor-pointer border"
                style={{ backgroundColor: color }}
                onClick={() => setShowColorPicker(!showColorPicker)}
              ></div>
              <Input
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="font-mono"
              />
            </div>
            {showColorPicker && (
              <Card className="p-3 mt-2">
                <HexColorPicker color={color} onChange={setColor} />
              </Card>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <Card className="p-4">
            <h3 className="text-sm font-medium mb-2">
              {t("modules.watermark.preview")}
            </h3>
            <div className="relative aspect-video bg-muted rounded-md overflow-hidden">
              <img
                src={fileInfo.url}
                alt="Aperçu"
                className="w-full h-full object-cover"
              />
              <div
                className="absolute"
                style={{
                  top: getPreviewPosition(position).top,
                  left: getPreviewPosition(position).left,
                  transform: getPreviewPosition(position).transform,
                  padding: `${padding}px`,
                  opacity: opacity / 100,
                }}
              >
                <div
                  style={{
                    color: color,
                    fontSize: `${fontSize}px`,
                    fontWeight: "bold",
                    textShadow: "1px 1px 2px rgba(0,0,0,0.7)",
                  }}
                >
                  {text}
                </div>
              </div>
            </div>
          </Card>

          <div className="space-y-2">
            <h3 className="text-sm font-medium">
              {t("modules.watermark.tips.title")}
            </h3>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc pl-5">
              <li>{t("modules.watermark.tips.opacity")}</li>
              <li>{t("modules.watermark.tips.font_size")}</li>
              <li>{t("modules.watermark.tips.position")}</li>
              <li>{t("modules.watermark.tips.color")}</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleApply}>{t("modules.watermark.apply")}</Button>
      </div>
    </div>
  );
}
