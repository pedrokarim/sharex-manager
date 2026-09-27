import { THEME_COLOR_KEYS } from "@/lib/theme/constants";
import {
  ThemeStyleProps,
  themeStylesSchema,
  type ThemeStyles,
} from "@/types/theme";
import * as z from "zod";

export const globalThemeModeSchema = z.enum(["light", "dark", "system"]);
export const userThemeModeSchema = z.enum([
  "inherit",
  "light",
  "dark",
  "system",
  "time-based",
]);

export type GlobalThemeMode = z.infer<typeof globalThemeModeSchema>;
export type UserThemeMode = z.infer<typeof userThemeModeSchema>;
export type RuntimeThemeMode = "light" | "dark";
export type ThemeColorOverrideKey = (typeof THEME_COLOR_KEYS)[number];
export type ThemeColorOverrides = Partial<
  Pick<ThemeStyleProps, ThemeColorOverrideKey>
>;

const themeColorOverrideShape = THEME_COLOR_KEYS.reduce(
  (shape, key) => {
    shape[key] = z.string().optional();
    return shape;
  },
  {} as Record<ThemeColorOverrideKey, z.ZodOptional<z.ZodString>>,
);

export const themeColorOverridesSchema = z
  .object(themeColorOverrideShape)
  .partial();

export const globalThemeConfigSchema = z.object({
  mode: globalThemeModeSchema,
  styles: themeStylesSchema,
  updatedAt: z.string(),
  updatedByUserId: z.string().nullable(),
});

export const userThemePreferencesSchema = z.object({
  userId: z.string(),
  modeOverride: userThemeModeSchema,
  overrideEnabled: z.boolean(),
  lightColorOverrides: themeColorOverridesSchema,
  darkColorOverrides: themeColorOverridesSchema,
  stylesOverride: themeStylesSchema.nullable().optional(),
  dayStartHour: z.number().int().min(0).max(23),
  dayEndHour: z.number().int().min(0).max(23),
  updatedAt: z.string(),
});

export const resolvedThemePayloadSchema = z.object({
  globalTheme: globalThemeConfigSchema,
  userPreferences: userThemePreferencesSchema.nullable(),
  styles: themeStylesSchema,
  modePreference: z.enum(["light", "dark", "system", "time-based"]),
  modeSource: z.enum(["global", "user"]),
  activeMode: z.enum(["light", "dark"]),
});

export type GlobalThemeConfig = z.infer<typeof globalThemeConfigSchema>;
export type UserThemePreferences = z.infer<typeof userThemePreferencesSchema>;
export type ResolvedThemePayload = z.infer<typeof resolvedThemePayloadSchema>;

export interface ThemeRuntimeUpdateResponse {
  payload: ResolvedThemePayload;
  userPreferences: UserThemePreferences | null;
  globalTheme: GlobalThemeConfig;
}
