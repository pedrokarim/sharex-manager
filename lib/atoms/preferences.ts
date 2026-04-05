import { atomWithStorage } from "jotai/utils";

export type GalleryViewMode = "grid" | "list" | "details";
export type ThumbnailSize = "tiny" | "small" | "medium" | "large";
export type Language = "fr" | "en";
export type SortOrder = "asc" | "desc";
export type SortBy = "name" | "date" | "size";

interface PreferencesState {
  language: Language;
  galleryViewMode: GalleryViewMode;
  thumbnailSize: ThumbnailSize;
  showFileInfo: boolean;
  showFileSize: boolean;
  showUploadDate: boolean;
  sortBy: SortBy;
  sortOrder: SortOrder;
  autoRefreshInterval: number;
  showNotifications: boolean;
  showThumbnails: boolean;
  defaultView: GalleryViewMode;
  defaultSortBy: SortBy;
  defaultSortOrder: SortOrder;
  enableUploadNotifications: boolean;
}

const defaultPreferences: PreferencesState = {
  language: "fr",
  galleryViewMode: "grid",
  thumbnailSize: "medium",
  showFileInfo: true,
  showFileSize: true,
  showUploadDate: true,
  sortBy: "date",
  sortOrder: "desc",
  autoRefreshInterval: 0,
  showNotifications: true,
  showThumbnails: true,
  defaultView: "grid",
  defaultSortBy: "date",
  defaultSortOrder: "desc",
  enableUploadNotifications: true,
};

// Atome principal pour toutes les préférences
export const preferencesAtom = atomWithStorage<PreferencesState>(
  "preferences",
  defaultPreferences
);

// Atomes dérivés pour des valeurs spécifiques
export const languageAtom = atomWithStorage<Language>("language", "fr");
export const galleryViewModeAtom = atomWithStorage<GalleryViewMode>(
  "galleryViewMode",
  "grid"
);
export const thumbnailSizeAtom = atomWithStorage<ThumbnailSize>(
  "thumbnailSize",
  "medium"
);
export const showFileInfoAtom = atomWithStorage<boolean>("showFileInfo", true);
export const showFileSizeAtom = atomWithStorage<boolean>("showFileSize", true);
export const showUploadDateAtom = atomWithStorage<boolean>(
  "showUploadDate",
  true
);
export const sortByAtom = atomWithStorage<SortBy>("sortBy", "date");
export const sortOrderAtom = atomWithStorage<SortOrder>("sortOrder", "desc");
export const autoRefreshIntervalAtom = atomWithStorage<number>(
  "autoRefreshInterval",
  0
);
export const showNotificationsAtom = atomWithStorage<boolean>(
  "showNotifications",
  true
);
export const showThumbnailsAtom = atomWithStorage<boolean>(
  "showThumbnails",
  true
);
export const defaultViewAtom = atomWithStorage<GalleryViewMode>(
  "defaultView",
  "grid"
);
export const defaultSortByAtom = atomWithStorage<SortBy>(
  "defaultSortBy",
  "date"
);
export const defaultSortOrderAtom = atomWithStorage<SortOrder>(
  "defaultSortOrder",
  "desc"
);
export const enableUploadNotificationsAtom = atomWithStorage<boolean>(
  "enableUploadNotifications",
  true
);

// Atomes dérivés pour des combinaisons utiles
export const sortingAtom = atomWithStorage<{ by: SortBy; order: SortOrder }>(
  "sorting",
  {
    by: "date",
    order: "desc",
  }
);
