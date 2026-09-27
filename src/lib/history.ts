import { promises as fs } from "fs";
import path from "path";
import { HistoryEntry } from "./types/history";
import { nanoid } from "nanoid";

const historyFile = path.join(process.cwd(), "data", "history.json");

// Assure que le fichier history.json existe
async function ensureHistoryFile() {
  try {
    await fs.access(historyFile);
  } catch {
    await fs.writeFile(historyFile, "[]");
  }
}

// Lit tous les enregistrements d'historique
export async function getAllHistory(): Promise<HistoryEntry[]> {
  await ensureHistoryFile();
  const content = await fs.readFile(historyFile, "utf-8");
  return JSON.parse(content);
}

// Ajoute un nouvel enregistrement
export async function addHistoryEntry(
  entry: Omit<HistoryEntry, "id">
): Promise<HistoryEntry> {
  const history = await getAllHistory();
  const newEntry: HistoryEntry = {
    ...entry,
    id: nanoid(),
  };

  history.push(newEntry);
  await fs.writeFile(historyFile, JSON.stringify(history, null, 2));
  return newEntry;
}

// Supprime un enregistrement
export async function deleteHistoryEntry(id: string): Promise<boolean> {
  const history = await getAllHistory();
  const filteredHistory = history.filter((entry) => entry.id !== id);

  if (filteredHistory.length === history.length) {
    return false;
  }

  await fs.writeFile(historyFile, JSON.stringify(filteredHistory, null, 2));
  return true;
}

// Recherche dans l'historique avec filtres
export async function searchHistory(filters: {
  startDate?: Date;
  endDate?: Date;
  userId?: string;
  uploadMethod?: "api" | "web" | "sharex";
  searchQuery?: string;
}): Promise<HistoryEntry[]> {
  const history = await getAllHistory();

  return history.filter((entry) => {
    const uploadDate = new Date(entry.uploadDate);

    if (filters.startDate && uploadDate < filters.startDate) return false;
    if (filters.endDate && uploadDate > filters.endDate) return false;
    if (filters.userId && entry.userId !== filters.userId) return false;
    if (filters.uploadMethod && entry.uploadMethod !== filters.uploadMethod)
      return false;
    if (filters.searchQuery) {
      const query = filters.searchQuery.toLowerCase();
      return (
        entry.originalFilename.toLowerCase().includes(query) ||
        entry.filename.toLowerCase().includes(query) ||
        entry.userName?.toLowerCase().includes(query)
      );
    }

    return true;
  });
}

// Fonction utilitaire pour enregistrer un upload
export async function recordUpload({
  filename,
  originalFilename,
  fileSize,
  mimeType,
  uploadMethod,
  fileUrl,
  thumbnailUrl,
  deletionToken,
  ipAddress,
  userId,
  userName,
}: {
  filename: string;
  originalFilename: string;
  fileSize: number;
  mimeType: string;
  uploadMethod: "api" | "web" | "sharex";
  fileUrl: string;
  thumbnailUrl?: string;
  deletionToken?: string;
  ipAddress: string;
  userId?: string;
  userName?: string;
}) {
  return addHistoryEntry({
    filename,
    originalFilename,
    uploadDate: new Date().toISOString(),
    fileSize,
    mimeType,
    uploadMethod,
    fileUrl,
    thumbnailUrl,
    deletionToken,
    ipAddress,
    userId,
    userName,
  });
}
