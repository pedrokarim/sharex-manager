/**
 * Profil Threads (dossier 07, § 8.12). La page « Threads Profiles » de la
 * documentation (vérifiée le 12/10/2026) ne décrit que la lecture
 * (`GET /{threads-user-id}` : `username`, `name`,
 * `threads_profile_picture_url`, `threads_biography`, autorisation
 * `threads_basic`) : tout le profil se change dans l'application Threads.
 */

import type { ConnectorContext, ProfileField, ProfileSnapshot, ProfileValue } from "../../types";
import { threadsRequest } from "./api";

const EDIT_PROFILE = { url: "{url}", linkLabel: "Ouvrir le profil Threads" };

export const THREADS_PROFILE_FIELDS: ProfileField[] = [
  { key: "name", label: "Nom", kind: "text", editable: false, brand: "name", manual: EDIT_PROFILE },
  { key: "username", label: "Nom d’utilisateur", kind: "text", editable: false, manual: { ...EDIT_PROFILE, reason: "Il suit le nom d’utilisateur Instagram, et Threads ne permet pas de le changer par son API." } },
  { key: "biography", label: "Bio", kind: "textarea", editable: false, brand: "bio", manual: EDIT_PROFILE },
  { key: "links", label: "Liens du profil", kind: "textarea", editable: false, brand: "links", manual: { ...EDIT_PROFILE, reason: "Threads ne permet ni de lire ni de changer les liens du profil par son API." } },
  { key: "avatar", label: "Photo de profil", kind: "image", editable: false, imageFormat: "avatar", manual: EDIT_PROFILE },
];

interface ThreadsProfileBody {
  username?: string;
  name?: string;
  threads_biography?: string;
  threads_profile_picture_url?: string;
}

/** Profil actuel (lecture, non comptée). */
export async function readThreadsProfile(context: ConnectorContext): Promise<ProfileSnapshot> {
  const body = await threadsRequest<ThreadsProfileBody>(context, "profile.read", "me", {
    query: { fields: "id,username,name,threads_biography,threads_profile_picture_url" },
  });
  const values: Record<string, ProfileValue> = {
    name: body?.name ?? "",
    username: body?.username ? `@${body.username}` : "",
    biography: body?.threads_biography ?? "",
  };
  if (body?.threads_profile_picture_url?.startsWith("https://")) values.avatar = body.threads_profile_picture_url;
  return { values, fetchedAt: Date.now() };
}
