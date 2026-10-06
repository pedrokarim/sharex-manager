/**
 * Ce que Scan Studio attend de la palette d'IA de l'application (§ 7.4 du
 * dossier), et les deux adaptateurs HTTP qui parlent aux modèles de langage.
 *
 * `AiPalette` est la seule porte vers un fournisseur : le garde-fou
 * (`guard.ts`) ne connaît qu'elle, et les tests lui en donnent une fausse. La
 * vraie est assemblée dans `palette.ts`, à partir des clés et des moteurs
 * d'AI Image Gen.
 *
 * Ce fichier n'importe rien d'un autre module : il se teste seul, avec un faux
 * `fetch`. Aucun appel n'est retenté ici, ni ailleurs.
 */

import type { AiAction } from "../../types";

export interface AiImage {
  b64: string;
  mimeType: string;
}

export interface AiModelRef {
  provider: string;
  model: string;
}

export interface AiPaletteModel extends AiModelRef {
  providerLabel: string;
  label: string;
  available: boolean;
  /** Pourquoi le modèle ne peut pas être appelé. */
  reason?: string;
}

export interface AiPalette {
  /** Modèles proposés pour chaque action, avec leur disponibilité. N'appelle aucun fournisseur. */
  models(): Promise<Record<AiAction, AiPaletteModel[]>>;
  /** Montre une image à un modèle et rend ce qu'il répond, en texte. */
  readImage(ref: AiModelRef, prompt: string, image: AiImage, signal: AbortSignal): Promise<string>;
  /** Envoie un texte à un modèle de langage et rend sa réponse. */
  completeText(ref: AiModelRef, prompt: string, signal: AbortSignal): Promise<string>;
  /** Donne une image à retoucher à un moteur d'image et rend l'image obtenue. */
  editImage(ref: AiModelRef, prompt: string, image: AiImage, size: { width: number; height: number }, signal: AbortSignal): Promise<AiImage>;
}

export type AiFailureKind =
  /** Clé refusée par le fournisseur. */
  | "unauthorized"
  /** Le fournisseur demande d'attendre, ou le quota est épuisé. */
  | "rate-limited"
  /** Le fournisseur ne répond pas, ou répond de travers. */
  | "unavailable"
  /** Le modèle a refusé la demande, ou n'a rien rendu d'exploitable. */
  | "refused"
  /** La demande est mal formée : la renvoyer telle quelle ne changerait rien. */
  | "invalid-request";

/** Échec d'un appel, avec un message déjà lisible par la personne qui a cliqué. */
export class AiCallError extends Error {
  constructor(
    readonly kind: AiFailureKind,
    message: string,
  ) {
    super(message);
    this.name = "AiCallError";
  }
}

export function toAiError(error: unknown): AiCallError {
  if (error instanceof AiCallError) return error;
  if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
    return new AiCallError("unavailable", "Le fournisseur n’a pas répondu à temps.");
  }
  const message = error instanceof Error && error.message ? error.message : "Erreur inconnue.";
  return new AiCallError("unavailable", message);
}

type Fetch = typeof fetch;

/** Message utile d'une réponse en erreur : celui du fournisseur s'il en donne un, sinon le code. */
async function failureOf(response: Response, label: string): Promise<AiCallError> {
  let detail = "";
  try {
    const payload = (await response.json()) as { error?: { message?: unknown }; message?: unknown } | null;
    const message = payload?.error?.message ?? payload?.message;
    if (typeof message === "string") detail = message.replace(/\s+/g, " ").trim().slice(0, 300);
  } catch {
    // Corps illisible : le code suffit.
  }
  const suffix = detail ? ` : ${detail}` : "";
  if (response.status === 401 || response.status === 403) {
    return new AiCallError("unauthorized", `Clé refusée par ${label} (HTTP ${response.status})${suffix}`);
  }
  if (response.status === 429) return new AiCallError("rate-limited", `${label} demande d’attendre, ou le quota est épuisé${suffix}`);
  if (response.status >= 500) return new AiCallError("unavailable", `${label} ne répond pas correctement (HTTP ${response.status})${suffix}`);
  return new AiCallError("invalid-request", `${label} a refusé la demande (HTTP ${response.status})${suffix}`);
}

// ─── OpenAI ──────────────────────────────────────────────────────

const OPENAI_CHAT = "https://api.openai.com/v1/chat/completions";

/** Une question à un modèle d'OpenAI, avec ou sans image. Une requête, jamais retentée. */
export async function askOpenAi(
  request: { apiKey: string; model: string; prompt: string; image?: AiImage; signal: AbortSignal },
  fetchImpl: Fetch = fetch,
): Promise<string> {
  const content: unknown[] = [{ type: "text", text: request.prompt }];
  if (request.image) {
    content.push({ type: "image_url", image_url: { url: `data:${request.image.mimeType};base64,${request.image.b64}` } });
  }
  const response = await fetchImpl(OPENAI_CHAT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${request.apiKey}` },
    body: JSON.stringify({ model: request.model, messages: [{ role: "user", content }] }),
    signal: request.signal,
  });
  if (!response.ok) throw await failureOf(response, "OpenAI");

  const payload = (await response.json()) as { choices?: { message?: { content?: unknown; refusal?: unknown } }[] } | null;
  const message = payload?.choices?.[0]?.message;
  if (typeof message?.refusal === "string" && message.refusal) {
    throw new AiCallError("refused", `Le modèle a refusé : ${message.refusal.slice(0, 200)}`);
  }
  if (typeof message?.content !== "string") throw new AiCallError("unavailable", "Réponse inattendue d’OpenAI.");
  return message.content;
}

// ─── Google ──────────────────────────────────────────────────────

const GOOGLE_MODELS = "https://generativelanguage.googleapis.com/v1beta/models";

/** Une question à un modèle Gemini, avec ou sans image. Une requête, jamais retentée. */
export async function askGoogle(
  request: { apiKey: string; model: string; prompt: string; image?: AiImage; signal: AbortSignal },
  fetchImpl: Fetch = fetch,
): Promise<string> {
  const parts: unknown[] = [{ text: request.prompt }];
  if (request.image) parts.push({ inline_data: { mime_type: request.image.mimeType, data: request.image.b64 } });

  const response = await fetchImpl(`${GOOGLE_MODELS}/${encodeURIComponent(request.model)}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": request.apiKey },
    body: JSON.stringify({ contents: [{ role: "user", parts }] }),
    signal: request.signal,
  });
  if (!response.ok) throw await failureOf(response, "Google");

  const payload = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: unknown }[] }; finishReason?: unknown }[];
    promptFeedback?: { blockReason?: unknown };
  } | null;
  const candidate = payload?.candidates?.[0];
  const text = (candidate?.content?.parts ?? [])
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .join("");
  if (!text) {
    // Un refus arrive avec un HTTP 200 et aucun texte : le motif est ailleurs dans la réponse.
    const reason = payload?.promptFeedback?.blockReason ?? candidate?.finishReason;
    throw new AiCallError("refused", typeof reason === "string" ? `Google n’a rien rendu (${reason}).` : "Google n’a rien rendu.");
  }
  return text;
}
