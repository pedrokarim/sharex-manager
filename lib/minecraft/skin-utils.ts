/**
 * Utilitaires pour la gestion des skins Minecraft
 */

/**
 * Récupère les données d'un skin en base64 à partir de son URL
 */
export async function getSkinBase64(skinUrl: string): Promise<string> {
  try {
    const response = await fetch(skinUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch skin: ${response.statusText}`);
    }

    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");

    return base64;
  } catch (error) {
    console.error("Error fetching skin base64:", error);
    throw error;
  }
}

/**
 * Récupère les données complètes d'un skin pour le rendu
 */
export async function getSkinDataForRendering(username: string): Promise<{
  uuid: string;
  base64: string;
  isSlim: boolean;
} | null> {
  try {
    // Importer les fonctions du player-service
    const { getPlayerData } = await import("./player-service");

    // Récupérer les données du joueur
    const playerData = await getPlayerData(username);
    if (!playerData || !playerData.skinUrl) {
      throw new Error(`No skin found for player: ${username}`);
    }

    // Récupérer les données base64 du skin
    const base64 = await getSkinBase64(playerData.skinUrl);

    return {
      uuid: playerData.uuid,
      base64,
      isSlim: playerData.isSlim || false,
    };
  } catch (error) {
    console.error(`Error getting skin data for ${username}:`, error);
    return null;
  }
}
