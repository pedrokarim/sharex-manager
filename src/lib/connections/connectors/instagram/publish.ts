/**
 * Publication Instagram par conteneur (dossier 07b, § 5 et § 6).
 *
 * Instagram ne reçoit pas le fichier : il le télécharge à une adresse
 * publique temporaire de l'instance (`context.publicLink`). Déroulé :
 *
 * 1. relire l'usage réel du compte (`content_publishing_limit`) ;
 * 2. créer le conteneur (`POST /<IG_ID>/media`) avec l'adresse du fichier ;
 * 3. attendre son traitement (`status_code`), une fois par minute comme le
 *    recommande Meta, puis plus espacé pour un long Reel : entre deux
 *    lectures, la main est rendue à la file (`PublishPending`), qui passe
 *    au travail suivant et rappelle `publish` à l'heure dite ;
 * 4. publier (`POST /<IG_ID>/media_publish`), appel non rejouable : l'étape
 *    est enregistrée avant, et un nouveau passage relit l'état du conteneur
 *    au lieu de republier ;
 * 5. lire l'adresse publique du média (`permalink`).
 *
 * L'état de reprise (`saveProgress`) garde l'identifiant du conteneur, son
 * heure de création, le temps déjà attendu et, une fois publié, celui du
 * média.
 */

import { isPublishPending, type ConnectorContext, type PublishContext, type PublishOutcome, type PublishPending } from "../../types";
import { QuotaExceededError, ReconnectRequiredError } from "../../errors";
import { InstagramApiError, LIMIT_RECHECK_MS, REBUILD_SUBCODES, SUBCODE_MESSAGES, graphRequest, idOf } from "./api";
import { toInstagramJpeg } from "./image";
import { normalizeInstagramOptions, type InstagramOptions } from "./metadata";

/** Un conteneur vit 24 heures ; au-delà de 23, on le tient pour perdu. */
export const CONTAINER_SAFE_MS = 23 * 60 * 60 * 1000;
/** Attente du traitement : 30 s, puis une minute jusqu'à 5 min, puis 5 min jusqu'à 30 min. */
export const FIRST_WAIT_MS = 30_000;
export const SHORT_WAIT_MS = 60_000;
export const LONG_WAIT_MS = 5 * 60_000;
export const MAX_WAIT_MS = 30 * 60_000;
/** Conteneurs recréés au plus après une erreur passagère ou une expiration. */
export const MAX_REBUILDS = 2;
/** Média retrouvé : publié au plus deux minutes avant la création du conteneur (horloges). */
const CLOCK_SKEW_MS = 2 * 60_000;
const INSTAGRAM_HOME = "https://www.instagram.com/";

/** État de reprise propre à Instagram. */
export interface InstagramResume {
  containerId?: string;
  containerCreatedAt?: number;
  /** « publishing » : `media_publish` est parti ou va partir ; ne jamais le renvoyer sans relire l'état. */
  step?: "container" | "publishing";
  mediaId?: string;
  rebuilds?: number;
  /** Conteneurs des éléments d'un carrousel, dans l'ordre. */
  children?: string[];
  /** Lien public de la vidéo, pour mesurer ce qu'Instagram a téléchargé. */
  videoLinkId?: string;
  /** Attente du traitement déjà demandée pour le conteneur en cours, en millisecondes. */
  waitedMs?: number;
}

export function readResume(value: unknown): InstagramResume {
  const raw = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const text = (entry: unknown) => (typeof entry === "string" && entry ? entry : undefined);
  const number = (entry: unknown) => (typeof entry === "number" && Number.isFinite(entry) ? entry : undefined);
  return {
    containerId: text(raw.containerId),
    containerCreatedAt: number(raw.containerCreatedAt),
    step: raw.step === "publishing" ? "publishing" : raw.step === "container" ? "container" : undefined,
    mediaId: text(raw.mediaId),
    rebuilds: number(raw.rebuilds),
    children: Array.isArray(raw.children) ? raw.children.filter((entry): entry is string => typeof entry === "string" && entry.length > 0) : undefined,
    videoLinkId: text(raw.videoLinkId),
    waitedMs: number(raw.waitedMs),
  };
}

function throwIfAborted(context: PublishContext) {
  if (context.signal.aborted) throw new Error("Publication annulée.");
}

/** Erreur réseau ou passagère : un nouvel essai peut réussir. */
const isTransient = (error: unknown) => (error instanceof InstagramApiError && error.transient) || error instanceof TypeError;

/** Relance une lecture après une erreur passagère (trois essais, attente croissante). */
async function withRetry<T>(context: PublishContext, run: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      if (!isTransient(error) || attempt >= 2) throw error;
      await context.sleep(15_000 * 2 ** attempt);
      throwIfAborted(context);
    }
  }
}

interface ContainerStatus {
  code: string;
  subcode?: number;
}

/** État d'un conteneur : `status_code`, et le sous-code d'erreur lu dans `status`. */
export async function readContainerStatus(context: Pick<ConnectorContext, "getAccessToken" | "chargeQuota">, containerId: string): Promise<ContainerStatus> {
  const body = await graphRequest<{ status_code?: unknown; status?: unknown }>(context, containerId, { query: { fields: "status_code,status" } });
  const subcode = /(\d{7})/.exec(String(body.status ?? ""))?.[1];
  return { code: String(body.status_code ?? "").toUpperCase(), ...(subcode ? { subcode: Number(subcode) } : {}) };
}

/** Octets déjà téléchargés par Instagram depuis le lien de la vidéo. */
function bytesServed(context: PublishContext, state: InstagramResume): number {
  if (!state.videoLinkId) return 0;
  try {
    const served = context.publicLinkAccesses(state.videoLinkId).reduce((sum, entry) => sum + (entry.method === "GET" ? entry.bytes : 0), 0);
    return Math.min(served, context.source.bytes);
  } catch {
    return 0;
  }
}

/** Étape affichée pendant l'attente du traitement. */
const PROCESSING_NOTE = "Instagram traite le média avant de le publier.";

/**
 * État d'un conteneur, rendu dès qu'il a quitté `IN_PROGRESS`. Encore en
 * traitement : la main est rendue à la file (`PublishPending`) pour
 * l'attente suivante, comptée dans l'état de reprise.
 */
async function waitForContainer(context: PublishContext, containerId: string, state: InstagramResume, save: () => void): Promise<ContainerStatus | PublishPending> {
  throwIfAborted(context);
  const status = await withRetry(context, () => readContainerStatus(context, containerId));
  if (status.code !== "IN_PROGRESS" && status.code !== "") {
    if (state.waitedMs !== undefined) {
      state.waitedMs = undefined;
      save();
    }
    return status;
  }
  const waited = state.waitedMs ?? 0;
  if (waited >= MAX_WAIT_MS) {
    // « Réessayer » reprendra une attente complète, avec le même conteneur.
    state.waitedMs = undefined;
    save();
    throw new Error("Instagram traite encore la vidéo après 30 minutes : « Réessayer » reprendra l’attente sans republier (le conteneur reste valable 24 heures).");
  }
  const delay = waited === 0 ? FIRST_WAIT_MS : waited < 5 * 60_000 ? SHORT_WAIT_MS : LONG_WAIT_MS;
  state.waitedMs = waited + delay;
  save();
  return { pending: true, retryAfterMs: delay, note: PROCESSING_NOTE };
}

/** Usage réel du compte chez Instagram : refuse avant de créer un conteneur si la limite est atteinte. */
async function assertPublishingAllowed(context: PublishContext) {
  let usage: number | undefined;
  let total: number | undefined;
  try {
    const body = await graphRequest<{ data?: { quota_usage?: unknown; config?: { quota_total?: unknown } }[] }>(context, `${context.externalId}/content_publishing_limit`, {
      query: { fields: "quota_usage,config" },
    });
    const entry = Array.isArray(body.data) ? body.data[0] : undefined;
    usage = Number(entry?.quota_usage);
    total = Number(entry?.config?.quota_total);
  } catch (error) {
    // Lecture de confort : seuls un jeton refusé ou une limite annoncée arrêtent la publication.
    if (error instanceof ReconnectRequiredError || error instanceof QuotaExceededError) throw error;
    return;
  }
  if (Number.isFinite(usage) && Number.isFinite(total) && total! > 0 && usage! >= total!) {
    throw new QuotaExceededError(
      `Limite de publications atteinte pour ce compte chez Instagram (${usage}/${total} sur 24 heures) : la publication reprendra d’elle-même.`,
      Date.now() + LIMIT_RECHECK_MS,
      "posts",
      "account"
    );
  }
}

/** Crée un conteneur et rend son identifiant. */
async function createContainer(context: PublishContext, form: Record<string, string | number | undefined>): Promise<string> {
  const body = await graphRequest<{ id?: unknown }>(context, `${context.externalId}/media`, { form, quotaMethod: "media" });
  const id = idOf(body.id);
  if (!id) throw new Error("Instagram n’a pas rendu l’identifiant du conteneur.");
  return id;
}

/** Champs communs : légende et étiquette « Infos IA ». */
function commonFields(options: InstagramOptions): Record<string, string> {
  return {
    ...(options.caption ? { caption: options.caption } : {}),
    ...(options.aiGenerated ? { is_ai_generated: "true" } : {}),
  };
}

/** JPEG converti dans un fichier temporaire du cœur, servi par son propre lien. */
async function jpegUrl(context: PublishContext, input: string, checkRatio: boolean): Promise<string> {
  const output = context.tempFile("jpg");
  await toInstagramJpeg(input, output, { checkRatio });
  return context.publicUrl(undefined, { derivedFile: output, contentType: "image/jpeg" });
}

/** Conteneur d'un Reel. */
async function createReelContainer(context: PublishContext, options: InstagramOptions, state: InstagramResume): Promise<string> {
  const link = context.publicLink();
  state.videoLinkId = link.id;
  const form: Record<string, string | number | undefined> = {
    media_type: "REELS",
    video_url: link.url,
    share_to_feed: options.shareToFeed ? "true" : "false",
    ...commonFields(options),
  };
  if (options.cover === "custom" && context.coverPath) form.cover_url = await jpegUrl(context, context.coverPath, false);
  else form.thumb_offset = options.thumbOffsetMs;
  if (options.trial !== "none") form.trial_params = JSON.stringify({ graduation_strategy: options.trial === "manual" ? "MANUAL" : "SS_PERFORMANCE" });
  return createContainer(context, form);
}

/** Conteneur d'une image seule. */
async function createImageContainer(context: PublishContext, options: InstagramOptions): Promise<string> {
  return createContainer(context, {
    image_url: await jpegUrl(context, context.filePath, true),
    ...commonFields(options),
    ...(options.altText ? { alt_text: options.altText } : {}),
  });
}

/**
 * Conteneur d'un carrousel : un conteneur par élément (image JPEG ou vidéo
 * `VIDEO`), tous traités, puis le conteneur parent avec la légende.
 */
async function createCarouselContainer(
  context: PublishContext,
  options: InstagramOptions,
  state: InstagramResume,
  save: () => void
): Promise<string | PublishPending> {
  if (context.source.kind !== "carousel") throw new Error("Source inattendue pour un carrousel.");
  const items = context.source.items;
  const children = state.children ?? [];
  state.children = children;
  for (let index = children.length; index < items.length; index += 1) {
    throwIfAborted(context);
    const item = items[index];
    const path = context.filePaths[index];
    if (!path) throw new Error(`Élément ${index + 1} du carrousel introuvable.`);
    const form: Record<string, string> =
      item.kind === "image"
        ? { image_url: await jpegUrl(context, path, true), is_carousel_item: "true" }
        : { media_type: "VIDEO", video_url: context.publicUrl(undefined, { item: index }), is_carousel_item: "true" };
    children.push(await createContainer(context, form));
    save();
  }
  for (const [index, child] of children.entries()) {
    const status = await waitForContainer(context, child, state, save);
    if (isPublishPending(status)) return status;
    if (status.code !== "FINISHED") {
      const detail = status.subcode ? SUBCODE_MESSAGES[status.subcode] : undefined;
      throw new ChildFailedError(`Élément ${index + 1} du carrousel refusé par Instagram (${status.code})${detail ? ` : ${detail}` : "."}`, status);
    }
  }
  return createContainer(context, { media_type: "CAROUSEL", children: children.join(","), ...commonFields(options) });
}

/** Un élément de carrousel a échoué : le carrousel entier est recréé si l'erreur est passagère. */
class ChildFailedError extends Error {
  readonly status: ContainerStatus;
  constructor(message: string, status: ContainerStatus) {
    super(message);
    this.name = "ChildFailedError";
    this.status = status;
  }
}

/** Le conteneur peut-il être recréé après cet état ? */
const rebuildable = (status: ContainerStatus) => status.code === "EXPIRED" || (status.code === "ERROR" && (!status.subcode || REBUILD_SUBCODES.has(status.subcode)));

/** Adresse publique d'un média publié ; à défaut, l'accueil d'Instagram (le média existe, rien ne doit échouer ici). */
export async function finishMedia(context: Pick<ConnectorContext, "getAccessToken" | "chargeQuota">, mediaId: string): Promise<{ externalId: string; url: string }> {
  try {
    const body = await graphRequest<{ permalink?: unknown; shortcode?: unknown }>(context, mediaId, { query: { fields: "permalink,shortcode" } });
    const permalink = typeof body.permalink === "string" && body.permalink.startsWith("https://") ? body.permalink : undefined;
    const shortcode = typeof body.shortcode === "string" && /^[A-Za-z0-9_-]+$/.test(body.shortcode) ? body.shortcode : undefined;
    return { externalId: mediaId, url: permalink ?? (shortcode ? `${INSTAGRAM_HOME}p/${shortcode}/` : INSTAGRAM_HOME) };
  } catch (error) {
    if (error instanceof ReconnectRequiredError) throw error;
    return { externalId: mediaId, url: INSTAGRAM_HOME };
  }
}

const sameText = (a: string, b: string) => {
  const normalize = (value: string) => value.replace(/@/g, "").replace(/\s+/g, " ").trim();
  return normalize(a) === normalize(b);
};

interface MediaEntry {
  id?: unknown;
  caption?: unknown;
  timestamp?: unknown;
  permalink?: unknown;
}

/** Date ISO d'Instagram (« 2026-10-12T08:00:00+0000 ») en millisecondes. */
export function parseInstagramDate(value: unknown): number {
  if (typeof value !== "string") return Number.NaN;
  return Date.parse(value.replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
}

/**
 * Le conteneur est publié mais la réponse s'est perdue : l'API ne relie pas
 * le conteneur au média. On lit les derniers médias du compte et on retient
 * celui qui suit la création du conteneur et porte la même légende (ou le
 * seul candidat quand la légende n'est pas lisible).
 */
export async function findPublishedMedia(
  context: Pick<ConnectorContext, "getAccessToken" | "chargeQuota" | "externalId">,
  since: number,
  caption: string
): Promise<{ externalId: string; url: string } | null> {
  let entries: MediaEntry[] = [];
  for (const fields of ["id,caption,timestamp,permalink", "id,timestamp,permalink"]) {
    try {
      const body = await graphRequest<{ data?: MediaEntry[] }>(context, `${context.externalId}/media`, { query: { fields, limit: 10 } });
      entries = Array.isArray(body.data) ? body.data : [];
      break;
    } catch (error) {
      // Champ refusé (code 100) : nouvel essai sans la légende.
      if (error instanceof InstagramApiError && error.code === 100 && fields.includes("caption")) continue;
      throw error;
    }
  }
  const candidates = entries.filter((entry) => idOf(entry.id) && parseInstagramDate(entry.timestamp) >= since - CLOCK_SKEW_MS);
  const readable = candidates.filter((entry) => typeof entry.caption === "string");
  const match =
    readable.find((entry) => sameText(String(entry.caption), caption)) ??
    (readable.length === 0 && candidates.length === 1 ? candidates[0] : undefined) ??
    (!caption && candidates.length === 1 ? candidates[0] : undefined);
  if (!match) return null;
  const id = idOf(match.id)!;
  const permalink = typeof match.permalink === "string" && match.permalink.startsWith("https://") ? match.permalink : undefined;
  return permalink ? { externalId: id, url: permalink } : finishMedia(context, id);
}

/** Avant de republier un travail déjà tenté : la publication existe-t-elle déjà ? */
export async function findExistingInstagramPost(context: PublishContext): Promise<{ externalId: string; url: string } | null> {
  const state = readResume(context.resume);
  if (state.mediaId) return finishMedia(context, state.mediaId);
  if (!state.containerId) return null;
  try {
    const status = await readContainerStatus(context, state.containerId);
    if (status.code !== "PUBLISHED") return null;
    const options = normalizeInstagramOptions(context.options, context.source);
    return await findPublishedMedia(context, state.containerCreatedAt ?? 0, options.caption);
  } catch (error) {
    if (error instanceof ReconnectRequiredError) throw error;
    // Lecture impossible : la publication relira l'état du conteneur avant tout envoi.
    return null;
  }
}

/**
 * Publie un Reel, une image ou un carrousel. Rend `PublishPending` tant
 * qu'Instagram traite le média : la file rappelle alors cette fonction, qui
 * reprend d'après l'état enregistré.
 */
export async function publishToInstagram(context: PublishContext): Promise<PublishOutcome> {
  if (context.source.kind === "text") throw new Error("Instagram ne publie pas de message sans image ni vidéo.");
  const options = normalizeInstagramOptions(context.options, context.source);
  const state = readResume(context.resume);
  const save = () => context.saveProgress({ ...state }, bytesServed(context, state));
  if (state.mediaId) return finishMedia(context, state.mediaId);

  const reset = () => {
    context.revokePublicUrls();
    state.containerId = undefined;
    state.containerCreatedAt = undefined;
    state.children = undefined;
    state.step = undefined;
    state.videoLinkId = undefined;
    state.waitedMs = undefined;
    state.rebuilds = (state.rebuilds ?? 0) + 1;
    if (state.rebuilds > MAX_REBUILDS) throw new Error("Instagram a refusé plusieurs conteneurs de suite : publication abandonnée, réessayez plus tard.");
    save();
  };

  let publishCharged = false;
  let notReady = 0;
  let missing = 0;
  let unsure = 0;
  for (;;) {
    throwIfAborted(context);
    if (state.containerId && Date.now() - (state.containerCreatedAt ?? 0) > CONTAINER_SAFE_MS) reset();

    if (!state.containerId) {
      await assertPublishingAllowed(context);
      try {
        const created =
          context.source.kind === "video"
            ? await createReelContainer(context, options, state)
            : context.source.kind === "image"
              ? await createImageContainer(context, options)
              : await createCarouselContainer(context, options, state, save);
        // Éléments du carrousel encore en traitement : la file reviendra.
        if (isPublishPending(created)) return created;
        state.containerId = created;
        state.containerCreatedAt = Date.now();
        state.step = "container";
        save();
      } catch (error) {
        if (error instanceof ChildFailedError && rebuildable(error.status)) {
          reset();
          continue;
        }
        throw error;
      }
    }

    const status = await waitForContainer(context, state.containerId!, state, save);
    if (isPublishPending(status)) return status;

    if (status.code === "PUBLISHED") {
      const found = await findPublishedMedia(context, state.containerCreatedAt ?? 0, options.caption);
      if (!found) {
        throw new Error("Instagram indique la publication faite, mais elle reste introuvable dans les derniers médias du compte : vérifiez sur Instagram avant de republier.");
      }
      state.mediaId = found.externalId;
      save();
      context.revokePublicUrls();
      return found;
    }

    if (status.code !== "FINISHED") {
      if (rebuildable(status)) {
        reset();
        continue;
      }
      const detail = status.subcode ? SUBCODE_MESSAGES[status.subcode] : undefined;
      throw new Error(`Instagram a refusé le média (${status.code || "état inconnu"}${status.subcode ? `, ${status.subcode}` : ""})${detail ? ` : ${detail}` : "."}`);
    }

    // Le fichier est chez Instagram : les liens publics se ferment.
    context.revokePublicUrls();
    state.step = "publishing";
    save();
    try {
      const body = await graphRequest<{ id?: unknown }>(context, `${context.externalId}/media_publish`, {
        form: { creation_id: state.containerId },
        ...(publishCharged ? {} : { quotaMethod: "media_publish" }),
      });
      publishCharged = true;
      const mediaId = idOf(body.id);
      if (!mediaId) throw new Error("Instagram n’a pas rendu l’identifiant de la publication.");
      state.mediaId = mediaId;
      save();
      return await finishMedia(context, mediaId);
    } catch (error) {
      publishCharged = true;
      if (error instanceof InstagramApiError && error.subcode === 2207027 && notReady < 3) {
        // « Pas encore prêt » : on attend et on relit l'état avant de republier.
        notReady += 1;
        await context.sleep(SHORT_WAIT_MS);
        continue;
      }
      if (error instanceof InstagramApiError && error.subcode === 2207008) {
        // Conteneur introuvable, souvent passager : deux essais, puis un nouveau conteneur.
        missing += 1;
        if (missing > 2) {
          missing = 0;
          reset();
        } else await context.sleep(30_000 * missing);
        continue;
      }
      if (isTransient(error) && unsure < 2) {
        // Panne ou coupure : la publication a pu aboutir. On attend, puis la
        // boucle relit l'état du conteneur avant tout nouvel envoi.
        unsure += 1;
        await context.sleep(30_000 * unsure);
        continue;
      }
      throw error;
    }
  }
}
