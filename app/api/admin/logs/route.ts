import type { NextRequest } from "next/server";
import { logDb } from "@/lib/utils/db";
import { logger } from "@/lib/utils/logger";
import type { Log } from "@/lib/types/logs";
import { auth } from "@/auth";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user || session.user.role !== "admin") {
      return Response.json({ error: "Non autorisé" }, { status: 401 });
    }

    const searchParams = req.nextUrl.searchParams;
    const limit = Number.parseInt(searchParams.get("limit") || "50", 10);
    const offset = Number.parseInt(searchParams.get("offset") || "0", 10);
    const level = searchParams.get("level");
    const action = searchParams.get("action");
    const userId = searchParams.get("userId");
    const search = searchParams.get("search");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const logs = logDb.getLogs(limit, offset, {
      level: level || undefined,
      action: action || undefined,
      userId: userId || undefined,
      search: search || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    });

    // await logger.logAdminAction("admin.action", "Consultation des logs", {
    //   adminId: session.user.id || "",
    //   adminEmail: session.user.email || "",
    //   targetResource: "logs",
    //   changes: {
    //     filters: { level, action, userId, limit, offset },
    //   },
    // });

    return Response.json(logs);
  } catch (error) {
    console.error("Erreur lors de la récupération des logs:", error);
    return Response.json(
      { error: "Erreur lors de la récupération des logs" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user || session.user.role !== "admin") {
      return Response.json({ error: "Non autorisé" }, { status: 401 });
    }

    if (!session.user.id || !session.user.email) {
      return Response.json({ error: "Session invalide" }, { status: 401 });
    }

    logDb.clearLogs();

    await logger.logAdminAction(
      "admin.action",
      "Suppression de tous les logs",
      {
        adminId: session.user.id,
        adminEmail: session.user.email,
      }
    );

    return Response.json({ message: "Logs supprimés avec succès" });
  } catch (error) {
    console.error("Erreur lors de la suppression des logs:", error);
    return Response.json(
      { error: "Erreur lors de la suppression des logs" },
      { status: 500 }
    );
  }
}
