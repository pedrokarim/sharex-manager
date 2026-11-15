import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api-guard";
import { organizationDb } from "@/lib/organization/organization-db";
import { canEditTag, idSchema, notFound, organizationErrorResponse } from "@/lib/organization/http";
import { TAG_DESCRIPTION_MAX } from "@/lib/organization/types";

type Context = { params: Promise<{ id: string }> };

const UpdateTagSchema = z
  .object({
    name: z.string().max(200).optional(),
    description: z.string().max(TAG_DESCRIPTION_MAX).nullable().optional(),
  })
  .refine((body) => body.name !== undefined || body.description !== undefined, {
    message: "Rien à modifier",
  });

const TAG_NOT_FOUND = "Tag introuvable";

// GET /api/tags/[id]
export const GET = withAuth(async (_request: NextRequest, { params }: Context) => {
  try {
    const tag = organizationDb.getTag(idSchema.parse((await params).id));
    return tag ? NextResponse.json({ tag }) : notFound(TAG_NOT_FOUND);
  } catch (error) {
    return organizationErrorResponse(error, "Erreur lors de la lecture du tag");
  }
});

// PATCH /api/tags/[id] : renommer, décrire (créateur du tag ou admin).
export const PATCH = withAuth(async (request: NextRequest, { params }: Context, session) => {
  try {
    const id = idSchema.parse((await params).id);
    const current = organizationDb.getTag(id);
    if (!current) return notFound(TAG_NOT_FOUND);
    if (!canEditTag(session, current)) {
      return NextResponse.json(
        { error: "Seul le créateur du tag ou un admin peut le modifier" },
        { status: 403 },
      );
    }
    const body = UpdateTagSchema.parse(await request.json());
    const tag = organizationDb.updateTag(id, body);
    return tag ? NextResponse.json({ tag }) : notFound(TAG_NOT_FOUND);
  } catch (error) {
    return organizationErrorResponse(error, "Erreur lors de la modification du tag");
  }
});

// DELETE /api/tags/[id] : le tag quitte les fichiers et les collections (créateur ou admin).
export const DELETE = withAuth(async (_request: NextRequest, { params }: Context, session) => {
  try {
    const id = idSchema.parse((await params).id);
    const current = organizationDb.getTag(id);
    if (!current) return notFound(TAG_NOT_FOUND);
    if (!canEditTag(session, current)) {
      return NextResponse.json(
        { error: "Seul le créateur du tag ou un admin peut le supprimer" },
        { status: 403 },
      );
    }
    organizationDb.deleteTag(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return organizationErrorResponse(error, "Erreur lors de la suppression du tag");
  }
});
