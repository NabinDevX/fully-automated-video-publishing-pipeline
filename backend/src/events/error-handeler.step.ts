import { EventConfig, Handlers } from "motia";

export const config: EventConfig = {
  name: "ErrorHandler",
  type: "event",
  description: "Handle errors from YouTube video upload workflow",
  flows: ["yt.video.upload"],
  subscribes: [
    "file.upload.error",
    "prompts.generation.error",
    "thumbnail.image.generation.error",
    "final.title.generation.error",
    "youtube.upload.error",
    "pipeline.error",
  ],
  emits: [],
};

interface ErrorEvent {
  traceId?: string;
  jobId?: string;
  error?: string;
  step?: string;
  videoId?: string;
  fileName?: string;
  details?: any;
}

interface ErrorLog {
  traceId: string;
  step: string;
  error: string;
  timestamp: string;
  resolved: boolean;
  details?: any;
}

const ERROR_MESSAGES: Record<string, string> = {
  "file.upload.error": "Failed to upload video file",
  "prompts.generation.error": "Failed to generate AI prompts",
  "thumbnail.image.generation.error": "Failed to generate thumbnail image",
  "final.title.generation.error": "Failed to generate final title",
  "youtube.upload.error": "Failed to upload video to YouTube",
  "pipeline.error": "Pipeline encountered an error",
};

export const handler: Handlers["ErrorHandler"] = async (
  eventData: ErrorEvent,
  { logger, state, event }: any
) => {
  const topic = event?.topic || "unknown";
  const traceId = eventData?.traceId || eventData?.jobId || "unknown";

  try {
    logger.warn("Error event received", {
      topic,
      traceId,
      error: eventData?.error,
      step: eventData?.step,
    });

    const friendlyMessage = ERROR_MESSAGES[topic] || "An unexpected error occurred";

    const errorLog: ErrorLog = {
      traceId,
      step: eventData?.step || topic.replace(".error", ""),
      error: eventData?.error || friendlyMessage,
      timestamp: new Date().toISOString(),
      resolved: false,
      details: eventData?.details || null,
    };

    let existingErrors: ErrorLog[] = [];
    try {
      existingErrors = (await state.get(traceId, "errors")) || [];
    } catch {
      existingErrors = [];
    }

    existingErrors.push(errorLog);

    await state.set(traceId, "errors", existingErrors);

    await state.set(traceId, "status", {
      status: "failed",
      error: eventData?.error || friendlyMessage,
      failedStep: eventData?.step || topic,
      failedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    switch (topic) {
      case "file.upload.error":
        logger.error("File upload failed", {
          traceId,
          fileName: eventData?.fileName,
          error: eventData?.error,
        });
        break;

      case "prompts.generation.error":
        logger.error("AI prompt generation failed", {
          traceId,
          error: eventData?.error,
        });
        break;

      case "thumbnail.image.generation.error":
        logger.error("Thumbnail generation failed", {
          traceId,
          error: eventData?.error,
        });
        break;

      case "final.title.generation.error":
        logger.error("Final title generation failed", {
          traceId,
          error: eventData?.error,
        });
        break;

      case "youtube.upload.error":
        logger.error("YouTube upload failed", {
          traceId,
          videoId: eventData?.videoId,
          error: eventData?.error,
        });
        break;

      case "pipeline.error":
        logger.error("Pipeline error occurred", {
          traceId,
          step: eventData?.step,
          error: eventData?.error,
        });
        break;

      default:
        logger.error("Unknown error occurred", {
          traceId,
          topic,
          error: eventData?.error,
        });
    }

    await state.set(traceId, "errorSummary", {
      totalErrors: existingErrors.length,
      lastError: errorLog,
      failedAt: new Date().toISOString(),
    });

    logger.info("Error handled and logged", {
      traceId,
      topic,
      totalErrors: existingErrors.length,
    });
  } catch (error: any) {
    logger.error("Critical: Error in ErrorHandler itself", {
      traceId,
      topic,
      originalError: eventData?.error,
      handlerError: error.message || error.toString(),
    });
  }
};
