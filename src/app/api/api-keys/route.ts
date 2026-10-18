import { isAdmin, withAuth } from "@/lib/api-guard";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { ApiKeyPermissions, CreatedApiKey } from "@/types/api-key";
import { logDb } from "@/lib/utils/db";
import { raiseAlert } from "@/lib/security/alerts";
import { apiKeyExpiry } from "@/lib/security/settings";
import { createApiKey, loadApiKeys, toApiKeyView } from "@/lib/api-key-store";

/**
 * Clés API du compte connecté (toutes pour un admin).
 *
 * La clé est tirée par le serveur ; une clé envoyée par le client est
 * ignorée. Elle n'est remise qu'une fois, dans la réponse de création : le
 * serveur n'en garde que l'empreinte.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

const permissionsSchema = z
  .object({
    uploadImages: z.boolean().default(false),
    uploadText: z.boolean().default(false),
    uploadFiles: z.boolean().default(false),
    extractColors: z.boolean().default(false),
  })
  // Une permission inconnue est refusée plutôt qu'enregistrée telle quelle.
  .strict()
  .refine((value) => Object.values(value).some(Boolean), {
    message: "Choisissez au moins une permission.",
  });

const createSchema = z.object({
  name: z.string().trim().min(1, "Le nom est requis").max(100),
  permissions: permissionsSchema,
  /** Durée de vie demandée, en jours ; `null` : sans expiration (si les réglages le permettent). */
  expiresInDays: z.number().int().min(1).max(3650).nullable().optional(),
  /** Ancienne forme : une date d'expiration. */
  expiresAt: z.string().nullable().optional(),
});

/** Durée demandée en jours : `undefined` (rien demandé : durée par défaut), `null` (sans expiration) ou un nombre. */
function requestedDays(data: z.infer<typeof createSchema>, now: Date): number | null | undefined | "invalid" {
  if (data.expiresInDays !== undefined) return data.expiresInDays;
  if (data.expiresAt === undefined) return undefined;
  if (data.expiresAt === null || data.expiresAt === "") return null;
  const date = new Date(data.expiresAt);
  if (Number.isNaN(date.getTime()) || date.getTime() <= now.getTime()) return "invalid";
  return Math.max(1, Math.ceil((date.getTime() - now.getTime()) / DAY_MS));
}

// GET /api/api-keys
export const GET = withAuth(async (_request: Request, _context: unknown, session) => {
  try {
    // Un admin voit toutes les clés ; un autre compte, seulement les siennes.
    const keys = await loadApiKeys();
    const visible = isAdmin(session) ? keys : keys.filter((key) => key.createdBy === session.user.id);
    return NextResponse.json(visible.map(toApiKeyView));
  } catch (error) {
    logDb.createLog({
      level: "error",
      action: "system.error",
      message: "Erreur lors de la récupération des clés API",
      userId: session?.user?.id || undefined,
      userEmail: session?.user?.email || undefined,
      metadata: {
        error: error instanceof Error ? error.message : "Unknown error",
      },
    });
    return new Response("Erreur serveur", { status: 500 });
  }
});

// POST /api/api-keys
export const POST = withAuth(async (request: NextRequest, _context: unknown, session) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Requête invalide" }, { status: 400 });
  }

  const now = new Date();
  const days = requestedDays(parsed.data, now);
  if (days === "invalid") {
    return NextResponse.json({ error: "La date d’expiration doit être dans le futur." }, { status: 400 });
  }

  try {
    const { record, secret } = await createApiKey({
      name: parsed.data.name,
      permissions: parsed.data.permissions as ApiKeyPermissions,
      // Durée par défaut et durée maximale de l'écran Sécurité.
      expiresAt: apiKeyExpiry(days, now),
      createdBy: session.user.id || "system",
    });
    void raiseAlert("newApiKey", { userId: session.user.id, userEmail: session.user.email, keyId: record.id, keyName: record.name });

    logDb.createLog({
      level: "info",
      action: "api.request",
      message: `Création d'une nouvelle clé API: ${record.name}`,
      userId: session.user.id || undefined,
      userEmail: session.user.email || undefined,
      metadata: {
        keyId: record.id,
        keyName: record.name,
        permissions: record.permissions,
        expiresAt: record.expiresAt,
      },
    });

    const created: CreatedApiKey = { ...toApiKeyView(record), key: secret };
    return NextResponse.json(created, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logDb.createLog({
      level: "error",
      action: "system.error",
      message: "Erreur lors de la création d'une clé API",
      userId: session?.user?.id || undefined,
      userEmail: session?.user?.email || undefined,
      metadata: {
        error: error instanceof Error ? error.message : "Unknown error",
      },
    });
    return new Response("Erreur serveur", { status: 500 });
  }
});
