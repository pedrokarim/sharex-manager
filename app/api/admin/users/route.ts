import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { nanoid } from "nanoid";
import { z } from "zod";

const userSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(6),
  role: z.enum(["admin", "user"]),
});

const usersPath = join(process.cwd(), "data/users.json");

export async function POST(req: NextRequest) {
  const session = await auth();

  if (!session?.user?.role || session.user.role !== "admin") {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const data = userSchema.parse(body);

    const users = JSON.parse(readFileSync(usersPath, "utf-8"));

    if (users.some((u: any) => u.username === data.username)) {
      return Response.json(
        { error: "Username already exists" },
        { status: 400 }
      );
    }

    const newUser = {
      id: `usr_${nanoid()}`,
      ...data,
    };

    users.push(newUser);
    writeFileSync(usersPath, JSON.stringify(users, null, 2));

    return Response.json(newUser);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: error.errors }, { status: 400 });
    }
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await auth();

  if (!session?.user?.role || session.user.role !== "admin") {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return Response.json({ error: "ID is required" }, { status: 400 });
    }

    const users = JSON.parse(readFileSync(usersPath, "utf-8"));
    const filteredUsers = users.filter((u: any) => u.id !== id);

    if (filteredUsers.length === users.length) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    writeFileSync(usersPath, JSON.stringify(filteredUsers, null, 2));
    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
