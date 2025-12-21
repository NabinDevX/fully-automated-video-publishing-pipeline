import type { EventConfig, Handlers } from "motia";
import { GoogleGenerativeAI } from "@google/generative-ai";
import * as fs from "fs";
import * as path from "path";

export const config: EventConfig = {
  name: "Generate-Thumbnail-Image",
  type: "event",
  description: "Generate thumbnail image using Gemini AI",
  flows: ["yt.video.upload"],
  subscribes: ["thumbnail.prompts.generated"],
  emits: [
    { topic: "thumbnail.image.generated", label: "Thumbnail Image Generated" },
    { topic: "thumbnail.image.generation.error", label: "Generation Error", conditional: true },
  ],
};

export const handler: Handlers["Generate-Thumbnail-Image"] = async (
  input: any,
  { emit, logger, state }: any
) => {
  const { traceId } = input;

  try {
    logger.info("Starting thumbnail generation", { traceId });

    // Check for API key
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is not set");
    }

    // Get data from state
    const videoData = await state.get(traceId, "videoData");
    const metadata = await state.get(traceId, "metadata");
    const prompts = await state.get(traceId, "prompts");

    if (!videoData || !metadata) {
      throw new Error("Video data or metadata not found in state");
    }

    // Update status to processing
    await state.set(traceId, "status", {
      status: "generating-thumbnail",
      updatedAt: new Date().toISOString(),
    });

    logger.info("Retrieved data from state", {
      traceId,
      fileName: videoData.fileName,
      hasTitle: Boolean(metadata.title),
    });

    // Initialize Gemini AI client
    const genAI = new GoogleGenerativeAI(apiKey);

    // Build thumbnail prompt
    const thumbnailPrompt = prompts?.thumbnailPrompt ||
      `Create a vibrant, eye-catching YouTube thumbnail image for a video titled "${metadata.title || videoData.fileName}".
      
Requirements:
- Bold, attention-grabbing design
- Bright, contrasting colors
- Clear focal point
- Professional quality suitable for YouTube (1280x720)
- No text overlay (we'll add that separately)
- High contrast and saturation for visibility at small sizes`;

    logger.info("Generating thumbnail with Gemini", {
      traceId,
      promptLength: thumbnailPrompt.length,
    });

    // Get the image generation model
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash-exp",
      generationConfig: {
        temperature: 0.9,
        topP: 0.95,
        topK: 40,
      },
    });

    // Generate image using Gemini Imagen
    const response = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: thumbnailPrompt }] }],
    });

    const result = response.response;

    // Process the response
    let thumbnailPath: string | null = null;
    let thumbnailBase64: string | null = null;

    // Check if response has inline data (image)
    const candidates = result.candidates;
    if (candidates && candidates[0]?.content?.parts) {
      for (const part of candidates[0].content.parts) {
        if (part.inlineData) {
          // Got image data
          const imageData = part.inlineData.data;
          const mimeType = part.inlineData.mimeType || "image/png";

          if (imageData) {
            // Store base64 in state
            thumbnailBase64 = imageData;

            // Save to file
            const outputDir = path.join(process.cwd(), "output", "thumbnails");
            if (!fs.existsSync(outputDir)) {
              fs.mkdirSync(outputDir, { recursive: true });
            }

            const extension = mimeType.split("/")[1] || "png";
            const fileName = `thumbnail-${traceId}.${extension}`;
            thumbnailPath = path.join(outputDir, fileName);

            // Write image file
            const buffer = Buffer.from(imageData, "base64");
            fs.writeFileSync(thumbnailPath, buffer);

            logger.info("Thumbnail image saved", {
              traceId,
              path: thumbnailPath,
              size: buffer.length,
            });

            break;
          }
        }
      }
    }

    // If no image was generated, use a placeholder approach
    if (!thumbnailBase64) {
      logger.warn("Gemini did not return an image, generating text description instead", { traceId });

      // Get text description for thumbnail
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

      // Store description in state (no actual image)
      await state.set(traceId, "thumbnail", {
        description,
        path: null,
        generatedAt: new Date().toISOString(),
        isPlaceholder: true,
      });

      // Update status
      await state.set(traceId, "status", {
        status: "thumbnail-description-generated",
        updatedAt: new Date().toISOString(),
      });

      logger.info("Thumbnail description generated", { traceId, description });

      await emit({
        topic: "thumbnail.image.generated",
        data: {
          traceId,
          thumbnailPath: null,
          hasImage: false,
          description,
        },
      });

      return;
    }

    // Store thumbnail data in state
    await state.set(traceId, "thumbnail", {
      base64: thumbnailBase64,
      path: thumbnailPath,
      generatedAt: new Date().toISOString(),
      isPlaceholder: false,
    });

    // Update status
    await state.set(traceId, "status", {
      status: "thumbnail-generated",
      updatedAt: new Date().toISOString(),
    });

    logger.info("Thumbnail generated successfully", { traceId });

    await emit({
      topic: "thumbnail.image.generated",
      data: {
        traceId,
        thumbnailPath,
        hasImage: true,
      },
    });
  } catch (error: any) {
    logger.error("Error generating thumbnail", {
      traceId,
      error: error.message,
      stack: error.stack,
    });

    // Update status to failed
    await state.set(traceId, "status", {
      status: "thumbnail-generation-failed",
      error: error.message,
      updatedAt: new Date().toISOString(),
    });

    await emit({
      topic: "thumbnail.image.generation.error",
      data: {
        traceId,
        error: error.message,
      },
    });
  }
};
