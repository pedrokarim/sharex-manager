/**
 * Adaptateurs vers les API de génération d'images.
 *
 * Chaque provider expose la même signature et renvoie toujours du base64 :
 * les URL temporaires d'OpenAI expirent en une heure, alors que le module
 * archive les images sur disque. Recevoir directement les octets évite un
 * aller-retour de téléchargement et une fenêtre pendant laquelle l'archivage
 * peut échouer.
 */

import { MODELS, getModelSpec, type ProviderId } from "./models";

export { MODELS, getModelSpec };
export type { ProviderId, ModelSpec } from "./models";

export interface GeneratedImage {
  b64: string;
  /** Prompt réécrit par le modèle, quand il en renvoie un (gpt-image-1, DALL-E 3). */
  revisedPrompt?: string;
}

export interface GenerateImageResult {
  images: GeneratedImage[];
}

export interface GenerateImageOptions {
  prompt: string;
  model?: string;
  size?: string;
  quality?: string;
  n?: number;
  apiKey: string;
  /** Image de départ en base64, sans le préfixe `data:`. Déclenche le mode édition. */
  referenceImageB64?: string;
  referenceMimeType?: string;
}

/**
 * Les API renvoient leurs erreurs sous des formes différentes, et le message
 * utile est souvent enfoui. On le remonte tel quel : « Erreur 400 » n'aide
 * personne, « billing hard limit reached » se corrige tout de suite.
 */
async function readApiError(response: Response, fallback: string): Promise<string> {
  let payload: any = null;
  try {
    payload = await response.json();
  } catch {
    return `${fallback} (HTTP ${response.status})`;
  }
  const message =
    payload?.error?.message ??
    payload?.message ??
    (Array.isArray(payload?.errors) ? payload.errors.join(", ") : null);
  return message ? String(message) : `${fallback} (HTTP ${response.status})`;
}

// ─── OpenAI ──────────────────────────────────────────────────────

async function openAIGenerate(
  options: GenerateImageOptions
): Promise<GenerateImageResult> {
  const { prompt, model = "gpt-image-1", size, quality, n = 1, apiKey } = options;

  const body: Record<string, unknown> = { model, prompt, n, size };

  if (quality) {
    body.quality = quality;
  }

  // gpt-image-1 renvoie toujours du base64 et rejette `response_format`.
  // DALL-E 3 renvoie une URL par défaut : il faut le lui demander.
  if (model !== "gpt-image-1") {
    body.response_format = "b64_json";
  }

  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Erreur OpenAI"));
  }

  const data = await response.json();
  return {
    images: (data.data ?? [])
      .filter((item: any) => item?.b64_json)
      .map((item: any) => ({
        b64: item.b64_json,
        revisedPrompt: item.revised_prompt,
      })),
  };
}

/**
 * Retouche à partir d'une image existante. C'est un endpoint distinct, en
 * multipart : l'image ne peut pas être passée en JSON.
 */
async function openAIEdit(
  options: GenerateImageOptions
): Promise<GenerateImageResult> {
  const {
    prompt,
    model = "gpt-image-1",
    size,
    quality,
    n = 1,
    apiKey,
    referenceImageB64,
    referenceMimeType = "image/png",
  } = options;

  if (!referenceImageB64) {
    throw new Error("Image de référence manquante");
  }

  const bytes = Buffer.from(referenceImageB64, "base64");
  const extension = referenceMimeType.split("/")[1]?.split("+")[0] || "png";

  const form = new FormData();
  form.append("model", model);
  form.append("prompt", prompt);
  form.append("n", String(n));
  if (size) form.append("size", size);
  if (quality) form.append("quality", quality);
  form.append(
    "image",
    new Blob([new Uint8Array(bytes)], { type: referenceMimeType }),
    `reference.${extension}`
  );

  const response = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Erreur OpenAI"));
  }

  const data = await response.json();
  return {
    images: (data.data ?? [])
      .filter((item: any) => item?.b64_json)
      .map((item: any) => ({ b64: item.b64_json })),
  };
}

export async function generateWithOpenAI(
  options: GenerateImageOptions
): Promise<GenerateImageResult> {
  const spec = getModelSpec(options.model || "gpt-image-1");
  const wantsReference = Boolean(options.referenceImageB64);

  if (wantsReference && spec?.supportsReference) {
    return openAIEdit(options);
  }

  const requested = options.n ?? 1;
  const maxBatch = spec?.maxBatch ?? 1;

  // DALL-E 3 refuse n > 1. Pour honorer un lot on parallélise les appels,
  // sinon l'interface proposerait un choix que l'API rejetterait.
  if (requested > maxBatch) {
    const batches: Promise<GenerateImageResult>[] = [];
    let remaining = requested;
    while (remaining > 0) {
      const take = Math.min(remaining, maxBatch);
      batches.push(openAIGenerate({ ...options, n: take }));
      remaining -= take;
    }
    const results = await Promise.all(batches);
    return { images: results.flatMap((r) => r.images) };
  }

  return openAIGenerate(options);
}

// ─── Stability AI ────────────────────────────────────────────────

export async function generateWithStability(
  options: GenerateImageOptions
): Promise<GenerateImageResult> {
  const { prompt, size = "1024x1024", n = 1, apiKey } = options;
  const [width, height] = size.split("x").map(Number);

  const response = await fetch(
    "https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      body: JSON.stringify({
        text_prompts: [{ text: prompt, weight: 1 }],
        cfg_scale: 7,
        width: Math.min(width || 1024, 1024),
        height: Math.min(height || 1024, 1024),
        steps: 30,
        samples: Math.min(n, 4),
      }),
    }
  );

  if (!response.ok) {
    throw new Error(await readApiError(response, "Erreur Stability"));
  }

  const data = await response.json();
  return {
    images: (data.artifacts ?? [])
      .filter((a: any) => a?.base64)
      .map((a: any) => ({ b64: a.base64 })),
  };
}
