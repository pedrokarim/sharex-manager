import type { RuntimeThemeMode } from "@/types/theme-runtime";
import type { ThemeStyles } from "@/types/theme";

export function applyRuntimeThemeToElement(
  root: HTMLElement,
  styles: ThemeStyles,
  mode: RuntimeThemeMode,
) {
  if (!root || !styles?.[mode]) {
    return;
  }

  if (mode === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }

  for (const [key, value] of Object.entries(styles[mode])) {
    if (typeof value === "string" && value.trim() !== "") {
      root.style.setProperty(`--${key}`, value);
    }
  }
}
