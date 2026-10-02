import { ViewTransition, type ReactNode } from "react";

/**
 * Entrée et sortie d'une page publique : l'ancienne s'efface vite, la nouvelle
 * monte doucement à sa place (règles `.page-in` et `.page-out` de
 * `global.css`). À poser dans chaque `page.tsx`, pas dans un layout : un
 * layout reste en place d'une page à l'autre, son contenu n'entre ni ne sort.
 * Sans prise en charge par le navigateur, la page change simplement.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <ViewTransition enter="page-in" exit="page-out" default="none">
      {children}
    </ViewTransition>
  );
}
