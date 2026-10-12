"use client";

import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { PositionPicker } from "@/components/ui/position-picker";
import { Switch } from "@/components/ui/switch";
import { watermarkAsset } from "../../lib/theme";
import { KIT_LIMITS, kitAssetUrl, type BrandKit, type BrandWatermark, type WatermarkAnchor } from "../../lib/types";
import { AssetChooser } from "../asset-chooser";
import { CountedInput, Field, FieldGroup, SectionHeading, SteppedSliderField, formatPercent, formatSeconds } from "../fields";
import type { SectionProps } from "./types";

/** Rapport d'un short : le filigrane se place sur le cadre où il sera le plus vu. */
const SHORT_RATIO = 9 / 16;

/** Le filigrane dessiné à son coin, à sa taille, sa marge et son opacité, comme Clip Studio le pose. */
function WatermarkOverlay({ kit, mark }: { kit: BrandKit; mark: BrandWatermark }) {
  const asset = kit.assets.find((entry) => entry.id === mark.assetId);
  const background = kit.assets.find((entry) => entry.kind === "background");
  if (!asset) return null;
  // Taille et marge sont relatives au petit côté : la largeur d'un cadre 9:16.
  const [vertical, horizontal] = mark.anchor.split("-") as ["top" | "bottom", "left" | "right"];
  return (
    <div className="absolute inset-0" style={{ backgroundColor: kit.palette.background }}>
      {background && (
        // eslint-disable-next-line @next/next/no-img-element -- fond de la marque, servi par le module
        <img src={kitAssetUrl(kit.id, background.file)} alt="" className="absolute inset-0 h-full w-full object-cover opacity-60" />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element -- image du filigrane, servie par le module */}
      <img
        src={kitAssetUrl(kit.id, asset.file)}
        alt=""
        className="absolute h-auto object-contain transition-all duration-150"
        style={{
          width: `${mark.size * 100}%`,
          opacity: mark.opacity,
          [horizontal]: `${mark.margin * 100}%`,
          [vertical]: `${mark.margin * SHORT_RATIO * 100}%`,
        }}
      />
    </div>
  );
}

export function VideoSection({ kit, update }: SectionProps) {
  const logos = kit.assets.filter((asset) => asset.kind === "logo" || asset.kind === "logo-mark");
  const poses = kit.assets.filter((asset) => asset.kind === "mascot-pose");
  const mark = kit.watermark;
  const setMark = (patch: Partial<BrandWatermark>) => update((draft) => (draft.watermark ? { ...draft, watermark: { ...draft.watermark, ...patch } } : draft));

  const enableMark = (on: boolean) =>
    update((draft) => {
      if (!on) return { ...draft, watermark: undefined };
      const asset = watermarkAsset(draft) ?? logos[0];
      return asset ? { ...draft, watermark: { assetId: asset.id, anchor: "bottom-right", size: 0.14, opacity: 0.85, margin: 0.035, startSeconds: 0 } } : draft;
    });

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading title="Vidéo" text="Ce que la marque ajoute à chaque clip de Clip Studio : un filigrane et un carton de fin." />

      <FieldGroup title="Filigrane">
        <label className="flex items-center gap-2.5 text-sm">
          <Switch checked={Boolean(mark)} onCheckedChange={enableMark} disabled={!mark && logos.length === 0} />
          Poser un logo sur les vidéos
        </label>
        {!mark && logos.length === 0 && <p className="text-xs text-muted-foreground">Ajoutez d’abord un logo dans la section « Logos ».</p>}
        {mark && (
          <div className="flex flex-wrap items-start gap-5">
            <div className="grid w-36 shrink-0 gap-1.5">
              <span className="text-xs font-medium">Coin</span>
              <PositionPicker
                label="Coin du filigrane"
                positions="corners"
                ratio={SHORT_RATIO}
                value={mark.anchor}
                onValueChange={(anchor: WatermarkAnchor) => setMark({ anchor })}
                showMarker={false}
              >
                <WatermarkOverlay kit={kit} mark={mark} />
              </PositionPicker>
              <span className="text-[11px] text-muted-foreground">Cliquez le coin voulu, sur un short.</span>
            </div>
            <div className="grid min-w-52 flex-1 gap-4">
              <AssetChooser
                kit={kit}
                assets={logos}
                value={mark.assetId}
                label="Image du filigrane"
                emptyText="Ajoutez un logo dans la section « Logos »."
                onChange={(assetId) => assetId && setMark({ assetId })}
              />
              <SteppedSliderField label="Taille" value={mark.size} min={0.04} max={0.4} step={0.01} stops={[0.04, 0.2, 0.4]} format={formatPercent} onChange={(size) => setMark({ size })} />
              <SteppedSliderField label="Opacité" value={mark.opacity} min={0.1} max={1} step={0.05} stops={[0.1, 0.5, 1]} format={formatPercent} onChange={(opacity) => setMark({ opacity })} />
              <SteppedSliderField label="Marge au bord" value={mark.margin} min={0} max={0.15} step={0.005} stops={[0, 0.05, 0.1, 0.15]} format={formatPercent} onChange={(margin) => setMark({ margin })} />
              <Field label="Apparition" htmlFor="kit-mark-start" hint="Depuis le début de la vidéo ; le filigrane s’efface au carton de fin.">
                <InputGroup className="w-32">
                  <InputGroupInput
                    id="kit-mark-start"
                    type="number"
                    min={0}
                    max={600}
                    step={0.5}
                    value={mark.startSeconds}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      if (Number.isFinite(value)) setMark({ startSeconds: Math.min(600, Math.max(0, value)) });
                    }}
                  />
                  <InputGroupAddon align="inline-end">s</InputGroupAddon>
                </InputGroup>
              </Field>
            </div>
          </div>
        )}
      </FieldGroup>

      <FieldGroup title="Carton de fin" text="L’aperçu des formats le joue à sa durée réelle.">
        <label className="flex items-center gap-2.5 text-sm">
          <Switch checked={kit.endCard.enabled} onCheckedChange={(enabled) => update((draft) => ({ ...draft, endCard: { ...draft.endCard, enabled } }))} />
          Ajouter un carton de fin aux vidéos
        </label>
        {kit.endCard.enabled && (
          <div className="grid gap-4 @md/form:grid-cols-2">
            <SteppedSliderField
              label="Durée"
              value={kit.endCard.seconds}
              min={1.5}
              max={8}
              step={0.5}
              stops={[1.5, 3, 5, 8]}
              format={formatSeconds}
              onChange={(seconds) => update((draft) => ({ ...draft, endCard: { ...draft.endCard, seconds } }))}
            />
            <Field label="Appel à l’action" htmlFor="kit-end-cta">
              <CountedInput
                id="kit-end-cta"
                value={kit.endCard.callToAction ?? ""}
                maxLength={KIT_LIMITS.callToAction}
                placeholder="Abonne-toi"
                onChange={(event) => update((draft) => ({ ...draft, endCard: { ...draft.endCard, callToAction: event.target.value } }))}
              />
            </Field>
            <div className="@md/form:col-span-2">
              <AssetChooser
                kit={kit}
                assets={poses}
                value={kit.endCard.poseAssetId}
                label="Pose de la mascotte"
                noneLabel="Le logo seul"
                emptyText="Ajoutez des poses dans la section « Mascotte »."
                onChange={(poseAssetId) => update((draft) => ({ ...draft, endCard: { ...draft.endCard, poseAssetId } }))}
              />
            </div>
          </div>
        )}
      </FieldGroup>
    </div>
  );
}
