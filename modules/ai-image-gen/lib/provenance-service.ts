/**
 * Marques d'origine des rendus du module. Le lecteur lui-même est commun à
 * toute l'application : ici, on le pointe seulement sur le dossier des images.
 */

import { createProvenanceReader, samePixels } from "@/lib/provenance/service";
import { IMAGES_DIR } from "./store";

const reader = createProvenanceReader(() => IMAGES_DIR);

export const inspectMany = reader.inspectMany;
export const inspectOne = reader.inspectOne;
export const cleanCopy = reader.cleanCopy;
export { samePixels };
