export interface ApiKeyPermissions {
  uploadImages: boolean;
  uploadText: boolean;
  uploadFiles: boolean;
}

export interface ApiKey {
  id: string;
  name: string;
  key: string;
  createdAt: string;
  expiresAt: string | null;
  createdBy: string;
  permissions: ApiKeyPermissions;
  lastUsed?: string;
}
