import { promises as fs } from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const FEATURED_SKINS_FILE = path.join(DATA_DIR, "minecraft-featured-skins.json");
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface FeaturedSkin {
  uuid: string;
  username: string;
}

interface FeaturedSkinsCache {
  skins: FeaturedSkin[];
  source: "namemc" | "manual";
  cachedAt: string;
}

// Well-known players as fallback
const MANUAL_FEATURED: { username: string }[] = [
  { username: "Notch" },
  { username: "jeb_" },
  { username: "Dinnerbone" },
  { username: "Dream" },
  { username: "Technoblade" },
  { username: "Philza" },
  { username: "TommyInnit" },
  { username: "Ranboo" },
  { username: "Tubbo" },
  { username: "Sapnap" },
  { username: "GeorgeNotFound" },
  { username: "Quackity" },
  { username: "KarlJacobs" },
  { username: "BadBoyHalo" },
  { username: "Skeppy" },
  { username: "CaptainSparklez" },
];

async function ensureDataDir() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch {
    // Already exists
  }
}

async function readCache(): Promise<FeaturedSkinsCache | null> {
  try {
    const data = await fs.readFile(FEATURED_SKINS_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return null;
  }
}

async function writeCache(cache: FeaturedSkinsCache): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(FEATURED_SKINS_FILE, JSON.stringify(cache, null, 2));
}

function isCacheValid(cache: FeaturedSkinsCache): boolean {
  const age = Date.now() - new Date(cache.cachedAt).getTime();
  return age < CACHE_TTL_MS && cache.skins.length > 0;
}

/**
 * Scrape trending skin IDs from NameMC, then resolve each to a player username.
 */
async function scrapeFeaturedFromNameMC(): Promise<FeaturedSkin[]> {
  // Step 1: Fetch trending page and extract skin IDs
  const trendingRes = await fetch("https://namemc.com/minecraft-skins/trending", {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; MinecraftSkinViewer/1.0)",
    },
  });

  if (!trendingRes.ok) {
    throw new Error(`NameMC trending returned ${trendingRes.status}`);
  }

  const trendingHtml = await trendingRes.text();

  // Extract skin IDs from href="/skin/{id}" links
  const skinIdRegex = /href="\/skin\/([a-f0-9]+)"/gi;
  const skinIds: string[] = [];
  let match;
  while ((match = skinIdRegex.exec(trendingHtml)) !== null) {
    if (!skinIds.includes(match[1])) {
      skinIds.push(match[1]);
    }
    if (skinIds.length >= 30) break;
  }

  if (skinIds.length === 0) {
    throw new Error("No skin IDs found on NameMC trending page");
  }

  // Step 2: For each skin, extract the first player username
  const skins: FeaturedSkin[] = [];

  for (const skinId of skinIds.slice(0, 20)) {
    try {
      const skinRes = await fetch(`https://namemc.com/skin/${skinId}`, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; MinecraftSkinViewer/1.0)",
        },
      });

      if (!skinRes.ok) continue;

      const skinHtml = await skinRes.text();

      // Extract player username from profile links: href="/profile/{username}"
      const profileMatch = skinHtml.match(
        /href="\/profile\/([A-Za-z0-9_]{1,16})"/
      );
      if (!profileMatch) continue;

      const username = profileMatch[1];

      // Skip if we already have this player
      if (skins.some((s) => s.username.toLowerCase() === username.toLowerCase()))
        continue;

      // Step 3: Resolve UUID via our player API (internal)
      const playerRes = await fetch(
        `https://api.minecraftservices.com/minecraft/profile/lookup/name/${encodeURIComponent(username)}`
      );

      if (!playerRes.ok) continue;

      const playerData = await playerRes.json();
      if (playerData.id) {
        skins.push({
          uuid: playerData.id,
          username: playerData.name || username,
        });
      }

      if (skins.length >= 16) break;
    } catch {
      // Skip failed individual skins
      continue;
    }
  }

  return skins;
}

/**
 * Resolve manual fallback list by looking up UUIDs.
 */
async function resolveManualFeatured(): Promise<FeaturedSkin[]> {
  const skins: FeaturedSkin[] = [];

  for (const { username } of MANUAL_FEATURED) {
    try {
      const res = await fetch(
        `https://api.minecraftservices.com/minecraft/profile/lookup/name/${encodeURIComponent(username)}`
      );
      if (!res.ok) continue;
      const data = await res.json();
      if (data.id) {
        skins.push({ uuid: data.id, username: data.name || username });
      }
    } catch {
      continue;
    }
  }

  return skins;
}

export async function getFeaturedSkins(): Promise<FeaturedSkinsCache> {
  // Check cache first
  const cache = await readCache();
  if (cache && isCacheValid(cache)) {
    return cache;
  }

  // Try scraping NameMC
  try {
    const skins = await scrapeFeaturedFromNameMC();
    if (skins.length > 0) {
      const result: FeaturedSkinsCache = {
        skins,
        source: "namemc",
        cachedAt: new Date().toISOString(),
      };
      await writeCache(result);
      return result;
    }
  } catch (err) {
    console.warn("NameMC scraping failed, falling back to manual list:", err);
  }

  // Fallback: manual list
  const skins = await resolveManualFeatured();
  const result: FeaturedSkinsCache = {
    skins,
    source: "manual",
    cachedAt: new Date().toISOString(),
  };

  if (skins.length > 0) {
    await writeCache(result);
  }

  return result;
}
