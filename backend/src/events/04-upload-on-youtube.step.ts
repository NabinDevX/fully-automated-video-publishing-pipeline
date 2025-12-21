import type { EventConfig, Handlers } from "motia";
import { google } from "googleapis";
import { Readable } from "stream";
import {
  getFirstConnectedUser,
  getAuthenticatedClient,
} from "../helper/oauth";

export const config: EventConfig = {
  name: "Upload-To-YouTube",
  type: "event",
  description: "Upload video with generated metadata to YouTube",
  flows: ["yt.video.upload"],
  subscribes: ["file.uploaded", "thumbnail.image.generated", "final.title.generated"],
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

    // Get all data from state
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

    // Update status
    await state.set(traceId, "status", {
      status: "uploading-to-youtube",
      updatedAt: new Date().toISOString(),
    });

    // Get connected user
    const connectedUser = await getFirstConnectedUser();
    if (!connectedUser) {
      throw new Error("No YouTube account connected. Please connect your account first.");
    }

    logger.info("Found connected user", {
      traceId,
      email: connectedUser.email,
    });

    // Get authenticated OAuth client
    const authClient = await getAuthenticatedClient(connectedUser.email);

    // Initialize YouTube API
    const youtube = google.youtube({ version: "v3", auth: authClient });

    // Prepare video title and description
    const videoTitle = generatedTitle?.title || metadata.title || videoData.fileName;
    const videoDescription = metadata.description || `Uploaded via YouTube Auto Publisher`;

    // Prepare tags
    const tags = metadata.tags || [];

    // Convert base64 buffer back to Buffer
    const videoBuffer = Buffer.from(videoData.buffer, "base64");

    // Create readable stream from buffer
    const videoStream = new Readable();
    videoStream.push(videoBuffer);
    videoStream.push(null);

    logger.info("Uploading video to YouTube", {
      traceId,
      title: videoTitle,
      privacy: metadata.privacy,
      fileSize: videoBuffer.length,
    });

    // Upload video to YouTube
    const uploadResponse = await youtube.videos.insert({
      part: ["snippet", "status"],
      requestBody: {
        snippet: {
          title: videoTitle,
          description: videoDescription,
          tags: tags,
          categoryId: "22", // People & Blogs (default)
          defaultLanguage: "en",
          defaultAudioLanguage: "en",
        },
        status: {
          privacyStatus: metadata.privacy || "private",
          selfDeclaredMadeForKids: false,
        },
      },
      media: {
        mimeType: videoData.mimetype,
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

    // Upload thumbnail if available
    let thumbnailUploaded = false;
    if (thumbnail?.base64 && videoId) {
      try {
        logger.info("Uploading thumbnail", { traceId, videoId });

        const thumbnailBuffer = Buffer.from(thumbnail.base64, "base64");
        const thumbnailStream = new Readable();
        thumbnailStream.push(thumbnailBuffer);
        thumbnailStream.push(null);

        await youtube.thumbnails.set({
          videoId: videoId,
          media: {
            mimeType: "image/png",
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
        // Continue without thumbnail - video is already uploaded
      }
    }

    // Store upload result in state
    await state.set(traceId, "uploadResult", {
      videoId,
      videoUrl,
      channelId: uploadResponse.data.snippet?.channelId,
      channelTitle: uploadResponse.data.snippet?.channelTitle,
      publishedAt: uploadResponse.data.snippet?.publishedAt,
      thumbnailUploaded,
      uploadedAt: new Date().toISOString(),
    });

    // Update final status
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

    // Handle specific YouTube API errors
    let errorMessage = error.message;
    if (error.code === 403) {
      errorMessage = "YouTube API quota exceeded or permission denied";
    } else if (error.code === 401) {
      errorMessage = "YouTube authentication expired. Please reconnect your account.";
    } else if (error.code === 400) {
      errorMessage = `Invalid request: ${error.message}`;
    }

    // Update status to failed
    await state.set(traceId, "status", {
      status: "upload-failed",
      error: errorMessage,
      updatedAt: new Date().toISOString(),
    });

    await emit({
      topic: "youtube.upload.error",
      data: {
        traceId,
        error: errorMessage,
      },
    });
  }
};