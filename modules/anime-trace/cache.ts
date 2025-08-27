import fs from "fs";
import path from "path";
import crypto from "crypto";

interface CacheEntry {
  key: string;
  timestamp: number;
  data: any;
}

interface CacheFile {
  entries: CacheEntry[];
  maxEntries: number;
}

export class FileBasedLRUCache {
  private cacheFilePath: string;
  private maxEntries: number;
  private cache: CacheFile;

  constructor(modulePath: string, maxEntries: number = 1000) {
    this.cacheFilePath = path.join(modulePath, "cache.json");
    this.maxEntries = maxEntries;
    this.cache = this.loadCache();
  }

  private loadCache(): CacheFile {
    try {
      if (fs.existsSync(this.cacheFilePath)) {
        const data = fs.readFileSync(this.cacheFilePath, "utf-8");
        return JSON.parse(data);
      }
    } catch (error) {
      console.error("Erreur lors du chargement du cache:", error);
    }

    return { entries: [], maxEntries: this.maxEntries };
  }

  private saveCache(): void {
    try {
      fs.writeFileSync(this.cacheFilePath, JSON.stringify(this.cache, null, 2));
    } catch (error) {
      console.error("Erreur lors de la sauvegarde du cache:", error);
    }
  }

  private generateKey(imageBuffer: Buffer): string {
    return crypto.createHash("sha256").update(imageBuffer).digest("hex");
  }

  get(imageBuffer: Buffer): any | null {
    const key = this.generateKey(imageBuffer);
    const entry = this.cache.entries.find((e) => e.key === key);

    if (entry) {
      // Mettre à jour le timestamp pour le LRU
      entry.timestamp = Date.now();
      this.saveCache();
      return entry.data;
    }

    return null;
  }

  set(imageBuffer: Buffer, data: any): void {
    const key = this.generateKey(imageBuffer);
    const now = Date.now();

    // Supprimer l'entrée existante si elle existe
    this.cache.entries = this.cache.entries.filter((e) => e.key !== key);

    // Ajouter la nouvelle entrée
    this.cache.entries.push({
      key,
      timestamp: now,
      data,
    });

    // Si on dépasse la limite, supprimer les entrées les plus anciennes
    if (this.cache.entries.length > this.maxEntries) {
      this.cache.entries.sort((a, b) => a.timestamp - b.timestamp);
      this.cache.entries = this.cache.entries.slice(-this.maxEntries);
    }

    this.saveCache();
  }

  clear(): void {
    this.cache.entries = [];
    this.saveCache();
  }
}
