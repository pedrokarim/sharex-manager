/**
 * Journal des actions sur les comptes connectés (connexion, déconnexion,
 * publication…), dans le journal d'administration. Jamais de jeton ni de
 * secret : le nom du compte et du service suffisent.
 *
 * Réservé aux routes et aux actions serveur : le journal s'appuie sur
 * `bun:sqlite`, absent des tests sous Node.
 */

import { logDb } from "@/lib/utils/db";

export function auditConnection(
  session: { user?: { id?: string | null; email?: string | null } } | null | undefined,
  message: string,
  metadata?: Record<string, unknown>,
  level: "info" | "warning" | "error" = "info"
) {
  try {
    logDb.createLog({
      level,
      action: "admin.action",
      message,
      userId: session?.user?.id ?? undefined,
      userEmail: session?.user?.email ?? undefined,
      metadata,
    });
  } catch (error) {
    console.error("[connections] journal indisponible :", error instanceof Error ? error.message : error);
  }
}
