/**
 * Banque de bruitages sur le disque (dossier 07 sexies, D3 ; sons de la
 * planche : dossier 01, « illustrations animées », étape I4).
 *
 * Les sons sont synthétisés par le moteur (`engine/sfx.ts`) et écrits une
 * fois dans `data/resources/sfx/`, d'où la route des données du module les
 * sert. Un fichier manquant ou abîmé est simplement réécrit : la recette ne
 * change pas, le son non plus.
 */

import fs from "fs";
import path from "path";
import { SFX_IDS, encodeWav, sfxFile, synthesizeSfx } from "../engine/sfx";

/** Même dossier que `RESOURCES_DIR` (`resources.ts`), sans l'importer : `store.ts` appelle ce module. */
export const SFX_DIR = path.join(process.cwd(), "modules", "clip-studio", "data", "resources", "sfx");

let checked = false;

/** Écrit les bruitages qui manquent ; une seule vérification par processus. Rend le nombre de fichiers écrits. */
export function ensureSfxBank(directory = SFX_DIR, force = false): number {
  if (checked && !force && directory === SFX_DIR) return 0;
  let written = 0;
  try {
    fs.mkdirSync(directory, { recursive: true });
    for (const id of SFX_IDS) {
      const file = path.join(directory, sfxFile(id));
      const wav = encodeWav(synthesizeSfx(id));
      if (fs.existsSync(file) && fs.statSync(file).size === wav.length) continue;
      const temporary = `${file}.${Date.now()}.tmp`;
      fs.writeFileSync(temporary, wav);
      fs.renameSync(temporary, file);
      written++;
    }
    if (directory === SFX_DIR) checked = true;
  } catch {
    // Un disque en lecture seule n'empêche pas le module de démarrer : les clips restent muets de bruitages.
  }
  return written;
}
