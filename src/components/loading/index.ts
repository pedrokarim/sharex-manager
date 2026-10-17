/**
 * Système de chargement de l'application. Choisir la plus petite indication
 * qui couvre ce qui attend réellement :
 *
 * - un bouton qui travaille : `<Button loading={busy}>` ;
 * - une attente brève dans une ligne : `Spinner` (`@/components/ui/spinner`) ;
 * - une forme connue à venir : `Skeleton`, puis `LoadingReveal` pour le
 *   passage au contenu ;
 * - une zone entière (page, module, panneau) : `LoadingState` ;
 * - un travail de fond qui dure (génération, analyse, traduction) :
 *   `ThinkingStatus`, ou `Orb` et `ShimmerText` composés à la main ;
 * - un lien de navigation : `LinkPendingIcon` autour de son icône.
 */
export { Orb, type OrbProps, type OrbSize, type OrbState } from "./orb";
export { ShimmerText } from "./shimmer-text";
export { ThinkingStatus } from "./thinking-status";
export { LoadingState } from "./loading-state";
export { LoadingReveal } from "./loading-reveal";
export { LinkPendingIcon } from "./link-pending-icon";
