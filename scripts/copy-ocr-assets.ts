/**
 * Copie dans `public/scan-studio-ocr/` les fichiers dont le moteur de lecture
 * de Scan Studio a besoin dans le navigateur : son script de travail, son cœur
 * WebAssembly et les données de chaque langue lue (anglais, japonais, chinois,
 * coréen).
 *
 * Sans cette copie, tesseract.js irait les chercher sur un CDN public au
 * premier usage. L'application les sert donc elle-même : rien ne sort de la
 * machine, et le module marche hors ligne.
 *
 * Lancé avant `dev` et `build` (`predev`, `prebuild`). Le dossier de sortie
 * n'est pas versionné : il se reconstruit depuis `node_modules`.
 */

import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

const root = join(import.meta.dir, "..");
const modules = join(root, "node_modules");
const output = join(root, "public", "scan-studio-ocr");

/** Variante des données de langue : la même pour toutes, environ 2 Mo compressés par modèle. */
const VARIANT = "4.0.0_best_int";

/**
 * Modèles de lecture, un fichier chacun. Le navigateur ne télécharge que ceux
 * de la langue du chapitre analysé (`lib/analysis/languages.ts`) : les copier
 * tous ici ne coûte que de la place sur le disque du serveur. Les modèles
 * « _vert » lisent le texte écrit en colonnes, de haut en bas.
 */
const languages = ["eng", "jpn", "jpn_vert", "chi_sim", "chi_sim_vert", "chi_tra", "chi_tra_vert", "kor", "kor_vert"];

/**
 * Le cœur existe en trois variantes, choisies par le navigateur selon ce que
 * son processeur sait faire. Seules les variantes « LSTM » servent : le module
 * n'utilise pas l'ancien moteur de Tesseract.
 */
const files: [from: string, to: string][] = [
  ["tesseract.js/dist/tesseract.min.js", "tesseract.min.js"],
  ["tesseract.js/dist/worker.min.js", "worker.min.js"],
  ["tesseract.js-core/tesseract-core-lstm.wasm.js", "core/tesseract-core-lstm.wasm.js"],
  ["tesseract.js-core/tesseract-core-simd-lstm.wasm.js", "core/tesseract-core-simd-lstm.wasm.js"],
  ["tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js", "core/tesseract-core-relaxedsimd-lstm.wasm.js"],
  ...languages.map((code): [string, string] => [`@tesseract.js-data/${code}/${VARIANT}/${code}.traineddata.gz`, `lang/${code}.traineddata.gz`]),
  // ONNX Runtime Web, en WebAssembly seul : il fait tourner le détecteur de bulles et de texte.
  ["onnxruntime-web/dist/ort.wasm.min.js", "ort/ort.wasm.min.js"],
  ["onnxruntime-web/dist/ort-wasm-simd-threaded.mjs", "ort/ort-wasm-simd-threaded.mjs"],
  ["onnxruntime-web/dist/ort-wasm-simd-threaded.wasm", "ort/ort-wasm-simd-threaded.wasm"],
];

let copied = 0;
for (const [from, to] of files) {
  const source = join(modules, from);
  const target = join(output, to);
  if (!existsSync(source)) {
    console.error(`[scan-studio] Fichier du moteur de lecture introuvable : ${from}. Lancez « bun install ».`);
    process.exit(1);
  }
  // Même taille, déjà en place : rien à refaire.
  if (existsSync(target) && statSync(target).size === statSync(source).size) continue;
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
  copied++;
}
if (copied > 0) console.log(`[scan-studio] Moteur de lecture : ${copied} fichier(s) copié(s) dans public/scan-studio-ocr/.`);
