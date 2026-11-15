import type { IconComponent } from "@/components/icon-theme";
import { cn } from "@/lib/utils";

/**
 * Icône posée devant le titre d'une page de l'application : la même que son
 * entrée dans la barre latérale, dessinée dans le jeu d'icônes du thème
 * (passer un composant de `THEMED_ICONS`).
 */
export function PageTitleIcon({ icon: Icon, className }: { icon: IconComponent; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-background/80 text-muted-foreground shadow-sm sm:h-11 sm:w-11",
        className,
      )}
    >
      <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
    </span>
  );
}
