/**
 * Profil d'un compte Instagram professionnel (dossier 07, § 8.12). La
 * référence « IG User » (vérifiée le 12/10/2026) ne documente que la
 * lecture : « Creating / Updating / Deleting : This operation is not
 * supported. » Tout le profil est donc à changer dans l'application
 * Instagram ; ShareX Manager lit les valeurs actuelles et fournit ce que la
 * marque propose (textes à copier, photo à télécharger).
 */

import type { ConnectorContext, ProfileField, ProfileSnapshot, ProfileValue } from "../../types";
import { InstagramApiError, graphRequest } from "./api";

const EDIT_PROFILE = { url: "https://www.instagram.com/accounts/edit/", linkLabel: "Ouvrir Instagram › Modifier le profil" };

/** Longueur de la bio dans l'application Instagram (la référence de l'API ne la donne pas). */
export const BIO_MAX = 150;

export const INSTAGRAM_PROFILE_FIELDS: ProfileField[] = [
  { key: "name", label: "Nom", kind: "text", editable: false, brand: "name", manual: EDIT_PROFILE },
  { key: "username", label: "Nom d’utilisateur", kind: "text", editable: false, manual: EDIT_PROFILE },
  { key: "biography", label: "Bio", kind: "textarea", editable: false, brand: "bio", maxLength: BIO_MAX, manual: EDIT_PROFILE },
  { key: "website", label: "Lien", kind: "url", editable: false, brand: "website", manual: EDIT_PROFILE },
  { key: "avatar", label: "Photo de profil", kind: "image", editable: false, imageFormat: "avatar", manual: EDIT_PROFILE },
];

interface InstagramProfileBody {
  username?: string;
  name?: string;
  biography?: string;
  website?: string;
  profile_picture_url?: string;
}

const FULL_FIELDS = "username,name,biography,website,profile_picture_url";
const BASE_FIELDS = "username,name,profile_picture_url";

/** Profil actuel (lecture gratuite) ; sans la bio ni le lien si le service refuse ces champs. */
export async function readInstagramProfile(context: ConnectorContext): Promise<ProfileSnapshot> {
  let body: InstagramProfileBody;
  try {
    body = await graphRequest<InstagramProfileBody>(context, "me", { query: { fields: FULL_FIELDS } });
  } catch (error) {
    // Champ inconnu dans cette voie de l'API (code 100) : les champs de base suffisent.
    if (!(error instanceof InstagramApiError && error.code === 100)) throw error;
    body = await graphRequest<InstagramProfileBody>(context, "me", { query: { fields: BASE_FIELDS } });
  }
  const values: Record<string, ProfileValue> = { name: body.name ?? "", username: body.username ? `@${body.username}` : "" };
  if (typeof body.biography === "string") values.biography = body.biography;
  if (typeof body.website === "string") values.website = body.website;
  if (body.profile_picture_url?.startsWith("https://")) values.avatar = body.profile_picture_url;
  return { values, fetchedAt: Date.now() };
}
