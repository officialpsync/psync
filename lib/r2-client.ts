// lib/r2-client.ts
// Direct client-side uploader to Cloudflare R2 via short-lived presigned URLs.
// Used for logos, member photos, exercise images, support ticket attachments, etc.

import { createClient } from "@/lib/supabase";

export type R2Folder = "logos" | "members" | "exercises" | "support" | "tickets";

/**
 * Uploads an image/media file directly to Cloudflare R2 storage.
 * Returns the permanent Cloudflare R2 public URL.
 */
export async function uploadToCloudflareR2(
  file: File,
  folder: R2Folder = "logos"
): Promise<string> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error("You must be logged in to upload images to Cloudflare R2.");
  }

  // 1. Get short-lived signed R2 upload URL
  const res = await fetch("/api/upload-url", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      contentType: file.type,
      size: file.size,
      folder,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to generate Cloudflare R2 upload URL.");
  }

  const { uploadUrl, publicUrl } = (await res.json()) as { uploadUrl: string; publicUrl: string };

  // 2. Upload file directly to Cloudflare R2 bucket
  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": file.type,
    },
    body: file,
  });

  if (!putRes.ok) {
    throw new Error(`Failed to upload to Cloudflare R2 (status: ${putRes.status}).`);
  }

  return publicUrl;
}
