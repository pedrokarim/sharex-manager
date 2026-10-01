import { cn } from "@/lib/utils";

/**
 * Logos officiels des fournisseurs tiers affichés dans l'application.
 *
 * Sources : paquet @lobehub/icons-static-svg 1.95.1 (MIT) pour OpenAI,
 * ElevenLabs, Claude, Codex, Gemini, Google, Google Cloud et Stability AI ;
 * simple-icons (CC0) pour Openverse ; icône publiée par jamendo.com pour
 * Jamendo ; icônes publiées par leurs propres sites pour trace.moe, SauceNAO,
 * IQDB, Yandex, TinEye, ascii2d, Bing et SerpApi. Les marques restent la propriété de leurs titulaires : elles ne
 * servent ici qu'à désigner le fournisseur.
 *
 * Les logos en couleur sont des fichiers de `public/logos/`. Les logos
 * monochromes sont dessinés en ligne avec `currentColor`, pour rester
 * lisibles en thème sombre.
 */

export type Brand =
  | "openai"
  | "elevenlabs"
  | "claude"
  | "codex"
  | "gemini"
  | "google"
  | "googlecloud"
  | "stability"
  | "openverse"
  | "jamendo"
  | "tracemoe"
  | "saucenao"
  | "iqdb"
  | "yandex"
  | "tineye"
  | "ascii2d"
  | "bing"
  | "serpapi";

const INLINE: Partial<Record<Brand, string>> = {
  openai: "M9.205 8.658v-2.26c0-.19.072-.333.238-.428l4.543-2.616c.619-.357 1.356-.523 2.117-.523 2.854 0 4.662 2.212 4.662 4.566 0 .167 0 .357-.024.547l-4.71-2.759a.797.797 0 00-.856 0l-5.97 3.473zm10.609 8.8V12.06c0-.333-.143-.57-.429-.737l-5.97-3.473 1.95-1.118a.433.433 0 01.476 0l4.543 2.617c1.309.76 2.189 2.378 2.189 3.948 0 1.808-1.07 3.473-2.76 4.163zM7.802 12.703l-1.95-1.142c-.167-.095-.239-.238-.239-.428V5.899c0-2.545 1.95-4.472 4.591-4.472 1 0 1.927.333 2.712.928L8.23 5.067c-.285.166-.428.404-.428.737v6.898zM12 15.128l-2.795-1.57v-3.33L12 8.658l2.795 1.57v3.33L12 15.128zm1.796 7.23c-1 0-1.927-.332-2.712-.927l4.686-2.712c.285-.166.428-.404.428-.737v-6.898l1.974 1.142c.167.095.238.238.238.428v5.233c0 2.545-1.974 4.472-4.614 4.472zm-5.637-5.303l-4.544-2.617c-1.308-.761-2.188-2.378-2.188-3.948A4.482 4.482 0 014.21 6.327v5.423c0 .333.143.571.428.738l5.947 3.449-1.95 1.118a.432.432 0 01-.476 0zm-.262 3.9c-2.688 0-4.662-2.021-4.662-4.519 0-.19.024-.38.047-.57l4.686 2.71c.286.167.571.167.856 0l5.97-3.448v2.26c0 .19-.07.333-.237.428l-4.543 2.616c-.619.357-1.356.523-2.117.523zm5.899 2.83a5.947 5.947 0 005.827-4.756C22.287 18.339 24 15.84 24 13.296c0-1.665-.713-3.282-1.998-4.448.119-.5.19-.999.19-1.498 0-3.401-2.759-5.947-5.946-5.947-.642 0-1.26.095-1.88.31A5.962 5.962 0 0010.205 0a5.947 5.947 0 00-5.827 4.757C1.713 5.447 0 7.945 0 10.49c0 1.666.713 3.283 1.998 4.448-.119.5-.19 1-.19 1.499 0 3.401 2.759 5.946 5.946 5.946.642 0 1.26-.095 1.88-.309a5.96 5.96 0 004.162 1.713z",
  elevenlabs: "M5 0h5v24H5V0zM14 0h5v24h-5V0z",
};

const FILES: Partial<Record<Brand, string>> = {
  claude: "/logos/claude.svg",
  codex: "/logos/codex.svg",
  gemini: "/logos/gemini.svg",
  google: "/logos/google.svg",
  googlecloud: "/logos/googlecloud.svg",
  stability: "/logos/stability.svg",
  openverse: "/logos/openverse.svg",
  jamendo: "/logos/jamendo.png",
  tracemoe: "/logos/tracemoe.png",
  saucenao: "/logos/saucenao.png",
  iqdb: "/logos/iqdb.png",
  yandex: "/logos/yandex.png",
  tineye: "/logos/tineye.png",
  ascii2d: "/logos/ascii2d.png",
  bing: "/logos/bing.png",
  serpapi: "/logos/serpapi.png",
};

const NAMES: Record<Brand, string> = {
  openai: "OpenAI",
  elevenlabs: "ElevenLabs",
  claude: "Claude",
  codex: "Codex",
  gemini: "Gemini",
  google: "Google",
  googlecloud: "Google Cloud",
  stability: "Stability AI",
  openverse: "Openverse",
  jamendo: "Jamendo",
  tracemoe: "trace.moe",
  saucenao: "SauceNAO",
  iqdb: "IQDB",
  yandex: "Yandex",
  tineye: "TinEye",
  ascii2d: "ascii2d",
  bing: "Bing",
  serpapi: "SerpApi",
};

export function isBrand(value: unknown): value is Brand {
  return typeof value === "string" && value in NAMES;
}

/**
 * Logo d'un fournisseur, à la taille du texte par défaut (`size-4`).
 *
 * Décoratif par défaut, car le nom est presque toujours écrit à côté : le
 * lire une seconde fois n'apporte rien. `labelled` le rend lisible seul.
 */
export function BrandLogo({ brand, className, labelled = false }: { brand: Brand; className?: string; labelled?: boolean }) {
  const label = labelled ? NAMES[brand] : "";
  const inline = INLINE[brand];
  if (inline) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        fillRule="evenodd"
        {...(labelled ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
        className={cn("size-4 shrink-0", className)}
      >
        <path d={inline} />
      </svg>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element -- petite image statique, sans intérêt pour next/image
  return (
    <img
      src={FILES[brand]}
      alt={label}
      aria-hidden={labelled ? undefined : true}
      draggable={false}
      className={cn("size-4 shrink-0 object-contain", className)}
    />
  );
}
