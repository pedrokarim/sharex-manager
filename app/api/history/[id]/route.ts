import { NextRequest, NextResponse } from "next/server";
import { deleteHistoryEntry, getAllHistory } from "@/lib/history";
import { auth } from "@/auth";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  try {
    const { id } = await params;

    // Vérification d'ownership : seul le propriétaire ou un admin peut supprimer
    const history = await getAllHistory();
    const entry = history.find((e) => e.id === id);
    if (!entry) {
      return NextResponse.json(
        { error: "Enregistrement non trouvé" },
        { status: 404 }
      );
    }

    if (entry.userId && entry.userId !== session.user.id && session.user.role !== "admin") {
      return NextResponse.json({ error: "Accès interdit" }, { status: 403 });
    }

    const success = await deleteHistoryEntry(id);

    if (!success) {
      return NextResponse.json(
        { error: "Enregistrement non trouvé" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: "Erreur lors de la suppression" },
      { status: 500 }
    );
  }
}
