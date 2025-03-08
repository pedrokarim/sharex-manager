import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ColorConfig {
  [key: string]: string;
}

export interface Preferences {
  theme: "light" | "dark" | "system";
  language: "fr" | "en";
  galleryViewMode: "grid" | "list" | "details";
  thumbnailSize: "small" | "medium" | "large";
  showThumbnails: boolean;
  showFileSize: boolean;
  showUploadDate: boolean;
  sortBy: "date" | "name" | "size";
  sortOrder: "asc" | "desc";
  enableUploadNotifications: boolean;
  autoRefreshInterval: number;
  // Nouvelles propriétés pour le thème
  lightColors: ColorConfig;
  darkColors: ColorConfig;
  radius: number;
}

interface PreferencesStore extends Preferences {
  updatePreferences: (preferences: Partial<Preferences>) => void;
  resetPreferences: () => void;
  applyThemeColors: (colors: ColorConfig, theme: "light" | "dark") => void;
}

const defaultLightColors: ColorConfig = {
  background: "#ffffff",
  foreground: "#020817",
  card: "#ffffff",
  "card-foreground": "#020817",
  popover: "#ffffff",
  "popover-foreground": "#020817",
  primary: "#0ea5e9",
  "primary-foreground": "#f8fafc",
  secondary: "#f1f5f9",
  "secondary-foreground": "#0f172a",
  muted: "#f1f5f9",
  "muted-foreground": "#64748b",
  accent: "#f1f5f9",
  "accent-foreground": "#0f172a",
  destructive: "#ef4444",
  "destructive-foreground": "#f8fafc",
  border: "#e2e8f0",
  input: "#e2e8f0",
  ring: "#0ea5e9",
};

const defaultDarkColors: ColorConfig = {
  background: "#020817",
  foreground: "#f8fafc",
  card: "#020817",
  "card-foreground": "#f8fafc",
  popover: "#020817",
  "popover-foreground": "#f8fafc",
  primary: "#0ea5e9",
  "primary-foreground": "#020817",
  secondary: "#1e293b",
  "secondary-foreground": "#f8fafc",
  muted: "#1e293b",
  "muted-foreground": "#94a3b8",
  accent: "#1e293b",
  "accent-foreground": "#f8fafc",
  destructive: "#ef4444",
  "destructive-foreground": "#f8fafc",
  border: "#1e293b",
  input: "#1e293b",
  ring: "#0ea5e9",
};

const defaultPreferences: Preferences = {
  theme: "system",
  language: "fr",
  galleryViewMode: "grid",
  thumbnailSize: "medium",
  showThumbnails: true,
  showFileSize: true,
  showUploadDate: true,
  sortBy: "date",
  sortOrder: "desc",
  enableUploadNotifications: true,
  autoRefreshInterval: 0,
  // Valeurs par défaut pour le thème
  lightColors: defaultLightColors,
  darkColors: defaultDarkColors,
  radius: 8,
};

export const usePreferences = create<PreferencesStore>()(
  persist(
    (set) => ({
      ...defaultPreferences,
      updatePreferences: (preferences: Partial<Preferences>) =>
        set((state) => ({ ...state, ...preferences })),
      resetPreferences: () => set(defaultPreferences),
      applyThemeColors: (colors: ColorConfig, theme: "light" | "dark") => {
        // Mettre à jour les variables CSS
        Object.entries(colors).forEach(([key, value]) => {
          document.documentElement.style.setProperty(`--${key}`, value);
        });
        // Mettre à jour le store
        set((state) => ({
          ...state,
          [theme === "light" ? "lightColors" : "darkColors"]: colors,
        }));
      },
    }),
    {
      name: "preferences",
    }
  )
);
