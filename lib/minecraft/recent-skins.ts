import { promises as fs } from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const RECENT_SKINS_FILE = path.join(DATA_DIR, "minecraft-recent-skins.json");
const MAX_RECENT_SKINS = 50;

export interface RecentSkin {
  uuid: string;
  username: string;
  searchedAt: string;
  isSlim: boolean;
}

async function ensureDataDir() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch {
    // Already exists
  }
}

export async function getRecentSkins(): Promise<RecentSkin[]> {
  try {
    const data = await fs.readFile(RECENT_SKINS_FILE, "utf-8");
    const skins: RecentSkin[] = JSON.parse(data);
    return skins.sort(
      (a, b) =>
        new Date(b.searchedAt).getTime() - new Date(a.searchedAt).getTime()
    );
  } catch {
    return [];
  }
}

export async function addRecentSkin(
  uuid: string,
  username: string,
  isSlim: boolean
): Promise<void> {
  await ensureDataDir();

  const skins = await getRecentSkins();

  // Remove existing entry with same UUID (dedup)
  const filtered = skins.filter(
    (s) => s.uuid.toLowerCase() !== uuid.toLowerCase()
  );

  // Add new entry at the beginning
  filtered.unshift({
    uuid,
    username,
    searchedAt: new Date().toISOString(),
    isSlim,
  });

  // Keep only MAX entries
  const trimmed = filtered.slice(0, MAX_RECENT_SKINS);

  await fs.writeFile(RECENT_SKINS_FILE, JSON.stringify(trimmed, null, 2));
}
