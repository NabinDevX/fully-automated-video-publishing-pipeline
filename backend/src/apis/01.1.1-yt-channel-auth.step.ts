import type { ApiRouteConfig, Handlers } from "motia";
import { getAuthUrl } from "../helper/oauth";
import { connectMongo } from "../db/index";

export const config: ApiRouteConfig = {
  name: "YouTube-Channel-Auth",
  type: "api",
  path: "/yt-channel-auth",
  method: "GET",
  description: "Initiate OAuth flow for YouTube channel authentication",
  flows: ["yt.video.upload"],
  emits: [],
};

export const handler: Handlers["YouTube-Channel-Auth"] = async (
  req: any,
  { logger }: any
) => {
  try {
    await connectMongo();
    const authUrl = getAuthUrl();

    logger.info("Redirecting to Google OAuth", { authUrl });

    return {
      status: 302,
      headers: {
        Location: authUrl,
      },
    };
  } catch (error) {
    logger.error("OAuth init failed", { error });
    return {
      status: 500,
      body: { error: "Failed to start OAuth" },
    };
  }
};
