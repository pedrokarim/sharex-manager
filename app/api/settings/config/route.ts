import { readFile, writeFile } from "fs/promises";
import { resolve } from "path";
import { NextRequest, NextResponse } from "next/server";
import { UploadConfig } from "@/lib/types/upload-config";

const CONFIG_PATH = resolve(process.cwd(), "config", "uploads.json");

async function readConfig(): Promise<UploadConfig> {
  try {
    const configFile = await readFile(CONFIG_PATH, "utf-8");
    return JSON.parse(configFile);
  } catch (error) {
    throw new Error("Erreur lors de la lecture de la configuration");
  }
}

async function writeConfig(config: UploadConfig): Promise<void> {
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));
}

export async function GET() {
  try {
    const config = await readConfig();
    return NextResponse.json(config);
  } catch (error) {
    return NextResponse.json(
      { error: "Erreur lors de la lecture de la configuration" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const updates = await request.json();
    const currentConfig = await readConfig();

    // Fusionner les mises à jour avec la configuration actuelle
    const newConfig = {
      ...currentConfig,
      ...updates,
    };

    await writeConfig(newConfig);
    return NextResponse.json(newConfig);
  } catch (error) {
    return NextResponse.json(
      { error: "Erreur lors de la mise à jour de la configuration" },
      { status: 500 }
    );
  }
}
