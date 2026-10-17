"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { BotAvatar } from "bot-avatars";
import { cn } from "@/lib/utils";

/**
 * Visage d'un assistant (bot-avatars, Jakub Antalik) : il travaille – petits
 * bonds, sourire – pendant une génération, et regarde autour de lui le reste
 * du temps. Chaque assistant garde sa forme, pour qu'on le reconnaisse :
 * `brand` (Image de marque), `clip` (Clip Studio).
 *
 * Dessiné seulement dans le navigateur, une fois monté et quand le suivi de
 * visibilité existe : la case garde sa taille en attendant (rendu serveur,
 * tests sous jsdom).
 */

const PERSONAS = {
  brand: { type: "flower", label: "Assistant de marque" },
  clip: { type: "droid", label: "Assistant de Clip Studio" },
} as const;

export function AssistantAvatar({
  persona,
  busy,
  size = 40,
  shading = "smooth",
  className,
}: {
  persona: keyof typeof PERSONAS;
  busy: boolean;
  size?: number;
  /** Rendu du corps ; `smooth` est le plus sobre en calcul à cette taille. */
  shading?: "smooth" | "crisp" | "flat" | "plastic" | "fabric";
  className?: string;
}) {
  const reducedMotion = useReducedMotion();
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(typeof IntersectionObserver !== "undefined"), []);
  const { type, label } = PERSONAS[persona];

  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      {ready ? (
        <BotAvatar
          type={type}
          state={busy ? "working" : "default"}
          size={size}
          shading={shading}
          interactive={false}
          paused={reducedMotion ?? false}
          aria-label={`${label}${busy ? ", au travail" : ""}`}
        />
      ) : null}
    </span>
  );
}
