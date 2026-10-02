/**
 * Transition du changement de thème : un cercle qui s'ouvre depuis le clic.
 *
 * Elle porte une classe sur `<html>` le temps de l'animation, pour que ses
 * règles CSS ne s'appliquent qu'à elle. Les changements de page utilisent eux
 * aussi les View Transitions : sans cette classe, chaque navigation rejouerait
 * le cercle du thème.
 */
export function startThemeTransition(update: () => void) {
  const root = document.documentElement;
  root.classList.add("theme-switching");
  const transition = document.startViewTransition(update);
  void transition.finished.finally(() => root.classList.remove("theme-switching"));
}
