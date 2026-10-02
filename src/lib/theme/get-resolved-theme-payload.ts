import { cache } from "react";
import { resolveThemePayload } from "@/lib/theme/resolve-theme";
import { themeDb } from "@/lib/theme/theme-db";

/** Le thème du site, lu une fois par requête. */
export const getResolvedThemePayload = cache(async () =>
  resolveThemePayload(themeDb.getGlobalThemeConfig()),
);
