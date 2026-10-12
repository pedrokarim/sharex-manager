/**
 * Appels à l'API Instagram dans sa voie « Instagram API with Instagram
 * Login » (dossier 07b) : hôte `graph.instagram.com`, jeton Instagram User en
 * `Authorization: Bearer`, corps en formulaire. Les réponses sont lues sans
 * perte sur les identifiants de 17 chiffres. Les jetons ne sont jamais
 * journalisés ni recopiés dans un message d'erreur.
 */

import type { ConnectorContext } from "../../types";
import { QuotaExceededError, ReconnectRequiredError, ServiceError } from "../../errors";
import { readJsonKeepingIds } from "../../json";

export const INSTAGRAM_GRAPH = "https://graph.instagram.com";
/** Version citée par la documentation vérifiée le 12/10/2026 (dossier 07b). */
export const GRAPH_VERSION = "v25.0";
/** Attente avant de relire l'usage chez Instagram quand il annonce la limite atteinte. */
export const LIMIT_RECHECK_MS = 60 * 60 * 1000;

/** Erreur d'appel à l'API Graph : code et sous-code d'Instagram, passagère ou non. */
export class InstagramApiError extends ServiceError {
  readonly code?: number;
  readonly subcode?: number;
  /** Une nouvelle tentative peut réussir (limite d'appels, panne du service). */
  readonly transient: boolean;
  constructor(status: number, message: string, code?: number, subcode?: number, transient = false) {
    super(status, message, code !== undefined ? `${code}${subcode ? `/${subcode}` : ""}` : undefined);
    this.name = "InstagramApiError";
    this.code = code;
    this.subcode = subcode;
    this.transient = transient;
  }
}

/** Messages des sous-codes d'Instagram (référence « Error Codes », dossier 07b § 5.5). */
export const SUBCODE_MESSAGES: Record<number, string> = {
  2207001: "Erreur du serveur d’Instagram.",
  2207003: "Instagram a mis trop de temps à télécharger le fichier.",
  2207004: "L’image dépasse 8 Mio.",
  2207005: "Format d’image refusé par Instagram.",
  2207006: "Publication introuvable chez Instagram (droits ou jeton).",
  2207008: "Le conteneur de publication n’existe plus ou a expiré.",
  2207009: "Rapport largeur sur hauteur refusé : de 4:5 à 1,91:1 pour une image.",
  2207010: "Légende trop longue : 2 200 caractères au plus.",
  2207020: "Le fichier envoyé a expiré chez Instagram.",
  2207026: "Format vidéo refusé : MP4 ou MOV, H.264 ou HEVC, son AAC.",
  2207027: "Le média n’est pas encore prêt à publier.",
  2207028: "Un carrousel compte de 2 à 10 éléments.",
  2207032: "Instagram n’a pas pu créer la publication.",
  2207040: "Trop de mentions (@) : 20 au plus.",
  2207042: "Limite de publications atteinte pour ce compte sur 24 heures.",
  2207050: "Le compte Instagram est restreint : ouvrez l’application Instagram et suivez ses consignes.",
  2207051: "Instagram a bloqué la publication comme suspecte de spam : rien n’est retenté automatiquement.",
  2207052: "Instagram n’a pas pu télécharger le fichier à l’adresse publique de l’instance (proxy, pare-feu, défi anti-robot ?).",
  2207053: "Erreur inconnue pendant l’envoi chez Instagram.",
  2207057: "Image de couverture choisie hors de la durée de la vidéo.",
};

/** Sous-codes d'une erreur passagère : un nouveau conteneur peut réussir. */
export const REBUILD_SUBCODES = new Set([2207001, 2207003, 2207020, 2207032, 2207052, 2207053]);

/** Codes Graph d'une limite d'appels, passagère. */
const THROTTLE_CODES = new Set([4, 17, 32, 613]);

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

/** Message lisible d'un service : sans caractère de contrôle ni rien qui ressemble à un jeton, borné. */
function clean(message: unknown): string {
  return String(message ?? "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/[A-Za-z0-9_\-.|]{32,}/g, "…")
    .trim()
    .slice(0, 200);
}

/** Erreur Graph lue dans un corps de réponse : `{ error: { message, code, error_subcode, error_user_msg } }`. */
export function readGraphError(body: unknown): { code?: number; subcode?: number; message: string } | null {
  if (!isRecord(body) || !isRecord(body.error)) return null;
  const error = body.error;
  const code = Number(error.code);
  const subcode = Number(error.error_subcode);
  return {
    code: Number.isFinite(code) ? code : undefined,
    subcode: Number.isFinite(subcode) && subcode > 0 ? subcode : undefined,
    message: clean(error.error_user_msg || error.message),
  };
}

/**
 * Convertit une réponse en erreur affichable :
 * - jeton refusé (code 190, HTTP 401) : compte « à reconnecter » ;
 * - limite de publication (sous-code 2207042) : attente du seul compte ;
 * - limite d'appels (codes 4, 17, 32, 613) : passagère.
 */
export function instagramError(status: number, body: unknown): Error {
  const graph = readGraphError(body);
  if (graph?.code === 190 || status === 401) {
    return new ReconnectRequiredError("Instagram a refusé le jeton d’accès (code 190) : reconnectez le compte.");
  }
  if (graph?.subcode === 2207042) {
    return new QuotaExceededError(
      "Instagram annonce la limite de publications atteinte pour ce compte : la publication reprendra d’elle-même.",
      Date.now() + LIMIT_RECHECK_MS,
      "posts",
      "account"
    );
  }
  const known = graph?.subcode ? SUBCODE_MESSAGES[graph.subcode] : undefined;
  if (graph?.code === 10 || graph?.code === 200) {
    return new InstagramApiError(status, "Droits insuffisants : reconnectez le compte avec le jeu de portées « Publier ».", graph.code, graph.subcode);
  }
  const transient = (graph?.code !== undefined && THROTTLE_CODES.has(graph.code)) || status >= 500 || (graph?.subcode !== undefined && REBUILD_SUBCODES.has(graph.subcode));
  const detail = known ?? (graph?.message ? graph.message : `HTTP ${status}`);
  return new InstagramApiError(status, `Instagram a refusé la demande : ${detail}`, graph?.code, graph?.subcode, transient);
}

export interface GraphRequestOptions {
  method?: "GET" | "POST";
  query?: Record<string, string | number | boolean | undefined>;
  form?: Record<string, string | number | boolean | undefined>;
  /**
   * Méthode comptée dans les quotas avant l'appel : « media » (conteneur),
   * « media_publish » (publication) ; une lecture n'est pas comptée.
   */
  quotaMethod?: string;
}

/** Adresse d'un chemin de l'API, version comprise. */
export function graphUrl(path: string, query: GraphRequestOptions["query"] = {}): string {
  const url = new URL(`${INSTAGRAM_GRAPH}/${GRAPH_VERSION}/${path.replace(/^\/+/, "")}`);
  for (const [key, value] of Object.entries(query)) if (value !== undefined) url.searchParams.set(key, String(value));
  return url.toString();
}

/** Appel authentifié à l'API Graph d'Instagram ; rend le corps lu, identifiants gardés en chaînes. */
export async function graphRequest<T = Record<string, unknown>>(context: Pick<ConnectorContext, "getAccessToken" | "chargeQuota">, path: string, options: GraphRequestOptions = {}): Promise<T> {
  if (options.quotaMethod) context.chargeQuota(options.quotaMethod);
  const token = await context.getAccessToken();
  const headers: Record<string, string> = { Authorization: `Bearer ${token.value}`, Accept: "application/json" };
  let body: string | undefined;
  if (options.form) {
    const form = new URLSearchParams();
    for (const [key, value] of Object.entries(options.form)) if (value !== undefined) form.set(key, String(value));
    body = form.toString();
    headers["Content-Type"] = "application/x-www-form-urlencoded";
  }
  const response = await fetch(graphUrl(path, options.query), { method: options.method ?? (body ? "POST" : "GET"), headers, body });
  const parsed = await readJsonKeepingIds(response);
  if (!response.ok || readGraphError(parsed)) throw instagramError(response.status, parsed);
  return (parsed ?? {}) as T;
}

/** Identifiant rendu par l'API : toujours une chaîne. */
export function idOf(value: unknown): string | undefined {
  if (typeof value === "string" && value) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}
