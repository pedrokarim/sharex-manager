/**
 * Classes partagées par les pages publiques : de quoi écrire un surtitre ou un
 * bouton sans le redessiner à chaque page.
 */

/** Surtitre en petites capitales espacées. */
export const KICKER = "text-xs font-semibold tracking-[0.18em] uppercase";
/** Vert d'accent, sur le fond de la page. */
export const ACCENT = "text-emerald-700 dark:text-emerald-400";

const PILL =
  "group inline-flex h-12 items-center gap-2 rounded-full px-6 text-sm font-semibold transition focus-visible:ring-[3px] focus-visible:outline-none";

/** Bouton principal posé sur une photo. */
export const PILL_ON_PHOTO = `${PILL} bg-white text-[#08150e] hover:bg-white/90 focus-visible:ring-white/50`;
/** Bouton secondaire posé sur une photo : un verre dépoli. */
export const PILL_GLASS = `${PILL} bg-white/12 text-white backdrop-blur-md hover:bg-white/20 focus-visible:ring-white/50`;
/** Bouton principal sur le fond de la page. */
export const PILL_SOLID = `${PILL} bg-foreground text-background hover:opacity-90 focus-visible:ring-ring/50`;
/** Bouton secondaire sur le fond de la page. */
export const PILL_SOFT = `${PILL} bg-foreground/[0.06] hover:bg-foreground/10 focus-visible:ring-ring/50`;

/** Champ de formulaire : un fond teinté, sans contour. */
export const FIELD =
  "h-12 rounded-xl border-transparent bg-foreground/[0.05] px-4 shadow-none transition-colors focus-visible:border-transparent focus-visible:bg-foreground/[0.08] dark:bg-foreground/[0.07]";
/** Zone de texte, sur le même principe. */
export const FIELD_AREA =
  "rounded-xl border-transparent bg-foreground/[0.05] px-4 py-3 shadow-none transition-colors focus-visible:border-transparent focus-visible:bg-foreground/[0.08] dark:bg-foreground/[0.07]";

/** Pastille de filtre ou de réglage, dans une barre d'outils. */
export const CHIP = "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-medium transition-colors";
export const CHIP_IDLE = "bg-foreground/[0.06] text-muted-foreground hover:bg-foreground/10 hover:text-foreground";
export const CHIP_ACTIVE = "bg-foreground text-background";
