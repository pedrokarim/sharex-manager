import { getAbsoluteUploadPath } from "@/lib/config";
import { createProvenanceReader } from "./service";

/** Marques d'origine des fichiers de la galerie. */
export const galleryProvenance = createProvenanceReader(() => getAbsoluteUploadPath());
