import { join } from "node:path";
import type { NextRequest } from "next/server";
import { getAbsoluteUploadPath } from "@/lib/config";
import { serveFile } from "@/lib/file-handler";

const UPLOADS_DIR = getAbsoluteUploadPath();

export async function GET(
	request: NextRequest,
	{ params }: { params: { filename: string } },
) {
	// Sécurisation : on ne prend que le nom du fichier, sans chemin
	const filename = params.filename.replace(/[/\\]/g, "");
	const filePath = join(UPLOADS_DIR, filename);

	return serveFile({
		filePath,
		filename,
		enableLogging: false,
	});
}
