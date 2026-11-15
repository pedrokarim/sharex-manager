import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-guard";
import { previewCollection, readGalleryIndex } from "@/lib/gallery-listing";
import { previewCollectionSchema } from "@/lib/organization/collection-schema";
import { NO_STORE, organizationErrorResponse } from "@/lib/organization/http";
import { normalizeRules } from "@/lib/organization/rules";
import { hasAnyRule, type CollectionPreview } from "@/lib/organization/types";

// POST /api/collections/preview : compte et aperçu de règles en cours d'écriture.
export const POST = withAuth(async (request: NextRequest) => {
  try {
    const body = previewCollectionSchema.parse(await request.json());
    const rules = normalizeRules(body.rules);
    if (!hasAnyRule(rules)) {
      return NextResponse.json(
        { error: "Une collection a besoin d’au moins une règle.", code: "empty_rules" },
        { status: 400 },
      );
    }
    const { files, tagsByFile } = await readGalleryIndex();
    const preview: CollectionPreview = previewCollection(files, tagsByFile, {
      rules,
      sort: body.sort ?? "date",
      order: body.order ?? "desc",
    });
    return NextResponse.json(preview, { headers: NO_STORE });
  } catch (error) {
    return organizationErrorResponse(error, "Erreur lors du calcul de l’aperçu");
  }
});
