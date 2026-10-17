import { LoadingState } from "@/components/loading";

/**
 * Attente par défaut d'une page de l'espace applicatif : la barre latérale et
 * l'en-tête restent, l'orbe occupe la zone de contenu. Les pages dont la forme
 * est connue (tableaux, galerie, cartes) ont leur propre squelette.
 */
export default function LoadingPage() {
  return <LoadingState fill />;
}
