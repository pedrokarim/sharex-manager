import { auth } from "@/auth";
import { unlink } from "fs/promises";
import { join } from "path";
import { NextRequest } from "next/server";

const UPLOADS_DIR = join(process.cwd(), "public/uploads");

export async function DELETE(
  request: NextRequest,
  { params }: { params: { filename: string } }
) {
  try {
    const session = await auth();
    if (!session) {
      return new Response("Non autorisé", { status: 401 });
    }

    const filePath = join(UPLOADS_DIR, params.filename);
    await unlink(filePath);

    return new Response(null, { status: 204 });
  } catch (error) {
    return new Response("Erreur lors de la suppression", { status: 500 });
  }
}
