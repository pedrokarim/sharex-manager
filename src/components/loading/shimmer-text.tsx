import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/**
 * Texte d'attente traversé par un reflet (motif « Shimmer text » de
 * transitions.dev) : « Génération… », « Analyse de la page… ». Les couleurs
 * suivent le thème – `--shimmer-base` et `--shimmer-highlight` les changent.
 *
 * L'utilitaire `shimmer` (dans `global.css`) s'applique aussi seul, avec des
 * variantes : `group-data-[state=uploading]:shimmer`.
 */
export function ShimmerText({ className, ...props }: ComponentProps<"span">) {
  return <span className={cn("inline-block max-w-full shimmer", className)} {...props} />;
}
