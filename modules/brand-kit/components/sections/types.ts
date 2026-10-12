import type { BrandKit } from "../../lib/types";

/** Ce que reçoit chaque section de l'éditeur. */
export interface SectionProps {
  kit: BrandKit;
  /** Modification locale, enregistrée automatiquement. */
  update: (mutate: (draft: BrandKit) => BrandKit) => void;
}

/** Section qui touche aussi aux fichiers de la marque (images, polices). */
export interface FileSectionProps extends SectionProps {
  /** Opération serveur qui rend la fiche modifiée ; ce qui attend part d'abord. */
  runOperation: (operation: () => Promise<BrandKit>) => Promise<BrandKit | null>;
}
