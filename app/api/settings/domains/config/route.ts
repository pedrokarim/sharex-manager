import { readFile, writeFile } from "fs/promises";
import { resolve } from "path";
import { NextRequest, NextResponse } from "next/server";

const CONFIG_PATH = resolve(process.cwd(), "config", "uploads.json");

async function readConfig() {
  const configFile = await readFile(CONFIG_PATH, "utf-8");
  return JSON.parse(configFile);
}

async function writeConfig(config: any) {
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));
}

export async function GET() {
  try {
    const config = await readConfig();
    return NextResponse.json({
      useSSL: config.domains.useSSL,
      pathPrefix: config.domains.pathPrefix,
      defaultDomain: config.domains.defaultDomain,
    });
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
    const config = await readConfig();

    config.domains.useSSL = updates.useSSL;
    config.domains.pathPrefix = updates.pathPrefix;

    await writeConfig(config);

    return NextResponse.json({
      useSSL: config.domains.useSSL,
      pathPrefix: config.domains.pathPrefix,
      defaultDomain: config.domains.defaultDomain,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Erreur lors de la mise à jour de la configuration" },
      { status: 500 }
    );
  }
}
