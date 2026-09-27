import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { toggleFileStarred } from "@/lib/starred-files";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return new Response("Non autorisé", { status: 401 });
    }

    const { filename } = await params;
    const formData = await request.formData();
    const isStarred = formData.get("isStarred") === "true";

    await toggleFileStarred(filename, isStarred);

    return NextResponse.json({
      success: true,
      isStarred,
    });
  } catch (error) {
    console.error("Erreur lors de la modification des favoris:", error);
    return new Response("Erreur serveur", { status: 500 });
  }
}
