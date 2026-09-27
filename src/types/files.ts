export interface FileInfo {
  name: string;
  url: string;
  size: number;
  createdAt: string;
  isSecure?: boolean;
  isStarred?: boolean;
  /** Vidéo : durée et dimensions, connues une fois la couverture extraite. */
  durationMs?: number;
  width?: number;
  height?: number;
}
