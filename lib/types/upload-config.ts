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
  };
  limits: {
    maxFileSize: number;
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
