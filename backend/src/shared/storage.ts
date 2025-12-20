import {
  S3Client,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { Readable } from "stream";
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  unlinkSync,
} from "fs";
import { dirname, join } from "path";
import type {
  SupportedVideoFormat,
  SupportedThumbnailFormat,
} from "./interfaces";
import {
  generateVideoFilename,
  generateThumbnailFilename,
  isValidVideoFormat,
} from "./storage-utils";

const VIDEO_CONTENT_TYPES: Record<SupportedVideoFormat, string> = {
  mp4: "video/mp4",
  mov: "video/quicktime",
  avi: "video/x-msvideo",
  webm: "video/webm",
  mkv: "video/x-matroska",
};

const THUMBNAIL_CONTENT_TYPES: Record<SupportedThumbnailFormat, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

interface StorageAdapter {
  saveStream(
    stream: Readable,
    key: string,
    contentType?: string
  ): Promise<string>;
  saveBuffer(
    buffer: Buffer,
    key: string,
    contentType?: string
  ): Promise<string>;
  getStream(key: string): Promise<Readable>;
  delete(key: string): Promise<void>;
  getPublicUrl(key: string): Promise<string>;
}

class S3StorageAdapter implements StorageAdapter {
  private s3Client: S3Client;
  private bucketName: string;
  private region: string;

  constructor() {
    this.bucketName = process.env.AWS_S3_BUCKET_NAME!;
    this.region = process.env.AWS_REGION!;
    this.s3Client = new S3Client({ region: this.region });
  }

  async saveStream(
    stream: Readable,
    key: string,
    contentType?: string
  ): Promise<string> {
    const upload = new Upload({
      client: this.s3Client,
      params: {
        Bucket: this.bucketName,
        Key: key,
        Body: stream,
        ContentType: contentType || "application/octet-stream",
      },
    });
    await upload.done();
    return key;
  }

  async saveBuffer(
    buffer: Buffer,
    key: string,
    contentType?: string
  ): Promise<string> {
    const upload = new Upload({
      client: this.s3Client,
      params: {
        Bucket: this.bucketName,
        Key: key,
        Body: buffer,
        ContentType: contentType || "application/octet-stream",
      },
    });
    await upload.done();
    return key;
  }

  async getStream(key: string): Promise<Readable> {
    const command = new GetObjectCommand({ Bucket: this.bucketName, Key: key });
    const response = await this.s3Client.send(command);
    return response.Body as Readable;
  }

  async delete(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });
    await this.s3Client.send(command);
  }

  async getPublicUrl(key: string): Promise<string> {
    return `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${key}`;
  }
}

class LocalStorageAdapter implements StorageAdapter {
  private basePath: string;

  constructor() {
    this.basePath = process.env.LOCAL_STORAGE_PATH || "output";
    if (!existsSync(this.basePath)) {
      mkdirSync(this.basePath, { recursive: true });
    }
  }

  async saveStream(stream: Readable, key: string): Promise<string> {
    const filePath = join(this.basePath, key);
    const dir = dirname(filePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    return new Promise((resolve, reject) => {
      const writeStream = createWriteStream(filePath);
      stream.on("error", reject);
      writeStream.on("error", reject);
      writeStream.on("finish", () => resolve(key));
      stream.pipe(writeStream);
    });
  }

  async saveBuffer(buffer: Buffer, key: string): Promise<string> {
    const filePath = join(this.basePath, key);
    const dir = dirname(filePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    const { writeFileSync } = await import("fs");
    writeFileSync(filePath, buffer);
    return key;
  }

  async getStream(key: string): Promise<Readable> {
    const filePath = join(this.basePath, key);
    if (!existsSync(filePath)) throw new Error(`File not found: ${key}`);
    return createReadStream(filePath);
  }

  async delete(key: string): Promise<void> {
    const filePath = join(this.basePath, key);
    if (existsSync(filePath)) unlinkSync(filePath);
  }

  async getPublicUrl(key: string): Promise<string> {
    const baseUrl =
      process.env.LOCAL_STORAGE_URL || "http://localhost:3000/files";
    return `${baseUrl}/${key}`;
  }
}

let storageInstance: StorageAdapter | null = null;

export function getStorage(): StorageAdapter {
  if (!storageInstance) {
    const storageType = process.env.STORAGE_TYPE || "local";
    storageInstance =
      storageType === "s3" ? new S3StorageAdapter() : new LocalStorageAdapter();
  }
  return storageInstance;
}

export async function uploadVideo(
  stream: Readable,
  originalFilename: string
): Promise<{ storageKey: string; url: string; format: SupportedVideoFormat }> {
  if (!isValidVideoFormat(originalFilename)) {
    throw new Error(`Invalid video format: ${originalFilename}`);
  }

  const storage = getStorage();
  const uniqueFilename = generateVideoFilename(originalFilename);
  const storageKey = `videos/${uniqueFilename}`;
  const ext = originalFilename
    .split(".")
    .pop()
    ?.toLowerCase() as SupportedVideoFormat;
  const contentType = VIDEO_CONTENT_TYPES[ext] || "video/mp4";

  await storage.saveStream(stream, storageKey, contentType);
  const url = await storage.getPublicUrl(storageKey);

  return { storageKey, url, format: ext };
}

export async function uploadThumbnail(
  imageBuffer: Buffer,
  format: SupportedThumbnailFormat = "jpeg"
): Promise<{ storageKey: string; url: string }> {
  const storage = getStorage();
  const uniqueFilename = generateThumbnailFilename();
  const storageKey = `thumbnails/${uniqueFilename}`;
  const contentType = THUMBNAIL_CONTENT_TYPES[format];

  await storage.saveBuffer(imageBuffer, storageKey, contentType);
  const url = await storage.getPublicUrl(storageKey);

  return { storageKey, url };
}

export async function getVideoStream(storageKey: string): Promise<Readable> {
  return getStorage().getStream(storageKey);
}

export async function getThumbnailStream(
  storageKey: string
): Promise<Readable> {
  return getStorage().getStream(storageKey);
}

export async function deleteFile(storageKey: string): Promise<void> {
  await getStorage().delete(storageKey);
}

export async function cleanupAfterUpload(
  videoStorageKey: string,
  thumbnailStorageKey?: string
): Promise<void> {
  await deleteFile(videoStorageKey);
  if (thumbnailStorageKey) {
    await deleteFile(thumbnailStorageKey);
  }
}
