import { getCacheStats, clearCache } from "./player-service";

/**
 * Service d'administration pour les outils Minecraft
 * Ces fonctions ne doivent être utilisées que côté serveur
 */

export interface AdminCacheStats {
  playerCache: {
    size: number;
    max: number;
    calculatedSize: number;
  };
  usernameCache: {
    size: number;
    max: number;
    calculatedSize: number;
  };
}

/**
 * Récupère les statistiques du cache (côté serveur uniquement)
 */
export function getAdminCacheStats(): AdminCacheStats {
  return getCacheStats();
}

/**
 * Vide le cache (côté serveur uniquement)
 */
export function clearAdminCache(): void {
  clearCache();
}

/**
 * Vérifie si l'utilisateur a les droits d'administration
 */
export function isAdminUser(userRole?: string): boolean {
  return userRole === "admin";
}
