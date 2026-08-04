/**
 * Catalogue des modèles — données pures, sans dépendance serveur.
 *
 * Il est importé aussi bien par les adaptateurs API que par les pages du
 * module : les contrôles de l'interface se construisent à partir d'ici, ce qui
 * évite de proposer une taille ou un lot qu'un modèle refusera ensuite.
 */

export type ProviderId = "openai" | "stability";

export interface ModelSpec {
  id: string;
  label: string;
  provider: ProviderId;
  description: string;
  sizes: string[];
  qualities?: { value: string; label: string }[];
  /** Nombre maximum d'images qu'un seul appel API accepte. */
  maxBatch: number;
  /** Le modèle sait-il partir d'une image existante (endpoint /images/edits) ? */
  supportsReference: boolean;
  tags: string[];
}

export const MODELS: ModelSpec[] = [
  {
    id: "gpt-image-1",
    label: "GPT Image 1",
    provider: "openai",
    description:
      "Le modèle image courant d'OpenAI. Suit les consignes de près et sait retravailler une image existante.",
    sizes: ["1024x1024", "1536x1024", "1024x1536"],
    qualities: [
      { value: "low", label: "Basse" },
      { value: "medium", label: "Moyenne" },
      { value: "high", label: "Haute" },
    ],
    maxBatch: 10,
    supportsReference: true,
    tags: ["Recommandé", "Image de référence"],
  },
  {
    id: "dall-e-3",
    label: "DALL-E 3",
    provider: "openai",
    description:
      "Rendu très graphique. Réécrit systématiquement le prompt et ne produit qu'une image par appel.",
    sizes: ["1024x1024", "1024x1792", "1792x1024"],
    qualities: [
      { value: "standard", label: "Standard" },
      { value: "hd", label: "HD" },
    ],
    maxBatch: 1,
    supportsReference: false,
    tags: ["Portrait / paysage"],
  },
  {
    id: "stable-diffusion-xl",
    label: "Stable Diffusion XL",
    provider: "stability",
    description:
      "Modèle ouvert hébergé par Stability AI. Demande une clé Stability distincte.",
    sizes: ["1024x1024", "768x1024", "1024x768"],
    maxBatch: 4,
    supportsReference: false,
    tags: ["Open source"],
  },
];

export function getModelSpec(id: string): ModelSpec | undefined {
  return MODELS.find((m) => m.id === id);
}

/** Ratio d'une taille « 1536x1024 », pour réserver la place du résultat avant qu'il arrive. */
export function aspectRatioOf(size: string): number {
  const [w, h] = size.split("x").map(Number);
  if (!w || !h) return 1;
  return w / h;
}
