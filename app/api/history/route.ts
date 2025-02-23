import { NextRequest, NextResponse } from "next/server";
import { getAllHistory, searchHistory } from "@/lib/history";
import { auth } from "@/auth";

export async function GET(request: NextRequest) {
  const session = await auth();

  if (!session) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);

    const isStatsRequest = searchParams.get("stats") === "true";
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "25");
    const sortField = searchParams.get("sortField") || "uploadDate";
    const sortOrder = searchParams.get("sortOrder") || "desc";

    // Si c'est une requête pour les stats, on force les filtres pour les 30 derniers jours
    const filters = {
      startDate: isStatsRequest
        ? new Date(new Date().setDate(new Date().getDate() - 30))
        : searchParams.get("startDate")
        ? new Date(searchParams.get("startDate")!)
        : undefined,
      endDate: searchParams.get("endDate")
        ? new Date(searchParams.get("endDate")!)
        : undefined,
      userId: searchParams.get("userId") || undefined,
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

    // Trier les éléments
    allItems = allItems.sort((a, b) => {
      const aValue = a[sortField as keyof typeof a];
      const bValue = b[sortField as keyof typeof b];

      if (aValue === undefined || bValue === undefined) return 0;

      const comparison = aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      return sortOrder === "desc" ? -comparison : comparison;
    });

    // Si c'est une requête pour les stats, on renvoie tous les éléments
    if (isStatsRequest) {
      return NextResponse.json({
        items: allItems,
        total: allItems.length,
      });
    }

    // Sinon, on applique la pagination normale
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const items = allItems.slice(startIndex, endIndex);

    return NextResponse.json({
      items,
      total: allItems.length,
      page,
      pageSize,
      totalPages: Math.ceil(allItems.length / pageSize),
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
}
