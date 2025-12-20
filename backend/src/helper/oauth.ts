import { google } from "googleapis";
import { Credentials, OAuth2Client } from "google-auth-library";
import { YouTubeToken } from "../models/YouTubeToken";

interface OAuthCredentials {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

let cachedCredentials: OAuthCredentials | null = null;

function getCredentials(): OAuthCredentials {
  if (cachedCredentials) {
    return cachedCredentials;
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || "http://localhost:3000/auth/callback";

  if (!clientId || !clientSecret) {
    throw new Error(
      "OAuth not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables.\n" +
      "Steps:\n" +
      "1. Go to Google Cloud Console > APIs & Services > Credentials\n" +
      "2. Create OAuth 2.0 Client ID > Web application\n" +
      "3. Add redirect URI: http://localhost:3000/auth/callback\n" +
      "4. Copy Client ID and Client Secret to .env file"
    );
  }

  cachedCredentials = {
    clientId,
    clientSecret,
    redirectUri,
  };

  return cachedCredentials;
}

export function isOAuthConfigured(): boolean {
  try {
    getCredentials();
    return true;
  } catch {
    return false;
  }
}

export function getOAuth2Client(): OAuth2Client {
  const { clientId, clientSecret, redirectUri } = getCredentials();

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export function createOAuthClient(tokens: Credentials): OAuth2Client {
  const { clientId, clientSecret, redirectUri } = getCredentials();

  const client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  client.setCredentials(tokens);

  return client;
}

export const SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube",
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
];

export function getAuthUrl(state?: string): string {
  const oauth2Client = getOAuth2Client();

  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
    state: state,
  });
}

export async function getTokensFromCode(code: string): Promise<Credentials> {
  const oauth2Client = getOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
}

export async function refreshTokens(client: OAuth2Client): Promise<Credentials> {
  const { credentials } = await client.refreshAccessToken();
  client.setCredentials(credentials);
  return credentials;
}

export async function saveTokensForUser(
  email: string,
  tokens: Credentials
): Promise<void> {
  const normalizedEmail = email.toLowerCase().trim();

  await YouTubeToken.findOneAndUpdate(
    { email: normalizedEmail },
    { $set: { tokens } },
    { upsert: true, new: true }
  );

  console.log(`✅ Tokens saved for: ${normalizedEmail}`);
}

export async function loadTokensForUser(
  email: string
): Promise<Credentials | null> {
  const normalizedEmail = email.toLowerCase().trim();
  const record = await YouTubeToken.findOne({ email: normalizedEmail });
  return record?.tokens || null;
}

export async function deleteTokensForUser(email: string): Promise<void> {
  const normalizedEmail = email.toLowerCase().trim();
  await YouTubeToken.deleteOne({ email: normalizedEmail });
  console.log(`🗑️ Tokens deleted for: ${normalizedEmail}`);
}

export async function getFirstConnectedUser(): Promise<{
  email: string;
  tokens: Credentials;
} | null> {
  const record = await YouTubeToken.findOne({}).sort({ updatedAt: -1 });

  if (!record) return null;

  return {
    email: record.email,
    tokens: record.tokens,
  };
}

export async function isAnyUserConnected(): Promise<boolean> {
  const count = await YouTubeToken.countDocuments();
  return count > 0;
}

export async function getAuthenticatedClient(email: string): Promise<OAuth2Client> {
  const tokens = await loadTokensForUser(email);

  if (!tokens) {
    throw new Error("User not authenticated");
  }

  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials(tokens);

  oauth2Client.on("tokens", async (newTokens) => {
    console.log("🔄 Refreshing tokens for:", email);
    await saveTokensForUser(email, { ...tokens, ...newTokens });
  });

  return oauth2Client;
}

export async function getYouTubeClient(email: string) {
  const auth = await getAuthenticatedClient(email);
  return google.youtube({ version: "v3", auth });
}

export async function getEmailFromIdToken(idToken: string): Promise<string> {
  const client = new OAuth2Client();
  const ticket = await client.verifyIdToken({ idToken });
  const payload = ticket.getPayload();

  if (!payload?.email) {
    throw new Error("Email not found in ID token");
  }

  return payload.email;
}
