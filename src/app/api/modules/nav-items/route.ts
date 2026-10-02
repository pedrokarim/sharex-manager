import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { readModuleNavEntries } from "@/lib/modules/nav-items";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  try {
    return NextResponse.json({ items: await readModuleNavEntries() });
  } catch (error) {
    console.error("Error fetching module nav items:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération des items de navigation" },
      { status: 500 }
    );
  }
}
