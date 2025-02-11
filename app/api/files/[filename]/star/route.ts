import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { toggleFileStarred } from "@/lib/starred-files";

export async function PUT(
  request: Request,
  { params }: { params: { filename: string } }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return new Response("Non autorisé", { status: 401 });
    }

    const formData = await request.formData();
    const isStarred = formData.get("isStarred") === "true";

    await toggleFileStarred(params.filename, isStarred);

    return NextResponse.json({
      success: true,
      isStarred,
    });
  } catch (error) {
    console.error("Erreur lors de la modification des favoris:", error);
    return new Response("Erreur serveur", { status: 500 });
  }
}
