/**
 * Écriture de la configuration des envois (`config/uploads.json`) : le seul
 * chemin, emprunté par `PUT /api/settings/config` (l'interface) comme par
 * `POST /api/uploads/config`.
 *
 * Toute modification passe par le schéma zod `schemas/upload-config.ts`, puis
 * est fusionnée dans la configuration en place : un envoi partiel ne vide
 * plus les sections qu'il ne mentionne pas. Le fichier est écrit par fichier
 * temporaire renommé ensuite.
 *
 * `storage.path` n'est pas réglable ici : le dossier des envois vient de la
 * variable d'environnement `UPLOAD_PATH` (`lib/config.ts`). La valeur reçue
 * est ignorée ; l'interface affiche le dossier réel, en lecture seule.
 */

import { randomBytes } from "crypto";
import { mkdir, readFile, rename, rm, writeFile } from "fs/promises";
import path from "path";
import { defaultConfig } from "@/lib/defaultConfig";
import { getAbsoluteUploadPath } from "@/lib/config";
import type { UploadConfig } from "@/lib/types/upload-config";
import { uploadConfigSchema } from "@/schemas/upload-config";

export const UPLOAD_CONFIG_FILE = path.resolve(/* turbopackIgnore: true */ process.cwd(), "config", "uploads.json");

let pathOverride: string | null = null;

/** Déplace le fichier ailleurs, pour les tests. `null` rétablit l'emplacement normal. */
export function setUploadConfigPath(file: string | null) {
  pathOverride = file;
}

export function uploadConfigPath(): string {
  return pathOverride ?? UPLOAD_CONFIG_FILE;
}

/** Configuration en place ; la configuration par défaut si le fichier manque ou est illisible. */
export async function readUploadConfig(): Promise<UploadConfig> {
  try {
    return JSON.parse(await readFile(uploadConfigPath(), "utf-8")) as UploadConfig;
  } catch {
    return defaultConfig;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Fusion profonde : un champ absent (`undefined`) garde sa valeur ; un tableau remplace l'ancien. */
export function mergeUploadConfig<T>(current: T, patch: unknown): T {
  if (!isPlainObject(patch) || !isPlainObject(current)) return (patch === undefined ? current : patch) as T;
  const result: Record<string, unknown> = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    result[key] = isPlainObject(value) && isPlainObject(result[key]) ? mergeUploadConfig(result[key], value) : value;
  }
  return result as T;
}

export type SaveUploadConfigResult =
  | { ok: true; config: UploadConfig; before: UploadConfig }
  | { ok: false; error: string; fieldErrors: Record<string, string[] | undefined>; formErrors: string[] };

/** Valide, fusionne et enregistre. Rien n'est écrit si la validation échoue. */
export async function saveUploadConfig(input: unknown): Promise<SaveUploadConfigResult> {
  const parsed = uploadConfigSchema.safeParse(input);
  if (!parsed.success) {
    const flattened = parsed.error.flatten();
    return {
      ok: false,
      error:
        flattened.formErrors[0] ||
        Object.values(flattened.fieldErrors).flat().find(Boolean) ||
        "Configuration invalide",
      fieldErrors: flattened.fieldErrors as Record<string, string[] | undefined>,
      formErrors: flattened.formErrors,
    };
  }

  const patch = structuredClone(parsed.data) as Record<string, unknown>;
  if (isPlainObject(patch.storage)) delete patch.storage.path;

  const before = await readUploadConfig();
  const config = mergeUploadConfig(before, patch);

  // Les règles croisées (taille minimale sous la maximale…) valent aussi
  // pour le résultat de la fusion.
  const merged = uploadConfigSchema.safeParse(config);
  if (!merged.success) {
    const flattened = merged.error.flatten();
    return {
      ok: false,
      error: flattened.formErrors[0] || Object.values(flattened.fieldErrors).flat().find(Boolean) || "Configuration invalide",
      fieldErrors: flattened.fieldErrors as Record<string, string[] | undefined>,
      formErrors: flattened.formErrors,
    };
  }

  const file = uploadConfigPath();
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(config, null, 2), "utf-8");
    await rename(temporary, file);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
  return { ok: true, config, before };
}

/**
 * Configuration telle que l'API la rend : `storage.path` montre le dossier
 * réel (`UPLOAD_PATH`) à un admin, et rien aux autres.
 */
export function presentUploadConfig(config: UploadConfig, { admin }: { admin: boolean }): UploadConfig {
  return {
    ...config,
    storage: { ...config.storage, path: admin ? getAbsoluteUploadPath() : "" },
  };
}
