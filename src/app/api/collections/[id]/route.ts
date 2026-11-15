import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-guard";
import { summarizeCollections } from "@/lib/gallery-listing";
import { organizationDb } from "@/lib/organization/organization-db";
import { updateCollectionSchema } from "@/lib/organization/collection-schema";
import { NO_STORE, notFound, organizationErrorResponse } from "@/lib/organization/http";

/** `[id]` : l'identifiant numérique, ou le slug de la collection. */
type Context = { params: Promise<{ id: string }> };

// Une collection d'un autre compte ne se distingue pas d'une collection inconnue.
const COLLECTION_NOT_FOUND = "Collection introuvable";

// GET /api/collections/[id] : la collection, avec son compte et son aperçu.
export const GET = withAuth(async (_request: NextRequest, { params }: Context, session) => {
  try {
    const collection = organizationDb.findCollection((await params).id, session.user.id);
    if (!collection) return notFound(COLLECTION_NOT_FOUND);
    const [summary] = await summarizeCollections([collection]);
    return NextResponse.json({ collection: summary }, { headers: NO_STORE });
  } catch (error) {
    return organizationErrorResponse(error, "Erreur lors de la lecture de la collection");
  }
});

// PATCH /api/collections/[id] : nom, description, règles, tri, épinglage.
export const PATCH = withAuth(async (request: NextRequest, { params }: Context, session) => {
  try {
    const current = organizationDb.findCollection((await params).id, session.user.id);
    if (!current) return notFound(COLLECTION_NOT_FOUND);
    const body = updateCollectionSchema.parse(await request.json());
    const collection = organizationDb.updateCollection(current.id, session.user.id, body);
    return collection ? NextResponse.json({ collection }) : notFound(COLLECTION_NOT_FOUND);
  } catch (error) {
    return organizationErrorResponse(error, "Erreur lors de la modification de la collection");
  }
});

// DELETE /api/collections/[id]
export const DELETE = withAuth(async (_request: NextRequest, { params }: Context, session) => {
  try {
    const current = organizationDb.findCollection((await params).id, session.user.id);
    if (!current) return notFound(COLLECTION_NOT_FOUND);
    organizationDb.deleteCollection(current.id, session.user.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return organizationErrorResponse(error, "Erreur lors de la suppression de la collection");
  }
});
