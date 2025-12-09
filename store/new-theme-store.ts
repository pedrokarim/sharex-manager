import { create } from "zustand";
import { persist } from "zustand/middleware";
import { ThemeStyles } from "@/types/new-theme";

export type ThemeMode = "light" | "dark";

export interface ThemeState {
  styles: ThemeStyles | null;
  currentMode: ThemeMode;
  preset: string | null;
}

export interface NewThemeStore {
  themeState: ThemeState;
  setThemeState: (state: ThemeState) => void;
  setCurrentMode: (mode: ThemeMode) => void;
  setStyles: (styles: ThemeStyles) => void;
  reset: () => void;
}

const defaultThemeState: ThemeState = {
  styles: null,
  currentMode: "light",
  preset: null,
};

export const useNewThemeStore = create<NewThemeStore>()(
  persist(
    (set, get) => ({
      themeState: defaultThemeState,

      setThemeState: (state: ThemeState) => {
        set({ themeState: state });
      },

      setCurrentMode: (mode: ThemeMode) => {
        const currentState = get().themeState;
        set({
          themeState: {
            ...currentState,
            currentMode: mode,
          },
        });
      },

      setStyles: (styles: ThemeStyles) => {
        const currentState = get().themeState;
        set({
          themeState: {
            ...currentState,
            styles,
          },
        });
      },

      reset: () => {
        set({ themeState: defaultThemeState });
      },
    }),
    {
      name: "new-theme-store",
      partialize: (state) => ({
        themeState: {
          ...state.themeState,
          styles: state.themeState.styles,
        },
      }),
    }
  )
);
