/**
 * Service de rendu côté serveur pour les skins Minecraft
 * Utilise les APIs existantes pour générer les images
 */

import {
  drawSkin2DHead,
  drawSkin2DCape,
  drawFullSkin2DNode,
  drawSkin3D,
} from "./skin-renderer";

export interface ServerRenderOptions {
  uuid: string;
  width?: number;
  height?: number;
  flip?: boolean;
  model?: "classic" | "slim";
}

/**
 * Génère une image de tête Minecraft côté serveur
 */
export async function generateServerHeadImage(
  options: ServerRenderOptions
): Promise<Buffer> {
  const { uuid, width = 32, height = 32, flip = false } = options;

  try {
    const canvas = await drawSkin2DHead({
      skin: uuid,
      width,
      height,
      flip,
    });

    return canvas.toBuffer("image/png");
  } catch (error) {
    console.error("Erreur lors de la génération de la tête:", error);
    throw new Error("Impossible de générer l'image de la tête");
  }
}

/**
 * Génère une image de cape Minecraft côté serveur
 */
export async function generateServerCapeImage(
  options: ServerRenderOptions
): Promise<Buffer> {
  const { uuid, width = 32, height = 32, flip = false } = options;

  try {
    const canvas = await drawSkin2DCape({
      skin: uuid,
      width,
      height,
      flip,
    });

    return canvas.toBuffer("image/png");
  } catch (error) {
    console.error("Erreur lors de la génération de la cape:", error);
    throw new Error("Impossible de générer l'image de la cape");
  }
}

/**
 * Génère une image complète du skin Minecraft côté serveur
 */
export async function generateServerSkinImage(
  options: ServerRenderOptions
): Promise<Buffer> {
  const { uuid, width = 64, height = 64, flip = false } = options;

  try {
    const canvas = await drawFullSkin2DNode({
      skin: uuid,
      width,
      height,
      flip,
    });

    return canvas.toBuffer("image/png");
  } catch (error) {
    console.error("Erreur lors de la génération du skin complet:", error);
    throw new Error("Impossible de générer l'image du skin complet");
  }
}

/**
 * Génère une image 3D du corps Minecraft côté serveur
 * Note: Pour l'instant, utilise le rendu 2D en attendant node-canvas-webgl
 */
export async function generateServerBodyImage(
  options: ServerRenderOptions
): Promise<Buffer> {
  const {
    uuid,
    width = 400,
    height = 400,
    flip = false,
    model = "classic",
  } = options;

  try {
    // Pour l'instant, on utilise le rendu 2D en attendant node-canvas-webgl
    const canvas = await drawFullSkin2DNode({
      skin: uuid,
      width,
      height,
      flip,
    });

    return canvas.toBuffer("image/png");
  } catch (error) {
    console.error("Erreur lors de la génération du corps 3D:", error);
    throw new Error("Impossible de générer l'image du corps 3D");
  }
}

/**
 * Génère toutes les images d'un skin en une seule fois
 */
export async function generateAllServerImages(options: ServerRenderOptions) {
  const [head, cape, skin, body] = await Promise.allSettled([
    generateServerHeadImage({ ...options, width: 32, height: 32 }),
    generateServerCapeImage({ ...options, width: 32, height: 32 }),
    generateServerSkinImage({ ...options, width: 64, height: 64 }),
    generateServerBodyImage({ ...options, width: 400, height: 400 }),
  ]);

  return {
    head: head.status === "fulfilled" ? head.value : null,
    cape: cape.status === "fulfilled" ? cape.value : null,
    skin: skin.status === "fulfilled" ? skin.value : null,
    body: body.status === "fulfilled" ? body.value : null,
    errors: {
      head: head.status === "rejected" ? head.reason.message : null,
      cape: cape.status === "rejected" ? cape.reason.message : null,
      skin: skin.status === "rejected" ? skin.reason.message : null,
      body: body.status === "rejected" ? body.reason.message : null,
    },
  };
}
