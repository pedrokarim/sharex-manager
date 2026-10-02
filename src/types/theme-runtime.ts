import { THEME_COLOR_KEYS } from "@/lib/theme/constants";
import { themeStylesSchema } from "@/types/theme";
import * as z from "zod";

/**
 * Le site n'a qu'un thème : celui que l'administrateur publie. Il n'existe pas
 * de thème personnel. Seul le mode d'affichage – clair, sombre ou celui de
 * l'appareil – peut être choisi par chaque navigateur, et ce choix reste dans
 * le navigateur.
 */
export const globalThemeModeSchema = z.enum(["light", "dark", "system"]);

export type GlobalThemeMode = z.infer<typeof globalThemeModeSchema>;
export type RuntimeThemeMode = "light" | "dark";
/** Une couleur du thème, parmi celles que l'on peut régler. */
export type ThemeColorKey = (typeof THEME_COLOR_KEYS)[number];

export const globalThemeConfigSchema = z.object({
  mode: globalThemeModeSchema,
  styles: themeStylesSchema,
  updatedAt: z.string(),
  updatedByUserId: z.string().nullable(),
});

export const resolvedThemePayloadSchema = z.object({
  globalTheme: globalThemeConfigSchema,
  styles: themeStylesSchema,
  /** Mode du site, tant que le navigateur n'en a pas choisi un autre. */
  modePreference: globalThemeModeSchema,
  activeMode: z.enum(["light", "dark"]),
});

export type GlobalThemeConfig = z.infer<typeof globalThemeConfigSchema>;
export type ResolvedThemePayload = z.infer<typeof resolvedThemePayloadSchema>;

export interface ThemeRuntimeUpdateResponse {
  payload: ResolvedThemePayload;
  globalTheme: GlobalThemeConfig;
}
