import fs from "fs/promises";
import path from "path";

const SECURE_FILES_PATH = path.join(process.cwd(), "data", "secure-files.json");

interface SecureFilesData {
  files: string[];
}

/**
 * Récupère la liste des fichiers sécurisés
 */
export async function getSecureFiles(): Promise<string[]> {
  try {
    const data = await fs.readFile(SECURE_FILES_PATH, "utf-8");
    const { files } = JSON.parse(data) as SecureFilesData;
    return files;
  } catch (error) {
    // Si le fichier n'existe pas, le créer
    await fs.writeFile(SECURE_FILES_PATH, JSON.stringify({ files: [] }));
    return [];
  }
}

/**
 * Vérifie si un fichier est sécurisé
 */
export async function isFileSecure(filename: string): Promise<boolean> {
  const files = await getSecureFiles();
  return files.includes(filename);
}

/**
 * Définit le statut de sécurité d'un fichier
 */
export async function setFileSecure(
  filename: string,
  isSecure: boolean
): Promise<void> {
  const files = await getSecureFiles();

  if (isSecure && !files.includes(filename)) {
    files.push(filename);
  } else if (!isSecure) {
    const index = files.indexOf(filename);
    if (index !== -1) {
      files.splice(index, 1);
    }
  }

  await fs.writeFile(SECURE_FILES_PATH, JSON.stringify({ files }, null, 2));
}

/**
 * Supprime un fichier de la liste des fichiers sécurisés
 */
export async function removeFileFromSecure(filename: string): Promise<void> {
  const files = await getSecureFiles();
  const index = files.indexOf(filename);

  if (index !== -1) {
    files.splice(index, 1);
    await fs.writeFile(SECURE_FILES_PATH, JSON.stringify({ files }, null, 2));
  }
}
