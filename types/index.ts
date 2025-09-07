export interface FileInfo {
  name: string;
  url: string;
  size: number;
  createdAt: string;
}

export interface GroupedFiles {
  [key: string]: FileInfo[];
}

// Exports des types d'albums
export * from './albums';
export * from './files';
export * from './user';
export * from './api-key';
export * from './modules';