/**
 * Ce que le module sait dire de l'origine d'une image. Types et libellés
 * partagés entre le serveur, qui lit les fichiers, et l'interface.
 */

/** Les trois états affichés, plus celui d'un format qu'on ne sait pas lire. */
export type ProvenanceStatus = "signed" | "metadata" | "none" | "unsupported";

export type CarrierKind = "c2pa" | "xmp" | "exif" | "text" | "iptc" | "comment" | "other";

/** Un chunk ou un segment qui porte des métadonnées, avec son poids. */
export interface ProvenanceCarrier {
  kind: CarrierKind;
  /** Nom dans le conteneur : `caBX`, `APP11`, `tEXt parameters`… */
  label: string;
  bytes: number;
}

export interface ManifestAction {
  /** `c2pa.created`, `c2pa.converted`… */
  action: string;
  when?: string;
  /** Logiciel déclaré pour cette action. */
  agent?: string;
  /** Code court du vocabulaire IPTC, sans son préfixe d'URL. */
  digitalSourceType?: string;
}

/**
 * État de la signature d'un manifeste.
 * - `consistent` : la signature correspond au certificat embarqué. La chaîne
 *   de confiance de ce certificat n'est **pas** contrôlée.
 * - `invalid` : la signature ne correspond pas à ce qu'elle prétend signer.
 * - `unverified` : pas de contrôle possible (algorithme inconnu, pièce absente).
 */
export type SignatureValidity = "consistent" | "invalid" | "unverified";

export interface ManifestSignature {
  validity: SignatureValidity;
  /** Raison lisible quand la signature n'a pas pu être contrôlée ou échoue. */
  detail?: string;
  /** « PS256 (RSA-PSS, SHA-256) ». */
  algorithm?: string;
  /** Sujet du certificat de signature. */
  signer?: string;
  /** Autorité qui a émis ce certificat. */
  issuer?: string;
  validFrom?: string;
  validTo?: string;
  /** Un jeton d'horodatage tiers accompagne la signature. */
  timestamped: boolean;
  /**
   * L'empreinte déclarée couvre-t-elle bien ce fichier ? `mismatch` signifie
   * que le fichier a changé depuis la signature.
   */
  contentHash: "match" | "mismatch" | "unchecked";
  /** Les assertions sont-elles celles que la déclaration a signées ? */
  assertionHashes: "match" | "mismatch" | "unchecked";
}

export interface ProvenanceManifest {
  /** Nombre de manifestes dans le fichier ; le dernier est celui qui fait foi. */
  manifestCount: number;
  generator?: { name: string; version?: string };
  title?: string;
  instanceId?: string;
  /** Nature de l'image d'après la déclaration, code court IPTC. */
  digitalSourceType?: string;
  /**
   * Le manifeste déclare lui-même qu'un filigrane a été inscrit dans l'image
   * (action `c2pa.watermarked`). Ce filigrane vit dans les pixels : il n'est
   * ni lisible ni retirable depuis le fichier.
   */
  declaresWatermark?: boolean;
  /** Date de la déclaration : la plus récente des actions. */
  claimedAt?: string;
  actions: ManifestAction[];
  /** Étiquettes des assertions présentes, avec leur poids. */
  assertions: { label: string; bytes: number }[];
  signature?: ManifestSignature;
  /** Le manifeste est là, mais il n'a pas pu être décodé entièrement. */
  partial?: string;
}

/** Texte libre d'un PNG (`tEXt`, `zTXt`, `iTXt`), tel qu'il est écrit. */
export interface ProvenanceText {
  keyword: string;
  /** Tronqué au-delà de `TEXT_PREVIEW_LIMIT` caractères. */
  text: string;
  truncated: boolean;
  /** Champs reconnus d'un bloc `parameters` de Stable Diffusion. */
  parameters?: { prompt?: string; negativePrompt?: string; settings: Record<string, string> };
}

export const TEXT_PREVIEW_LIMIT = 4000;

export interface ProvenanceReport {
  format: "png" | "jpeg" | "webp" | null;
  status: ProvenanceStatus;
  bytes: number;
  width?: number;
  height?: number;
  carriers: ProvenanceCarrier[];
  manifest?: ProvenanceManifest;
  /** Champs EXIF utiles, tels qu'ils sont écrits. */
  exif?: Record<string, string>;
  /** Champs XMP utiles, tels qu'ils sont écrits. */
  xmp?: Record<string, string>;
  texts?: ProvenanceText[];
  /** Le retrait sans recompression est-il géré pour ce format ? */
  removable: boolean;
  removableReason?: string;
}

/** Version courte d'un rapport, pour une vignette de la grille. */
export interface ProvenanceSummary {
  status: ProvenanceStatus;
  /** Nom du générateur quand l'image est signée. */
  generator?: string;
  digitalSourceType?: string;
  /** Ce que le fichier déclare de sa nature : généré, capture, ou rien de net. */
  declared?: ProvenanceVerdict["kind"];
}

/** Ce que donne le retrait des métadonnées, sans le fichier lui-même. */
export interface CleanResult {
  bytes: number;
  savedBytes: number;
  /** Chunks ou segments retirés. */
  removed: string[];
  /** Hachage des pixels bruts identique avant et après. */
  pixelsIdentical: boolean;
}

// ─── Libellés ────────────────────────────────────────────────────

/** Traduction en une ligne des codes IPTC `digitalSourceType`. */
export const DIGITAL_SOURCE_TYPES: Record<string, string> = {
  trainedAlgorithmicMedia: "Produite par un modèle entraîné : une image de génération.",
  compositeWithTrainedAlgorithmicMedia: "Montage mêlant du généré et du réel.",
  algorithmicMedia: "Produite par un algorithme non entraîné (rendu 3D, procédural).",
  digitalCapture: "Vraie capture : appareil photo ou capture d'écran.",
  digitalArt: "Œuvre numérique faite à la main.",
  minorHumanEdits: "Capture retouchée à la marge.",
  compositeCapture: "Montage de plusieurs captures.",
  compositeSynthetic: "Montage comprenant des éléments synthétiques.",
  virtualRecording: "Enregistrement d'une scène virtuelle.",
  dataDrivenMedia: "Produite à partir de données (graphique, visualisation).",
  negativeFilm: "Numérisation d'un négatif.",
  positiveFilm: "Numérisation d'un positif.",
  print: "Numérisation d'un tirage.",
  softwareImage: "Image créée par un logiciel.",
};

export function describeSourceType(code?: string): string | undefined {
  if (!code) return undefined;
  return DIGITAL_SOURCE_TYPES[code] ?? "Code inconnu du vocabulaire IPTC.";
}

/** Libellé de l'indicateur d'origine. Jamais « image propre ». */
export function provenanceLabel(summary: ProvenanceSummary): string {
  switch (summary.status) {
    case "signed":
      return summary.generator ?? "Manifeste C2PA";
    case "metadata":
      return "Métadonnées présentes";
    case "unsupported":
      return "Format non analysé";
    default:
      return "Aucune signature trouvée";
  }
}

// ─── Verdict ─────────────────────────────────────────────────────

/**
 * Ce que le fichier **déclare** de lui-même. Ce n'est pas une détection : une
 * image dont on a retiré les marques, ou qui n'en a jamais porté, reste
 * « indéterminée », qu'elle sorte d'un modèle ou d'un appareil photo.
 */
export interface ProvenanceVerdict {
  kind: "generated" | "capture" | "undetermined";
  title: string;
  /** D'où vient la conclusion, en une phrase. */
  reason: string;
}

const GENERATED_TYPES = new Set(["trainedAlgorithmicMedia", "compositeWithTrainedAlgorithmicMedia"]);
/** Mots-clés des textes PNG que seuls les générateurs écrivent. */
const GENERATOR_KEYWORDS = new Set(["parameters", "prompt", "workflow", "invokeai_metadata", "sd-metadata", "Dream"]);

export function provenanceVerdict(report: ProvenanceReport): ProvenanceVerdict {
  const fromXmp = report.xmp?.["Iptc4xmpExt:DigitalSourceType"];
  const declared = report.manifest?.digitalSourceType ?? (fromXmp ? fromXmp.slice(fromXmp.lastIndexOf("/") + 1) : undefined);
  const carrier = report.manifest?.digitalSourceType ? "Le manifeste C2PA indique" : "Les métadonnées XMP indiquent";

  if (declared && GENERATED_TYPES.has(declared)) {
    const generator = report.manifest?.generator?.name;
    return {
      kind: "generated",
      title: "Déclarée comme image générée par IA",
      reason: `${carrier} « ${declared} »${generator ? `, écrit par ${generator}` : ""}.`,
    };
  }
  const generatorText = report.texts?.find((entry) => GENERATOR_KEYWORDS.has(entry.keyword));
  if (generatorText) {
    return {
      kind: "generated",
      title: "Porte des paramètres de génération",
      reason: `Le fichier contient un bloc « ${generatorText.keyword} », tel qu'en écrivent Stable Diffusion, ComfyUI et leurs dérivés.`,
    };
  }
  if (declared === "digitalCapture" || declared === "minorHumanEdits") {
    return {
      kind: "capture",
      title: "Déclarée comme capture réelle",
      reason: `${carrier} « ${declared} ».`,
    };
  }
  if (report.status === "unsupported") {
    return { kind: "undetermined", title: "Format non analysé", reason: "Seuls les PNG, JPEG et WebP sont lus." };
  }
  if (report.status === "none") {
    return {
      kind: "undetermined",
      title: "Aucune signature trouvée dans le fichier",
      reason: "Cela ne prouve rien : les marques d'origine se retirent, et beaucoup d'outils n'en écrivent pas.",
    };
  }
  return {
    kind: "undetermined",
    title: report.status === "signed" ? "Signée, sans indication sur sa nature" : "Métadonnées présentes, sans indication de génération",
    reason: "Rien de ce qui a été lu ne dit si l'image sort d'un modèle ou d'un appareil.",
  };
}

/** Nom proposé pour la version sans métadonnées : `gen-…-0-clean.png`. */
export function cleanFileName(file: string): string {
  const dot = file.lastIndexOf(".");
  return dot > 0 ? `${file.slice(0, dot)}-clean${file.slice(dot)}` : `${file}-clean`;
}
