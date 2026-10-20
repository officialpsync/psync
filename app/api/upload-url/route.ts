// app/api/upload-url/route.ts
// Issues a short-lived signed URL so the browser can upload a file directly to Cloudflare R2.
// R2 credentials stay on the server; the client only ever sees a one-time URL.

import { NextRequest, NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createClient } from "@supabase/supabase-js";

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

const ALLOWED: Record<string, { ext: string; maxMb: number }> = {
  "image/jpeg": { ext: "jpg", maxMb: 10 },
  "image/png": { ext: "png", maxMb: 10 },
  "image/webp": { ext: "webp", maxMb: 10 },
  "image/gif": { ext: "gif", maxMb: 10 },
  "video/mp4": { ext: "mp4", maxMb: 100 },
  "video/webm": { ext: "webm", maxMb: 100 },
  "video/quicktime": { ext: "mov", maxMb: 100 },
};

const FOLDERS = new Set(["exercises"]); // extend later: "recipes", "logos", "members"

export async function POST(req: NextRequest) {
  // 1. Who is asking?
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );
  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: role } = await supabase.from("user_roles").select("org_id").eq("user_id", user.id).single();
  if (!role?.org_id) return NextResponse.json({ error: "No gym found for this account" }, { status: 403 });

  // 2. What are they uploading?
  const { contentType, size, folder } = (await req.json()) as { contentType: string; size: number; folder: string };
  const rule = ALLOWED[contentType];
  if (!rule) return NextResponse.json({ error: "Only JPG, PNG, WebP, GIF, MP4, WebM or MOV files are allowed" }, { status: 400 });
  if (!FOLDERS.has(folder)) return NextResponse.json({ error: "Invalid upload folder" }, { status: 400 });
  if (!size || size > rule.maxMb * 1024 * 1024) {
    return NextResponse.json({ error: `File is too large. Max ${rule.maxMb} MB.` }, { status: 400 });
  }

  // 3. Every file lives under the gym's own folder, so one gym can never overwrite another's files
  const key = `${role.org_id}/${folder}/${crypto.randomUUID()}.${rule.ext}`;

  const uploadUrl = await getSignedUrl(
    r2,
    new PutObjectCommand({ Bucket: process.env.R2_BUCKET!, Key: key, ContentType: contentType, ContentLength: size }),
    { expiresIn: 300 }, // 5 minutes
  );

  return NextResponse.json({
    uploadUrl,
    publicUrl: `${process.env.R2_PUBLIC_URL}/${key}`,
    key,
  });
}
