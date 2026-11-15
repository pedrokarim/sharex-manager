/**
 * Morceaux communs aux routes des tags et des collections : erreurs, droits,
 * présence d'un fichier.
 */
import { existsSync } from "fs";
import { join } from "path";
import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdmin } from "@/lib/api-guard";
import type { Session } from "@/lib/auth";
import { getAbsoluteUploadPath } from "@/lib/config";
import { OrganizationError, isPlainFileName } from "./rules";
import type { Tag } from "./types";

export const idSchema = z.coerce.number().int().positive();

export const NO_STORE = { "Cache-Control": "no-store" };

/** Réponse d'erreur : 400 pour une demande invalide, 500 sinon (journalisée). */
export function organizationErrorResponse(error: unknown, fallback: string): NextResponse {
  if (error instanceof z.ZodError) {
    return NextResponse.json({ error: "Données invalides", details: error.issues }, { status: 400 });
  }
  if (error instanceof OrganizationError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
  }
  if (error instanceof SyntaxError) {
    return NextResponse.json({ error: "Corps de la requête illisible" }, { status: 400 });
  }
  console.error(fallback, error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

export function notFound(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 404 });
}

/** Renommer, décrire, supprimer un tag : son créateur ou un admin. */
export function canEditTag(session: Session, tag: Pick<Tag, "createdBy">): boolean {
  return isAdmin(session) || (tag.createdBy !== null && tag.createdBy === session.user.id);
}

/** Vrai si ce nom désigne un fichier présent dans le dossier d'envoi. */
export function uploadExists(name: string): boolean {
  return isPlainFileName(name) && existsSync(join(getAbsoluteUploadPath(), name));
}
