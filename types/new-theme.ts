export type ThemeMode = "light" | "dark";

export interface ThemeStyleProps {
  primary: string;
  "primary-foreground": string;
  secondary: string;
  "secondary-foreground": string;
  accent: string;
  "accent-foreground": string;
  background: string;
  foreground: string;
  card: string;
  "card-foreground": string;
  popover: string;
  "popover-foreground": string;
  muted: string;
  "muted-foreground": string;
  destructive: string;
  "destructive-foreground": string;
  border: string;
  input: string;
  ring: string;
  radius: string;
}

export interface ThemeStyles {
  light: Partial<ThemeStyleProps>;
  dark: Partial<ThemeStyleProps>;
}

export interface Theme {
  id: string;
  name: string;
  styles: ThemeStyles;
  createdAt: Date;
  updatedAt: Date;
}

export interface NewThemeEditorControlsProps {
  styles: ThemeStyles | null;
  currentMode: ThemeMode;
  onChange: (styles: ThemeStyles) => void;
  themePromise?: Promise<Theme | null>;
}

export interface NewThemeEditorPreviewProps {
  styles: ThemeStyles | null;
  currentMode: ThemeMode;
}
