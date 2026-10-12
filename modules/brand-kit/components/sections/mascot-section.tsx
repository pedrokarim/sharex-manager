"use client";

import { useMemo } from "react";
import { Ban, Eye, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { FORMATS, buildFormat } from "../../lib/formats";
import { formatPoseSetting, mascotPoses, openingPose, proposedFormatPose } from "../../lib/mascot";
import { KIT_LIMITS, type BrandKit, type BrandMascot, type BrandMascotPresence, type FormatId, type MascotFormatId } from "../../lib/types";
import { AssetChooser } from "../asset-chooser";
import { AssetGallery } from "../asset-gallery";
import { CountedInput, CountedTextarea, Field, FieldGroup, SectionHeading } from "../fields";
import { FormatCanvas } from "../format-preview";
import type { FileSectionProps } from "./types";

const EMPTY_MASCOT: BrandMascot = { identityPrompt: "", sheetAssetIds: [], poseAssetIds: [] };
const NO_PRESENCE: BrandMascotPresence = { opening: false, reactions: false };

/** Formats où la mascotte peut paraître, dans l'ordre de l'aperçu ; le carton de fin a sa propre pose. */
const POSED_FORMATS: { id: MascotFormatId | "endcard"; format: FormatId; label: string }[] = [
  { id: "banner", format: "banner", label: "Bannière YouTube" },
  { id: "avatar", format: "avatar", label: "Avatar" },
  { id: "x-header", format: "x-header", label: "En-tête X" },
  { id: "endcard", format: "endcard-vertical", label: "Carton de fin (vidéos comprises)" },
  { id: "short-cover", format: "short-cover", label: "Couverture de short" },
];

interface MascotSectionProps extends FileSectionProps {
  fontsVersion: number;
  fontsReady: boolean;
  /** Montre un format dans le grand aperçu. */
  onShowFormat: (id: FormatId) => void;
}

export function MascotSection(props: MascotSectionProps) {
  const { kit, update, fontsVersion, fontsReady, onShowFormat } = props;
  const mascot = kit.mascot ?? EMPTY_MASCOT;
  const presence = mascot.presence ?? NO_PRESENCE;
  const poses = mascotPoses(kit);
  const setMascot = (patch: Partial<BrandMascot>) => update((draft: BrandKit) => ({ ...draft, mascot: { ...(draft.mascot ?? EMPTY_MASCOT), ...patch } }));
  const setPresence = (patch: Partial<BrandMascotPresence>) =>
    update((draft: BrandKit) => {
      const current = draft.mascot ?? EMPTY_MASCOT;
      return { ...draft, mascot: { ...current, presence: { ...(current.presence ?? NO_PRESENCE), ...patch } } };
    });
  const setFormatPose = (id: MascotFormatId, value: string | null | undefined) =>
    update((draft: BrandKit) => {
      const current = draft.mascot ?? EMPTY_MASCOT;
      const formatPoses = { ...current.formatPoses };
      if (value === undefined) delete formatPoses[id];
      else formatPoses[id] = value;
      return { ...draft, mascot: { ...current, formatPoses } };
    });

  // Une vignette par format, au rendu exact de l'aperçu.
  const thumbnails = useMemo(() => new Map(POSED_FORMATS.map((entry) => [entry.id, buildFormat(kit, entry.format)])), [kit]);
  const opening = openingPose(kit);

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
      <FieldGroup title="Poses" text="Poses détourées, sur fond transparent : les formats et les vidéos les mettent en scène. Leur note dit à quoi elles servent.">
        <AssetGallery {...props} kinds={["mascot-pose"]} addKind="mascot-pose" roles={["end-pose"]} emptyText="Aucune pose." pickerTitle="Pose de la mascotte" />
      </FieldGroup>

      <FieldGroup
        title="Pose par format"
        text="La pose mise en scène dans chaque format. Sans choix, une pose est proposée d’après sa note et sa forme ; le filigrane n’en a jamais. Cliquez une vignette pour voir le format en grand."
      >
        {poses.length === 0 ? (
          <p className="text-xs text-muted-foreground">Ajoutez des poses ci-dessus : sans pose, les formats montrent le logo seul.</p>
        ) : (
          <ul className="grid gap-3">
            {POSED_FORMATS.map((entry) => {
              const built = thumbnails.get(entry.id)!;
              const spec = FORMATS.find((format) => format.id === entry.format)!;
              const isEndCard = entry.id === "endcard";
              const setting = isEndCard ? undefined : formatPoseSetting(kit, entry.id as MascotFormatId);
              const proposed = isEndCard ? undefined : proposedFormatPose(kit, entry.id as MascotFormatId);
              const value = isEndCard ? kit.endCard.poseAssetId : setting === null ? undefined : (setting ?? proposed?.id);
              const hint = built.supplied
                ? "Une image finie remplace ce format : la pose ne s’y voit pas."
                : !isEndCard && setting === undefined
                  ? proposed
                    ? "Proposée d’après les poses"
                    : "Aucune pose proposée"
                  : undefined;
              return (
                <li key={entry.id} className="grid grid-cols-[minmax(0,6.5rem)_minmax(0,1fr)] items-center gap-3">
                  <button
                    type="button"
                    onClick={() => onShowFormat(entry.format)}
                    aria-label={`Voir ${spec.label} en grand`}
                    title={`Voir ${spec.label} en grand`}
                    className="group/thumb relative flex h-16 min-w-0 items-center justify-center rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  >
                    <FormatCanvas
                      built={built}
                      fontsVersion={fontsVersion}
                      ready={fontsReady}
                      round={entry.format === "avatar"}
                      className="shadow-sm"
                      style={spec.width / spec.height >= 1.4 ? { width: "100%" } : { height: "100%" }}
                    />
                    <span className="absolute inset-0 flex items-center justify-center rounded-md bg-background/0 text-foreground opacity-0 transition group-hover/thumb:bg-background/50 group-hover/thumb:opacity-100">
                      <Eye aria-hidden className="size-4" />
                    </span>
                  </button>
                  <div className="flex min-w-0 items-center gap-1.5">
                    <AssetChooser
                      kit={kit}
                      assets={poses}
                      value={value}
                      label={entry.label}
                      noneLabel="Sans mascotte"
                      noneIcon={<Ban aria-hidden className="size-5 text-muted-foreground" />}
                      hint={hint}
                      emptyText="Ajoutez des poses ci-dessus."
                      className="min-w-0 flex-1"
                      onChange={(assetId) => {
                        onShowFormat(entry.format);
                        if (isEndCard) update((draft) => ({ ...draft, endCard: { ...draft.endCard, poseAssetId: assetId } }));
                        else setFormatPose(entry.id as MascotFormatId, assetId ?? null);
                      }}
                    />
                    {!isEndCard && setting !== undefined && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="shrink-0"
                        aria-label={`${entry.label} : revenir à la pose proposée`}
                        title="Revenir à la pose proposée"
                        onClick={() => setFormatPose(entry.id as MascotFormatId, undefined)}
                      >
                        <RotateCcw />
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </FieldGroup>

      <FieldGroup
        title="Dans les vidéos"
        text="La mascotte dans les clips de Clip Studio, ajoutée et retirée avec la marque. Elle ne se pose jamais sur un texte ni sous l’interface d’un short : quand rien ne tient, elle laisse le segment tel quel."
      >
        <div className="grid gap-4">
          <div className="grid gap-2">
            <label className="flex items-start gap-2.5 text-sm">
              <Switch className="mt-0.5" checked={presence.opening} onCheckedChange={(on) => setPresence({ opening: on })} disabled={poses.length === 0} />
              <span className="min-w-0">
                Ouverture
                <span className="block text-xs text-muted-foreground">Une pose accompagne l’accroche du début.</span>
              </span>
            </label>
            {presence.opening && poses.length > 0 && (
              <AssetChooser
                kit={kit}
                assets={poses}
                value={opening?.id}
                label="Pose de l’ouverture"
                emptyText="Ajoutez des poses ci-dessus."
                hint={mascot.presence?.openingPoseId ? undefined : "Celle de l’en-tête X, faute de choix"}
                onChange={(assetId) => setPresence({ openingPoseId: assetId })}
              />
            )}
          </div>
          <label className="flex items-start gap-2.5 text-sm">
            <Switch className="mt-0.5" checked={presence.reactions} onCheckedChange={(on) => setPresence({ reactions: on })} disabled={poses.length === 0} />
            <span className="min-w-0">
              Réactions
              <span className="block text-xs text-muted-foreground">
                Une petite pose dans un coin pendant chaque segment, une autre à chaque fois. L’assistant de Clip Studio ne génère alors plus d’illustration de la mascotte.
              </span>
            </span>
          </label>
          <p className="text-xs text-muted-foreground">
            Carton de fin : sa pose se choisit dans « Pose par format » ; le carton s’active dans la section « Vidéo ».
          </p>
          {poses.length === 0 && <p className="text-xs text-muted-foreground">Ajoutez d’abord des poses.</p>}
        </div>
      </FieldGroup>
    </div>
  );
}
