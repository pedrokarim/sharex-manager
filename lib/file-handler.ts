import { createReadStream } from "fs";
import { stat } from "fs/promises";
import { Duplex } from "node:stream";
import type { NextRequest } from "next/server";

export interface ClientInfo {
	ip: string;
	userAgent: string;
	referer: string;
	method: string;
	url: string;
	timestamp: string;
}

export function getClientInfo(request: NextRequest): ClientInfo {
	const ip =
		request.ip ||
		request.headers.get("x-forwarded-for") ||
		request.headers.get("x-real-ip") ||
		"IP inconnue";

	const userAgent = request.headers.get("user-agent") || "User-Agent inconnu";
	const referer = request.headers.get("referer") || "Referer inconnu";

	return {
		ip,
		userAgent,
		referer,
		method: request.method,
		url: request.url,
		timestamp: new Date().toISOString(),
	};
}

const mimeTypes: { [key: string]: string } = {
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	png: "image/png",
	gif: "image/gif",
	webp: "image/webp",
	pdf: "application/pdf",
	txt: "text/plain",
};

interface ServeFileOptions {
	filePath: string;
	filename: string;
	clientInfo?: ClientInfo;
	fallbackPath?: string;
	enableLogging?: boolean;
	cacheControl?: string;
}

export async function serveFile({
	filePath,
	filename,
	clientInfo,
	fallbackPath,
	enableLogging = false,
	cacheControl = "public, max-age=31536000",
}: ServeFileOptions): Promise<Response> {
	let fileStream;

	try {
		// Vérifier si le fichier existe
		const stats = await stat(filePath);
		if (!stats.isFile()) {
			if (enableLogging) {
				console.log("Requête échouée :", {
					...clientInfo,
					filename,
					error: "Fichier non trouvé",
					status: "échec",
				});
			}
			return fallbackPath
				? await serveFallbackFile(fallbackPath)
				: new Response("Not found", { status: 404 });
		}

		// Vérifier l'extension et le type MIME
		const ext = filename.split(".").pop()?.toLowerCase();
		const contentType = mimeTypes[ext || ""] || "application/octet-stream";

		// Créer un stream de lecture du fichier
		fileStream = createReadStream(filePath);

		// Créer un Duplex stream pour gérer le flux de données
		const stream = new Duplex({
			read() {},
			write(chunk, encoding, callback) {
				this.push(chunk, encoding);
				callback();
			},
			final(callback) {
				this.push(null);
				callback();
			},
		});

		fileStream.pipe(stream);

		if (enableLogging) {
			console.log("Requête réussie :", {
				...clientInfo,
				filename,
				fileSize: stats.size,
				contentType,
				status: "succès",
			});
		}

		return new Response(stream as unknown as ReadableStream, {
			headers: {
				"Content-Type": contentType,
				"Content-Length": stats.size.toString(),
				...(cacheControl ? { "Cache-Control": cacheControl } : {}),
			},
		});
	} catch (error) {
		if (fileStream) {
			fileStream.destroy();
		}

		if (enableLogging) {
			console.error("Erreur critique :", {
				...clientInfo,
				filename,
				error: error instanceof Error ? error.message : "Erreur inconnue",
				status: "erreur critique",
			});
		}

		return fallbackPath
			? await serveFallbackFile(fallbackPath)
			: new Response("File not found", { status: 404 });
	}
}

async function serveFallbackFile(fallbackPath: string): Promise<Response> {
	try {
		const fileStream = createReadStream(fallbackPath);
		const stats = await stat(fallbackPath);

		return new Response(fileStream as any, {
			headers: {
				"Content-Type": "image/png",
				"Content-Length": stats.size.toString(),
			},
		});
	} catch {
		return new Response("File not found", { status: 404 });
	}
}
