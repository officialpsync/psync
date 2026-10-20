// download-exercises.mjs
// Run from your project root: node download-exercises.mjs
//
// Downloads all exercise images from free-exercise-db into:
//   ./exercise-images/<Exercise_Id>/0.jpg
//   ./exercise-images/<Exercise_Id>/1.jpg
//
// After reviewing, run upload-exercises.mjs to push to Supabase.

import fs from "fs"
import path from "path"
import https from "https"

const CDN = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main"
const OUT = "./exercise-images"
const CONCURRENCY = 5   // parallel downloads — keep low to avoid GitHub rate limits
const DELAY_MS    = 80  // ms between batches

// ─── Helpers ──────────────────────────────────────────────────────────────────

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const dir = path.dirname(dest)
    fs.mkdirSync(dir, { recursive: true })

    // Skip if already downloaded
    if (fs.existsSync(dest)) { resolve("skip"); return }

    const tmp = dest + ".tmp"
    const file = fs.createWriteStream(tmp)

    https.get(url, (res) => {
      if (res.statusCode === 404) {
        file.close()
        fs.unlink(tmp, () => {})
        resolve("404")
        return
      }
      if (res.statusCode !== 200) {
        file.close()
        fs.unlink(tmp, () => {})
        reject(new Error(`HTTP ${res.statusCode} for ${url}`))
        return
      }
      res.pipe(file)
      file.on("finish", () => {
        file.close()
        fs.renameSync(tmp, dest)
        resolve("ok")
      })
    }).on("error", (err) => {
      fs.unlink(tmp, () => {})
      reject(err)
    })
  })
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function runBatch(tasks) {
  return Promise.all(tasks.map((t) => t()))
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Fetching exercise list…")
  const res = await fetch(`${CDN}/dist/exercises.json`)
  if (!res.ok) throw new Error(`Failed to fetch exercises.json: ${res.status}`)
  const exercises = await res.json()
  console.log(`Found ${exercises.length} exercises\n`)

  fs.mkdirSync(OUT, { recursive: true })

  let ok = 0, skipped = 0, missing = 0, failed = 0
  const errors = []

  // Build all tasks: each exercise has images[] array of relative paths
  const allTasks = []
  for (const ex of exercises) {
    if (!ex.images || ex.images.length === 0) continue
    for (const imgPath of ex.images) {
      // imgPath is like "Barbell_Bench_Press/0.jpg"
      const url  = `${CDN}/exercises/${imgPath}`
      const dest = path.join(OUT, imgPath)
      allTasks.push({ id: ex.id, url, dest })
    }
  }

  console.log(`Downloading ${allTasks.length} images (${CONCURRENCY} at a time)…\n`)

  // Process in batches
  for (let i = 0; i < allTasks.length; i += CONCURRENCY) {
    const batch = allTasks.slice(i, i + CONCURRENCY)
    const results = await runBatch(
      batch.map((t) => async () => {
        try {
          const status = await download(t.url, t.dest)
          return { status, id: t.id }
        } catch (err) {
          return { status: "error", id: t.id, err }
        }
      })
    )

    for (const r of results) {
      if (r.status === "ok")    ok++
      if (r.status === "skip")  skipped++
      if (r.status === "404")   missing++
      if (r.status === "error") { failed++; errors.push(r) }
    }

    // Progress line
    const done = i + batch.length
    process.stdout.write(`\r${done}/${allTasks.length}  ✓ ${ok}  skip ${skipped}  404 ${missing}  err ${failed}   `)

    if (i + CONCURRENCY < allTasks.length) await sleep(DELAY_MS)
  }

  console.log("\n\nDone.")
  console.log(`  Downloaded : ${ok}`)
  console.log(`  Skipped    : ${skipped}  (already on disk)`)
  console.log(`  Missing    : ${missing}  (404 — no image in repo)`)
  console.log(`  Errors     : ${failed}`)

  if (errors.length) {
    console.log("\nFailed downloads:")
    errors.forEach((e) => console.log(`  ${e.id} — ${e.err?.message}`))
  }

  // Write a manifest of what downloaded successfully for the upload script
  const manifest = allTasks
    .filter((t) => fs.existsSync(t.dest))
    .map((t) => ({ id: t.id, dest: t.dest, rel: path.relative(OUT, t.dest) }))
  fs.writeFileSync(
    path.join(OUT, "_manifest.json"),
    JSON.stringify(manifest, null, 2)
  )
  console.log(`\nManifest written to ${OUT}/_manifest.json`)
  console.log("Review the images, then run: node upload-exercises.mjs")
}

main().catch((err) => { console.error(err); process.exit(1) })
