import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api-guard";
import { organizationDb } from "@/lib/organization/organization-db";
import { NO_STORE, organizationErrorResponse } from "@/lib/organization/http";
import { TAG_DESCRIPTION_MAX } from "@/lib/organization/types";

const CreateTagSchema = z.object({
  name: z.string().max(200),
  description: z.string().max(TAG_DESCRIPTION_MAX).nullable().optional(),
});

// GET /api/tags : tous les tags de l'instance, avec leurs comptes.
export const GET = withAuth(async () => {
  try {
    return NextResponse.json({ tags: organizationDb.listTags() }, { headers: NO_STORE });
  } catch (error) {
    return organizationErrorResponse(error, "Erreur lors de la lecture des tags");
  }
});

// POST /api/tags : crée un tag, ou rend celui qui porte déjà ce slug.
export const POST = withAuth(async (request: NextRequest, _context: unknown, session) => {
  try {
    const body = CreateTagSchema.parse(await request.json());
    const { tag, created } = organizationDb.createTag({ ...body, createdBy: session.user.id });
    return NextResponse.json({ tag, created }, { status: created ? 201 : 200 });
  } catch (error) {
    return organizationErrorResponse(error, "Erreur lors de la création du tag");
  }
});
