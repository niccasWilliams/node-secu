import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  NoSuchKey,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { Readable } from "stream";

type NonEmpty = string & { __brand: "NonEmpty" };
function reqEnv(name: string): NonEmpty {
  const v = process.env[name];
  if (!v) throw new Error(`ENV ${name} is required`);
  return v as NonEmpty;
}
function optBool(name: string, def = false) {
  const v = process.env[name];
  if (v == null) return def;
  return v === "1" || v.toLowerCase() === "true";
}

export class S3Service {
  // lazy Felder
  private _client?: S3Client;
  private _bucket?: string;

  // optional: manuelles Setzen (z.B. für Tests)
  configure(params: {
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucket: string;
    endpoint?: string;
    forcePathStyle?: boolean;
  }) {
    this._bucket = params.bucket;
    this._client = new S3Client({
      region: params.region,
      credentials: {
        accessKeyId: params.accessKeyId,
        secretAccessKey: params.secretAccessKey,
      },
      ...(params.endpoint ? { endpoint: params.endpoint } : {}),
      forcePathStyle:
        params.forcePathStyle ?? Boolean(params.endpoint), // gut für LocalStack/MinIO
    });
  }

  private ensureInit() {
    if (this._client && this._bucket) return;

    const region = reqEnv("AWS_REGION");
    const accessKeyId = reqEnv("AWS_ACCESS_KEY_ID");
    const secretAccessKey = reqEnv("AWS_SECRET_ACCESS_KEY");
    const bucket = reqEnv("AWS_BUCKET_NAME");
    const endpoint = process.env.S3_ENDPOINT; // optional (LocalStack/MinIO)
    const forcePathStyle = optBool("S3_FORCE_PATH_STYLE", !!endpoint);

    this._bucket = bucket;
    this._client = new S3Client({
      region,
      credentials: { accessKeyId, secretAccessKey },
      ...(endpoint ? { endpoint } : {}),
      forcePathStyle,
    });
  }

  private get client(): S3Client {
    this.ensureInit();
    return this._client!;
  }
  private get bucket(): string {
    this.ensureInit();
    return this._bucket!;
  }

  async getDownloadUrl(key: string, expiresInSec = 3600): Promise<string> {
    const cmd = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.client, cmd, { expiresIn: expiresInSec });
  }

  async uploadFile(buffer: Buffer, key: string, contentType: string) {
    const cmd = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    });
    await this.client.send(cmd);
    return { success: true as const, key };
  }

  async getPresignedPostUrl(key: string, contentType: string) {
    return createPresignedPost(this.client, {
      Bucket: this.bucket,
      Key: key,
      Conditions: [
        ["content-length-range", 0, 1024 * 1024 * 20], // z.B. 20MB
        ["starts-with", "$Content-Type", contentType.split("/")[0]],
      ],
      Expires: 600,
      Fields: { "Content-Type": contentType },
    });
  }

  async deleteFile(key: string): Promise<void> {
    const cmd = new DeleteObjectCommand({ Bucket: this.bucket, Key: key });
    await this.client.send(cmd);
  }

  async deleteFiles(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    const cmd = new DeleteObjectsCommand({
      Bucket: this.bucket,
      Delete: { Objects: keys.map((k) => ({ Key: k })) },
    });
    await this.client.send(cmd);
  }

  async getObjectStream(
    key: string
  ): Promise<{ stream: Readable; size?: number }> {
    try {
      const res = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key })
      );
      return { stream: res.Body as Readable, size: res.ContentLength };
    } catch (err: any) {
      if (err?.$metadata?.httpStatusCode === 404 || err instanceof NoSuchKey) {
        throw new Error("NOT_FOUND");
      }
      throw err;
    }
  }
}

export const s3Service = new S3Service();