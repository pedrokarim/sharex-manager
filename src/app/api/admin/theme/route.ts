import { withAuth } from "@/lib/api-guard";
import { resolveThemePayload } from "@/lib/theme/resolve-theme";
import { themeDb } from "@/lib/theme/theme-db";
import { globalThemeModeSchema } from "@/types/theme-runtime";
import { themeStylesSchema } from "@/types/theme";
import * as z from "zod";
import { isIconSetId } from "@/lib/icon-themes/registry";

const updateGlobalThemeSchema = z.object({
  mode: globalThemeModeSchema,
  styles: themeStylesSchema,
  /** Jeu d’icônes de l’interface, enregistré à part du thème des couleurs. */
  iconSet: z.string().refine(isIconSetId, "Jeu d’icônes inconnu").optional(),
});

export const GET = withAuth(async (_request: Request, _context: unknown, session) => {
  const globalTheme = themeDb.getGlobalThemeConfig();

  return Response.json({
    globalTheme,
    iconSet: themeDb.getIconSet(),
    payload: resolveThemePayload(globalTheme),
  });
}, { role: "admin" });

export const PUT = withAuth(async (request: Request, _context: unknown, session) => {
  const body = await request.json();
  const parsed = updateGlobalThemeSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json(
      {
        error: "Payload invalide",
        details: parsed.error.flatten(),
      },
      { status: 400 }
    );
  }

  const { iconSet: requestedIconSet, ...themeInput } = parsed.data;
  const globalTheme = themeDb.updateGlobalThemeConfig({
    ...themeInput,
    updatedByUserId: session.user.id,
  });
  const iconSet = requestedIconSet
    ? themeDb.setIconSet(requestedIconSet, session.user.id)
    : themeDb.getIconSet();

  return Response.json({
    globalTheme,
    iconSet,
    payload: resolveThemePayload(globalTheme),
  });
}, { role: "admin" });
