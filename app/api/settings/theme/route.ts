import { auth } from "@/auth";
import { resolveThemePayloadFromState } from "@/lib/theme/resolve-theme";
import { themeDb } from "@/lib/theme/theme-db";
import { themeStylesSchema } from "@/types/theme";
import {
  themeColorOverridesSchema,
  userThemeModeSchema,
} from "@/types/theme-runtime";
import * as z from "zod";

const updateUserThemePreferencesSchema = z.object({
  modeOverride: userThemeModeSchema.optional(),
  overrideEnabled: z.boolean().optional(),
  lightColorOverrides: themeColorOverridesSchema.optional(),
  darkColorOverrides: themeColorOverridesSchema.optional(),
  stylesOverride: themeStylesSchema.optional().nullable(),
  dayStartHour: z.number().int().min(0).max(23).optional(),
  dayEndHour: z.number().int().min(0).max(23).optional(),
});

export async function GET() {
  const session = await auth();

  if (!session?.user) {
    return Response.json({ error: "Non autorisé" }, { status: 401 });
  }

  const globalTheme = themeDb.getGlobalThemeConfig();
  const userPreferences = themeDb.getUserThemePreferences(session.user.id);

  return Response.json({
    globalTheme,
    userPreferences,
    payload: resolveThemePayloadFromState(globalTheme, userPreferences),
  });
}

export async function PUT(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return Response.json({ error: "Non autorisé" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = updateUserThemePreferencesSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json(
      {
        error: "Payload invalide",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  const userPreferences = themeDb.upsertUserThemePreferences(
    session.user.id,
    parsed.data,
  );
  const globalTheme = themeDb.getGlobalThemeConfig();

  return Response.json({
    globalTheme,
    userPreferences,
    payload: resolveThemePayloadFromState(globalTheme, userPreferences),
  });
}
