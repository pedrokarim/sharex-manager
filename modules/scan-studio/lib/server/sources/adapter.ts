/**
 * Sources : ce qu'est un adaptateur.
 *
 * Un adaptateur sait lire les chapitres d'UN site de lecture. Il reconnaît les
 * liens de ce site, dit ce qu'un lien désigne, et donne la liste ordonnée des
 * pages du chapitre. Le reste (file d'attente, délais, téléchargement,
 * rangement dans la bibliothèque, icône du site) est commun à tous et vit à
 * côté : `fetcher.ts`, `jobs.ts`, `icons.ts`.
 *
 * ─── Ajouter un site ─────────────────────────────────────────────
 *
 * Un site d'une famille connue (même modèle de site que d'autres) :
 *
 *   1. ajouter UNE déclaration en bas du fichier de la famille :
 *      `createMadaraAdapter({…})` dans `madara.ts` pour un site WordPress au
 *      thème Madara, `createWordpressReaderAdapter({…})` dans
 *      `wordpress-reader.ts` pour un site WordPress qui publie un chapitre
 *      comme un article fait d'une suite d'images ;
 *   2. ajouter UNE ligne à la liste `ADAPTERS` de `registry.ts`.
 *
 * Un site d'un nouveau genre :
 *
 *   1. écrire UN fichier dans ce dossier, qui exporte un objet
 *      `SourceAdapter` : sur le modèle de `mangadex.ts` pour un site qui a une
 *      API publique, de `lelscanfr.ts` (tout le chapitre dans une page) ou de
 *      `lelscans.ts` (une image par page du lecteur) pour un site qui se lit
 *      par ses pages. `html.ts` lit les balises, `reader.ts` lit une page et
 *      traduit sa réponse en cas d'erreur ;
 *   2. ajouter UNE ligne à la liste `ADAPTERS` de `registry.ts`.
 *
 * Rien d'autre : la page « Sources », la reconnaissance des liens, l'icône,
 * les réglages et l'import le prennent en compte d'eux-mêmes.
 *
 * ─── Ce qu'un adaptateur a le droit de faire ─────────────────────
 *
 * Seulement ce que le site sert ouvertement à n'importe quel visiteur anonyme,
 * par son API publique documentée ou par ses pages ordinaires. Donc : aucun
 * compte, aucun cookie ni jeton, aucun contenu payant ou réservé aux abonnés,
 * aucun contournement d'un système anti-robots, d'un captcha, d'une limite de
 * débit, d'un blocage géographique ou d'un verrou technique, aucun
 * désembrouillage d'images protégées. Si les pages ne sont pas lisibles ainsi,
 * l'adaptateur lève `unavailable` avec un message clair et n'essaie rien
 * d'autre. En particulier : un site qui répond par une vérification du
 * navigateur (page d'attente, captcha), une page de connexion ou une demande
 * de confirmation d'âge n'est pas lu. `reader.ts` reconnaît ces réponses et
 * dit, dans le message, que le module ne passe pas outre.
 *
 * L'agent (`User-Agent`) reste celui de l'application. Aucun en-tête `Referer`
 * n'est envoyé : un site dont les images l'exigeraient pour une lecture
 * ordinaire serait à étudier à part, pas à imiter d'office.
 *
 * Un adaptateur ne fait AUCUNE requête par ses propres moyens : tout passe par
 * `context.fetcher`, qui n'appelle que les domaines déclarés, s'identifie,
 * espace les requêtes et s'arrête quand le site le demande.
 */

import { SOURCE_ERROR_LEADS } from "../../library-helpers";
import type { SourceErrorKind } from "../../types";
import type { PoliteFetcher } from "./fetcher";

// ─── Erreurs ─────────────────────────────────────────────────────

/**
 * Erreur d'une source, avec son cas. Le message commence toujours par la
 * phrase du cas (`SOURCE_ERROR_LEADS`), suivie du détail : l'interface s'en
 * sert pour reconnaître le cas quand seul le texte lui parvient.
 */
export class SourceError extends Error {
  readonly kind: SourceErrorKind;
  /** Le détail seul, sans la phrase du cas. */
  readonly detail: string;
  /** Attente demandée par le site, quand il en donne une. */
  readonly retryAfterMs?: number;

  constructor(kind: SourceErrorKind, detail: string, options: { retryAfterMs?: number } = {}) {
    super(`${SOURCE_ERROR_LEADS[kind]} ${detail}`.trim());
    this.name = "SourceError";
    this.kind = kind;
    this.detail = detail;
    this.retryAfterMs = options.retryAfterMs;
  }
}

/** Levée quand le travail est interrompu à la demande (annulation). */
export class AbortedError extends Error {
  constructor() {
    super("Interrompu.");
    this.name = "AbortedError";
  }
}

/** Toute erreur inattendue devient une erreur de site : on ne dit jamais seulement « erreur ». */
export function toSourceError(error: unknown): SourceError {
  if (error instanceof SourceError) return error;
  const detail = error instanceof Error && error.message ? error.message : "Erreur inattendue.";
  return new SourceError("site-error", detail);
}

// ─── Ce qu'un adaptateur rend ────────────────────────────────────

/** Ce que le site dit d'un chapitre. Tout est facultatif sauf le nombre de pages. */
export interface ChapterInfo {
  series?: string;
  /** Numéro tel que le site l'écrit : « 11 », « 12.5 ». */
  chapterNumber?: string;
  chapterTitle?: string;
  /** Code court de la langue : « en », « ja ». */
  language?: string;
  /** Équipe ou éditeur que le site crédite. */
  credit?: string;
  /**
   * Adresse de la couverture de la série, sur un domaine déclaré par
   * l'adaptateur. Facultative : elle sert à illustrer le dossier, et son
   * absence ou son échec ne font jamais échouer un import.
   */
  seriesCoverUrl?: string;
  pageCount: number;
}

/** Une page à récupérer. Rien n'est téléchargé tant que l'import n'en est pas là. */
export interface SourcePage {
  /** Rang dans le chapitre, à partir de zéro : c'est lui qui décide de l'ordre. */
  index: number;
  /**
   * Adresse de l'image, sur un domaine déclaré ou confié par l'API du site
   * (`fetcher.allowHost`). Quand l'adresse de l'image ne se connaît qu'en
   * lisant une page du lecteur, c'est l'adresse de cette page, et le
   * `fetchPage` de l'adaptateur y lit celle de l'image.
   */
  url: string;
}

export interface ResolvedChapter {
  info: ChapterInfo;
  /** Les pages, dans l'ordre de lecture du site. */
  pages: SourcePage[];
}

/** Ce que l'adaptateur reçoit pour travailler. */
export interface SourceContext {
  /** Le seul moyen de joindre le site. */
  fetcher: PoliteFetcher;
  /** Abandonné quand l'import est annulé. */
  signal: AbortSignal;
  log: (message: string) => void;
}

// ─── L'adaptateur ────────────────────────────────────────────────

export interface SourceAdapter {
  /** Identifiant stable, en minuscules : « mangadex ». Sert de clé aux réglages et de nom à l'icône. */
  id: string;
  /** Nom du site, tel qu'il s'écrit. */
  name: string;
  /** Adresse d'accueil : c'est là que l'icône du site est lue. */
  homepage: string;
  /** Domaines dont les liens sont les siens (ceux qu'on colle). `*.exemple.org` couvre tout sous-domaine. */
  hosts: string[];
  /**
   * Autres domaines que l'adaptateur appelle (API, serveurs d'images connus).
   * Un domaine que l'API du site ne donne qu'au moment de lire un chapitre
   * s'ajoute, lui, par `context.fetcher.allowHost`.
   */
  requestHosts?: string[];
  /** Un vrai lien de chapitre, pour le champ de saisie et l'essai. */
  example: string;
  /** Ce qu'il faut savoir avant de s'en servir : limites, conditions du site. */
  notes?: string;
  /** Délai minimal entre deux requêtes vers un même domaine ; celui de `fetcher.ts` par défaut. Jamais moins. */
  minDelayMs?: number;

  /** Ce lien est-il celui d'un chapitre de ce site ? Sans aucune requête. */
  match(url: URL): boolean;

  /**
   * Ce que le lien désigne, pour l'aperçu, au moindre coût. Facultatif : sans
   * elle, l'aperçu appelle `resolve`. Utile quand la liste des pages demande
   * une requête de plus, que l'aperçu n'a pas à dépenser.
   */
  describe?(url: URL, context: SourceContext): Promise<ChapterInfo>;

  /** Le chapitre et la liste ordonnée de ses pages. Ne télécharge aucune image. */
  resolve(url: URL, context: SourceContext): Promise<ResolvedChapter>;

  /**
   * Récupère une page, quand le site demande plus qu'une simple requête :
   * compte rendu par image, adresse à renouveler… Sans elle, l'import fait un
   * GET de `page.url`. `chapter` est ce que `resolve` a rendu : l'adaptateur
   * peut y corriger les adresses des pages restantes.
   */
  fetchPage?(page: SourcePage, chapter: ResolvedChapter, context: SourceContext): Promise<Buffer>;
}
