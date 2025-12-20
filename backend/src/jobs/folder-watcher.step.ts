import type { CronConfig, Handlers } from "motia";
import chokidar from "chokidar";
import path from "node:path";

let watcherInitialized = false;

export const config: CronConfig = {
  name: "WatchUploads",
  type: "cron",
  cron: "0 0 * * * *", // every 10 seconds (but watcher runs persistently)
  description: "Watches for new files in the uploads folder",
  flows: ["yt.video.upload"],
  emits: ["file.new.detected"],
};

export const handler: Handlers["WatchUploads"] = async ({
  logger,
  state,
  emit,
}: any) => {
  const folderPath = path.resolve("./uploads");

  // Prevent duplicate watchers
  if (watcherInitialized) {
    return;
  }

  watcherInitialized = true;
  logger.info("Initializing file watcher...", { folderPath });

  // Load processed files from state
  let processedFiles = await state.get("fileWatcher", "knownFiles");
  if (!processedFiles) {
    processedFiles = [];
    await state.set("fileWatcher", "knownFiles", processedFiles);
  }

  // Create watcher once
  const watcher = chokidar.watch(folderPath, {
    ignoreInitial: true,
    depth: 0,
    persistent: true,
    awaitWriteFinish: {
      stabilityThreshold: 500,
      pollInterval: 100,
    },
    ignored: ["**/*.tmp", "**/~*", "**/.DS_Store", "**/Thumbs.db"],
  });

  watcher.on("add", async (filePath) => {
    const fileName = path.basename(filePath);

    const known = await state.get("fileWatcher", "knownFiles");

    // Skip if already processed
    if (!known.includes(fileName)) {
      logger.info("New file detected", { fileName, filePath });

      known.push(fileName);
      await state.set("fileWatcher", "knownFiles", known);

      await emit({
        topic: "file.new.detected",
        data: {
          fileName,
          filePath,
        },
      });
    }
  });

  watcher.on("error", (err: any) => {
    logger.error("File watcher error", { error: err.message });
  });
  return;
};
