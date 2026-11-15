import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-guard";
import { summarizeCollections } from "@/lib/gallery-listing";
import { organizationDb } from "@/lib/organization/organization-db";
import { createCollectionSchema } from "@/lib/organization/collection-schema";
import { NO_STORE, organizationErrorResponse } from "@/lib/organization/http";

// GET /api/collections : les collections du compte, épinglées d'abord, avec compte et aperçu.
export const GET = withAuth(async (_request: NextRequest, _context: unknown, session) => {
  try {
    const collections = await summarizeCollections(organizationDb.listCollections(session.user.id));
    return NextResponse.json({ collections }, { headers: NO_STORE });
  } catch (error) {
    return organizationErrorResponse(error, "Erreur lors de la lecture des collections");
  }
});

// POST /api/collections : crée une collection (au moins une règle).
export const POST = withAuth(async (request: NextRequest, _context: unknown, session) => {
  try {
    const body = createCollectionSchema.parse(await request.json());
    const collection = organizationDb.createCollection(session.user.id, body);
    return NextResponse.json({ collection }, { status: 201 });
  } catch (error) {
    return organizationErrorResponse(error, "Erreur lors de la création de la collection");
  }
});
