/**
 * Premier commentaire Instagram (dossier 01 ter, § 6 ; dossier 07b).
 *
 * D'après la référence « IG Media Comments » (vérifiée le 12/10/2026) :
 * `POST /<IG_MEDIA_ID>/comments` avec `message`, sur `graph.instagram.com`
 * dans la voie « Instagram API with Instagram Login », autorisations
 * `instagram_business_basic` et `instagram_business_manage_comments` ; pas de
 * commentaire sur une vidéo en direct. La référence ne donne aucune longueur
 * maximale : la borne est celle de la légende (2 200 caractères).
 *
 * La couverture d'un Reel ne se change pas après coup : elle part avec le
 * conteneur (`cover_url`, prioritaire sur `thumb_offset`, JPEG de 8 Mo au
 * plus). La file la range donc dans la source au lieu d'en faire une suite.
 * Instagram ne prend pas de sous-titres par l'API.
 */

import type { FollowUpContext, FollowUpOutcome } from "../../types";
import { graphRequest, idOf } from "./api";
import { CAPTION_MAX_CHARS } from "./metadata";

/** Aucune longueur n'est documentée pour un commentaire : celle de la légende. */
export const COMMENT_MAX_CHARS = CAPTION_MAX_CHARS;

/** Commentaire du compte déjà posté avec ce texte (réponse perdue) ; `null` sinon. */
async function findOwnComment(context: FollowUpContext, mediaId: string, text: string): Promise<string | null> {
  try {
    const body = await graphRequest<{ data?: { id?: unknown; text?: unknown; from?: { id?: unknown } }[] }>(context, `${encodeURIComponent(mediaId)}/comments`, {
      query: { fields: "id,text,from" },
    });
    const match = (body.data ?? []).find((comment) => idOf(comment.from?.id) === context.externalId && String(comment.text ?? "").trim() === text.trim());
    return match ? (idOf(match.id) ?? null) : null;
  } catch {
    return null;
  }
}

/** Premier commentaire sous le média publié, posté par le compte lui-même. */
export async function postInstagramComment(context: FollowUpContext, text: string): Promise<FollowUpOutcome> {
  const mediaId = context.result.externalId;
  if (context.attempt > 1) {
    const existing = await findOwnComment(context, mediaId, text);
    if (existing) return { externalId: existing, url: context.result.url };
  }
  const body = await graphRequest<{ id?: unknown }>(context, `${encodeURIComponent(mediaId)}/comments`, {
    method: "POST",
    form: { message: text },
    quotaMethod: "comments",
  });
  const id = idOf(body.id);
  return { ...(id ? { externalId: id } : {}), url: context.result.url };
}
