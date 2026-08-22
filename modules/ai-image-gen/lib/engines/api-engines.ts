/**
 * Moteurs joignables par une clé API.
 *
 * Chaque adaptateur renvoie toujours du base64 : les URL temporaires d'OpenAI
 * expirent en une heure alors que le module archive les images sur disque.
 * Recevoir directement les octets évite un aller-retour de téléchargement et
 * une fenêtre pendant laquelle l'archivage peut échouer.
 */

import type {
  Engine,
  EngineContext,
  EngineModelSpec,
  GenerateRequest,
  GenerateResult,
} from "./types";
import { EngineError } from "./types";

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

function requireKey(ctx: EngineContext, label: string): string {
  if (!ctx.apiKey) {
    throw new EngineError(
      `Aucune clé ${label} enregistrée. Ouvrez la configuration du module pour en ajouter une.`
    );
  }
  return ctx.apiKey;
}

// ─── OpenAI ──────────────────────────────────────────────────────

const OPENAI_MODELS: EngineModelSpec[] = [
  {
    id: "gpt-image-1",
    label: "GPT Image 1",
    engineId: "openai",
    kind: "api",
    billing: "api-key",
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
    tags: ["Clé API", "Image de référence"],
  },
  {
    id: "dall-e-3",
    label: "DALL-E 3",
    engineId: "openai",
    kind: "api",
    billing: "api-key",
    description:
      "Rendu très graphique. Réécrit systématiquement le prompt et ne produit qu'une image par appel.",
    sizes: ["1024x1024", "1024x1792", "1792x1024"],
    qualities: [
      { value: "standard", label: "Standard" },
      { value: "hd", label: "HD" },
    ],
    maxBatch: 1,
    supportsReference: false,
    tags: ["Clé API", "Portrait / paysage"],
  },
];

async function openAIGenerate(
  request: GenerateRequest,
  apiKey: string
): Promise<GenerateResult> {
  const body: Record<string, unknown> = {
    model: request.model,
    prompt: request.prompt,
    n: request.n,
    size: request.size,
  };

  if (request.quality) body.quality = request.quality;

  // gpt-image-1 renvoie toujours du base64 et rejette `response_format`.
  // DALL-E 3 renvoie une URL par défaut : il faut le lui demander.
  if (request.model !== "gpt-image-1") {
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
    throw new EngineError(await readApiError(response, "Erreur OpenAI"));
  }

  const data = await response.json();
  return {
    images: (data.data ?? [])
      .filter((item: any) => item?.b64_json)
      .map((item: any) => ({
        b64: item.b64_json,
        mimeType: "image/png",
        revisedPrompt: item.revised_prompt,
      })),
  };
}

/**
 * Retouche à partir d'une image existante. C'est un endpoint distinct, en
 * multipart : l'image ne peut pas être passée en JSON.
 */
async function openAIEdit(
  request: GenerateRequest,
  apiKey: string
): Promise<GenerateResult> {
  const references = request.references ?? [];
  if (!references.length) {
    throw new EngineError("Image de référence manquante");
  }

  const form = new FormData();
  form.append("model", request.model);
  form.append("prompt", request.prompt);
  form.append("n", String(request.n));
  if (request.size) form.append("size", request.size);
  if (request.quality) form.append("quality", request.quality);

  references.forEach((reference, index) => {
    const bytes = Buffer.from(reference.b64, "base64");
    const extension = reference.mimeType.split("/")[1]?.split("+")[0] || "png";
    form.append(
      // L'endpoint accepte plusieurs images sous la forme `image[]`.
      references.length > 1 ? "image[]" : "image",
      new Blob([new Uint8Array(bytes)], { type: reference.mimeType }),
      `reference-${index + 1}.${extension}`
    );
  });

  const response = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!response.ok) {
    throw new EngineError(await readApiError(response, "Erreur OpenAI"));
  }

  const data = await response.json();
  return {
    images: (data.data ?? [])
      .filter((item: any) => item?.b64_json)
      .map((item: any) => ({ b64: item.b64_json, mimeType: "image/png" })),
  };
}

export const openAIEngine: Engine = {
  id: "openai",
  label: "OpenAI",
  kind: "api",
  billing: "api-key",
  accessHint: "Clé API OpenAI (facturée à l'image).",
  models: OPENAI_MODELS,

  async generate(request, ctx) {
    const apiKey = requireKey(ctx, "OpenAI");
    const spec = OPENAI_MODELS.find((model) => model.id === request.model);
    const references = request.references ?? [];

    if (references.length && spec?.supportsReference) {
      return openAIEdit(request, apiKey);
    }

    const maxBatch = spec?.maxBatch ?? 1;
    // DALL-E 3 refuse n > 1. Pour honorer un lot on parallélise les appels,
    // sinon l'interface proposerait un choix que l'API rejetterait.
    if (request.n > maxBatch) {
      const calls: Promise<GenerateResult>[] = [];
      let remaining = request.n;
      while (remaining > 0) {
        const take = Math.min(remaining, maxBatch);
        calls.push(openAIGenerate({ ...request, n: take }, apiKey));
        remaining -= take;
      }
      const results = await Promise.all(calls);
      return { images: results.flatMap((result) => result.images) };
    }

    return openAIGenerate(request, apiKey);
  },
};

// ─── Stability AI ────────────────────────────────────────────────

const STABILITY_MODELS: EngineModelSpec[] = [
  {
    id: "stable-diffusion-xl",
    label: "Stable Diffusion XL",
    engineId: "stability",
    kind: "api",
    billing: "api-key",
    description:
      "Modèle ouvert hébergé par Stability AI. Demande une clé Stability distincte.",
    sizes: ["1024x1024", "768x1024", "1024x768"],
    maxBatch: 4,
    supportsReference: false,
    tags: ["Clé API", "Open source"],
  },
];

export const stabilityEngine: Engine = {
  id: "stability",
  label: "Stability AI",
  kind: "api",
  billing: "api-key",
  accessHint: "Clé API Stability (crédits prépayés).",
  models: STABILITY_MODELS,

  async generate(request, ctx) {
    const apiKey = requireKey(ctx, "Stability");
    const [width, height] = request.size.split("x").map(Number);

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
          text_prompts: [
            { text: request.prompt, weight: 1 },
            ...(request.negativePrompt
              ? [{ text: request.negativePrompt, weight: -1 }]
              : []),
          ],
          cfg_scale: 7,
          width: Math.min(width || 1024, 1024),
          height: Math.min(height || 1024, 1024),
          steps: 30,
          samples: Math.min(request.n, 4),
          ...(request.seed !== undefined ? { seed: request.seed } : {}),
        }),
      }
    );

    if (!response.ok) {
      throw new EngineError(await readApiError(response, "Erreur Stability"));
    }

    const data = await response.json();
    return {
      images: (data.artifacts ?? [])
        .filter((artifact: any) => artifact?.base64)
        .map((artifact: any) => ({ b64: artifact.base64, mimeType: "image/png" })),
    };
  },
};

// ─── Google ──────────────────────────────────────────────────────

const GOOGLE_MODELS: EngineModelSpec[] = [
  {
    id: "gemini-2.5-flash-image",
    label: "Gemini 2.5 Flash Image",
    engineId: "google",
    kind: "api",
    billing: "api-key",
    description:
      "Le modèle image de Google, rapide et à l'aise avec les retouches guidées par plusieurs références.",
    sizes: ["1024x1024", "1536x1024", "1024x1536"],
    maxBatch: 1,
    supportsReference: true,
    tags: ["Clé API", "Image de référence"],
  },
  {
    id: "imagen-4.0-generate-001",
    label: "Imagen 4",
    engineId: "google",
    kind: "api",
    billing: "api-key",
    description:
      "Le modèle texte-vers-image de Google. Rend jusqu'à quatre variantes par appel, sans image de départ.",
    sizes: ["1024x1024", "1536x1024", "1024x1536"],
    maxBatch: 4,
    supportsReference: false,
    tags: ["Clé API", "Lot de variantes"],
  },
];

/** Google raisonne en proportions, pas en pixels. */
function aspectRatioLabel(size: string): string {
  const [width, height] = size.split("x").map(Number);
  if (!width || !height) return "1:1";
  const ratio = width / height;
  const candidates: [string, number][] = [
    ["1:1", 1],
    ["3:4", 3 / 4],
    ["4:3", 4 / 3],
    ["9:16", 9 / 16],
    ["16:9", 16 / 9],
  ];
  return candidates.reduce((best, entry) =>
    Math.abs(entry[1] - ratio) < Math.abs(best[1] - ratio) ? entry : best
  )[0];
}

const GOOGLE_API = "https://generativelanguage.googleapis.com/v1beta/models";

async function googleGeminiImage(
  request: GenerateRequest,
  apiKey: string
): Promise<GenerateResult> {
  const parts: any[] = [{ text: request.prompt }];
  if (request.negativePrompt?.trim()) {
    parts.push({ text: `À éviter absolument : ${request.negativePrompt.trim()}` });
  }
  for (const reference of request.references ?? []) {
    parts.push({
      inline_data: { mime_type: reference.mimeType, data: reference.b64 },
    });
  }

  const response = await fetch(
    `${GOOGLE_API}/${encodeURIComponent(request.model)}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: {
          responseModalities: ["IMAGE"],
          imageConfig: { aspectRatio: aspectRatioLabel(request.size) },
        },
      }),
    }
  );

  if (!response.ok) {
    throw new EngineError(await readApiError(response, "Erreur Google"));
  }

  const data = await response.json();
  const images = (data.candidates ?? [])
    .flatMap((candidate: any) => candidate?.content?.parts ?? [])
    .map((part: any) => part.inlineData ?? part.inline_data)
    .filter((inline: any) => inline?.data)
    .map((inline: any) => ({
      b64: inline.data,
      mimeType: inline.mimeType ?? inline.mime_type ?? "image/png",
    }));

  if (!images.length) {
    // Un refus du modèle arrive avec un HTTP 200 et aucune image : le motif se
    // trouve dans promptFeedback, sinon l'utilisateur reste sans explication.
    const reason =
      data.promptFeedback?.blockReason ??
      data.candidates?.[0]?.finishReason ??
      null;
    throw new EngineError(
      reason
        ? `Google n'a rendu aucune image (${reason}).`
        : "Google n'a rendu aucune image."
    );
  }

  return { images };
}

async function googleImagen(
  request: GenerateRequest,
  apiKey: string
): Promise<GenerateResult> {
  const response = await fetch(
    `${GOOGLE_API}/${encodeURIComponent(request.model)}:predict`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        instances: [
          {
            prompt: request.prompt,
            ...(request.negativePrompt
              ? { negativePrompt: request.negativePrompt }
              : {}),
          },
        ],
        parameters: {
          sampleCount: Math.min(request.n, 4),
          aspectRatio: aspectRatioLabel(request.size),
        },
      }),
    }
  );

  if (!response.ok) {
    throw new EngineError(await readApiError(response, "Erreur Google"));
  }

  const data = await response.json();
  return {
    images: (data.predictions ?? [])
      .filter((prediction: any) => prediction?.bytesBase64Encoded)
      .map((prediction: any) => ({
        b64: prediction.bytesBase64Encoded,
        mimeType: prediction.mimeType ?? "image/png",
      })),
  };
}

export const googleEngine: Engine = {
  id: "google",
  label: "Google AI",
  kind: "api",
  billing: "api-key",
  accessHint: "Clé API Google AI Studio.",
  models: GOOGLE_MODELS,

  async generate(request, ctx) {
    const apiKey = requireKey(ctx, "Google");

    if (request.model.startsWith("imagen")) {
      return googleImagen(request, apiKey);
    }

    // Gemini ne rend qu'une image par appel : le lot se fait côté client.
    const calls = Array.from({ length: request.n }, () =>
      googleGeminiImage({ ...request, n: 1 }, apiKey)
    );
    const results = await Promise.all(calls);
    return { images: results.flatMap((result) => result.images) };
  },
};

export const API_ENGINES: Engine[] = [openAIEngine, stabilityEngine, googleEngine];

/** Point de vérification d'une clé, sans consommer de génération. */
export const API_HEALTHCHECKS: Record<
  string,
  { url: string; headers: (key: string) => Record<string, string> }
> = {
  openai: {
    url: "https://api.openai.com/v1/models",
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
  },
  stability: {
    url: "https://api.stability.ai/v1/user/account",
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
  },
  google: {
    url: `${GOOGLE_API}?pageSize=1`,
    headers: (key) => ({ "x-goog-api-key": key }),
  },
};
