"use client";

import { useEffect, useState } from "react";
import { MetalBadge } from "metal-fx";

/**
 * Pastille « Pro » en métal liquide (metal-fx, Jakub Antalik). Le métal est
 * un rendu WebGL2 que le serveur ne peut pas produire : on pose d'abord une
 * pastille simple de même taille, remplacée une fois dans le navigateur
 * (sinon l'hydratation échoue). Sans WebGL2, metal-fx garde elle-même une
 * pastille simple.
 */
export function ProBadge({ children = "Pro" }: { children?: string }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <span className="inline-flex h-[25px] min-w-[45px] items-center justify-center rounded-full bg-muted px-2 text-[12px] font-semibold">
        {children}
      </span>
    );
  }
  return <MetalBadge>{children}</MetalBadge>;
}
