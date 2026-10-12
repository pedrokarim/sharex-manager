/**
 * Profil d'une Page Facebook (dossier 07, § 8.12). Références vérifiées le
 * 12/10/2026 :
 * - « Page » de la Graph API, section « Updating » : `POST /{page-id}`
 *   accepte notamment `about` (réglage « Description » de la Page),
 *   `website`, `phone`, `description`… ; `about` est limité à 100
 *   caractères (description du champ en lecture) ;
 * - guide « Manage a Page » : jeton de Page d'une personne qui peut
 *   accomplir la tâche MANAGE, autorisation `pages_manage_metadata` ;
 * - la couverture (`cover`) ne se change qu'avec `business_management`,
 *   que l'application ne demande pas ; aucune méthode documentée ne change
 *   la photo de profil ni le nom.
 */

import type { ConnectorContext, ProfileField, ProfileSnapshot, ProfileValue } from "../../types";
import { authFromContext, graphRequest } from "./graph";

const PAGE_LINK = { url: "{url}", linkLabel: "Ouvrir la Page Facebook" };

export const ABOUT_MAX = 100;

export const FACEBOOK_PROFILE_FIELDS: ProfileField[] = [
  {
    key: "about",
    label: "Description de la Page",
    kind: "textarea",
    editable: true,
    maxLength: ABOUT_MAX,
    capability: "profile.details",
    brand: "bio",
    help: "Le court texte de présentation de la Page, repris de la bio de la marque.",
  },
  {
    key: "website",
    label: "Site web",
    kind: "url",
    editable: true,
    capability: "profile.details",
    brand: "website",
    help: "Premier lien de la marque.",
  },
  { key: "name", label: "Nom de la Page", kind: "text", editable: false, brand: "name", manual: PAGE_LINK },
  { key: "avatar", label: "Photo de profil", kind: "image", editable: false, imageFormat: "avatar", manual: PAGE_LINK },
  {
    key: "cover",
    label: "Photo de couverture",
    kind: "image",
    editable: false,
    imageFormat: "x-header",
    help: "Format 3:1 de la marque : Facebook recadre la couverture.",
    manual: { ...PAGE_LINK, reason: "L’API de Facebook ne change la couverture qu’avec une autorisation d’entreprise (business_management) que ShareX Manager ne demande pas." },
  },
];

interface PageProfile {
  name?: string;
  about?: string;
  website?: string;
  picture?: { data?: { url?: string } };
  cover?: { source?: string };
}

/** Profil actuel de la Page : une lecture. */
export async function readFacebookProfile(context: ConnectorContext): Promise<ProfileSnapshot> {
  context.chargeQuota("page.read");
  const page = await graphRequest<PageProfile>(await authFromContext(context), encodeURIComponent(context.externalId), {
    params: { fields: "name,about,website,picture.type(large){url},cover{source}" },
  });
  const values: Record<string, ProfileValue> = { name: page.name ?? "", about: page.about ?? "", website: page.website ?? "" };
  if (page.picture?.data?.url?.startsWith("https://")) values.avatar = page.picture.data.url;
  if (page.cover?.source?.startsWith("https://")) values.cover = page.cover.source;
  return { values, fetchedAt: Date.now() };
}

/** Envoie `about` et `website` (seuls les champs envoyés changent chez Facebook), puis relit la Page. */
export async function updateFacebookProfile(context: ConnectorContext, changes: Record<string, ProfileValue>): Promise<ProfileSnapshot> {
  const params: Record<string, string> = {};
  for (const key of ["about", "website"] as const) if (typeof changes[key] === "string") params[key] = changes[key] as string;
  if (Object.keys(params).length > 0) {
    context.chargeQuota("page.update");
    await graphRequest(await authFromContext(context), encodeURIComponent(context.externalId), { method: "POST", params });
  }
  return readFacebookProfile(context);
}
