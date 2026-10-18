import { withAuth } from "@/lib/api-guard";
import { NextResponse } from "next/server";
import { toggleFileStarred } from "@/lib/starred-files";

export const PUT = withAuth(async (
  request: Request,
  { params }: { params: Promise<{ filename: string }> },
  session
) => {
  try {
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
});
