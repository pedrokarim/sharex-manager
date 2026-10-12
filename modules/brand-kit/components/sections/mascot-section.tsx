"use client";

import { KIT_LIMITS, type BrandKit, type BrandMascot } from "../../lib/types";
import { AssetGallery } from "../asset-gallery";
import { CountedInput, CountedTextarea, Field, FieldGroup, SectionHeading } from "../fields";
import type { FileSectionProps } from "./types";

const EMPTY_MASCOT: BrandMascot = { identityPrompt: "", sheetAssetIds: [], poseAssetIds: [] };

export function MascotSection(props: FileSectionProps) {
  const { kit, update } = props;
  const mascot = kit.mascot ?? EMPTY_MASCOT;
  const setMascot = (patch: Partial<BrandMascot>) => update((draft: BrandKit) => ({ ...draft, mascot: { ...(draft.mascot ?? EMPTY_MASCOT), ...patch } }));

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading title="Mascotte" text="Son identité et sa feuille de modèle sont jointes à chaque image qui la met en scène." />
      <FieldGroup>
        <Field label="Nom" htmlFor="kit-mascot-name">
          <CountedInput id="kit-mascot-name" value={mascot.name ?? ""} maxLength={KIT_LIMITS.name} placeholder="Facultatif" onChange={(event) => setMascot({ name: event.target.value })} />
        </Field>
        <Field label="Identité" htmlFor="kit-mascot-identity" hint="Description fixe du personnage : silhouette, coiffure, tenue, couleurs, signes distinctifs.">
          <CountedTextarea
            id="kit-mascot-identity"
            value={mascot.identityPrompt}
            maxLength={KIT_LIMITS.identityPrompt}
            rows={5}
            placeholder="Jeune femme aux cheveux courts roses, sweat bleu oversize, baskets blanches à semelle épaisse…"
            onChange={(event) => setMascot({ identityPrompt: event.target.value })}
          />
        </Field>
      </FieldGroup>
      <FieldGroup title="Feuilles de modèle" text="Le personnage de face, de profil et de dos : la référence de toutes ses images. Survolez une feuille pour la voir en grand.">
        <AssetGallery {...props} kinds={["mascot-sheet"]} addKind="mascot-sheet" emptyText="Aucune feuille de modèle." pickerTitle="Feuille de modèle" />
      </FieldGroup>
      <FieldGroup title="Poses" text="Poses détourées, pour le carton de fin et les vidéos. Clic droit pour choisir celle du carton de fin.">
        <AssetGallery {...props} kinds={["mascot-pose"]} addKind="mascot-pose" roles={["end-pose"]} emptyText="Aucune pose." pickerTitle="Pose de la mascotte" />
      </FieldGroup>
    </div>
  );
}
