import type { EventConfig, Handlers } from "motia";
import { google } from "googleapis";
import { Readable } from "stream";
import {
  getFirstConnectedUser,
  getAuthenticatedClient,
} from "../helper/oauth";
import { getVideoStream, getThumbnailStream } from "../shared/storage";

export const config: EventConfig = {
  name: "Upload-To-YouTube",
  type: "event",
  description: "Upload video with generated metadata to YouTube",
  flows: ["yt.video.upload"],
  subscribes: ["thumbnail.image.generated", "final.title.generated"],
  emits: [
    { topic: "youtube.upload.completed", label: "YouTube Upload Completed" },
    { topic: "youtube.upload.error", label: "YouTube Upload Error", conditional: true },
  ],
};

export const handler: Handlers["Upload-To-YouTube"] = async (
  input: any,
  { emit, logger, state }: any
) => {
  const { traceId } = input;

  try {
    logger.info("Starting YouTube upload", { traceId });

    const videoData = await state.get(traceId, "videoData");
    const metadata = await state.get(traceId, "metadata");
    const generatedTitle = await state.get(traceId, "generatedTitle");
    const thumbnail = await state.get(traceId, "thumbnail");

    if (!videoData) {
      throw new Error("Video data not found in state");
    }

    if (!metadata) {
      throw new Error("Metadata not found in state");
    }

    if (!videoData.storageKey) {
      throw new Error("Video storage key not found. Video must be uploaded to storage first.");
    }

    await state.set(traceId, "status", {
      status: "uploading-to-youtube",
      updatedAt: new Date().toISOString(),
    });

    const connectedUser = await getFirstConnectedUser();
    if (!connectedUser) {
      throw new Error("No YouTube account connected. Please connect your account first.");
    }

    logger.info("Found connected user", {
      traceId,
      email: connectedUser.email,
    });

    const authClient = await getAuthenticatedClient(connectedUser.email);

    const youtube = google.youtube({ version: "v3", auth: authClient });

    const videoTitle = generatedTitle?.title || metadata.title || videoData.fileName;
    const videoDescription = metadata.description || "Uploaded via YouTube Auto Publisher";
    const tags = Array.isArray(metadata.tags) ? metadata.tags : [];

    logger.info("Getting video stream from storage", {
      traceId,
      storageKey: videoData.storageKey,
    });

    const videoStream = await getVideoStream(videoData.storageKey);

    logger.info("Uploading video to YouTube", {
      traceId,
      title: videoTitle,
      privacy: metadata.privacy,
      storageKey: videoData.storageKey,
    });

    const uploadResponse = await youtube.videos.insert({
      part: ["snippet", "status"],
      requestBody: {
        snippet: {
          title: videoTitle,
          description: videoDescription,
          tags: tags,
          categoryId: "22",
          defaultLanguage: "en",
          defaultAudioLanguage: "en",
        },
        status: {
          privacyStatus: metadata.privacy || "private",
          selfDeclaredMadeForKids: false,
        },
      },
      media: {
        mimeType: videoData.mimetype || "video/mp4",
        body: videoStream,
      },
    });

    const videoId = uploadResponse.data.id;
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

    logger.info("Video uploaded successfully", {
      traceId,
      videoId,
      videoUrl,
    });

    let thumbnailUploaded = false;
    if (thumbnail?.storageKey && videoId && !thumbnail.isPlaceholder) {
      try {
        logger.info("Uploading thumbnail from storage", {
          traceId,
          videoId,
          thumbnailStorageKey: thumbnail.storageKey,
        });

        const thumbnailStream = await getThumbnailStream(thumbnail.storageKey);

        await youtube.thumbnails.set({
          videoId: videoId,
          media: {
            mimeType: `image/${thumbnail.format || "jpeg"}`,
            body: thumbnailStream,
          },
        });

        thumbnailUploaded = true;
        logger.info("Thumbnail uploaded successfully", { traceId, videoId });
      } catch (thumbnailError: any) {
        logger.warn("Failed to upload thumbnail", {
          traceId,
          videoId,
          error: thumbnailError.message,
        });
      }
    } else {
      logger.info("No thumbnail to upload", {
        traceId,
        hasThumbnail: Boolean(thumbnail),
        hasStorageKey: Boolean(thumbnail?.storageKey),
        isPlaceholder: thumbnail?.isPlaceholder,
      });
    }

    await state.set(traceId, "uploadResult", {
      videoId,
      videoUrl,
      channelId: uploadResponse.data.snippet?.channelId,
      channelTitle: uploadResponse.data.snippet?.channelTitle,
      publishedAt: uploadResponse.data.snippet?.publishedAt,
      thumbnailUploaded,
      uploadedAt: new Date().toISOString(),
    });

    await state.set(traceId, "status", {
      status: "completed",
      videoId,
      videoUrl,
      updatedAt: new Date().toISOString(),
    });

    logger.info("YouTube upload completed", {
      traceId,
      videoId,
      videoUrl,
      thumbnailUploaded,
    });

    await emit({
      topic: "youtube.upload.completed",
      data: {
        traceId,
        videoId,
        videoUrl,
        title: videoTitle,
        privacy: metadata.privacy,
        thumbnailUploaded,
      },
    });

  } catch (error: any) {
    logger.error("Error uploading to YouTube", {
      traceId,
      error: error.message,
      stack: error.stack,
    });

    let errorMessage = error.message;
    if (error.code === 403) {
      errorMessage = "YouTube API quota exceeded or permission denied";
    } else if (error.code === 401) {
      errorMessage = "YouTube authentication expired. Please reconnect your account.";
    } else if (error.code === 400) {
      errorMessage = `Invalid request: ${error.message}`;
    }

    try {
      await state.set(traceId, "status", {
        status: "upload-failed",
        error: errorMessage,
        updatedAt: new Date().toISOString(),
      });
    } catch {
    }

    await emit({
      topic: "youtube.upload.error",
      data: {
        traceId,
        error: errorMessage,
        step: "youtube-upload",
      },
    });
  }
};