import mongoose, { Schema, Document } from "mongoose";
import type { Credentials } from "google-auth-library";

export interface YouTubeTokenDocument extends Document {
  email: string;
  tokens: Credentials;
  createdAt: Date;
  updatedAt: Date;
}

const YouTubeTokenSchema = new Schema<YouTubeTokenDocument>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    tokens: {
      type: Object,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

export const YouTubeToken =
  mongoose.models.YouTubeToken ||
  mongoose.model<YouTubeTokenDocument>("YouTubeToken", YouTubeTokenSchema);
