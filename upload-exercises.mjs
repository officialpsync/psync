// upload-exercises.mjs
// Run from your project root: node upload-exercises.mjs
//
// Reads .env.local for Supabase credentials.
// Creates a public "exercise-images" bucket if it doesn't exist.
// Uploads every image from ./exercise-images/ using the manifest.
// Skips files already in the bucket (upsert: false).

import fs from "fs"
import path from "path"
import { createClient } from "@supabase/supabase-js"

// ─── Load .env.local manually (no dotenv dependency needed) ──────────────────

function loadEnv(file = ".env.local") {
  if (!fs.existsSync(file)) throw new Error(`${file} not found`)
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eq = trimmed.indexOf("=")
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "")
    process.env[key] = process.env[key] ?? val
  }
}

loadEnv()

const SUPABASE_URL      = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE  = process.env.SUPABASE_SERVICE_ROLE_KEY
const BUCKET            = "exercise-images"
const MANIFEST          = "./exercise-images/_manifest.json"
const IMAGE_DIR         = "./exercise-images"
const CONCURRENCY       = 4    // parallel uploads
const DELAY_MS          = 60   // ms between batches

if (!SUPABASE_URL || !SUPABASE_SERVICE) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local")
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE)

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function ensureBucket() {
  const { data: buckets } = await supabase.storage.listBuckets()
  const exists = buckets?.some((b) => b.name === BUCKET)
  if (exists) {
    console.log(`Bucket "${BUCKET}" already exists.`)
    return
  }
  const { error } = await supabase.storage.createBucket(BUCKET, { public: true })
  if (error) throw new Error(`Could not create bucket: ${error.message}`)
  console.log(`Bucket "${BUCKET}" created (public).`)
}

async function uploadFile(localPath, storagePath) {
  const buffer = fs.readFileSync(localPath)
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, buffer, {
      contentType: "image/jpeg",
      upsert: false,   // skip if already uploaded
    })
  if (error) {
    // "already exists" is not a real error when upsert=false
    if (error.message?.includes("already exists") || error.statusCode === "409") return "skip"
    throw error
  }
  return "ok"
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!fs.existsSync(MANIFEST)) {
    console.error("Manifest not found. Run download-exercises.mjs first.")
    process.exit(1)
  }

  const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"))
  console.log(`Manifest: ${manifest.length} images to upload\n`)

  await ensureBucket()

  let ok = 0, skipped = 0, failed = 0
  const errors = []

  for (let i = 0; i < manifest.length; i += CONCURRENCY) {
    const batch = manifest.slice(i, i + CONCURRENCY)

    await Promise.all(batch.map(async (entry) => {
      const localPath   = path.join(IMAGE_DIR, entry.rel)
      const storagePath = entry.rel   // e.g. "Barbell_Bench_Press/0.jpg"

      if (!fs.existsSync(localPath)) { skipped++; return }

      try {
        const result = await uploadFile(localPath, storagePath)
        if (result === "skip") skipped++
        else ok++
      } catch (err) {
        failed++
        errors.push({ path: storagePath, err })
      }
    }))

    const done = Math.min(i + CONCURRENCY, manifest.length)
    process.stdout.write(`\r${done}/${manifest.length}  ✓ ${ok}  skip ${skipped}  err ${failed}   `)

    if (i + CONCURRENCY < manifest.length) await sleep(DELAY_MS)
  }

  console.log("\n\nDone.")
  console.log(`  Uploaded : ${ok}`)
  console.log(`  Skipped  : ${skipped}  (already in bucket or missing locally)`)
  console.log(`  Errors   : ${failed}`)

  if (errors.length) {
    console.log("\nFailed uploads:")
    errors.slice(0, 20).forEach((e) => console.log(`  ${e.path} — ${e.err?.message}`))
  }

  // Print the public base URL so you can paste it into the app
  const baseUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}`
  console.log(`\nPublic base URL:\n  ${baseUrl}`)
  console.log(`\nExample image:\n  ${baseUrl}/Barbell_Bench_Press/0.jpg`)
  console.log("\nNext: update WorkoutDayTabs.tsx with this base URL.")
}

main().catch((err) => { console.error(err); process.exit(1) })
