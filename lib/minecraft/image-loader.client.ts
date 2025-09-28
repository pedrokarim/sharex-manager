/**
 * Utilitaire client pour charger les images de skins et capes
 */

export async function loadImageFromUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous"; // Important pour les CORS
    image.onload = () => resolve(image);
    image.onerror = (error) =>
      reject(new Error(`Failed to load image from ${url}: ${error}`));
    image.src = url;
  });
}

export async function loadSkinImage(
  skinUrl: string
): Promise<HTMLImageElement> {
  try {
    return await loadImageFromUrl(skinUrl);
  } catch (error) {
    console.error("Error loading skin image:", error);
    throw new Error("Impossible de charger l'image du skin");
  }
}

export async function loadCapeImage(
  capeUrl: string
): Promise<HTMLImageElement> {
  try {
    return await loadImageFromUrl(capeUrl);
  } catch (error) {
    console.error("Error loading cape image:", error);
    throw new Error("Impossible de charger l'image de la cape");
  }
}
