/**
 * Frise chronologique d'une galerie : calculs purs, partagés entre le serveur
 * (compter les fichiers par mois) et le rail de défilement.
 *
 * Le rail ne représente pas le temps mais le **contenu** : un mois occupe une
 * hauteur proportionnelle à son nombre de fichiers, plus une part fixe. Dix
 * ans sans rien ne prennent donc aucune place, et un mois d'une seule image
 * reste atteignable.
 */

export interface TimelineMonth {
  /** « 2026-09 ». */
  key: string;
  count: number;
}

/**
 * Clé « AAAA-MM » d'une date, dans le fuseau du navigateur : `tzOffset` est
 * la valeur de `Date.getTimezoneOffset()` (minutes à ajouter pour obtenir
 * l'UTC), afin que le serveur range un fichier dans le même mois que l'écran.
 */
export function monthKeyOf(date: string | number | Date, tzOffset = 0): string {
  const time = new Date(date).getTime();
  if (!Number.isFinite(time)) return "0000-00";
  const local = new Date(time - tzOffset * 60_000);
  return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Regroupe des dates déjà triées en mois consécutifs, dans le même ordre. */
export function summarizeMonths(dates: (string | number | Date)[], tzOffset = 0): TimelineMonth[] {
  const months: TimelineMonth[] = [];
  for (const date of dates) {
    const key = monthKeyOf(date, tzOffset);
    const last = months[months.length - 1];
    if (last?.key === key) last.count++;
    else months.push({ key, count: 1 });
  }
  return months;
}

export function yearOf(key: string): number {
  return Number(key.slice(0, 4));
}

/** Premier jour du mois d'une clé, en UTC : de quoi le nommer sans décalage. */
function monthDate(key: string): Date {
  return new Date(Date.UTC(yearOf(key), Number(key.slice(5, 7)) - 1, 1));
}

/** « juil. » ou « juillet », pour un mois de 0 à 11. */
export function monthName(index: number, form: "short" | "long" = "long", locale = "fr"): string {
  return new Intl.DateTimeFormat(locale, { month: form, timeZone: "UTC" }).format(new Date(Date.UTC(2024, index, 1)));
}

/** « juil. 2016 » ou « juillet 2016 ». */
export function formatMonthKey(key: string, form: "short" | "long" = "short", locale = "fr"): string {
  if (key === "0000-00") return "";
  return new Intl.DateTimeFormat(locale, { month: form, year: "numeric", timeZone: "UTC" }).format(monthDate(key));
}

// ─── Disposition du rail ─────────────────────────────────────────

export interface RailSegment extends TimelineMonth {
  /** Rang du premier fichier du mois dans la liste complète. */
  startIndex: number;
  /** Bornes verticales du mois sur le rail, en pixels. */
  top: number;
  bottom: number;
}

export interface RailLayout {
  height: number;
  total: number;
  segments: RailSegment[];
}

/**
 * Place les mois sur un rail de `height` pixels. `headerWeight` est la part
 * fixe de chaque mois, exprimée en fichiers : l'équivalent de son titre et de
 * ses marges dans la page.
 */
export function buildRail(months: TimelineMonth[], height: number, headerWeight = 6): RailLayout {
  const total = months.reduce((sum, month) => sum + month.count, 0);
  const weight = months.reduce((sum, month) => sum + month.count + headerWeight, 0);
  const segments: RailSegment[] = [];
  let index = 0;
  let cursor = 0;
  for (const month of months) {
    const span = weight > 0 ? ((month.count + headerWeight) / weight) * height : 0;
    segments.push({ ...month, startIndex: index, top: cursor, bottom: cursor + span });
    index += month.count;
    cursor += span;
  }
  return { height, total, segments };
}

function segmentAtY(layout: RailLayout, y: number): RailSegment | null {
  const { segments } = layout;
  if (segments.length === 0) return null;
  let low = 0;
  let high = segments.length - 1;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (segments[middle].bottom <= y) low = middle + 1;
    else high = middle;
  }
  return segments[low];
}

/** Rang du fichier désigné par une hauteur sur le rail, et son mois. */
export function indexAtY(layout: RailLayout, y: number): { index: number; month: RailSegment } | null {
  const clamped = Math.min(Math.max(y, 0), Math.max(0, layout.height - 0.001));
  const month = segmentAtY(layout, clamped);
  if (!month) return null;
  const span = month.bottom - month.top;
  const ratio = span > 0 ? (clamped - month.top) / span : 0;
  const index = month.startIndex + Math.min(month.count - 1, Math.floor(ratio * month.count));
  return { index, month };
}

export function monthAtIndex(layout: RailLayout, index: number): RailSegment | null {
  const { segments } = layout;
  if (segments.length === 0) return null;
  let low = 0;
  let high = segments.length - 1;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if (segments[middle].startIndex <= index) low = middle;
    else high = middle - 1;
  }
  return segments[low];
}

/** Hauteur, sur le rail, d'un rang de la liste (éventuellement fractionnaire). */
export function yAtIndex(layout: RailLayout, index: number): number {
  const month = monthAtIndex(layout, Math.floor(index));
  if (!month) return 0;
  const ratio = month.count > 0 ? Math.min(1, Math.max(0, (index - month.startIndex) / month.count)) : 0;
  return month.top + ratio * (month.bottom - month.top);
}

export interface RailYearLabel {
  year: number;
  /** Hauteur réelle du début de l'année. */
  y: number;
  /** Hauteur d'affichage, décalée pour ne pas chevaucher les voisines. */
  labelY: number;
}

/**
 * Étiquettes d'années. Quand plusieurs années se serrent (peu de contenu),
 * elles s'empilent avec un écart minimal, comme au bas du rail de Google
 * Photos ; celles qui ne tiennent vraiment pas sont omises.
 */
export function yearLabels(layout: RailLayout, minGap = 18): RailYearLabel[] {
  const labels: RailYearLabel[] = [];
  let previous: number | null = null;
  for (const segment of layout.segments) {
    const year = yearOf(segment.key);
    if (year !== previous) labels.push({ year, y: segment.top, labelY: segment.top });
    previous = year;
  }
  const capacity = Math.max(1, Math.floor(layout.height / minGap));
  let kept = labels;
  if (kept.length > capacity) {
    // Trop d'années pour la hauteur : on n'en garde qu'une sur n.
    const step = Math.ceil(kept.length / capacity);
    kept = kept.filter((_, index) => index % step === 0);
  }
  // Vers le bas, puis vers le haut depuis la fin : aucun chevauchement, rien hors du rail.
  for (let index = 1; index < kept.length; index++) {
    kept[index].labelY = Math.max(kept[index].labelY, kept[index - 1].labelY + minGap);
  }
  const floor = layout.height - minGap / 2;
  for (let index = kept.length - 1; index >= 0; index--) {
    const limit = index === kept.length - 1 ? floor : kept[index + 1].labelY - minGap;
    kept[index].labelY = Math.min(kept[index].labelY, limit);
  }
  return kept;
}
