/**
 * Profil TikTok (dossier 07e, § 8). L'API « Display » ne fait que lire :
 * `GET /v2/user/info/` rend le nom affiché et la photo (`user.info.basic`),
 * le pseudo et la bio (`user.info.profile`). Aucune méthode documentée ne
 * change le profil : tout se fait dans l'application TikTok, avec ce que la
 * marque fournit (bio à copier, photo au format avatar).
 */

import type { ConnectorContext, ProfileField, ProfileSnapshot, ProfileValue } from "../../types";
import { fetchTiktokUser } from "./api";

const EDIT_PROFILE = { url: "{url}", linkLabel: "Ouvrir le profil TikTok" };

export const TIKTOK_PROFILE_FIELDS: ProfileField[] = [
  { key: "name", label: "Nom", kind: "text", editable: false, brand: "name", manual: EDIT_PROFILE },
  {
    key: "username",
    label: "Nom d’utilisateur",
    kind: "text",
    editable: false,
    manual: { ...EDIT_PROFILE, reason: "TikTok ne permet pas de le changer par son API, et ne le rend qu’avec l’autorisation « user.info.profile »." },
  },
  { key: "bio", label: "Bio", kind: "textarea", editable: false, brand: "bio", manual: EDIT_PROFILE },
  { key: "avatar", label: "Photo de profil", kind: "image", editable: false, imageFormat: "avatar", manual: EDIT_PROFILE },
];

/** Profil actuel (lecture, non comptée). */
export async function readTiktokProfile(context: ConnectorContext): Promise<ProfileSnapshot> {
  const token = await context.getAccessToken();
  const user = await fetchTiktokUser(token.value);
  const values: Record<string, ProfileValue> = { name: user.display_name ?? "" };
  if (user.username) values.username = `@${user.username}`;
  if (typeof user.bio_description === "string") values.bio = user.bio_description;
  if (user.avatar_url?.startsWith("https://")) values.avatar = user.avatar_url;
  return { values, fetchedAt: Date.now() };
}
