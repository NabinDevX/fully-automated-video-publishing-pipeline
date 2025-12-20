import type { EventConfig, Handlers } from "motia";

export const config: EventConfig = {
  name: "ProcessNewFile",
  type: "event",
  description: "Handles newly detected files",
  subscribes: ["file.new.detected"],
  flows: ["yt.video.upload"],
  emits: [],
};

export const handler: Handlers["ProcessNewFile"] = async (data, { logger }) => {
  const { fileName, filePath } = data;

  logger.info("Processing new file", { fileName, filePath });

  // Put your file logic here (upload, move, read, etc.)
};
