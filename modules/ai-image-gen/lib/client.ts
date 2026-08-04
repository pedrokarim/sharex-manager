/**
 * Passerelle client → fonctions serveur du module, plus les quelques formats
 * partagés par les trois pages.
 */

export interface HistoryItem {
  id: string;
  prompt: string;
  finalPrompt: string;
  notes: string;
  provider: string;
  model: string;
  size: string;
  quality?: string;
  count: number;
  imageFiles: string[];
  revisedPrompt?: string;
  savedToGallery?: Record<string, string>;
  usedReference?: boolean;
  favorite?: boolean;
  durationMs?: number;
  createdAt: number;
}

export interface ModuleStats {
  generations: number;
  images: number;
  favorites: number;
  inGallery: number;
  diskBytes: number;
  byModel: { model: string; label: string; count: number }[];
}

export interface SecretStatus {
  configured: boolean;
  fromEnv: boolean;
  hint: string;
}

const MODULE_NAME = "ai-image-gen";

/**
 * Les fonctions du module répondent `{ success, data, error }`. On lève sur
 * échec pour que les pages traitent erreur réseau et erreur métier au même
 * endroit, avec un seul `catch`.
 */
export async function callModule<T = any>(
  functionName: string,
  ...args: unknown[]
): Promise<T> {
  const res = await fetch("/api/modules/call-function", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ moduleName: MODULE_NAME, functionName, args }),
  });

  let payload: any = null;
  try {
    payload = await res.json();
  } catch {
    throw new Error(`Réponse illisible du serveur (HTTP ${res.status})`);
  }

  if (!res.ok || payload?.success === false) {
    throw new Error(payload?.error || `Échec de ${functionName}`);
  }
  return payload?.data as T;
}

export function imageUrl(file: string): string {
  return `/api/modules/${MODULE_NAME}/data/images/${file}`;
}

export function timeAgo(ts: number): string {
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return "à l'instant";
  if (mins < 60) return `il y a ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 31) return `il y a ${days} j`;
  return new Date(ts).toLocaleDateString("fr-FR");
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  const units = ["Ko", "Mo", "Go"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}

export function formatDuration(ms?: number): string | null {
  if (!ms) return null;
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

/** Fragments de style ajoutés au prompt en un clic. */
export const PRESETS = [
  {
    label: "Anime",
    fragment: "anime style, detailed illustration, vibrant colors",
  },
  {
    label: "Photo",
    fragment: "photorealistic, natural lighting, sharp focus, 50mm lens",
  },
  {
    label: "Paysage",
    fragment: "sweeping landscape, atmospheric lighting, wide angle",
  },
  {
    label: "Portrait",
    fragment: "portrait, studio lighting, shallow depth of field",
  },
  {
    label: "Cyberpunk",
    fragment: "cyberpunk, neon lights, rain-slick streets, cinematic",
  },
  {
    label: "Fantasy",
    fragment: "fantasy art, ethereal, dramatic lighting, painterly",
  },
  {
    label: "Minimal",
    fragment: "minimalist, flat design, generous negative space",
  },
  {
    label: "3D",
    fragment: "3D render, octane, soft global illumination",
  },
] as const;

/**
 * Télécharge une image depuis une URL du module. On passe par un blob plutôt
 * que par `<a download>` sur l'URL directe : l'attribut est ignoré dès que la
 * ressource est servie par une autre route, et le navigateur se contente
 * d'ouvrir l'image.
 */
export async function downloadImage(url: string, fileName: string) {
  const response = await fetch(url);
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

/** Lit un fichier choisi par l'utilisateur en base64 nu (sans le préfixe `data:`). */
export function readFileAsBase64(
  file: File
): Promise<{ b64: string; mimeType: string; dataUrl: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Lecture du fichier impossible"));
    reader.onload = () => {
      const dataUrl = reader.result as string;
      resolve({
        b64: dataUrl.split(",")[1] ?? "",
        mimeType: file.type || "image/png",
        dataUrl,
      });
    };
    reader.readAsDataURL(file);
  });
}
