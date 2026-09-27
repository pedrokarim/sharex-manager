import Link from "next/link";
import { ArrowRight, type LucideIcon } from "lucide-react";

import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Palettes d'accent. Les classes sont écrites en toutes lettres : Tailwind
 * scanne les sources, une classe assemblée dynamiquement ne serait pas générée.
 */
const NAV_CARD_ACCENTS = {
  blue: {
    wash: "from-blue-500/10 via-blue-500/5 dark:from-blue-400/15 dark:via-blue-400/5",
    glow: "bg-blue-500/25 dark:bg-blue-400/30",
    icon: "text-blue-600 dark:text-blue-400",
    border: "group-hover:border-blue-500/40 dark:group-hover:border-blue-400/40",
  },
  emerald: {
    wash: "from-emerald-500/10 via-emerald-500/5 dark:from-emerald-400/15 dark:via-emerald-400/5",
    glow: "bg-emerald-500/25 dark:bg-emerald-400/30",
    icon: "text-emerald-600 dark:text-emerald-400",
    border:
      "group-hover:border-emerald-500/40 dark:group-hover:border-emerald-400/40",
  },
  cyan: {
    wash: "from-cyan-500/10 via-cyan-500/5 dark:from-cyan-400/15 dark:via-cyan-400/5",
    glow: "bg-cyan-500/25 dark:bg-cyan-400/30",
    icon: "text-cyan-600 dark:text-cyan-400",
    border: "group-hover:border-cyan-500/40 dark:group-hover:border-cyan-400/40",
  },
  amber: {
    wash: "from-amber-500/10 via-amber-500/5 dark:from-amber-400/15 dark:via-amber-400/5",
    glow: "bg-amber-500/25 dark:bg-amber-400/30",
    icon: "text-amber-600 dark:text-amber-400",
    border:
      "group-hover:border-amber-500/40 dark:group-hover:border-amber-400/40",
  },
  violet: {
    wash: "from-violet-500/10 via-violet-500/5 dark:from-violet-400/15 dark:via-violet-400/5",
    glow: "bg-violet-500/25 dark:bg-violet-400/30",
    icon: "text-violet-600 dark:text-violet-400",
    border:
      "group-hover:border-violet-500/40 dark:group-hover:border-violet-400/40",
  },
  indigo: {
    wash: "from-indigo-500/10 via-indigo-500/5 dark:from-indigo-400/15 dark:via-indigo-400/5",
    glow: "bg-indigo-500/25 dark:bg-indigo-400/30",
    icon: "text-indigo-600 dark:text-indigo-400",
    border:
      "group-hover:border-indigo-500/40 dark:group-hover:border-indigo-400/40",
  },
  rose: {
    wash: "from-rose-500/10 via-rose-500/5 dark:from-rose-400/15 dark:via-rose-400/5",
    glow: "bg-rose-500/25 dark:bg-rose-400/30",
    icon: "text-rose-600 dark:text-rose-400",
    border: "group-hover:border-rose-500/40 dark:group-hover:border-rose-400/40",
  },
  slate: {
    wash: "from-slate-500/10 via-slate-500/5 dark:from-slate-400/15 dark:via-slate-400/5",
    glow: "bg-slate-500/25 dark:bg-slate-400/30",
    icon: "text-slate-600 dark:text-slate-400",
    border:
      "group-hover:border-slate-500/40 dark:group-hover:border-slate-400/40",
  },
} as const;

export type NavCardAccent = keyof typeof NAV_CARD_ACCENTS;

export interface NavCardProps {
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
  /** Micro-libellé de catégorie affiché en haut à droite. */
  badge?: string;
  /** Pastille d'état accolée au titre (ex. « Bientôt »). */
  tag?: string;
  /** Libellé de l'appel à l'action en pied de carte. */
  action?: string;
  accent?: NavCardAccent;
  className?: string;
}

/**
 * Carte de navigation pleine hauteur utilisée par les écrans d'index
 * (administration, réglages…).
 *
 * Le dégradé est posé sur la `Card` elle-même et non dans un `CardHeader` :
 * depuis shadcn v4 la `Card` porte un `py-6` par défaut, un calque `inset-0`
 * placé dans un sous-bloc laissait donc deux bandes vides en haut et en bas.
 */
export function NavCard({
  href,
  title,
  description,
  icon: Icon,
  badge,
  tag,
  action,
  accent = "slate",
  className,
}: NavCardProps) {
  const palette = NAV_CARD_ACCENTS[accent];

  return (
    <Link
      href={href}
      className={cn(
        "group block h-full rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        className
      )}
    >
      <Card
        className={cn(
          "relative h-full gap-0 overflow-hidden border-border/70 py-0 transition-[transform,box-shadow,border-color] duration-200",
          "hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:shadow-sm",
          palette.border
        )}
      >
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-0 bg-gradient-to-br to-transparent",
            palette.wash
          )}
        />
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute -top-16 -right-16 size-40 rounded-full opacity-0 blur-3xl transition-opacity duration-300 group-hover:opacity-100",
            palette.glow
          )}
        />

        <div className="relative flex h-full flex-col gap-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <span
              className={cn(
                "inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-background/80 shadow-xs backdrop-blur-sm transition-transform duration-200 group-hover:scale-105",
                palette.icon
              )}
            >
              <Icon className="size-5" />
            </span>
            {badge ? (
              <span className="truncate rounded-full border border-border/60 bg-background/70 px-2.5 py-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase backdrop-blur-sm">
                {badge}
              </span>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <CardTitle className="flex flex-wrap items-center gap-2 text-base leading-snug sm:text-lg">
              {title}
              {tag ? (
                <span className="rounded-full border border-dashed border-border bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                  {tag}
                </span>
              ) : null}
            </CardTitle>
            <CardDescription className="leading-relaxed">
              {description}
            </CardDescription>
          </div>

          <div className="mt-auto flex items-center justify-between border-t border-border/60 pt-3 text-sm">
            <span className="font-medium text-muted-foreground transition-colors group-hover:text-foreground">
              {action}
            </span>
            <ArrowRight className="size-4 text-muted-foreground transition-transform duration-200 group-hover:translate-x-1 group-hover:text-foreground" />
          </div>
        </div>
      </Card>
    </Link>
  );
}
