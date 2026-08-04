import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { resolveThemePayloadFromState } from "@/lib/theme/resolve-theme";
import { themeDb } from "@/lib/theme/theme-db";
import { globalThemeModeSchema } from "@/types/theme-runtime";
import { themeStylesSchema } from "@/types/theme";
import * as z from "zod";

const updateGlobalThemeSchema = z.object({
  mode: globalThemeModeSchema,
  styles: themeStylesSchema,
});

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user || session.user.role !== "admin") {
    return Response.json({ error: "Non autorisé" }, { status: 401 });
  }

  const globalTheme = themeDb.getGlobalThemeConfig();

  return Response.json({
    globalTheme,
    payload: resolveThemePayloadFromState(globalTheme, themeDb.getUserThemePreferences(session.user.id)),
  });
}

export async function PUT(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user || session.user.role !== "admin") {
    return Response.json({ error: "Non autorisé" }, { status: 401 });
  }

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
  const userPreferences = themeDb.getUserThemePreferences(session.user.id);

  return Response.json({
    globalTheme,
    userPreferences,
    payload: resolveThemePayloadFromState(globalTheme, userPreferences),
  });
}
