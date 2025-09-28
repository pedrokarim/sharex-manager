import { LRUCache } from 'lru-cache';

// Cache pour les données des joueurs (UUID, skin, etc.)
const playerCache = new LRUCache<string, any>({
  max: 1000,
  ttl: 1000 * 60 * 60, // 1 heure
});

// Cache pour les recherches pseudo -> UUID
const usernameCache = new LRUCache<string, string>({
  max: 2000,
  ttl: 1000 * 60 * 30, // 30 minutes
});

export interface PlayerData {
  uuid: string;
  username: string;
  skinUrl?: string;
  capeUrl?: string;
  isSlim?: boolean;
}

/**
 * Recherche un joueur par son pseudo et retourne ses informations complètes
 */
export async function getPlayerData(username: string): Promise<PlayerData | null> {
  try {
    // Normaliser le pseudo (enlever les espaces, caractères spéciaux)
    const normalizedUsername = username.trim().toLowerCase();
    
    // Vérifier le cache d'abord
    const cachedData = playerCache.get(normalizedUsername);
    if (cachedData) {
      console.log(`Player data found in cache for: ${username}`);
      return cachedData;
    }

    console.log(`Fetching player data for: ${username}`);

    // Étape 1: Récupérer l'UUID à partir du pseudo
    const uuid = await getUUIDFromUsername(username);
    if (!uuid) {
      console.log(`No UUID found for username: ${username}`);
      return null;
    }

    // Étape 2: Récupérer les données complètes du joueur
    const playerData = await getPlayerDataFromUUID(uuid);
    if (!playerData) {
      console.log(`No player data found for UUID: ${uuid}`);
      return null;
    }

    // Mettre en cache
    playerCache.set(normalizedUsername, playerData);
    
    return playerData;
  } catch (error) {
    console.error(`Error fetching player data for ${username}:`, error);
    return null;
  }
}

/**
 * Récupère l'UUID d'un joueur à partir de son pseudo
 */
async function getUUIDFromUsername(username: string): Promise<string | null> {
  const normalizedUsername = username.trim().toLowerCase();
  
  // Vérifier le cache
  const cachedUUID = usernameCache.get(normalizedUsername);
  if (cachedUUID) {
    return cachedUUID;
  }

  try {
    const response = await fetch(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(username)}`);
    
    if (!response.ok) {
      if (response.status === 404) {
        console.log(`Username not found: ${username}`);
        return null;
      }
      throw new Error(`Mojang API error: ${response.statusText}`);
    }

    const data = await response.json();
    const uuid = data.id;
    
    // Mettre en cache
    usernameCache.set(normalizedUsername, uuid);
    
    return uuid;
  } catch (error) {
    console.error(`Error fetching UUID for ${username}:`, error);
    return null;
  }
}

/**
 * Récupère les données complètes d'un joueur à partir de son UUID
 */
async function getPlayerDataFromUUID(uuid: string): Promise<PlayerData | null> {
  try {
    const response = await fetch(`https://sessionserver.mojang.com/session/minecraft/profile/${uuid}`, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Mojang API error: ${response.statusText}`);
    }

    const data = await response.json();

    // Parser les propriétés
    let skinUrl: string | undefined;
    let capeUrl: string | undefined;
    let isSlim = false;

    if (data.properties && Array.isArray(data.properties)) {
      for (const prop of data.properties) {
        try {
          const value = JSON.parse(Buffer.from(prop.value, 'base64').toString('ascii'));
          
          if (value.textures) {
            if (value.textures.SKIN) {
              skinUrl = value.textures.SKIN.url;
              isSlim = value.textures.SKIN.metadata?.model === 'slim';
            }
            if (value.textures.CAPE) {
              capeUrl = value.textures.CAPE.url;
            }
          }
        } catch (e) {
          console.warn('Failed to parse property value:', e);
        }
      }
    }

    const playerData: PlayerData = {
      uuid: data.id,
      username: data.name,
      skinUrl,
      capeUrl,
      isSlim
    };

    return playerData;
  } catch (error) {
    console.error(`Error fetching player data for UUID ${uuid}:`, error);
    return null;
  }
}

/**
 * Recherche un joueur par UUID (pour les cas où on a déjà l'UUID)
 */
export async function getPlayerDataByUUID(uuid: string): Promise<PlayerData | null> {
  try {
    // Vérifier le cache
    const cachedData = playerCache.get(uuid);
    if (cachedData) {
      return cachedData;
    }

    const playerData = await getPlayerDataFromUUID(uuid);
    if (playerData) {
      playerCache.set(uuid, playerData);
    }
    
    return playerData;
  } catch (error) {
    console.error(`Error fetching player data for UUID ${uuid}:`, error);
    return null;
  }
}

/**
 * Vérifie si un pseudo existe
 */
export async function checkUsernameExists(username: string): Promise<boolean> {
  const playerData = await getPlayerData(username);
  return playerData !== null;
}

/**
 * Nettoie le cache (utile pour les tests ou la maintenance)
 */
export function clearCache(): void {
  playerCache.clear();
  usernameCache.clear();
}

/**
 * Retourne les statistiques du cache
 */
export function getCacheStats() {
  return {
    playerCache: {
      size: playerCache.size,
      max: playerCache.max,
      calculatedSize: playerCache.calculatedSize
    },
    usernameCache: {
      size: usernameCache.size,
      max: usernameCache.max,
      calculatedSize: usernameCache.calculatedSize
    }
  };
}
