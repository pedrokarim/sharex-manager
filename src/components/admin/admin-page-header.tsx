import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

interface AdminPageHeaderProps {
  icon: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  /** Boutons de la page, calés à droite. */
  actions?: ReactNode;
}

/**
 * En-tête des pages d'administration : une icône, le titre, une phrase. Pas
 * d'encadré, pas de badge au-dessus du titre, pas de tuiles de chiffres : la
 * page commence tout de suite après.
 */
export function AdminPageHeader({ icon: Icon, title, description, actions }: AdminPageHeaderProps) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {description ? <p className="max-w-3xl text-sm text-muted-foreground">{description}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
