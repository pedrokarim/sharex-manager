import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

// Configuration « plate » d'ESLint 10, celle recommandée par Next.js 16 :
// l'ancien .eslintrc.json n'était plus lu.
//
// Bloquant connu : le projet utilise TypeScript 7, et typescript-eslint (dont
// dépend eslint-config-next) ne prend en charge que TypeScript < 6.1 à ce jour.
// `bun run lint` échoue donc au chargement tant que typescript-eslint n'a pas
// suivi ; cette configuration est prête pour ce moment-là.
export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Projets et données qui ne font pas partie du serveur.
    "sharex-mobile/**",
    "tweakcn/**",
    "docs/website/**",
    "uploads/**",
    "data/**",
    "modules/*/data/**",
  ]),
]);
