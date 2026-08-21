/**
 * Vocabulaire commun aux deux familles de moteurs.
 *
 * Le module sait produire une image de deux façons : en appelant une API
 * facturée à la clé, ou en pilotant un agent en ligne de commande déjà
 * authentifié sur le serveur (Codex, Gemini CLI…), qui consomme l'abonnement
 * du compte connecté. Les deux chemins n'ont presque rien en commun côté
 * transport, mais l'interface ne doit voir qu'une chose : un modèle qui
 * accepte un prompt et rend des images.
 */

export type EngineKind = "api" | "cli";

/** D'où vient la facture : une clé prépayée, ou l'abonnement d'un compte. */
export type BillingMode = "api-key" | "subscription";

export interface QualityOption {
  value: string;
  label: string;
}

export interface EngineModelSpec {
  /** Identifiant stable, stocké tel quel dans l'historique. */
  id: string;
  label: string;
  /** Moteur qui sait exécuter ce modèle. */
  engineId: string;
  kind: EngineKind;
  billing: BillingMode;
  description: string;
  sizes: string[];
  qualities?: QualityOption[];
  /** Nombre d'images qu'une seule exécution peut rendre. */
  maxBatch: number;
  /** Le modèle sait-il partir d'une ou plusieurs images existantes ? */
  supportsReference: boolean;
  tags: string[];
}

export interface GeneratedImage {
  b64: string;
  mimeType?: string;
  /** Prompt réécrit par le modèle, quand il en renvoie un. */
  revisedPrompt?: string;
}

export interface GenerateResult {
  images: GeneratedImage[];
  /** Trace d'exécution, utile pour les moteurs CLI dont le déroulé est long. */
  log?: LogLine[];
}

export interface LogLine {
  ts: number;
  level: "info" | "warn" | "error";
  text: string;
}

export interface ReferenceImage {
  b64: string;
  mimeType: string;
  /** Rôle annoncé au modèle : simple inspiration ou image à retoucher. */
  role?: "reference" | "edit-target";
}

export interface GenerateRequest {
  prompt: string;
  /** Consignes négatives, quand le moteur sait les distinguer du prompt. */
  negativePrompt?: string;
  model: string;
  size: string;
  quality?: string;
  n: number;
  references?: ReferenceImage[];
  /** Graine, pour les moteurs qui savent la respecter. */
  seed?: number;
}

/** Ce que le moteur reçoit en plus de la demande elle-même. */
export interface EngineContext {
  /** Clé API du moteur, vide pour un moteur CLI. */
  apiKey?: string;
  /** Chemin absolu de l'exécutable, résolu par la détection. */
  binaryPath?: string;
  /** Réglages propres au moteur (timeout, arguments additionnels…). */
  options?: Record<string, unknown>;
  /** Remonte l'avancement pendant une exécution longue. */
  onProgress?: (line: LogLine) => void;
  /** Interrompt l'exécution quand l'utilisateur annule le travail. */
  signal?: AbortSignal;
}

export interface Engine {
  id: string;
  label: string;
  kind: EngineKind;
  billing: BillingMode;
  /** Ce que l'interface affiche pour expliquer d'où vient l'accès. */
  accessHint: string;
  models: EngineModelSpec[];
  generate(request: GenerateRequest, ctx: EngineContext): Promise<GenerateResult>;
}

/** Erreur porteuse d'un message déjà lisible par l'utilisateur final. */
export class EngineError extends Error {
  constructor(
    message: string,
    readonly detail?: string
  ) {
    super(message);
    this.name = "EngineError";
  }
}
