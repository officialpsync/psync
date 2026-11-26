// psync/lib/s3.ts
// Shared AWS S3 / Cloudflare R2 client & presigned URL generator for uploads.

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const s3 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ACCOUNT_ID
    ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
    : undefined,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});

export const ALLOWED_MEDICAL_MIME_TYPES: Record<string, { ext: string; maxMb: number }> = {
  "application/pdf": { ext: "pdf", maxMb: 15 },
  "image/jpeg": { ext: "jpg", maxMb: 10 },
  "image/png": { ext: "png", maxMb: 10 },
  "image/webp": { ext: "webp", maxMb: 10 },
};

export async function createPresignedUploadUrl({
  orgId,
  memberId,
  contentType,
  size,
  folder = "medical-reports",
}: {
  orgId: string;
  memberId: string;
  contentType: string;
  size: number;
  folder?: string;
}) {
  const rule = ALLOWED_MEDICAL_MIME_TYPES[contentType];
  if (!rule) {
    throw new Error("Only PDF, JPG, PNG or WebP files are allowed for medical reports.");
  }

  if (size > rule.maxMb * 1024 * 1024) {
    throw new Error(`File is too large. Max size allowed is ${rule.maxMb} MB.`);
  }

  const key = `${orgId}/${folder}/${memberId}/${crypto.randomUUID()}.${rule.ext}`;
  const bucket = process.env.R2_BUCKET || "psync-assets";

  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
      ContentLength: size,
    }),
    { expiresIn: 600 } // 10 minutes
  );

  const publicBase = process.env.R2_PUBLIC_URL || "";
  const publicUrl = publicBase ? `${publicBase.replace(/\/$/, "")}/${key}` : key;

  return { uploadUrl, publicUrl, key };
}
