"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HexColorPicker } from "react-colorful";
import { Card } from "@/components/ui/card";
import { useSession } from "@/lib/auth-client";
import { useTranslation, useModuleTranslations } from "@/lib/i18n";
import moduleTranslations from "./translations";

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

/** Nom du module tel que le connaît le gestionnaire (réglages enregistrés). */
const MODULE_NAME = "Watermark";
const BRAND_MODULE = "brand-kit";

type Source = "text" | "brand";

const POSITION_VALUES = [
  "top-left",
  "top-center",
  "top-right",
  "middle-left",
  "middle-center",
  "middle-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
] as const;
type Position = (typeof POSITION_VALUES)[number];

const isPosition = (value: unknown): value is Position =>
  typeof value === "string" && (POSITION_VALUES as readonly string[]).includes(value);

/** Une image de marque dans le sélecteur. */
interface KitOption {
  id: string;
  name: string;
  isDefault: boolean;
}

/** Filigrane d'une marque, tel que l'enregistre le module `brand-kit`. */
interface BrandWatermark {
  kitId: string;
  /** Adresse du logo du filigrane, absente si la marque n'en a pas. */
  logoUrl: string | null;
  /** Largeur / hauteur du logo, connue avant son chargement. */
  logoRatio: number | null;
  position: Position;
  /** Pourcentages, comme les curseurs. */
  size: number;
  opacity: number;
  margin: number;
}

/** Réglages de la source marque, en pourcentages pour les curseurs. */
interface BrandValues {
  position: Position;
  size: number;
  opacity: number;
  margin: number;
}

/** Appel d'une fonction du module `brand-kit` depuis le navigateur. */
async function callBrandKit<T>(functionName: string, ...args: unknown[]): Promise<T | null> {
  const response = await fetch("/api/modules/call-function", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ moduleName: BRAND_MODULE, functionName, args }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.error || `HTTP ${response.status}`);
  }
  return (payload?.data ?? null) as T | null;
}

/**
 * Filigrane d'une marque : le logo du filigrane, sinon le symbole, sinon le
 * logo principal, comme côté serveur.
 */
function readBrandWatermark(kit: any): BrandWatermark {
  const assets: { id: string; file: string; width?: number; height?: number }[] = Array.isArray(kit?.assets)
    ? kit.assets
    : [];
  const find = (id: unknown) => (typeof id === "string" ? assets.find((asset) => asset.id === id) : undefined);
  const asset = find(kit?.watermark?.assetId) ?? find(kit?.markAssetId) ?? find(kit?.logoAssetId);
  const watermark = kit?.watermark ?? {};
  const percent = (value: unknown, fallback: number, digits = 0) => {
    const number = Number(value);
    const factor = 10 ** digits;
    return Number.isFinite(number) ? Math.round(number * 100 * factor) / factor : fallback;
  };
  return {
    kitId: String(kit?.id ?? ""),
    logoUrl: asset
      ? `/api/modules/${BRAND_MODULE}/data/kits/${encodeURIComponent(kit.id)}/assets/${encodeURIComponent(asset.file)}?v=${kit.updatedAt ?? ""}`
      : null,
    logoRatio: asset?.width && asset?.height ? asset.width / asset.height : null,
    position: isPosition(watermark.anchor) ? watermark.anchor : "bottom-right",
    size: percent(watermark.size, 14),
    opacity: percent(watermark.opacity, 85),
    margin: percent(watermark.margin, 3.5, 1),
  };
}

export default function WatermarkUI({
  fileInfo,
  onComplete,
}: WatermarkUIProps) {
  // Enregistrer les traductions du module
  useModuleTranslations("watermark", moduleTranslations);
  const { t } = useTranslation();
  const { data: session } = useSession();
  const isAdmin = (session?.user as { role?: string | null } | undefined)?.role === "admin";

  const [source, setSource] = useState<Source>("text");
  const [text, setText] = useState("© ShareX Manager");
  const [position, setPosition] = useState<string>("bottom-right");
  const [opacity, setOpacity] = useState(70);
  const [fontSize, setFontSize] = useState(24);
  const [color, setColor] = useState("#ffffff");
  const [padding, setPadding] = useState(20);
  const [showColorPicker, setShowColorPicker] = useState(false);

  // ─── Image de marque ────────────────────────────────────────────
  // `null` : pas encore su. Sans module `brand-kit` actif, la source est masquée.
  const [brandAvailable, setBrandAvailable] = useState<boolean | null>(null);
  const [kits, setKits] = useState<KitOption[]>([]);
  const [kitId, setKitId] = useState("");
  const [brand, setBrand] = useState<BrandWatermark | null>(null);
  const [brandLoading, setBrandLoading] = useState(false);
  const [brandError, setBrandError] = useState<string | null>(null);
  const [brandValues, setBrandValues] = useState<BrandValues>({
    position: "bottom-right",
    size: 14,
    opacity: 85,
    margin: 3.5,
  });
  const [savingDefaults, setSavingDefaults] = useState(false);
  /** Retouches enregistrées pour la marque des envois, appliquées une fois sa fiche lue. */
  const savedBrandRef = useRef<{ kitId: string; values: Partial<BrandValues> } | null>(null);

  // Réglages enregistrés du module (ceux des envois), puis les marques.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let saved: Record<string, unknown> = {};
      try {
        const response = await fetch(`/api/modules/${MODULE_NAME}/settings`);
        if (response.ok) saved = (await response.json())?.settings ?? {};
      } catch {
        // Sans réglages enregistrés, la fenêtre part des valeurs par défaut.
      }
      if (cancelled) return;
      if (typeof saved.text === "string" && saved.text.trim()) setText(saved.text);
      if (isPosition(saved.position)) setPosition(saved.position);
      if (typeof saved.opacity === "number") setOpacity(Math.round(saved.opacity * 100));
      if (typeof saved.fontSize === "number") setFontSize(saved.fontSize);
      if (typeof saved.color === "string" && /^#[0-9a-f]{6}$/i.test(saved.color)) setColor(saved.color);
      if (typeof saved.padding === "number") setPadding(saved.padding);
      const savedKitId = saved.source === "brand" && typeof saved.kitId === "string" ? saved.kitId : "";
      if (savedKitId) {
        const number = (value: unknown, factor: number) =>
          typeof value === "number" ? Math.round(value * factor * 10) / 10 : undefined;
        savedBrandRef.current = {
          kitId: savedKitId,
          values: {
            position: isPosition(saved.position) ? saved.position : undefined,
            size: number(saved.size, 100),
            opacity: number(saved.opacity, 100),
            margin: number(saved.margin, 100),
          },
        };
      }

      let list: KitOption[] | null = null;
      try {
        list = await callBrandKit<KitOption[]>("listKits");
      } catch {
        list = null;
      }
      if (cancelled) return;
      if (!Array.isArray(list)) {
        setBrandAvailable(false);
        return;
      }
      setBrandAvailable(true);
      setKits(list.map(({ id, name, isDefault }) => ({ id, name, isDefault })));
      const preferred =
        list.find((kit) => kit.id === savedKitId) ?? list.find((kit) => kit.isDefault) ?? list[0];
      if (preferred) setKitId(preferred.id);
      if (savedKitId && list.some((kit) => kit.id === savedKitId)) setSource("brand");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Fiche de la marque choisie : logo et réglages du filigrane.
  useEffect(() => {
    if (!kitId) {
      setBrand(null);
      return;
    }
    let cancelled = false;
    setBrandLoading(true);
    setBrandError(null);
    callBrandKit<{ kit: unknown }>("getKit", kitId)
      .then((data) => {
        if (cancelled) return;
        const next = readBrandWatermark(data?.kit);
        setBrand(next);
        const saved = savedBrandRef.current;
        const overrides = saved && saved.kitId === kitId ? saved.values : {};
        savedBrandRef.current = null;
        setBrandValues({
          position: overrides.position ?? next.position,
          size: overrides.size ?? next.size,
          opacity: overrides.opacity ?? next.opacity,
          margin: overrides.margin ?? next.margin,
        });
      })
      .catch((error) => {
        if (cancelled) return;
        setBrand(null);
        setBrandError(error instanceof Error ? error.message : t("modules.watermark.brand.load_error"));
      })
      .finally(() => {
        if (!cancelled) setBrandLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // t est stable et géré par la bibliothèque de traduction
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kitId]);

  const updateBrand = (change: Partial<BrandValues>) => setBrandValues((current) => ({ ...current, ...change }));

  // Positions disponibles pour le filigrane
  const positions = POSITION_VALUES.map((value) => ({
    value,
    label: t(`modules.watermark.positions.${value.replace("-", "_")}`),
  }));

  // L'aperçu montre l'image entière et met le texte à son échelle : les
  // tailles valent pour une image de 1 000 px de large, comme côté serveur.
  const previewRef = useRef<HTMLDivElement>(null);
  const [previewWidth, setPreviewWidth] = useState(0);
  const [imageRatio, setImageRatio] = useState<number | null>(null);
  const [loadedLogoRatio, setLoadedLogoRatio] = useState<number | null>(null);
  useEffect(() => {
    const node = previewRef.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setPreviewWidth(entry.contentRect.width));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const previewScale = previewWidth / 1000;

  const brandMode = source === "brand" && brandAvailable === true;
  const canApply = brandMode ? Boolean(brand?.logoUrl) && !brandLoading : text.trim().length > 0;

  // Appliquer le filigrane
  const handleApply = () => {
    if (brandMode) {
      if (!brand?.logoUrl) return;
      onComplete({
        source: "brand",
        kitId: brand.kitId,
        position: brandValues.position,
        size: brandValues.size / 100,
        opacity: brandValues.opacity / 100,
        margin: brandValues.margin / 100,
      });
      return;
    }
    // La source est toujours précisée : les réglages enregistrés du module
    // complètent ceux de la fenêtre, et pourraient désigner une marque.
    onComplete({
      source: "text",
      text,
      position,
      opacity: opacity / 100, // Convertir en valeur entre 0 et 1
      fontSize,
      color,
      padding,
    });
  };

  /**
   * Enregistre les réglages de la fenêtre pour le traitement à l'envoi. En
   * mode marque, une valeur égale à celle de la marque est enregistrée vide :
   * elle suivra la marque si on la modifie ensuite.
   */
  const handleSaveDefaults = async () => {
    const settings = brandMode
      ? brand && {
          source: "brand",
          kitId: brand.kitId,
          position: brandValues.position === brand.position ? null : brandValues.position,
          size: brandValues.size === brand.size ? null : brandValues.size / 100,
          opacity: brandValues.opacity === brand.opacity ? null : brandValues.opacity / 100,
          margin: brandValues.margin === brand.margin ? null : brandValues.margin / 100,
        }
      : { source: "text", text, position, opacity: opacity / 100, fontSize, color, padding };
    if (!settings) return;
    setSavingDefaults(true);
    try {
      const response = await fetch(`/api/modules/${MODULE_NAME}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error ?? `HTTP ${response.status}`);
      }
      toast.success(t("modules.watermark.defaults.saved"));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? `${t("modules.watermark.defaults.error")} (${error.message})`
          : t("modules.watermark.defaults.error")
      );
    } finally {
      setSavingDefaults(false);
    }
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

  /**
   * Place du logo dans l'aperçu, calculée comme côté serveur : largeur et
   * marge relatives au petit côté, logo toujours dans l'image.
   */
  const logoBox = (() => {
    if (!brandMode || !brand?.logoUrl || !previewWidth || !imageRatio) return null;
    const ratio = loadedLogoRatio ?? brand.logoRatio ?? 1;
    const width = previewWidth;
    const height = previewWidth / imageRatio;
    const shortSide = Math.min(width, height);
    const margin = Math.min((brandValues.margin / 100) * shortSide, width / 4, height / 4);
    const logoWidth = Math.max(
      1,
      Math.min((brandValues.size / 100) * shortSide, width - 2 * margin, (height - 2 * margin) * ratio)
    );
    const logoHeight = logoWidth / ratio;
    const [vertical, horizontal] = brandValues.position.split("-");
    return {
      width: logoWidth,
      left: horizontal === "left" ? margin : horizontal === "right" ? width - margin - logoWidth : (width - logoWidth) / 2,
      top: vertical === "top" ? margin : vertical === "bottom" ? height - margin - logoHeight : (height - logoHeight) / 2,
    };
  })();

  const positionSelect = (id: string, value: string, onChange: (value: string) => void) => (
    <div className="space-y-2">
      <Label htmlFor={id}>{t("modules.watermark.position")}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id}>
          <SelectValue placeholder={t("modules.watermark.choose_position")} />
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
  );

  const slider = (
    label: string,
    value: number,
    display: string,
    range: { min: number; max: number; step: number },
    onChange: (value: number) => void
  ) => (
    <div className="space-y-2">
      <div className="flex justify-between">
        <Label>{label}</Label>
        <span className="text-sm text-muted-foreground">{display}</span>
      </div>
      <Slider
        value={[value]}
        min={range.min}
        max={range.max}
        step={range.step}
        onValueChange={(values) => onChange(values[0])}
      />
    </div>
  );

  const formatPercent = (value: number) => `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })} %`;

  return (
    <div className="space-y-6">
      {brandAvailable && (
        <Tabs value={source} onValueChange={(value) => setSource(value as Source)}>
          <TabsList className="grid grid-cols-2" aria-label={t("modules.watermark.source.label")}>
            <TabsTrigger value="text">{t("modules.watermark.source.text")}</TabsTrigger>
            <TabsTrigger value="brand">{t("modules.watermark.source.brand")}</TabsTrigger>
          </TabsList>
        </Tabs>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {brandMode ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="watermark-kit">{t("modules.watermark.brand.kit")}</Label>
              {kits.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("modules.watermark.brand.no_kits")}</p>
              ) : (
                <Select value={kitId} onValueChange={setKitId}>
                  <SelectTrigger id="watermark-kit">
                    <SelectValue placeholder={t("modules.watermark.brand.choose_kit")} />
                  </SelectTrigger>
                  <SelectContent>
                    {kits.map((kit) => (
                      <SelectItem key={kit.id} value={kit.id}>
                        {kit.isDefault ? t("modules.watermark.brand.default_kit", { name: kit.name }) : kit.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {brandLoading && (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {t("modules.watermark.brand.loading")}
                </p>
              )}
              {brandError && <p className="text-sm text-destructive">{brandError}</p>}
              {brand && !brand.logoUrl && !brandLoading && (
                <p className="text-sm text-destructive">{t("modules.watermark.brand.no_logo")}</p>
              )}
            </div>

            {positionSelect("watermark-brand-position", brandValues.position, (value) =>
              updateBrand({ position: value as Position })
            )}
            {slider(
              t("modules.watermark.brand.size"),
              brandValues.size,
              formatPercent(brandValues.size),
              { min: 2, max: 80, step: 1 },
              (value) => updateBrand({ size: value })
            )}
            {slider(
              t("modules.watermark.opacity"),
              brandValues.opacity,
              formatPercent(brandValues.opacity),
              { min: 5, max: 100, step: 1 },
              (value) => updateBrand({ opacity: value })
            )}
            {slider(
              t("modules.watermark.brand.margin"),
              brandValues.margin,
              formatPercent(brandValues.margin),
              { min: 0, max: 25, step: 0.5 },
              (value) => updateBrand({ margin: value })
            )}

            {brand && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-muted-foreground"
                onClick={() =>
                  setBrandValues({
                    position: brand.position,
                    size: brand.size,
                    opacity: brand.opacity,
                    margin: brand.margin,
                  })
                }
              >
                {t("modules.watermark.brand.reset")}
              </Button>
            )}
          </div>
        ) : (
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

            {positionSelect("watermark-position", position, setPosition)}

            {slider(t("modules.watermark.opacity"), opacity, formatPercent(opacity), { min: 10, max: 100, step: 1 }, setOpacity)}
            {slider(t("modules.watermark.font_size"), fontSize, String(fontSize), { min: 8, max: 160, step: 1 }, setFontSize)}
            {slider(t("modules.watermark.padding"), padding, String(padding), { min: 0, max: 100, step: 1 }, setPadding)}

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
        )}

        <div className="space-y-4">
          <Card className="p-4">
            <h3 className="text-sm font-medium mb-2">
              {t("modules.watermark.preview")}
            </h3>
            <div ref={previewRef} className="relative overflow-hidden rounded-md bg-muted">
              {/* L'image entière, à ses proportions : un aperçu rogné mentait sur la place du texte. */}
              <img
                src={fileInfo.url}
                alt={t("modules.watermark.preview")}
                className="block h-auto w-full"
                onLoad={(event) => {
                  const { naturalWidth, naturalHeight } = event.currentTarget;
                  if (naturalWidth && naturalHeight) setImageRatio(naturalWidth / naturalHeight);
                }}
              />
              {brandMode ? (
                brand?.logoUrl && logoBox && (
                  <img
                    src={brand.logoUrl}
                    alt=""
                    className="pointer-events-none absolute h-auto max-w-none"
                    style={{
                      left: `${logoBox.left}px`,
                      top: `${logoBox.top}px`,
                      width: `${logoBox.width}px`,
                      opacity: brandValues.opacity / 100,
                    }}
                    onLoad={(event) => {
                      const { naturalWidth, naturalHeight } = event.currentTarget;
                      if (naturalWidth && naturalHeight) setLoadedLogoRatio(naturalWidth / naturalHeight);
                    }}
                  />
                )
              ) : (
                <div
                  className="absolute"
                  style={{
                    top: getPreviewPosition(position).top,
                    left: getPreviewPosition(position).left,
                    transform: getPreviewPosition(position).transform,
                    padding: `${padding * previewScale}px`,
                    opacity: opacity / 100,
                  }}
                >
                  <div
                    style={{
                      color: color,
                      fontSize: `${Math.max(4, fontSize * previewScale)}px`,
                      fontWeight: "bold",
                      fontFamily: "'DejaVu Sans', Arial, Helvetica, sans-serif",
                      whiteSpace: "nowrap",
                      textShadow: "1px 1px 2px rgba(0,0,0,0.45)",
                    }}
                  >
                    {text}
                  </div>
                </div>
              )}
            </div>
          </Card>

          {brandMode ? (
            <p className="text-sm text-muted-foreground">{t("modules.watermark.brand.hint")}</p>
          ) : (
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
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {isAdmin && (
          <Button
            variant="outline"
            onClick={handleSaveDefaults}
            disabled={savingDefaults || !canApply}
            title={t("modules.watermark.defaults.hint")}
          >
            {savingDefaults && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("modules.watermark.defaults.save")}
          </Button>
        )}
        <Button onClick={handleApply} disabled={!canApply}>
          {t("modules.watermark.apply")}
        </Button>
      </div>
    </div>
  );
}
