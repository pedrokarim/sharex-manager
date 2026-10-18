/** Permissions connues d'une clé API ; toute autre clé est refusée à la création. */
export const API_KEY_PERMISSIONS = ["uploadImages", "uploadText", "uploadFiles", "extractColors"] as const;
export type ApiKeyPermission = (typeof API_KEY_PERMISSIONS)[number];

export interface ApiKeyPermissions {
  uploadImages: boolean;
  uploadText: boolean;
  uploadFiles: boolean;
  extractColors?: boolean;
}

/**
 * Clé API telle qu'elle est enregistrée dans `data/api-keys.json` : le
 * serveur n'en garde que l'empreinte SHA-256 et un préfixe d'affichage.
 */
export interface ApiKey {
  id: string;
  name: string;
  /** Empreinte SHA-256 (hexadécimal) de la clé complète. */
  hash: string;
  /** Début de la clé (`sk_` + six caractères), pour la reconnaître. */
  prefix: string;
  createdAt: string;
  expiresAt: string | null;
  createdBy: string;
  permissions: ApiKeyPermissions;
  lastUsed?: string;
}

/** Ce que voit l'interface : jamais l'empreinte. */
export type ApiKeyView = Omit<ApiKey, "hash">;

/** Réponse de la création : la clé complète, remise une seule fois. */
export interface CreatedApiKey extends ApiKeyView {
  key: string;
}

/** Réglages de durée de vie des clés, lus par la fenêtre de création. */
export interface ApiKeyPolicy {
  defaultExpiryDays: number | null;
  maxExpiryDays: number | null;
}
