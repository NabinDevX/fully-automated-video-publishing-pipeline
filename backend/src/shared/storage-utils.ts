import type { SupportedVideoFormat } from "./interfaces";

export const STATE_KEYS = {
  oauthState: (stateId: string) => `oauth:state:${stateId}`,
  youtubeTokens: (userId: string) => `youtube:tokens:${userId}`,
  videoWorkflow: (traceId: string) => `video:workflow:${traceId}`,
} as const;

export function generateVideoFilename(originalFilename: string): string {
  const ext = originalFilename.split(".").pop()?.toLowerCase() || "mp4";
  const uuid = crypto.randomUUID();
  return `video_${Date.now()}_${uuid}.${ext}`;
}

export function generateThumbnailFilename(): string {
  const uuid = crypto.randomUUID();
  return `thumb_${Date.now()}_${uuid}.jpg`;
}

export function isValidVideoFormat(filename: string): boolean {
  const ext = filename.split(".").pop()?.toLowerCase();
  const validFormats: SupportedVideoFormat[] = [
    "mp4",
    "mov",
    "avi",
    "webm",
    "mkv",
  ];
  return validFormats.includes(ext as SupportedVideoFormat);
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
