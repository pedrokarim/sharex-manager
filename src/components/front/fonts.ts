import { Fraunces } from "next/font/google";

/**
 * Police de titrage des pages publiques : Fraunces, un serif doux, en regard
 * des images de nature. Le texte courant garde la police du site ; celle-ci ne
 * sert qu'aux grands titres. Sa variable se pose sur la racine de chaque
 * gabarit public (`frontDisplay.variable`), pas sur `<html>` : l'espace
 * d'administration n'a pas à la charger.
 */
export const frontDisplay = Fraunces({
  style: ["normal", "italic"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-front-display",
});

/** Classe des grands titres. */
export const DISPLAY = "font-[family-name:var(--font-front-display)] font-medium tracking-[-0.035em]";
