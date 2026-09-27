import { cache } from "react";
import { resolveThemePayloadFromState } from "@/lib/theme/resolve-theme";
import { themeDb } from "@/lib/theme/theme-db";

export const getResolvedThemePayload = cache(async (userId?: string | null) => {
  const globalTheme = themeDb.getGlobalThemeConfig();
  const userPreferences = userId
    ? themeDb.getUserThemePreferences(userId)
    : null;

  return resolveThemePayloadFromState(globalTheme, userPreferences);
});
