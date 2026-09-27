/**
 * Comptes de l'application tels que l'administration les affiche, lus dans
 * la base d'authentification (better-auth), sans aucun secret.
 */

import { auth } from "@/lib/auth";

export interface AppUser {
  id: string;
  username?: string | null;
  displayUsername?: string | null;
  name?: string | null;
  email?: string | null;
  role?: string | null;
  createdAt?: Date | string;
}

/** Forme attendue par la page d'administration, sans aucun secret. */
export function toPublicUser(user: AppUser) {
  return {
    id: user.id,
    username: user.displayUsername || user.username || user.name || user.email || user.id,
    email: user.email ?? undefined,
    role: (user.role === "admin" ? "admin" : "user") as "admin" | "user",
    createdAt: user.createdAt,
  };
}

/** Tous les comptes, sans secret. Partagé avec la page d'administration. */
export async function listAppUsers() {
  const ctx = await auth.$context;
  const users = await ctx.internalAdapter.listUsers(500, 0, { field: "createdAt", direction: "asc" });
  return (users as AppUser[]).map(toPublicUser);
}

