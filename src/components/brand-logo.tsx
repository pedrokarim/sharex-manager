import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * Logos officiels des fournisseurs tiers affichés dans l'application.
 *
 * Sources : paquet @lobehub/icons-static-svg 1.95.1 (MIT) pour OpenAI,
 * ElevenLabs, Claude, Codex, Gemini, Google, Google Cloud et Stability AI ;
 * simple-icons (CC0) pour Openverse ; icône publiée par jamendo.com pour
 * Jamendo ; icônes publiées par leurs propres sites pour trace.moe, SauceNAO,
 * IQDB, Yandex, TinEye, ascii2d, Bing et SerpApi ; logo à quatre carrés
 * publié par Microsoft pour Microsoft ; icône publiée par mymemory.translated.net
 * pour MyMemory ; simple-icons 16.28.0 (CC0) pour les tracés de DeepL (source
 * deepl.com/press.html) et de LibreTranslate (source libretranslate.com),
 * monochromes, et pour ceux de YouTube, Facebook, Instagram, Threads, X et TikTok, avec
 * les couleurs de leurs chartes (rouge YouTube #FF0000, bleu Facebook
 * #0866FF, dégradé d'Instagram ; Threads, X et TikTok sont monochromes). Les marques
 * restent la propriété de leurs titulaires : elles ne servent ici qu'à
 * désigner le fournisseur.
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
  | "serpapi"
  | "microsoft"
  | "deepl"
  | "libretranslate"
  | "mymemory"
  | "youtube"
  | "facebook"
  | "instagram"
  | "threads"
  | "x"
  | "tiktok";

const INLINE: Partial<Record<Brand, string>> = {
  openai: "M9.205 8.658v-2.26c0-.19.072-.333.238-.428l4.543-2.616c.619-.357 1.356-.523 2.117-.523 2.854 0 4.662 2.212 4.662 4.566 0 .167 0 .357-.024.547l-4.71-2.759a.797.797 0 00-.856 0l-5.97 3.473zm10.609 8.8V12.06c0-.333-.143-.57-.429-.737l-5.97-3.473 1.95-1.118a.433.433 0 01.476 0l4.543 2.617c1.309.76 2.189 2.378 2.189 3.948 0 1.808-1.07 3.473-2.76 4.163zM7.802 12.703l-1.95-1.142c-.167-.095-.239-.238-.239-.428V5.899c0-2.545 1.95-4.472 4.591-4.472 1 0 1.927.333 2.712.928L8.23 5.067c-.285.166-.428.404-.428.737v6.898zM12 15.128l-2.795-1.57v-3.33L12 8.658l2.795 1.57v3.33L12 15.128zm1.796 7.23c-1 0-1.927-.332-2.712-.927l4.686-2.712c.285-.166.428-.404.428-.737v-6.898l1.974 1.142c.167.095.238.238.238.428v5.233c0 2.545-1.974 4.472-4.614 4.472zm-5.637-5.303l-4.544-2.617c-1.308-.761-2.188-2.378-2.188-3.948A4.482 4.482 0 014.21 6.327v5.423c0 .333.143.571.428.738l5.947 3.449-1.95 1.118a.432.432 0 01-.476 0zm-.262 3.9c-2.688 0-4.662-2.021-4.662-4.519 0-.19.024-.38.047-.57l4.686 2.71c.286.167.571.167.856 0l5.97-3.448v2.26c0 .19-.07.333-.237.428l-4.543 2.616c-.619.357-1.356.523-2.117.523zm5.899 2.83a5.947 5.947 0 005.827-4.756C22.287 18.339 24 15.84 24 13.296c0-1.665-.713-3.282-1.998-4.448.119-.5.19-.999.19-1.498 0-3.401-2.759-5.947-5.946-5.947-.642 0-1.26.095-1.88.31A5.962 5.962 0 0010.205 0a5.947 5.947 0 00-5.827 4.757C1.713 5.447 0 7.945 0 10.49c0 1.666.713 3.283 1.998 4.448-.119.5-.19 1-.19 1.499 0 3.401 2.759 5.946 5.946 5.946.642 0 1.26-.095 1.88-.309a5.96 5.96 0 004.162 1.713z",
  elevenlabs: "M5 0h5v24H5V0zM14 0h5v24h-5V0z",
  threads: "M18.263 11.097c-.03-3.486-1.92-5.586-5.111-5.586-2.13 0-3.922.963-4.863 2.499l2.062 1.438c.535-.843 1.272-1.543 2.628-1.543 1.528 0 2.318.85 2.544 2.431a15 15 0 0 0-2.236-.173c-4.125 0-6.068 1.867-6.068 4.336s1.943 3.99 4.804 3.99c3.139 0 5.013-2.115 5.781-4.735.798.361 1.348 1.204 1.348 2.47 0 3.387-3.907 5.232-7.22 5.232-4.885 0-8.077-3.207-8.077-8.424 0-6.392 4.223-10.487 9.9-10.487 3.808 0 5.69 1.671 6.97 3.914l2.108-1.475C21.44 2.078 18.331 0 13.663 0 6.227 0 1.168 5.277 1.168 12.934c0 7 4.953 11.066 10.856 11.066 4.878 0 9.809-2.846 9.809-7.716 0-2.545-1.46-4.231-3.569-5.187m-6.33 4.855c-1.077 0-2.026-.512-2.026-1.453 0-1.483 1.822-1.934 3.606-1.934.678 0 1.34.045 1.927.173-.422 1.927-1.671 3.215-3.508 3.214Z",
  tiktok: "M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z",
  deepl: "M20.907 4.93953 12.68543.18573a1.3577 1.3577 0 0 0-1.3709 0L3.09298 4.9565a1.3766 1.3766 0 0 0-.68639 1.18233v9.52646a1.3766 1.3766 0 0 0 .68639 1.19363l8.22157 4.75946.06223.03583 4.04856 2.3458-.01131-2.06106.0075-1.1446.0038.01885v-.38467c0-.23006.1188-.43371.29605-.56005l.264-.15086.12633-.06977h-.0075l4.80283-2.7795a1.3803 1.3803 0 0 0 .68639-1.19551V6.13505a1.3803 1.3803 0 0 0-.68642-1.19552m-9.85269 9.68863a1.4275 1.4275 0 0 1-.39976 1.3841 1.4086 1.4086 0 0 1-1.97054 0 1.4199 1.4199 0 0 1 0-2.06294 1.4086 1.4086 0 0 1 2.0422.07543l3.32822-1.91585.6864.38656zm5.77019-2.41367a1.4086 1.4086 0 0 1-1.97054 0 1.4256 1.4256 0 0 1-.3696-1.47837l-.0132.0075-3.7525-2.1723-.05657.05656a1.4086 1.4086 0 0 1-1.97053 0 1.4199 1.4199 0 0 1 0-2.06293 1.4086 1.4086 0 0 1 1.97242 0c.3941.37713.52422.91832.39033 1.40672l3.7808 2.20059.01886-.01886a1.4086 1.4086 0 0 1 1.97242 0 1.42746 1.42746 0 0 1 0 2.06105z",
  libretranslate: "M13.7835 0q-1.7162 4.666-8.892 7.991l1.3623 1.523q5.3951-2.6385 7.8192-5.996 2.4777 3.1857 8.1948 6.1247L23.544 8.066q-6.103-2.9283-8.4198-6.2425.118-.1824.4827-1.255ZM9.5467 7.991q-.3218 3.5075-1.4481 5.8028-1.1155 2.2953-3.6683 4.5692l1.4265 1.2763q2.8426-2.6064 4.1941-5.556 1.1799 1.0297 2.4133 2.6494l1.4588-1.3086q-1.1477-1.4587-3.2286-3.25.547-2.0271.7614-3.9793zm7.1007 0q-.1716 4.151-1.4158 6.3927-1.2444 2.2417-3.7328 3.8934l1.4051 1.298q3.5718-2.6065 4.7088-5.8242 1.7268 3.4644 4.8696 5.867l1.4051-1.3408q-1.7806-1.3192-3.0141-2.7887-1.2227-1.4801-1.8662-3.0461-.6328-1.5767-.6328-2.1452l.075-.751q.0859-.8366.0859-1.3942zM.1126 8.8018V24h9.4443v-1.7095H2.0515V8.8018Z",
  x: "M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z",
};

/** Logos en couleur dessinés en ligne : tracé, puis couleur ou dégradé de la charte. */
const COLORED: Partial<Record<Brand, { d: string; fill: string; extra?: { d: string; fill: string } }>> = {
  youtube: {
    d: "M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z",
    fill: "#FF0000",
    // Le triangle de lecture, blanc comme dans le logo officiel.
    extra: { d: "M9.545 15.568V8.432L15.818 12l-6.273 3.568z", fill: "#FFFFFF" },
  },
  facebook: { d: "M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z", fill: "#0866FF" },
  instagram: { d: "M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077", fill: "gradient" },
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
  microsoft: "/logos/microsoft.svg",
  mymemory: "/logos/mymemory.png",
};

/** Logos en fichier qui demandent un fond : l'icône grise de MyMemory se perdrait sur un thème sombre. */
const FILE_CLASSES: Partial<Record<Brand, string>> = {
  mymemory: "rounded-[3px] bg-white p-px",
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
  microsoft: "Microsoft",
  deepl: "DeepL",
  libretranslate: "LibreTranslate",
  mymemory: "MyMemory",
  youtube: "YouTube",
  facebook: "Facebook",
  instagram: "Instagram",
  threads: "Threads",
  x: "X",
  tiktok: "TikTok",
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
  const gradientId = useId();
  const colored = COLORED[brand];
  if (colored) {
    return (
      <svg
        viewBox="0 0 24 24"
        fillRule="evenodd"
        {...(labelled ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
        className={cn("size-4 shrink-0", className)}
      >
        {colored.fill === "gradient" ? (
          <defs>
            <linearGradient id={gradientId} x1="0" y1="1" x2="1" y2="0">
              <stop offset="0" stopColor="#FFD600" />
              <stop offset="0.5" stopColor="#FF0169" />
              <stop offset="0.8" stopColor="#D300C5" />
              <stop offset="1" stopColor="#7638FA" />
            </linearGradient>
          </defs>
        ) : null}
        <path d={colored.d} fill={colored.fill === "gradient" ? `url(#${gradientId})` : colored.fill} />
        {colored.extra ? <path d={colored.extra.d} fill={colored.extra.fill} /> : null}
      </svg>
    );
  }
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
      className={cn("size-4 shrink-0 object-contain", FILE_CLASSES[brand], className)}
    />
  );
}
