"use client";

import type { ReactNode } from "react";
import { useLinkStatus } from "next/link";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

/**
 * Icône d'un lien qui se change en indicateur d'attente tant que la page
 * demandée n'est pas là. Elle prend la place exacte de l'icône : rien ne
 * bouge, et l'indication reste visible quand la barre latérale est réduite.
 *
 * À placer à l'intérieur d'un `<Link>` (exigence de `useLinkStatus`).
 */
export function LinkPendingIcon({
  children,
  className,
}: {
  children: ReactNode;
  /** Taille de l'indicateur : celle de l'icône remplacée. */
  className?: string;
}) {
  const { pending } = useLinkStatus();
  if (!pending) return children;
  return <Spinner aria-hidden className={cn("size-4", className)} />;
}
