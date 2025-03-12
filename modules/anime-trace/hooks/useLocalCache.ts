interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

interface CacheConfig {
  ttl: number; // Durée de vie en millisecondes
  maxEntries: number; // Nombre maximum d'entrées dans le cache
}

export function useLocalCache<T>(key: string, config: CacheConfig) {
  const CACHE_PREFIX = "anime_trace_cache_";
  const cacheKey = CACHE_PREFIX + key;

  const set = (data: T) => {
    try {
      // Récupérer toutes les clés du cache
      const allKeys = Object.keys(localStorage).filter((k) =>
        k.startsWith(CACHE_PREFIX)
      );

      // Si on atteint la limite, supprimer l'entrée la plus ancienne
      if (allKeys.length >= config.maxEntries) {
        let oldestKey = allKeys[0];
        let oldestTime = Infinity;

        allKeys.forEach((k) => {
          const item = localStorage.getItem(k);
          if (item) {
            const entry: CacheEntry<T> = JSON.parse(item);
            if (entry.timestamp < oldestTime) {
              oldestTime = entry.timestamp;
              oldestKey = k;
            }
          }
        });

        localStorage.removeItem(oldestKey);
      }

      // Sauvegarder la nouvelle entrée
      const entry: CacheEntry<T> = {
        data,
        timestamp: Date.now(),
      };

      localStorage.setItem(cacheKey, JSON.stringify(entry));
    } catch (error) {
      console.error("Erreur lors de la sauvegarde dans le cache:", error);
    }
  };

  const get = (): T | null => {
    try {
      const item = localStorage.getItem(cacheKey);
      if (!item) return null;

      const entry: CacheEntry<T> = JSON.parse(item);
      const now = Date.now();

      // Vérifier si l'entrée est expirée
      if (now - entry.timestamp > config.ttl) {
        localStorage.removeItem(cacheKey);
        return null;
      }

      return entry.data;
    } catch (error) {
      console.error("Erreur lors de la lecture du cache:", error);
      return null;
    }
  };

  const remove = () => {
    try {
      localStorage.removeItem(cacheKey);
    } catch (error) {
      console.error("Erreur lors de la suppression du cache:", error);
    }
  };

  return { get, set, remove };
}
