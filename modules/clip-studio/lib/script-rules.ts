/**
 * Règles d'écriture des shorts, données à Codex avec chaque script et
 * appliquées aux textes qu'il renvoie : familles d'accroches, grille de
 * notation, rythme, tournures typiques d'une IA à éviter, nettoyage.
 *
 * Notre typographie française s'applique aux textes produits : espaces
 * insécables, guillemets « », jamais de tiret cadratin dans un texte
 * français.
 *
 * Tout est pur : aucun disque, aucun réseau.
 */

/** Débit de lecture d'une voix off, en mots par minute. */
export const SPEAKING_RATE_WPM = 160;
/** L'accroche se dit en 3 secondes au plus. */
export const HOOK_MAX_SECONDS = 3;
/** Soit environ 8 mots au débit habituel. */
export const HOOK_MAX_WORDS = Math.floor((HOOK_MAX_SECONDS * SPEAKING_RATE_WPM) / 60);
/** Une phrase, une respiration. */
export const LINE_WORDS = { min: 4, max: 15 } as const;
/** Fenêtre de la relance, en part de la durée du clip. */
export const REHOOK_WINDOW = { from: 0.4, to: 0.6 } as const;

// ─── Accroches ───────────────────────────────────────────────────

export interface HookFamily {
  id: string;
  name: string;
  /** Une forme, pas une phrase à remplir mot pour mot. */
  template: string;
  /** Ce qui la fait échouer. */
  trap: string;
}

export const HOOK_FAMILIES: readonly HookFamily[] = [
  { id: "still-stuck", name: "Toujours bloqué", template: "Tu fais [l'effort] et pourtant [le mauvais résultat].", trap: "une douleur vague au lieu d'un chiffre ou d'une scène" },
  { id: "flip", name: "Le retournement", template: "[Conseil courant], c'est justement pourquoi [le problème].", trap: "une provocation que la suite ne défend pas" },
  { id: "stop-start", name: "Arrête, commence", template: "Arrête de [action courante]. Fais plutôt [ceci].", trap: "arrêter une chose que personne ne fait" },
  { id: "number-result", name: "Chiffre et résultat", template: "[Nombre] [choses] ont fait passer [sujet] de [A] à [B].", trap: "un chiffre inventé" },
  { id: "mistake", name: "L'erreur", template: "L'erreur qui a [coûté, ruiné] [le résultat].", trap: "ne nommer l'erreur qu'à la toute fin" },
  { id: "mid-scene", name: "En pleine scène", template: "[Quand], [où], [ce qui déraille] : on commence au milieu.", trap: "du contexte après l'accroche au lieu du tournant" },
  { id: "before-after", name: "Avant, après", template: "[Avant, chiffré]. [Après, chiffré]. [Ce qui n'a pas changé].", trap: "un après dû à la chance" },
  { id: "not-that", name: "Ce n'était pas ça", template: "[Résultat], et ce n'était pas [la cause évidente].", trap: "ne jamais dire ce que c'était" },
  { id: "versus", name: "A contre B", template: "[A] contre [B]. [Lequel l'emporte, ou un indice].", trap: "une comparaison jamais faite" },
  { id: "their-question", name: "La question qu'on pose", template: "« [Question fréquente] ? » [Réponse franche].", trap: "une question à laquelle on répond non avant de passer" },
  { id: "how-without", name: "Comment, sans", template: "Comment [résultat] sans [la peine attendue].", trap: "un « sans » que la méthode n'enlève pas" },
];

/** Grille de notation d'une accroche : cinq critères notés de 0 à 2, total sur 10. */
export const HOOK_RUBRIC: readonly { id: string; label: string; full: string }[] = [
  { id: "specific", label: "précise", full: "un chiffre, un nom, une scène" },
  { id: "tension", label: "tension", full: "un manque, un enjeu ou une contradiction que le spectateur veut voir résolu" },
  { id: "viewer", label: "spectateur", full: "il s'y reconnaît, on lui parle à lui" },
  { id: "fast", label: "rapide", full: `${HOOK_MAX_WORDS} mots au plus, le sujet dans les 5 premiers` },
  { id: "true", label: "tenue", full: "la suite livre exactement ce qu'elle promet" },
];

/** Ouvertures interdites, quelle que soit la famille. */
export const FORBIDDEN_OPENINGS: readonly string[] = [
  "une salutation",
  "« dans cette vidéo »",
  "« aujourd'hui, je vais vous montrer »",
  "une question fermée à la réponse évidente",
  "« le saviez-vous » suivi d'un fait connu",
  "du contexte avant l'idée",
];

// ─── Tournures typiques d'une IA ─────────────────────────────────

export const AI_TELLS_FR: readonly string[] = [
  "plonger dans",
  "explorer (au sens figuré)",
  "véritable",
  "révolutionner",
  "incontournable",
  "crucial",
  "primordial",
  "booster",
  "sublimer",
  "tirer parti de",
  "permettre de (à chaque phrase)",
  "la clé du succès",
  "en effet",
  "de plus",
  "en outre",
  "en somme",
  "en conclusion",
  "il est important de noter",
  "dans un monde où",
  "à l'ère du numérique",
  "sans plus attendre",
  "vous l'aurez compris",
  "n'hésitez pas à",
  "que vous soyez débutant ou expert",
];

export const AI_TELLS_EN: readonly string[] = [
  "delve",
  "dive into",
  "leverage",
  "unlock",
  "elevate",
  "seamless",
  "robust",
  "game-changer",
  "crucial",
  "landscape",
  "tapestry",
  "journey",
  "testament to",
  "moreover",
  "furthermore",
  "it's worth noting",
  "in today's fast-paced world",
  "let's dive in",
  "without further ado",
];

/** Formes de phrase qui trahissent une IA, quelle que soit la langue. */
export const AI_SHAPES: readonly string[] = [
  "le faux contraste (« ce n'est pas X, c'est Y »)",
  "les triades (trois adjectifs ou trois propositions parallèles, encore et encore)",
  "les fragments saccadés (« Pas de blabla. Que du concret. »)",
  "la question qui se répond aussitôt (« Le résultat ? »)",
  "le préambule (« Voici pourquoi : », « Laisse-moi t'expliquer »)",
  "le résumé final et l'accroche répétée en dernière phrase",
  "les appâts à interaction (« Enregistre cette vidéo », « Identifie un ami »)",
  "les précautions empilées (« pourrait peut-être »)",
  "les chaînes de questions rhétoriques",
  "les exemples génériques inventés (« Imagine un entrepreneur qui… »)",
];

// ─── Consignes ───────────────────────────────────────────────────

/** Lignes de consigne données à Codex, pour tous les modèles. */
export function scriptRuleLines(options: { french: boolean }): string[] {
  const families = HOOK_FAMILIES.map((family) => `- ${family.id} (${family.name}) : ${family.template} Piège : ${family.trap}.`);
  const rubric = HOOK_RUBRIC.map((point) => `${point.label} (2 = ${point.full})`).join(" ; ");
  const tells = options.french ? AI_TELLS_FR : AI_TELLS_EN;
  return [
    `Accroches : ajoute au JSON une clé "hooks" : trois accroches courtes de familles différentes, [{"text": string, "family": string, "score": number}]. Chacune se dit en ${HOOK_MAX_SECONDS} secondes au plus (${HOOK_MAX_WORDS} mots environ). Familles (family prend l'identifiant) :`,
    ...families,
    `score sur 10 : cinq critères notés de 0 à 2, ${rubric}.`,
    "L'accroche la mieux notée ouvre le clip : title la reprend mot pour mot.",
    `N'ouvre jamais par ${FORBIDDEN_OPENINGS.join(", ")}.`,
    `Rythme : une idée par phrase, de ${LINE_WORDS.min} à ${LINE_WORDS.max} mots, de longueurs variées ; du concret (un chiffre, un nom, un lieu, un exemple réel), jamais trois phrases abstraites de suite.`,
    `Entre ${REHOOK_WINDOW.from * 100} et ${REHOOK_WINDOW.to * 100} % du clip, place une relance qui ravive l'attention : une question, un chiffre, un retournement.`,
    `Le texte lu se compte à ${SPEAKING_RATE_WPM} mots par minute : chaque mot doit servir.`,
    "Fin : aucune formule de clôture creuse (« merci d'avoir regardé », « dites-moi ce que vous en pensez », résumé de ce qui vient d'être dit) ; termine sur la dernière information utile, ou sur une phrase qui renvoie au début.",
    "N'invente aucun chiffre ni aucune source (« des études montrent »).",
    `À éviter absolument, ce sont des tics d'IA : ${tells.map((tell) => `« ${tell} »`).join(", ")}${options.french ? "" : " (et leurs équivalents dans la langue du script)"} ; ${AI_SHAPES.join(" ; ")}.`,
    ...(options.french
      ? ["Jamais de tiret cadratin (—) : une incise prend le tiret demi-cadratin (–) entouré d'espaces, des virgules ou des parenthèses."]
      : []),
  ];
}

// ─── Nettoyage des textes renvoyés ───────────────────────────────

/**
 * Caractères invisibles : espaces et liants de largeur nulle, marques de
 * direction, indicateur d'ordre des octets, trait d'union conditionnel,
 * caractères d'étiquette (ils peuvent cacher du texte). Le liant de largeur
 * nulle d'un émoji composé et les étiquettes d'un drapeau restent. Les
 * espaces insécables (U+00A0, U+202F) ne sont pas visés : ils font partie de
 * notre typographie.
 */
const INVISIBLE =
  /(\u{1F3F4}[\u{E0020}-\u{E007F}]+)|[\u200b\u200c\u200e\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff\u00ad\u{E0000}-\u{E007F}]|\u200d(?!\p{Extended_Pictographic})/gu;

export function stripInvisible(text: string): string {
  return text.replace(INVISIBLE, "$1");
}

/** Blancs ordinaires, sans les espaces insécables. */
const PLAIN_SPACES = /[^\S\u00a0\u202f]+/g;

/** Texte d'un script : sans caractère invisible, sur une ligne, borné. */
export function cleanScriptText(value: unknown, max: number): string {
  return stripInvisible(String(value ?? ""))
    .replace(PLAIN_SPACES, " ")
    .trim()
    .slice(0, max);
}

/**
 * Typographie française sur un texte renvoyé : espace insécable avant
 * « ; : ! ? % » et dans les guillemets, tiret demi-cadratin entouré
 * d'espaces à la place du cadratin. Rien n'est ajouté là où le texte n'avait
 * pas d'espace (une heure « 10:30 » reste telle quelle).
 */
export function frenchTypography(text: string): string {
  return text
    .replace(/[ \u00a0\u202f]*\u2014[ \u00a0\u202f]*/g, " – ")
    .replace(/[ \u00a0\u202f]+([;:!?%»])/g, "\u00a0$1")
    .replace(/«[ \u00a0\u202f]*/g, "«\u00a0")
    // Un nombre et son unité ne se séparent jamais en fin de ligne (« 16 h », « 72 km/h »).
    .replace(/(\d)[  ]+(h|min|s|ms|km\/h|km|m|cm|mm|kg|g|°C|°|€|ans?|mois|jours?|fps|Go|Mo|Ko|Hz)(?![\p{L}\d])/gu, "$1 $2")
    .trim();
}

// ─── Durée et accroches ──────────────────────────────────────────

export function countWords(text: string): number {
  return text.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
}

/** Durée de lecture estimée, en secondes, au débit d'une voix off. */
export function spokenSeconds(text: string, wordsPerMinute = SPEAKING_RATE_WPM): number {
  return (countWords(text) / wordsPerMinute) * 60;
}

export interface ScriptHook {
  text: string;
  family?: string;
  /** Note sur 10. */
  score: number;
}

/**
 * Accroches renvoyées par Codex, de la meilleure à la moins bonne : d'abord
 * celles qui se disent en 3 secondes, puis par note. Les entrées illisibles,
 * vides ou plus longues que `maxLength` sont écartées.
 */
export function rankHooks(raw: unknown, maxLength = 60): ScriptHook[] {
  const hooks = (Array.isArray(raw) ? raw : []).flatMap((entry): ScriptHook[] => {
    if (!entry || typeof entry !== "object") return [];
    const { text: rawText, family, score } = entry as Record<string, unknown>;
    const text = cleanScriptText(rawText, maxLength + 1);
    if (!text || text.length > maxLength) return [];
    const value = Number(score);
    return [
      {
        text,
        family: HOOK_FAMILIES.some((known) => known.id === family) ? (family as string) : undefined,
        score: Number.isFinite(value) ? Math.min(10, Math.max(0, Math.round(value))) : 0,
      },
    ];
  });
  const quick = (hook: ScriptHook) => (countWords(hook.text) <= HOOK_MAX_WORDS ? 1 : 0);
  // Tri stable : à égalité, l'ordre de Codex est gardé.
  return hooks.sort((a, b) => quick(b) - quick(a) || b.score - a.score);
}

export function pickBestHook(raw: unknown, maxLength = 60): ScriptHook | null {
  return rankHooks(raw, maxLength)[0] ?? null;
}
