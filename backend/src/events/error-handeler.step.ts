import { EventConfig, Handlers } from "motia";

export const config: EventConfig = {
  name: "ErrorHandler",
  type: "event",
  description: "Handle errors from YouTube video upload workflow",
  flows: ["yt.video.upload"],
  subscribes: ["yt.prompts.generation.error", "file.upload.error", "initial.title.thumbnail.prompts.generation.error", "thumbnail.image.generation.error", "final.title.generation.error", "youtube.upload.error", "pipeline.error"],
  emits: [],
};

export const handler: Handlers["ErrorHandler"] = async (
  eventData: any,
  { logger, state }: any
) => {
  try {
  } catch (error: any) {
    logger.error("Error in ErrorHandler", {
      error: error.message || error.toString(),
    });
    return;
  }
};
