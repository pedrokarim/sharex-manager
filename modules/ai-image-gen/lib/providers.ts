export interface GenerateImageOptions {
  prompt: string;
  provider: "openai" | "stability";
  model?: string;
  size?: string;
  n?: number;
  apiKey: string;
}

export interface GeneratedImage {
  url?: string;
  b64?: string;
}

export interface GenerateImageResult {
  images: GeneratedImage[];
}

export async function generateWithOpenAI(
  options: GenerateImageOptions
): Promise<GenerateImageResult> {
  const { prompt, model = "dall-e-3", size = "1024x1024", n = 1, apiKey } = options;

  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      prompt,
      n: model === "dall-e-3" ? 1 : n,
      size,
      response_format: "b64_json",
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      error?.error?.message || `OpenAI API error: ${response.status}`
    );
  }

  const data = await response.json();
  return {
    images: data.data.map((item: any) => ({
      b64: item.b64_json,
      url: item.url,
    })),
  };
}

export async function generateWithStability(
  options: GenerateImageOptions
): Promise<GenerateImageResult> {
  const { prompt, size = "1024x1024", apiKey } = options;

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
        width: Math.min(width, 1024),
        height: Math.min(height, 1024),
        steps: 30,
        samples: 1,
      }),
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      error?.message || `Stability API error: ${response.status}`
    );
  }

  const data = await response.json();
  return {
    images: data.artifacts.map((artifact: any) => ({
      b64: artifact.base64,
    })),
  };
}
