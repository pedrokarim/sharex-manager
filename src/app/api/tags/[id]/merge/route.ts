import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api-guard";
import { organizationDb } from "@/lib/organization/organization-db";
import { idSchema, notFound, organizationErrorResponse } from "@/lib/organization/http";

const MergeSchema = z.object({ into: z.number().int().positive() });

// POST /api/tags/[id]/merge : fusionne ce tag dans `into` (admin).
export const POST = withAuth(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    try {
      const id = idSchema.parse((await params).id);
      const { into } = MergeSchema.parse(await request.json());
      const tag = organizationDb.mergeTags(id, into);
      return tag ? NextResponse.json({ tag }) : notFound("Tag introuvable");
    } catch (error) {
      return organizationErrorResponse(error, "Erreur lors de la fusion des tags");
    }
  },
  { role: "admin" },
);
