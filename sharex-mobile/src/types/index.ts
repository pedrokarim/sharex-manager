// Types pour l'application ShareX Manager Mobile

export interface ApiKey {
  id: string;
  name: string;
  key: string;
  permissions: {
    uploadImages: boolean;
    uploadText: boolean;
    uploadFiles: boolean;
  };
  expiresAt?: string;
  lastUsed?: string;
  createdAt: string;
}

export interface UploadResponse {
  success: boolean;
  url?: string;
  filename?: string;
  error?: string;
}

export interface ServerConfig {
  url: string;
  apiKey: string;
  isConnected: boolean;
}

export interface ImageInfo {
  uri: string;
  name: string;
  type: string;
  size: number;
  width?: number;
  height?: number;
}

export interface UploadHistoryItem {
  id: string;
  filename: string;
  url: string;
  uploadedAt: string;
  size: number;
  type: string;
}

export interface AppSettings {
  serverUrl: string;
  apiKey: string;
  autoUpload: boolean;
  notifications: boolean;
  theme: "light" | "dark" | "auto";
  allowImageEditing: boolean;
}

export type ScreenName =
  | "Home"
  | "Settings"
  | "Gallery"
  | "Upload"
  | "History"
  | "Camera";

export interface NavigationProps {
  navigation: any;
  route: any;
}
