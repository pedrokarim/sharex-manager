import { LRUCache } from "lru-cache";
import { promises as fs } from "fs";
import path from "path";
import { GeoIPResult } from "./types/geo";

const CACHE_FILE = path.join(process.cwd(), "data", "geo-cache.json");

// LRU mémoire : max 5000 entrées, TTL 7 jours
const memoryCache = new LRUCache<string, GeoIPResult>({
  max: 5000,
  ttl: 1000 * 60 * 60 * 24 * 7,
});

let diskCacheLoaded = false;

async function loadDiskCache(): Promise<void> {
  if (diskCacheLoaded) return;
  try {
    const content = await fs.readFile(CACHE_FILE, "utf-8");
    const entries: Record<string, GeoIPResult> = JSON.parse(content);
    for (const [ip, data] of Object.entries(entries)) {
      memoryCache.set(ip, data);
    }
  } catch {
    // File doesn't exist yet or is invalid — ignore
  }
  diskCacheLoaded = true;
}

async function saveDiskCache(): Promise<void> {
  const entries: Record<string, GeoIPResult> = {};
  for (const [ip, data] of memoryCache.entries()) {
    entries[ip] = data;
  }
  await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });
  await fs.writeFile(CACHE_FILE, JSON.stringify(entries, null, 2));
}

const PRIVATE_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2[0-9]|3[01])\./,
  /^::1$/,
  /^0\.0\.0\.0$/,
  /^localhost$/i,
];

export function isPrivateIP(ip: string): boolean {
  return PRIVATE_IP_PATTERNS.some((pattern) => pattern.test(ip));
}

function getPrivateGeoResult(ip: string): GeoIPResult {
  return {
    ip,
    country: "Private Network",
    countryCode: "XX",
    city: "Local",
    lat: 0,
    lon: 0,
    isp: "Private",
    isPrivate: true,
  };
}

export async function getGeoIP(ip: string): Promise<GeoIPResult | null> {
  if (isPrivateIP(ip)) return getPrivateGeoResult(ip);

  await loadDiskCache();

  const cached = memoryCache.get(ip);
  if (cached) return cached;

  return null;
}

export async function batchResolveGeoIP(
  ips: string[]
): Promise<{ results: Map<string, GeoIPResult>; rateLimited: boolean }> {
  await loadDiskCache();

  const results = new Map<string, GeoIPResult>();
  const toResolve: string[] = [];

  for (const ip of ips) {
    if (isPrivateIP(ip)) {
      results.set(ip, getPrivateGeoResult(ip));
      continue;
    }

    const cached = memoryCache.get(ip);
    if (cached) {
      results.set(ip, cached);
      continue;
    }

    toResolve.push(ip);
  }

  let rateLimited = false;

  if (toResolve.length > 0) {
    // ip-api.com batch: max 100 per request
    const batches: string[][] = [];
    for (let i = 0; i < toResolve.length; i += 100) {
      batches.push(toResolve.slice(i, i + 100));
    }

    for (const batch of batches) {
      try {
        const response = await fetch("http://ip-api.com/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            batch.map((ip) => ({
              query: ip,
              fields: "query,country,countryCode,city,lat,lon,isp,status,message",
            }))
          ),
        });

        if (response.status === 429) {
          rateLimited = true;
          break;
        }

        if (!response.ok) continue;

        const data = await response.json();

        for (const entry of data) {
          if (entry.status === "success") {
            const geoResult: GeoIPResult = {
              ip: entry.query,
              country: entry.country,
              countryCode: entry.countryCode,
              city: entry.city,
              lat: entry.lat,
              lon: entry.lon,
              isp: entry.isp,
            };
            memoryCache.set(entry.query, geoResult);
            results.set(entry.query, geoResult);
          }
        }
      } catch (error) {
        console.error("[GeoCache] Batch API error:", error);
      }
    }

    // Persist to disk after resolving new IPs
    await saveDiskCache();
  }

  return { results, rateLimited };
}
