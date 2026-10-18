import type { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { requireAccess } from "@/lib/api-guard";
import { logDb } from "@/lib/utils/db";
import { listAppUsers, toPublicUser, type AppUser } from "@/lib/admin-users";
import { checkPassword, hashPassword } from "@/lib/security/password-policy";
import { revokeApiKeysOfUser } from "@/lib/api-key-store";

/**
 * Comptes de l'application, gérés par un administrateur.
 *
 * Les comptes vivent dans la base d'authentification (better-auth).
 * `data/users.json` ne sert qu'au premier démarrage : il n'est importé que
 * tant que la base est vide. Y écrire, comme le faisait cette route,
 * donnait des comptes qui ne pouvaient jamais se connecter.
 *
 * Le mot de passe suit la politique de l'écran Sécurité (longueur minimale,
 * refus des mots de passe courants : `lib/security/password-policy.ts`).
 */

const userSchema = z.object({
  username: z.string().min(3),
  password: z.string(),
  role: z.enum(["admin", "user"]),
});

const updateUserSchema = z.object({
  id: z.string(),
  username: z.string().min(3),
  // Vide : le mot de passe ne change pas.
  password: z
    .string()
    .optional()
    .transform((value) => (value ? value : undefined)),
  role: z.enum(["admin", "user"]),
});

/** Refus de la politique des mots de passe, prêt à renvoyer ; `null` si le mot de passe convient. */
function passwordRejection(password: string) {
  const check = checkPassword(password);
  return check.ok ? null : Response.json({ error: check.message }, { status: 400 });
}

/** Même adresse synthétique que l'import des comptes historiques (lib/auth-migrate.ts). */
function syntheticEmail(username: string) {
  return `${username.toLowerCase()}@local.sharex-manager`;
}

async function findByUsername(username: string): Promise<AppUser | null> {
  const ctx = await auth.$context;
  return ctx.adapter.findOne<AppUser>({
    model: "user",
    where: [{ field: "username", value: username.toLowerCase() }],
  });
}

function badRequest(error: unknown) {
  if (error instanceof z.ZodError) {
    return Response.json({ error: error.issues }, { status: 400 });
  }
  // Refus de better-auth (nom d'utilisateur invalide…) : c'est une erreur de saisie.
  const apiError = error as { statusCode?: number; body?: { message?: string } };
  if (apiError?.statusCode === 400) {
    const message = apiError.body?.message === "Username is invalid"
      ? "Nom d’utilisateur invalide : lettres, chiffres, « _ » et « . » uniquement."
      : apiError.body?.message ?? "Requête invalide";
    return Response.json({ error: message }, { status: 400 });
  }
  console.error("[admin/users]", error);
  return Response.json({ error: "Internal server error" }, { status: 500 });
}

export async function GET() {
  const guard = await requireAccess("admin");
  if (!guard.ok) return guard.response;
  return Response.json(await listAppUsers());
}

export async function POST(req: NextRequest) {
  const guard = await requireAccess("admin");
  if (!guard.ok) return guard.response;
  const session = guard.session;

  try {
    const data = userSchema.parse(await req.json());
    const rejected = passwordRejection(data.password);
    if (rejected) return rejected;
    if (await findByUsername(data.username)) {
      return Response.json({ error: "Username already exists" }, { status: 400 });
    }

    const ctx = await auth.$context;
    const now = new Date();
    // Appel interne : le hook de better-auth garde le rôle fourni (voir lib/auth.ts).
    const created = (await ctx.internalAdapter.createUser({
      name: data.username,
      email: syntheticEmail(data.username),
      emailVerified: true,
      username: data.username.toLowerCase(),
      displayUsername: data.username,
      role: data.role,
      createdAt: now,
      updatedAt: now,
    })) as AppUser;
    await ctx.internalAdapter.createAccount({
      userId: created.id,
      providerId: "credential",
      accountId: created.id,
      password: await hashPassword(data.password),
      createdAt: now,
      updatedAt: now,
    });

    logDb.createLog({
      level: "info",
      action: "user.create",
      message: `Création de l'utilisateur : ${data.username}`,
      userId: session.user.id,
      userEmail: session.user.email,
      metadata: { createdUserId: created.id, username: data.username, role: data.role },
    });
    return Response.json(toPublicUser(created));
  } catch (error) {
    return badRequest(error);
  }
}

export async function PUT(req: NextRequest) {
  const guard = await requireAccess("admin");
  if (!guard.ok) return guard.response;
  const session = guard.session;

  try {
    const data = updateUserSchema.parse(await req.json());
    if (data.password) {
      const rejected = passwordRejection(data.password);
      if (rejected) return rejected;
    }
    const ctx = await auth.$context;
    const existing = (await ctx.internalAdapter.findUserById(data.id)) as AppUser | null;
    if (!existing) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }
    const other = await findByUsername(data.username);
    if (other && other.id !== data.id) {
      return Response.json({ error: "Username already exists" }, { status: 400 });
    }
    if (session.user.id === data.id && data.role !== "admin") {
      return Response.json({ error: "You cannot remove your own admin role" }, { status: 400 });
    }

    // Le nom n'est envoyé que s'il change : le plugin username refuse un nom
    // « déjà pris »… par le compte lui-même.
    const renamed = (existing.username ?? "") !== data.username.toLowerCase();
    const updated = (await ctx.internalAdapter.updateUser(data.id, {
      ...(renamed
        ? { username: data.username.toLowerCase(), displayUsername: data.username, name: data.username }
        : {}),
      role: data.role,
      updatedAt: new Date(),
    })) as AppUser;

    let revokedSessions = 0;
    if (data.password) {
      const hash = await hashPassword(data.password);
      const accounts = await ctx.internalAdapter.findAccounts(data.id);
      if (accounts.some((account: { providerId: string }) => account.providerId === "credential")) {
        await ctx.internalAdapter.updatePassword(data.id, hash);
      } else {
        await ctx.internalAdapter.createAccount({
          userId: data.id,
          providerId: "credential",
          accountId: data.id,
          password: hash,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
      // Comme `scripts/auth-set-password.ts` : les sessions ouvertes avec
      // l'ancien mot de passe sont fermées. Pour son propre compte, l'admin
      // garde la session en cours.
      const sessions = await ctx.internalAdapter.listSessions(data.id);
      const toRevoke = sessions.filter(
        (item: { id: string }) => !(session.user.id === data.id && item.id === session.session.id)
      );
      if (toRevoke.length > 0) {
        await ctx.internalAdapter.deleteSessions(toRevoke.map((item: { token: string }) => item.token));
      }
      revokedSessions = toRevoke.length;
    }

    logDb.createLog({
      level: "info",
      action: "user.update",
      message: `Modification de l'utilisateur : ${data.username}`,
      userId: session.user.id,
      userEmail: session.user.email,
      metadata: { targetUserId: data.id, role: data.role, passwordChanged: Boolean(data.password), revokedSessions },
    });
    return Response.json(toPublicUser(updated ?? { ...existing, ...data }));
  } catch (error) {
    return badRequest(error);
  }
}

export async function DELETE(req: NextRequest) {
  const guard = await requireAccess("admin");
  if (!guard.ok) return guard.response;
  const session = guard.session;

  const id = new URL(req.url).searchParams.get("id");
  if (!id) {
    return Response.json({ error: "ID is required" }, { status: 400 });
  }
  if (session.user.id === id) {
    return Response.json({ error: "You cannot delete your own account" }, { status: 400 });
  }

  const ctx = await auth.$context;
  const existing = (await ctx.internalAdapter.findUserById(id)) as AppUser | null;
  if (!existing) {
    return Response.json({ error: "User not found" }, { status: 404 });
  }
  // Supprime aussi ses sessions et ses comptes rattachés.
  await ctx.internalAdapter.deleteUser(id);
  // Ses clés API cessent de fonctionner avec lui.
  let revokedApiKeys = 0;
  try {
    revokedApiKeys = (await revokeApiKeysOfUser(id)).length;
  } catch (error) {
    console.error("[admin/users] clés API non révoquées :", error instanceof Error ? error.message : error);
  }

  logDb.createLog({
    level: "info",
    action: "user.delete",
    message: `Suppression de l'utilisateur : ${toPublicUser(existing).username}`,
    userId: session.user.id,
    userEmail: session.user.email,
    metadata: { targetUserId: id, revokedApiKeys },
  });
  return Response.json({ success: true });
}
