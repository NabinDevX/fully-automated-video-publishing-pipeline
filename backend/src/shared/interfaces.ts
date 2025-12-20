export type SupportedVideoFormat = "mp4" | "mov" | "avi" | "webm" | "mkv";

export type SupportedThumbnailFormat = "jpeg" | "png" | "webp";

export type VideoPrivacyStatus = "public" | "unlisted" | "private";

export type UploadStatus = "pending" | "processing" | "uploaded" | "failed";

export interface VideoDocument {
  traceId: string;
  userId: string;
  originalFilename: string;
  storageKey: string;
  format: SupportedVideoFormat;
  fileSize: number;
  title: string;
  description: string;
  tags: string[];
  privacy: VideoPrivacyStatus;
  thumbnailStorageKey?: string;
  youtubeVideoId?: string;
  youtubeVideoUrl?: string;
  status: UploadStatus;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ThumbnailDocument {
  traceId: string;
  videoTraceId: string;
  storageKey: string;
  format: SupportedThumbnailFormat;
  fileSize: number;
  generatedByGemini: boolean;
  createdAt: Date;
}
