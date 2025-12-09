import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBytes(bytes: number, decimals = 2) {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

export function generateId(length: number = 12): string {
  const chars =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  const randomValues = new Uint8Array(length);
  crypto.getRandomValues(randomValues);
  for (let i = 0; i < length; i++) {
    result += chars[randomValues[i] % chars.length];
  }
  return result;
}

export const isEdgeRuntime = () => {
  return process.env.NEXT_RUNTIME === "edge";
};

// capitalize the first letter of a string
export function capitalize(str: string) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function isDeepEqual(obj1: any, obj2: any): boolean {
  if (obj1 === obj2) return true;

  if (obj1 == null || obj2 == null) return obj1 === obj2;

  if (typeof obj1 !== typeof obj2) return false;

  if (typeof obj1 !== 'object') return obj1 === obj2;

  if (Array.isArray(obj1) !== Array.isArray(obj2)) return false;

  if (Array.isArray(obj1)) {
    if (obj1.length !== obj2.length) return false;
    for (let i = 0; i < obj1.length; i++) {
      if (!isDeepEqual(obj1[i], obj2[i])) return false;
    }
    return true;
  }

  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);

  if (keys1.length !== keys2.length) return false;

  for (const key of keys1) {
    if (!keys2.includes(key)) return false;
    if (!isDeepEqual(obj1[key], obj2[key])) return false;
  }

  return true;
}

export function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;

  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

export function hexToHsl(hex: string): string {
  // Remove the hash if it exists
  hex = hex.replace(/^#/, "");

  // Parse the hex values
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }

    h = Math.round(h * 60);
  }

  s = Math.round(s * 100);
  const lPercent = Math.round(l * 100);

  return `${h} ${s}% ${lPercent}%`;
}

export function hslToOklch(h: number, s: number, l: number): string {
  // Convert HSL to RGB first
  s /= 100;
  l /= 100;

  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
  };

  const r = f(0);
  const g = f(8);
  const b = f(4);

  // Convert RGB to OKLCH
  // Using a simplified conversion (for more accuracy, would need a proper color library)
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const chroma = max - min;

  // Lightness (L) in OKLCH is similar to L in HSL but normalized differently
  const lightness = (max + min) / 2;

  // Chroma calculation (simplified)
  const chromaOklch = chroma;

  // Hue stays the same
  const hue = h;

  return `oklch(${lightness.toFixed(3)} ${chromaOklch.toFixed(3)} ${hue})`;
}

export function hexToOklch(hex: string): string {
  const hsl = hexToHsl(hex);
  const [h, s, l] = hsl.split(' ').map(val =>
    val.includes('%') ? parseFloat(val.replace('%', '')) : parseFloat(val)
  );
  return hslToOklch(h, s, l);
}

export function oklchToHex(oklch: string): string {
  // Extract values from oklch string
  const match = oklch.match(/oklch\(([^)]+)\)/);
  if (!match) return "#000000";

  const [lightness, chroma, hue] = match[1].split(' ').map(val => parseFloat(val));

  // Simplified conversion back to RGB (approximate)
  // This is a basic approximation - for production use, consider a proper color library
  const l = lightness;
  const c = chroma;
  const h = hue;

  // Convert back to RGB approximation
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);

  // Simplified RGB calculation
  const r = l + 0.3963377774 * a + 0.2158037573 * b;
  const g = l - 0.1055613458 * a - 0.0638541728 * b;
  const bl = l - 0.0894841775 * a - 1.2914855480 * b;

  // Clamp to [0, 1] and convert to hex
  const clamp = (val: number) => Math.max(0, Math.min(1, val));
  const toHex = (val: number) => Math.round(clamp(val) * 255).toString(16).padStart(2, '0');

  return `#${toHex(r)}${toHex(g)}${toHex(bl)}`;
}