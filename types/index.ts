export interface FileInfo {
  name: string;
  url: string;
  size: number;
  createdAt: string;
}

export interface GroupedFiles {
  [key: string]: FileInfo[];
}
