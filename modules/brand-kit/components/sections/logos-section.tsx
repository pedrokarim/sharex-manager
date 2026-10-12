"use client";

import { AssetChooser } from "../asset-chooser";
import { AssetGallery } from "../asset-gallery";
import { FieldGroup, SectionHeading } from "../fields";
import type { FileSectionProps } from "./types";

export function LogosSection(props: FileSectionProps) {
  const { kit, update } = props;
  const logos = kit.assets.filter((asset) => asset.kind === "logo" || asset.kind === "logo-mark");

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading title="Logos" text="Le logo principal signe la bannière et le carton de fin ; la marque réduite sert à l’avatar et au filigrane." />
      <FieldGroup>
        <div className="grid gap-3 @md/form:grid-cols-2">
          <AssetChooser
            kit={kit}
            assets={logos}
            value={kit.logoAssetId}
            label="Logo principal"
            noneLabel="Le nom de la marque"
            emptyText="Ajoutez un logo ci-dessous : sans logo, le nom de la marque le remplace."
            onChange={(logoAssetId) => update((draft) => ({ ...draft, logoAssetId }))}
          />
          <AssetChooser
            kit={kit}
            assets={logos}
            value={kit.markAssetId}
            label="Marque réduite"
            noneLabel="Le logo principal"
            emptyText="Une initiale ou un tampon, lisible à 40 px."
            onChange={(markAssetId) => update((draft) => ({ ...draft, markAssetId }))}
          />
        </div>
      </FieldGroup>
      <FieldGroup title="Logos" text="Clic droit sur une image pour en faire le logo principal, la marque réduite ou le filigrane.">
        <AssetGallery
          {...props}
          kinds={["logo", "logo-mark"]}
          addKind="logo"
          roles={["logo", "mark", "watermark"]}
          emptyText="Aucun logo : le nom de la marque, écrit dans la police des titres, le remplace."
          pickerTitle="Logo de la marque"
        />
      </FieldGroup>
      <FieldGroup title="Fonds et textures" text="Le premier fond habille la bannière, l’en-tête X et la couverture de short, sous un voile.">
        <AssetGallery {...props} kinds={["background", "texture"]} addKind="background" emptyText="Aucun fond : les formats prennent la couleur de fond." pickerTitle="Fond de la marque" />
      </FieldGroup>
      <FieldGroup title="Références" text="Planches, captures, inspirations : gardées avec la marque.">
        <AssetGallery {...props} kinds={["reference"]} addKind="reference" emptyText="Aucune référence." pickerTitle="Image de référence" />
      </FieldGroup>
    </div>
  );
}
