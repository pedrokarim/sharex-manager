import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import { nanoid } from "nanoid";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { logDb } from "@/lib/utils/db";

const userSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(6),
  role: z.enum(["admin", "user"]),
});

const updateUserSchema = z.object({
  id: z.string(),
  username: z.string().min(3),
  password: z.string().min(6).optional(),
  role: z.enum(["admin", "user"]),
});

const usersPath = join(process.cwd(), "data/users.json");

export async function POST(req: NextRequest) {
  const session = await auth();

  if (!session?.user?.role || session.user.role !== "admin") {
    logDb.createLog({
      level: "warning",
      action: "admin.action",
      message: "Tentative de création d'utilisateur non autorisée",
      userId: session?.user?.id || undefined,
      userEmail: session?.user?.email || undefined,
    });
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const data = userSchema.parse(body);

    const users = JSON.parse(readFileSync(usersPath, "utf-8"));

    if (users.some((u: any) => u.username === data.username)) {
      logDb.createLog({
        level: "warning",
        action: "user.create",
        message: `Tentative de création d'un utilisateur avec un nom déjà existant: ${data.username}`,
        userId: session.user.id || undefined,
        userEmail: session.user.email || undefined,
        metadata: { username: data.username },
      });
      return Response.json(
        { error: "Username already exists" },
        { status: 400 }
      );
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);

    const newUser = {
      id: `usr_${nanoid()}`,
      ...data,
      password: hashedPassword,
    };

    users.push(newUser);
    writeFileSync(usersPath, JSON.stringify(users, null, 2));

    logDb.createLog({
      level: "info",
      action: "user.create",
      message: `Création de l'utilisateur: ${newUser.username}`,
      userId: session.user.id || undefined,
      userEmail: session.user.email || undefined,
      metadata: {
        createdUserId: newUser.id,
        username: newUser.username,
        role: newUser.role,
      },
    });

    return Response.json(newUser);
  } catch (error) {
    logDb.createLog({
      level: "error",
      action: "system.error",
      message: "Erreur lors de la création d'un utilisateur",
      userId: session?.user?.id || undefined,
      userEmail: session?.user?.email || undefined,
      metadata: {
        error: error instanceof Error ? error.message : "Unknown error",
      },
    });
    if (error instanceof z.ZodError) {
      return Response.json({ error: error.errors }, { status: 400 });
    }
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const session = await auth();

  if (!session?.user?.role || session.user.role !== "admin") {
    logDb.createLog({
      level: "warning",
      action: "admin.action",
      message: "Tentative de modification d'utilisateur non autorisée",
      userId: session?.user?.id || undefined,
      userEmail: session?.user?.email || undefined,
    });
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const data = updateUserSchema.parse(body);

    const users = JSON.parse(readFileSync(usersPath, "utf-8"));
    const userIndex = users.findIndex((u: any) => u.id === data.id);

    if (userIndex === -1) {
      logDb.createLog({
        level: "warning",
        action: "user.update",
        message: "Tentative de modification d'un utilisateur inexistant",
        userId: session.user.id || undefined,
        userEmail: session.user.email || undefined,
        metadata: { targetUserId: data.id },
      });
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    // Vérifier si le nouveau nom d'utilisateur existe déjà (sauf pour l'utilisateur actuel)
    if (
      users.some((u: any) => u.id !== data.id && u.username === data.username)
    ) {
      logDb.createLog({
        level: "warning",
        action: "user.update",
        message: `Tentative de modification avec un nom d'utilisateur déjà existant: ${data.username}`,
        userId: session.user.id || undefined,
        userEmail: session.user.email || undefined,
        metadata: {
          targetUserId: data.id,
          newUsername: data.username,
        },
      });
      return Response.json(
        { error: "Username already exists" },
        { status: 400 }
      );
    }

    // Mettre à jour l'utilisateur
    const updatedUser = {
      ...users[userIndex],
      username: data.username,
      role: data.role,
    };

    // Hash du nouveau mot de passe si fourni
    if (data.password) {
      updatedUser.password = await bcrypt.hash(data.password, 10);
    }

    users[userIndex] = updatedUser;
    writeFileSync(usersPath, JSON.stringify(users, null, 2));

    logDb.createLog({
      level: "info",
      action: "user.update",
      message: `Modification de l'utilisateur: ${updatedUser.username}`,
      userId: session.user.id || undefined,
      userEmail: session.user.email || undefined,
      metadata: {
        targetUserId: data.id,
        username: updatedUser.username,
        role: updatedUser.role,
        passwordChanged: !!data.password,
      },
    });

    return Response.json(updatedUser);
  } catch (error) {
    logDb.createLog({
      level: "error",
      action: "system.error",
      message: "Erreur lors de la modification d'un utilisateur",
      userId: session.user.id || undefined,
      userEmail: session.user.email || undefined,
      metadata: {
        error: error instanceof Error ? error.message : "Unknown error",
      },
    });
    if (error instanceof z.ZodError) {
      return Response.json({ error: error.errors }, { status: 400 });
    }
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await auth();

  if (!session?.user?.role || session.user.role !== "admin") {
    logDb.createLog({
      level: "warning",
      action: "admin.action",
      message: "Tentative de suppression d'utilisateur non autorisée",
      userId: session?.user?.id || undefined,
      userEmail: session?.user?.email || undefined,
    });
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      logDb.createLog({
        level: "warning",
        action: "user.delete",
        message: "Tentative de suppression d'utilisateur sans ID",
        userId: session.user.id || undefined,
        userEmail: session.user.email || undefined,
      });
      return Response.json({ error: "ID is required" }, { status: 400 });
    }

    if (session.user.id === id) {
      logDb.createLog({
        level: "warning",
        action: "user.delete",
        message: "Tentative de suppression de son propre compte",
        userId: session.user.id || undefined,
        userEmail: session.user.email || undefined,
      });
      return Response.json(
        { error: "You cannot delete your own account" },
        { status: 400 }
      );
    }

    const users = JSON.parse(readFileSync(usersPath, "utf-8"));
    const userToDelete = users.find((u: any) => u.id === id);
    const filteredUsers = users.filter((u: any) => u.id !== id);

    if (filteredUsers.length === users.length) {
      logDb.createLog({
        level: "warning",
        action: "user.delete",
        message: "Tentative de suppression d'un utilisateur inexistant",
        userId: session.user.id || undefined,
        userEmail: session.user.email || undefined,
        metadata: { targetUserId: id },
      });
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    writeFileSync(usersPath, JSON.stringify(filteredUsers, null, 2));

    logDb.createLog({
      level: "info",
      action: "user.delete",
      message: `Suppression de l'utilisateur: ${userToDelete.username}`,
      userId: session.user.id || undefined,
      userEmail: session.user.email || undefined,
      metadata: {
        deletedUserId: id,
        username: userToDelete.username,
        role: userToDelete.role,
      },
    });

    return Response.json({ success: true });
  } catch (error) {
    logDb.createLog({
      level: "error",
      action: "system.error",
      message: "Erreur lors de la suppression d'un utilisateur",
      userId: session.user.id || undefined,
      userEmail: session.user.email || undefined,
      metadata: {
        error: error instanceof Error ? error.message : "Unknown error",
      },
    });
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const session = await auth();

  if (!session?.user?.role || session.user.role !== "admin") {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const users = JSON.parse(readFileSync(usersPath, "utf-8"));
  return Response.json(users);
}
