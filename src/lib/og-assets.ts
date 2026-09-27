import { readFile } from "fs/promises";
import { join } from "path";
import sharp from "sharp";

/**
 * Charge un fichier de `public/` et le renvoie en URL de données.
 *
 * `next/og` ne sait pas lire un chemin local : il faudrait lui donner une URL
 * absolue, donc faire appeler l'application par elle-même à travers le réseau –
 * ce qui échoue dès que le domaine public diffère de celui du serveur. Lire le
 * fichier sur le disque évite complètement cet aller-retour.
 */
export async function loadPublicImage(
  relativePath: string,
  options: { size?: number } = {},
): Promise<string | null> {
  try {
    const buffer = await readFile(join(process.cwd(), "public", relativePath));

    // Le logo est détouré : on recadre sur son contenu réel, sinon la marge
    // transparente du fichier le fait paraître deux fois plus petit qu'il n'est.
    const pipeline = sharp(buffer).trim();
    if (options.size) {
      pipeline.resize(options.size, options.size, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      });
    }

    const png = await pipeline.png().toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch (error) {
    console.error(`Image Open Graph illisible (${relativePath}):`, error);
    return null;
  }
}

/** Logo de la plateforme. */
export const LOGO_SITE = "images/logo-sxm-simple.png";

/** Logo du catalogue public, distinct de celui de la plateforme. */
export const LOGO_CATALOG = "images/logo-sxm-catalog.png";
