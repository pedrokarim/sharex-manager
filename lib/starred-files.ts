import fs from "fs/promises";
import path from "path";

const STARRED_FILES_PATH = path.join(
  process.cwd(),
  "data",
  "starred-files.json"
);

interface StarredFilesData {
  files: string[];
}

/**
 * Récupère la liste des fichiers favoris
 */
export async function getStarredFiles(): Promise<string[]> {
  try {
    const data = await fs.readFile(STARRED_FILES_PATH, "utf-8");
    const { files } = JSON.parse(data) as StarredFilesData;
    return files;
  } catch (error) {
    // Si le fichier n'existe pas, le créer
    await fs.writeFile(STARRED_FILES_PATH, JSON.stringify({ files: [] }));
    return [];
  }
}

/**
 * Vérifie si un fichier est en favori
 */
export async function isFileStarred(filename: string): Promise<boolean> {
  const files = await getStarredFiles();
  return files.includes(filename);
}

/**
 * Ajoute ou retire un fichier des favoris
 */
export async function toggleFileStarred(
  filename: string,
  isStarred: boolean
): Promise<void> {
  const files = await getStarredFiles();

  if (isStarred && !files.includes(filename)) {
    files.push(filename);
  } else if (!isStarred) {
    const index = files.indexOf(filename);
    if (index !== -1) {
      files.splice(index, 1);
    }
  }

  await fs.writeFile(STARRED_FILES_PATH, JSON.stringify({ files }, null, 2));
}

/**
 * Supprime un fichier des favoris
 */
export async function removeFileFromStarred(filename: string): Promise<void> {
  const files = await getStarredFiles();
  const index = files.indexOf(filename);

  if (index !== -1) {
    files.splice(index, 1);
    await fs.writeFile(STARRED_FILES_PATH, JSON.stringify({ files }, null, 2));
  }
}
