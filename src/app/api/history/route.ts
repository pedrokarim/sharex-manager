import { NextRequest, NextResponse } from "next/server";
import { getAllHistory, searchHistory, toClientHistoryEntry } from "@/lib/history";
import { isAdmin, withAuth } from "@/lib/api-guard";
import { historyOwnedBy } from "@/lib/file-ownership";

/** Champs de tri acceptés ; l'adresse IP n'est triable que par un admin. */
const SORT_FIELDS = new Set(["uploadDate", "filename", "originalFilename", "fileSize", "mimeType", "uploadMethod", "userName"]);

export const GET = withAuth(async (request: NextRequest, _context, session) => {
  try {
    const admin = isAdmin(session);
    const { searchParams } = new URL(request.url);

    const isStatsRequest = searchParams.get("stats") === "true";
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "25");
    const requestedSort = searchParams.get("sortField") || "uploadDate";
    const sortField =
      SORT_FIELDS.has(requestedSort) || (admin && requestedSort === "ipAddress") ? requestedSort : "uploadDate";
    const sortOrder = searchParams.get("sortOrder") || "desc";

    // Si c'est une requête pour les stats, on utilise les dates fournies ou les 30 derniers jours par défaut
    const filters = {
      startDate: searchParams.get("startDate")
        ? new Date(searchParams.get("startDate")!)
        : isStatsRequest
          ? new Date(new Date().setDate(new Date().getDate() - 30))
          : undefined,
      endDate: searchParams.get("endDate")
        ? new Date(searchParams.get("endDate")!)
        : undefined,
      // Le filtre par compte est réservé aux admins : les autres ne voient
      // de toute façon que leurs propres envois.
      userId: admin ? searchParams.get("userId") || undefined : undefined,
      uploadMethod: searchParams.get("uploadMethod") as
        | "api"
        | "web"
        | "sharex"
        | undefined,
      searchQuery: searchParams.get("q") || undefined,
    };

    let allItems =
      filters.startDate ||
      filters.endDate ||
      filters.userId ||
      filters.uploadMethod ||
      filters.searchQuery
        ? await searchHistory(filters)
        : await getAllHistory();

    // Un compte qui n'est pas admin ne voit que ses envois (interface et clés API).
    if (!admin) allItems = await historyOwnedBy(allItems, session.user.id);

    // Trier les éléments
    allItems = allItems.sort((a, b) => {
      const aValue = a[sortField as keyof typeof a];
      const bValue = b[sortField as keyof typeof b];

      if (aValue === undefined || bValue === undefined) return 0;

      const comparison = aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      return sortOrder === "desc" ? -comparison : comparison;
    });

    // Jamais de jeton de suppression ; l'adresse IP pour un admin seulement.
    const visible = allItems.map((entry) => toClientHistoryEntry(entry, admin));

    // Si c'est une requête pour les stats, on renvoie tous les éléments
    if (isStatsRequest) {
      return NextResponse.json({
        items: visible,
        total: visible.length,
      });
    }

    // Sinon, on applique la pagination normale
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const items = visible.slice(startIndex, endIndex);

    return NextResponse.json({
      items,
      total: visible.length,
      page,
      pageSize,
      totalPages: Math.ceil(visible.length / pageSize),
      sortField,
      sortOrder,
    });
  } catch (error) {
    console.error("Erreur lors de la récupération de l'historique:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération de l'historique" },
      { status: 500 }
    );
  }
});
