import { readFile } from "fs/promises";
import { resolve, join } from "path";
import type { UploadConfig } from "@/lib/types/upload-config";
import { defaultConfig } from "../defaultConfig";

const CONFIG_PATH = resolve(process.cwd(), "config", "uploads.json");

export async function getServerConfig(): Promise<UploadConfig> {
	try {
		const configData = await readFile(CONFIG_PATH, "utf-8");
		return JSON.parse(configData);
	} catch (error) {
		console.error("Erreur lors de la lecture de la configuration:", error);
		return defaultConfig;
	}
}
