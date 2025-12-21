import type { EventConfig, Handlers } from "motia";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { uploadThumbnail } from "../shared/storage";
import type { SupportedThumbnailFormat } from "../shared/interfaces";

export const config: EventConfig = {
  name: "Generate-Thumbnail-Image",
  type: "event",
  description: "Generate thumbnail image using Gemini AI and upload to S3",
  flows: ["yt.video.upload"],
  subscribes: ["prompts.generated"],
  emits: [
    { topic: "thumbnail.image.generated", label: "Thumbnail Image Generated" },
    { topic: "thumbnail.image.generation.error", label: "Generation Error", conditional: true },
  ],
};

interface PromptsGeneratedInput {
  traceId: string;
  title: string;
  description: string;
  tags: string[];
  thumbnailPrompt: string;
  thumbnailStyle: string;
  thumbnailColors: string[];
  thumbnailTextOverlay: string;
}

export const handler: Handlers["Generate-Thumbnail-Image"] = async (
  input: PromptsGeneratedInput,
  { emit, logger, state }: any
) => {
  const { traceId, thumbnailPrompt, thumbnailStyle, thumbnailColors, thumbnailTextOverlay } = input;

  try {
    logger.info("Starting thumbnail generation", { traceId });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is not set");
    }

    const videoData = await state.get(traceId, "videoData");
    const metadata = await state.get(traceId, "metadata");

    if (!videoData || !metadata) {
      throw new Error("Video data or metadata not found in state");
    }

    await state.set(traceId, "status", {
      status: "generating-thumbnail",
      updatedAt: new Date().toISOString(),
    });

    logger.info("Retrieved data from state", {
      traceId,
      fileName: videoData.fileName,
      hasTitle: Boolean(metadata.title),
    });

    const genAI = new GoogleGenerativeAI(apiKey);

    const fullThumbnailPrompt = thumbnailPrompt || buildDefaultThumbnailPrompt(metadata.title, videoData.fileName);

    const enhancedPrompt = `${fullThumbnailPrompt}

Style: ${thumbnailStyle || "vibrant and professional"}
Color Scheme: ${thumbnailColors?.join(", ") || "bright, contrasting colors"}
${thumbnailTextOverlay ? `Text to include: "${thumbnailTextOverlay}"` : "No text overlay needed"}

Requirements:
- YouTube thumbnail dimensions (1280x720 aspect ratio)
- Bold, eye-catching design
- High contrast for visibility at small sizes
- Professional quality`;

    logger.info("Generating thumbnail with Gemini", {
      traceId,
      promptLength: enhancedPrompt.length,
    });

    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash-exp",
      generationConfig: {
        temperature: 0.9,
        topP: 0.95,
        topK: 40,
      },
    });

    const response = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: enhancedPrompt }] }],
    });

    const result = response.response;

    let thumbnailBuffer: Buffer | null = null;
    let thumbnailFormat: SupportedThumbnailFormat = "jpeg";

    const candidates = result.candidates;
    if (candidates && candidates[0]?.content?.parts) {
      for (const part of candidates[0].content.parts) {
        if (part.inlineData) {
          const imageData = part.inlineData.data;
          const mimeType = part.inlineData.mimeType || "image/jpeg";

          if (imageData) {
            thumbnailBuffer = Buffer.from(imageData, "base64");

            if (mimeType.includes("png")) {
              thumbnailFormat = "png";
            } else if (mimeType.includes("webp")) {
              thumbnailFormat = "webp";
            } else {
              thumbnailFormat = "jpeg";
            }

            logger.info("Thumbnail image generated", {
              traceId,
              size: thumbnailBuffer.length,
              format: thumbnailFormat,
            });

            break;
          }
        }
      }
    }

    if (!thumbnailBuffer) {
      logger.warn("Gemini did not return an image, creating placeholder", { traceId });

      const textResponse = await model.generateContent({
        contents: [{
          role: "user",
          parts: [{
            text: `Describe a YouTube thumbnail for: "${metadata.title || videoData.fileName}". 
                   Include colors, layout, and visual elements. Keep it brief.`
          }]
        }],
      });

      const description = textResponse.response.text();

      await state.set(traceId, "thumbnail", {
        description,
        storageKey: null,
        url: null,
        generatedAt: new Date().toISOString(),
        isPlaceholder: true,
      });

      await state.set(traceId, "status", {
        status: "thumbnail-description-generated",
        updatedAt: new Date().toISOString(),
      });

      logger.info("Thumbnail description generated (no image)", { traceId });

      await emit({
        topic: "thumbnail.image.generated",
        data: {
          traceId,
          thumbnailStorageKey: null,
          thumbnailUrl: null,
          hasImage: false,
          description,
        },
      });

      return;
    }

    logger.info("Uploading thumbnail to storage", { traceId });

    const { storageKey, url } = await uploadThumbnail(thumbnailBuffer, thumbnailFormat);

    logger.info("Thumbnail uploaded to storage", {
      traceId,
      storageKey,
      url,
    });

    await state.set(traceId, "thumbnail", {
      storageKey,
      url,
      format: thumbnailFormat,
      size: thumbnailBuffer.length,
      generatedAt: new Date().toISOString(),
      isPlaceholder: false,
    });

    await state.set(traceId, "status", {
      status: "thumbnail-generated",
      updatedAt: new Date().toISOString(),
    });

    logger.info("Thumbnail generated and uploaded successfully", {
      traceId,
      storageKey,
      url,
    });

    await emit({
      topic: "thumbnail.image.generated",
      data: {
        traceId,
        thumbnailStorageKey: storageKey,
        thumbnailUrl: url,
        hasImage: true,
      },
    });

  } catch (error: any) {
    logger.error("Error generating thumbnail", {
      traceId,
      error: error.message,
      stack: error.stack,
    });

    try {
      await state.set(traceId, "status", {
        status: "thumbnail-generation-failed",
        error: error.message,
        updatedAt: new Date().toISOString(),
      });
    } catch {
    }

    await emit({
      topic: "thumbnail.image.generation.error",
      data: {
        traceId,
        error: error.message,
        step: "generate-thumbnail",
      },
    });
  }
};

function buildDefaultThumbnailPrompt(title: string, fileName: string): string {
  const subject = title || fileName || "video content";

  return `Create a vibrant, eye-catching YouTube thumbnail image for a video titled "${subject}".

Design Requirements:
- Bold, attention-grabbing composition
- Bright, contrasting colors that pop
- Clear focal point in the center
- Professional quality suitable for YouTube
- High contrast and saturation for visibility at small sizes
- Modern, clean aesthetic
- Suitable for 1280x720 dimensions`;
}
