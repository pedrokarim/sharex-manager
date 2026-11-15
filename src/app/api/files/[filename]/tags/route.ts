import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api-guard";
import { organizationDb } from "@/lib/organization/organization-db";
import { NO_STORE, notFound, organizationErrorResponse, uploadExists } from "@/lib/organization/http";
import { TAGS_PER_FILE_MAX } from "@/lib/organization/types";

type Context = { params: Promise<{ filename: string }> };

const ReplaceTagsSchema = z.object({
  tags: z.array(z.string().max(200)).max(TAGS_PER_FILE_MAX),
});

const FILE_NOT_FOUND = "Fichier introuvable";

// GET /api/files/[filename]/tags : tags posés sur le fichier.
export const GET = withAuth(async (_request: NextRequest, { params }: Context) => {
  try {
    const { filename } = await params;
    if (!uploadExists(filename)) return notFound(FILE_NOT_FOUND);
    return NextResponse.json({ tags: organizationDb.getFileTags(filename) }, { headers: NO_STORE });
  } catch (error) {
    return organizationErrorResponse(error, "Erreur lors de la lecture des tags du fichier");
  }
});

// PUT /api/files/[filename]/tags : remplace les tags (noms ; les inconnus sont créés).
// Les tags sont communs, comme les favoris : tout compte connecté les pose.
export const PUT = withAuth(async (request: NextRequest, { params }: Context, session) => {
  try {
    const { filename } = await params;
    if (!uploadExists(filename)) return notFound(FILE_NOT_FOUND);
    const { tags } = ReplaceTagsSchema.parse(await request.json());
    return NextResponse.json({ tags: organizationDb.setFileTags(filename, tags, session.user.id) });
  } catch (error) {
    return organizationErrorResponse(error, "Erreur lors de l'enregistrement des tags du fichier");
  }
});
