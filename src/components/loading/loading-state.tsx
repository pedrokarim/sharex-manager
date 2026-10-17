"use client";

import type { ComponentProps, ReactNode } from "react";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Orb, type OrbSize, type OrbState } from "./orb";
import { ShimmerText } from "./shimmer-text";

/**
 * Attente d'une zone entière : une page, un module, un panneau, une liste
 * vide qui se remplit. L'orbe et son texte se centrent dans la zone, le reste
 * de l'interface reste en place.
 *
 * Par défaut l'état n'apparaît qu'après un court délai, en fondu : un
 * chargement rapide ne fait rien clignoter.
 */

interface LoadingStateProps extends Omit<ComponentProps<"div">, "children"> {
  /** Ce qui se passe ; « Chargement… » par défaut. */
  label?: ReactNode;
  /** Une précision sous le texte : étape, durée attendue. */
  description?: ReactNode;
  state?: OrbState;
  size?: Extract<OrbSize, "md" | "lg">;
  /** Occupe toute la hauteur disponible, l'orbe au centre. */
  fill?: boolean;
  /** `false` : apparaît tout de suite, sans fondu. */
  delayed?: boolean;
}

export function LoadingState({
  label,
  description,
  state = "searching",
  size = "lg",
  fill = false,
  delayed = true,
  className,
  ...props
}: LoadingStateProps) {
  const { t } = useTranslation();

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      data-slot="loading-state"
      className={cn(
        "flex min-w-0 flex-col items-center justify-center gap-4 px-4 py-12 text-center",
        fill && "min-h-64 flex-1",
        delayed &&
          "animate-in fade-in-0 fill-mode-both delay-150 duration-300 motion-reduce:animate-none",
        className
      )}
      {...props}
    >
      <Orb size={size} state={state} className="text-primary" />
      <div className="flex min-w-0 max-w-sm flex-col items-center gap-1">
        <ShimmerText className="text-sm font-medium">
          {label ?? t("common.loading")}
        </ShimmerText>
        {description ? (
          <p className="text-xs text-muted-foreground break-words">{description}</p>
        ) : null}
      </div>
    </div>
  );
}
