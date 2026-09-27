export interface Domain {
  id: string;
  name: string;
  url: string;
  isDefault?: boolean;
}

export interface DomainConfig {
  list: Domain[];
  defaultDomain: string;
  useSSL: boolean;
  pathPrefix: string;
}

export interface UploadConfig {
  allowedTypes: {
    images: boolean;
    documents: boolean;
    archives: boolean;
    /** Absent des anciennes configurations : les vidéos restent alors refusées. */
    videos?: boolean;
  };
  limits: {
    maxFileSize: number;
    /** Limite propre aux vidéos, en Mo (95 par défaut : Cloudflare refuse un envoi de plus de 100 Mo). */
    maxVideoSize?: number;
    minFileSize: number;
    maxFilesPerUpload: number;
    maxFilesPerType: {
      images: number;
      documents: number;
      archives: number;
    };
  };
  filenamePattern: string;
  thumbnails: {
    enabled: boolean;
    maxWidth: number;
    maxHeight: number;
    quality: number;
    format: "auto" | "jpeg" | "png" | "webp";
    preserveFormat: boolean;
    fit: "cover" | "contain" | "fill" | "inside" | "outside";
    background: string;
    progressive: boolean;
    blur: number;
    sharpen: boolean;
    metadata: boolean;
  };
  storage: {
    path: string;
    structure: string;
    preserveFilenames: boolean;
    replaceExisting: boolean;
    thumbnailsPath: string;
    dateFormat: {
      folderStructure: string;
      timezone: string;
    };
    permissions: {
      files: string;
      directories: string;
    };
  };
  domains: DomainConfig;
}
