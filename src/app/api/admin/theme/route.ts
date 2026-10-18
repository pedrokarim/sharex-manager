import { withAuth } from "@/lib/api-guard";
import { resolveThemePayload } from "@/lib/theme/resolve-theme";
import { themeDb } from "@/lib/theme/theme-db";
import { globalThemeModeSchema } from "@/types/theme-runtime";
import { themeStylesSchema } from "@/types/theme";
import * as z from "zod";

const updateGlobalThemeSchema = z.object({
  mode: globalThemeModeSchema,
  styles: themeStylesSchema,
});

export const GET = withAuth(async (_request: Request, _context: unknown, session) => {
  const globalTheme = themeDb.getGlobalThemeConfig();

  return Response.json({
    globalTheme,
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

  const globalTheme = themeDb.updateGlobalThemeConfig({
    ...parsed.data,
    updatedByUserId: session.user.id,
  });

  return Response.json({
    globalTheme,
    payload: resolveThemePayload(globalTheme),
  });
}, { role: "admin" });
