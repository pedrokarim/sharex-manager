"use client";

import type { ReactNode } from "react";
import { useReducedMotion } from "framer-motion";
import { BorderBeam } from "border-beam";

/**
 * Lueur qui parcourt le bord d'une carte tant que son travail tourne
 * (border-beam, Jakub Antalik), puis s'éteint en fondu. C'est un état, pas
 * une décoration : elle ne s'allume que sur une carte active, jamais au repos.
 * L'enfant unique garde sa forme ; son arrondi est repris automatiquement.
 */
export function ActiveBeam({ active, children }: { active: boolean; children: ReactNode }) {
  const reducedMotion = useReducedMotion();
  return (
    <BorderBeam
      size="md"
      colorVariant="colorful"
      theme="auto"
      strength={0.75}
      active={active && !reducedMotion}
    >
      {children}
    </BorderBeam>
  );
}
