import { NextRequest, NextResponse } from "next/server";
import { isAdmin, withAuth } from "@/lib/api-guard";
import { historyOwnedBy } from "@/lib/file-ownership";
import { deleteHistoryEntry, getAllHistory } from "@/lib/history";

export const DELETE = withAuth(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
  session
) => {
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

    // Une entrée sans propriétaire connu (clé supprimée, envoi ancien) n'est
    // retirée que par un admin.
    if (!isAdmin(session) && (await historyOwnedBy([entry], session.user.id)).length === 0) {
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
});
