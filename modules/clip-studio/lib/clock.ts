/**
 * Instants écrits comme sur un lecteur vidéo : « 1:05 », « 1:02:03 ».
 * Servent au choix d'un passage dans l'onglet « Adresse ».
 */

/** Secondes → « m:ss » (ou « h:mm:ss » au-delà d'une heure). */
export function formatClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(Number.isFinite(totalSeconds) ? totalSeconds : 0));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/**
 * « 1:05 », « 1:02:03 », « 75 » ou « 1m15s » → secondes ; null si le texte
 * n'est pas un instant.
 */
export function parseClock(text: string): number | null {
  const value = text.trim().replace(",", ".");
  if (!value) return null;
  if (/^\d+(\.\d+)?$/.test(value)) return Number(value);
  const units = /^(?:(\d+)h)?\s*(?:(\d+)m(?:in)?)?\s*(?:(\d+(?:\.\d+)?)s)?$/i.exec(value);
  if (units && (units[1] || units[2] || units[3])) {
    return Number(units[1] ?? 0) * 3600 + Number(units[2] ?? 0) * 60 + Number(units[3] ?? 0);
  }
  const parts = value.split(":");
  if (parts.length < 2 || parts.length > 3) return null;
  if (!parts.every((part, index) => (index === parts.length - 1 ? /^\d{1,2}(\.\d+)?$/ : /^\d+$/).test(part))) return null;
  const numbers = parts.map(Number);
  const seconds = numbers[numbers.length - 1];
  const minutes = numbers[numbers.length - 2];
  if (seconds >= 60 || (parts.length === 3 && minutes >= 60)) return null;
  return parts.length === 3 ? numbers[0] * 3600 + minutes * 60 + seconds : minutes * 60 + seconds;
}
