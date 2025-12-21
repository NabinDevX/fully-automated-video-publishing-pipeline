import type { ApiRouteConfig, Handlers } from "motia";
import {
  getTokensFromCode,
  saveTokensForUser,
  getEmailFromIdToken,
} from "../helper/oauth";
import { connectMongo } from "../db/index";

export const config: ApiRouteConfig = {
  name: "YouTube-OAuth-Callback",
  type: "api",
  path: "/auth/callback",
  method: "GET",
  description: "Google OAuth callback for YouTube",
  flows: ["yt.video.upload"],
  emits: [],
};

export const handler: Handlers["YouTube-OAuth-Callback"] = async (
  req: any,
  { logger }: any
) => {
  await connectMongo();
  try {
    const code = req.queryParams?.code;

    logger.info("OAuth callback received", {
      hasCode: Boolean(code),
    });

    if (!code) {
      throw new Error("Missing OAuth code");
    }

    const tokens = await getTokensFromCode(code);
    if (!tokens.id_token) {
      throw new Error("ID Token missing in OAuth tokens");
    }

    const email = await getEmailFromIdToken(tokens.id_token);
    await saveTokensForUser(email, tokens);

    logger.info("YouTube OAuth completed", { email });
    return {
      status: 200,
      headers: { "Content-Type": "text/html" },
      body: `
        <script>
          const authData = {
            type: "youtube-auth-success",
            email: "${email}",
            accessToken: "${tokens.access_token}",
            refreshToken: "${tokens.refresh_token}"
          };
          
          // Send to frontend (localhost:5173)
          if (window.opener) {
            window.opener.postMessage(authData, "http://localhost:5173");
          }
          
          // Send to Motia workbench plugin (localhost:3000)
          if (window.opener) {
            window.opener.postMessage(authData, "http://localhost:3000");
          }
          
          // Alternative: Send to any origin (use with caution)
          // if (window.opener) {
          //   window.opener.postMessage(authData, "*");
          // }
          
          window.close();
        </script>
      `,
    };
  } catch (error) {
    logger.error("OAuth callback failed", { error });
    return {
      status: 500,
      headers: { "Content-Type": "text/html" },
      body: `
        <script>
          const errorData = { type: "youtube-auth-error", error: "Authentication failed" };
          
          if (window.opener) {
            window.opener.postMessage(errorData, "http://localhost:5173");
            window.opener.postMessage(errorData, "http://localhost:3000");
          }
          
          window.close();
        </script>
      `,
    };
  }
};
