export interface Album {
  id: number;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  userId?: string;
  thumbnailFile?: string;
  fileCount: number;
}

export interface AlbumFile {
  id: number;
  albumId: number;
  fileName: string;
  addedAt: string;
}

export interface CreateAlbumRequest {
  name: string;
  description?: string;
}

export interface UpdateAlbumRequest {
  name?: string;
  description?: string;
  thumbnailFile?: string;
}

export interface AddFilesToAlbumRequest {
  fileNames: string[];
}

export interface RemoveFilesFromAlbumRequest {
  fileNames: string[];
}

export interface AlbumWithFiles extends Album {
  files: string[];
}

export interface AlbumsStats {
  totalAlbums: number;
  totalFiles: number;
  averageFilesPerAlbum: number;
}

// Types pour la multi-sélection
export interface MultiSelection {
  selectedFiles: Set<string>;
  isSelecting: boolean;
  lastSelected?: string;
  selectMode: 'single' | 'multi' | 'range';
}

export interface SelectionAction {
  type: 'add' | 'remove' | 'clear' | 'range' | 'all' | 'toggle';
  fileNames?: string[];
  rangeStart?: string;
  rangeEnd?: string;
}

export interface SelectionToolbarActions {
  addToAlbum: (albumId: number) => void;
  removeFromAlbum: (albumId: number) => void;
  deleteSelected: () => void;
  toggleStarSelected: () => void;
  toggleSecuritySelected: () => void;
  downloadSelected: () => void;
}


