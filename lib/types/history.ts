export interface HistoryEntry {
  id: string;
  filename: string;
  originalFilename: string;
  uploadDate: string;
  fileSize: number;
  mimeType: string;
  ipAddress: string;
  userId?: string;
  userName?: string;
  uploadMethod: "api" | "web" | "sharex";
  fileUrl: string;
  thumbnailUrl?: string;
  deletionToken?: string;
}

export type HistoryFilter = {
  startDate?: Date;
  endDate?: Date;
  userId?: string;
  uploadMethod?: "api" | "web" | "sharex";
  searchQuery?: string;
};
