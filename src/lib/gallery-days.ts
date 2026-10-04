/**
 * Découpage d'une galerie par jour : calculs purs, sans React.
 *
 * Les mois donnent le rythme de la page ; les jours, à l'intérieur d'un mois,
 * disent quand une capture a été prise sans avoir à lire chaque carte.
 */

export interface DayGroup<T> {
  /** « 2026-10-02 », dans le fuseau du navigateur. */
  key: string;
  /** Date du premier élément du groupe. */
  date: Date;
  items: T[];
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** Clé « AAAA-MM-JJ » d'une date, en heure locale. */
export function dayKeyOf(date: string | number | Date): string {
  const local = new Date(date);
  if (!Number.isFinite(local.getTime())) return "0000-00-00";
  return `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}`;
}

/**
 * Regroupe des éléments déjà triés par date en jours consécutifs, dans le
 * même ordre. Deux éléments du même jour séparés par un autre jour forment
 * deux groupes : on ne réordonne rien, on ne fait que poser des séparations.
 */
export function groupByDay<T>(items: T[], dateOf: (item: T) => string | number | Date): DayGroup<T>[] {
  const groups: DayGroup<T>[] = [];
  for (const item of items) {
    const key = dayKeyOf(dateOf(item));
    const last = groups[groups.length - 1];
    if (last?.key === key) last.items.push(item);
    else groups.push({ key, date: new Date(dateOf(item)), items: [item] });
  }
  return groups;
}

export interface DayLabels {
  today: string;
  yesterday: string;
}

/**
 * « Aujourd'hui », « Hier », puis « jeu. 25 juin ». L'année n'apparaît que si
 * ce n'est pas l'année en cours : le titre du mois la porte déjà.
 */
export function formatDayLabel(date: Date, locale: string, labels: DayLabels, now: Date = new Date()): string {
  const key = dayKeyOf(date);
  if (key === dayKeyOf(now)) return labels.today;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (key === dayKeyOf(yesterday)) return labels.yesterday;
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: date.getFullYear() === now.getFullYear() ? undefined : "numeric",
  }).format(date);
}

// ─── Disposition en grille ───────────────────────────────────────

export interface DayRowStart<T> {
  day: DayGroup<T>;
  /** Colonne de la première carte du jour dans la rangée, à partir de 0. */
  column: number;
  /** Nombre de cartes de ce jour dans cette rangée. */
  span: number;
}

export interface DayRow<T> {
  /** Les cartes de la rangée, tous jours confondus, dans l'ordre. */
  items: T[];
  /** Les jours qui commencent dans cette rangée. */
  starts: DayRowStart<T>[];
}

/**
 * Range les jours dans une grille de `columns` colonnes sans laisser de case
 * vide : les jours se suivent, plusieurs partagent une rangée, et un jour trop
 * long continue à la rangée suivante. Chaque rangée sait quels jours y
 * commencent, et sur combien de colonnes, pour y poser leurs étiquettes.
 */
export function packDaysIntoRows<T>(days: DayGroup<T>[], columns: number): DayRow<T>[] {
  const width = Math.max(1, Math.floor(columns));
  const rows: DayRow<T>[] = [];
  let current: DayRow<T> = { items: [], starts: [] };

  for (const day of days) {
    let placed = 0;
    while (placed < day.items.length) {
      if (current.items.length === width) {
        rows.push(current);
        current = { items: [], starts: [] };
      }
      const room = width - current.items.length;
      const take = Math.min(room, day.items.length - placed);
      if (placed === 0) current.starts.push({ day, column: current.items.length, span: take });
      current.items.push(...day.items.slice(placed, placed + take));
      placed += take;
    }
  }
  if (current.items.length > 0) rows.push(current);
  return rows;
}
