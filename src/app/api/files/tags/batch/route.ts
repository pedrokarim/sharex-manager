import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api-guard";
import { organizationDb } from "@/lib/organization/organization-db";
import { organizationErrorResponse, uploadExists } from "@/lib/organization/http";
import { TAGS_PER_FILE_MAX } from "@/lib/organization/types";

/** Plus grande sélection traitée en une fois. */
const BATCH_FILES_MAX = 500;

const BatchTagsSchema = z
  .object({
    files: z.array(z.string().min(1).max(255)).min(1).max(BATCH_FILES_MAX),
    add: z.array(z.string().max(200)).max(TAGS_PER_FILE_MAX).optional(),
    remove: z.array(z.string().max(200)).max(TAGS_PER_FILE_MAX).optional(),
  })
  .refine((body) => Boolean(body.add?.length || body.remove?.length), {
    message: "Rien à ajouter ni à retirer",
  });

// POST /api/files/tags/batch : pose et retire des tags sur une sélection.
export const POST = withAuth(async (request: NextRequest, _context: unknown, session) => {
  try {
    const body = BatchTagsSchema.parse(await request.json());
    const files = [...new Set(body.files)];
    const present = files.filter(uploadExists);
    const missing = files.filter((name) => !present.includes(name));
    const result = organizationDb.updateFilesTags(present, { add: body.add, remove: body.remove }, session.user.id);
    return NextResponse.json({ ...result, missing });
  } catch (error) {
    return organizationErrorResponse(error, "Erreur lors de la pose des tags");
  }
});
