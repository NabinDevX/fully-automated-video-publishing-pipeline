import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { google } from "googleapis";
import { Credentials, OAuth2Client } from "google-auth-library";
import { YouTubeToken } from "../models/YouTubeToken";

const CLIENT_SECRET_PATH = join(process.cwd(), "config/client_secret.json");

interface WebCredentials {
  client_id: string;
  client_secret: string;
  redirect_uris: string[];
}

interface ClientSecrets {
  web: WebCredentials;
}

let cachedCredentials: WebCredentials | null = null;

function loadClientSecrets(): WebCredentials | null {
  if (!existsSync(CLIENT_SECRET_PATH)) {
    console.warn("⚠️ client_secret.json not found at:", CLIENT_SECRET_PATH);
    return null;
  }

  try {
    const content = readFileSync(CLIENT_SECRET_PATH, "utf-8");
    const secrets = JSON.parse(content) as ClientSecrets;

    if (!secrets.web) {
      console.error('❌ Invalid client_secret.json: Missing "web" credentials.');
      return null;
    }

    return secrets.web;
  } catch (error) {
    console.error("❌ Failed to parse client_secret.json:", error);
    return null;
  }
}

function getCredentials(): WebCredentials {
  if (!cachedCredentials) {
    cachedCredentials = loadClientSecrets();
  }

  if (!cachedCredentials) {
    throw new Error("OAuth not configured. Please add client_secret.json to config/ folder.");
  }

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
  const { client_id, client_secret, redirect_uris } = getCredentials();

  return new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0] || "http://localhost:3000/auth/callback"
  );
}

export function createOAuthClient(tokens: Credentials): OAuth2Client {
  const { client_id, client_secret, redirect_uris } = getCredentials();

  const client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0] || "http://localhost:3000/auth/callback"
  );

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

// ============ MongoDB Token Storage ============

// Save tokens - only email and tokens (timestamps auto-added by mongoose)
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

// Load tokens for user
export async function loadTokensForUser(
  email: string
): Promise<Credentials | null> {
  const normalizedEmail = email.toLowerCase().trim();
  const record = await YouTubeToken.findOne({ email: normalizedEmail });
  return record?.tokens || null;
}

// Delete tokens for user
export async function deleteTokensForUser(email: string): Promise<void> {
  const normalizedEmail = email.toLowerCase().trim();
  await YouTubeToken.deleteOne({ email: normalizedEmail });
  console.log(`🗑️ Tokens deleted for: ${normalizedEmail}`);
}

// Get first connected user
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

// Check if any user is connected
export async function isAnyUserConnected(): Promise<boolean> {
  const count = await YouTubeToken.countDocuments();
  return count > 0;
}

// Get authenticated client for user
export async function getAuthenticatedClient(email: string): Promise<OAuth2Client> {
  const tokens = await loadTokensForUser(email);

  if (!tokens) {
    throw new Error("User not authenticated");
  }

  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials(tokens);

  // Auto-refresh and save new tokens
  oauth2Client.on("tokens", async (newTokens) => {
    console.log("🔄 Refreshing tokens for:", email);
    await saveTokensForUser(email, { ...tokens, ...newTokens });
  });

  return oauth2Client;
}

// Get YouTube API client
export async function getYouTubeClient(email: string) {
  const auth = await getAuthenticatedClient(email);
  return google.youtube({ version: "v3", auth });
}

// Get email from ID token
export async function getEmailFromIdToken(idToken: string): Promise<string> {
  const client = new OAuth2Client();
  const ticket = await client.verifyIdToken({ idToken });
  const payload = ticket.getPayload();

  if (!payload?.email) {
    throw new Error("Email not found in ID token");
  }

  return payload.email;
}
