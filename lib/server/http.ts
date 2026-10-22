// lib/server/http.ts
// Small request-hardening helpers for API routes.
import "./guard"
import { NextResponse, type NextRequest } from "next/server"

export function fail(status: number, error: string, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}) {
  return NextResponse.json({ error, ...extra }, { status, headers: { "Cache-Control": "no-store", ...headers } })
}

export function ok(body: unknown) {
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } })
}

/** Caller IP as seen by Vercel's edge (first hop of x-forwarded-for). */
export function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for")
  const ip = fwd?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown"
  return ip.slice(0, 64)
}

/**
 * If the browser sent an Origin header, it must be this site. Bearer tokens
 * already block classic CSRF; this also stops other websites from scripting
 * the endpoint with a stolen token in a victim's browser.
 */
export function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin")
  if (!origin) return true // server-to-server / same-origin fetches may omit it
  try {
    return new URL(origin).host === req.headers.get("host")
  } catch {
    return false
  }
}

/** Reads a JSON body with a hard size cap. Returns null on oversize or bad JSON. */
export async function readJson(req: NextRequest, maxBytes: number): Promise<Record<string, unknown> | null> {
  const declared = Number(req.headers.get("content-length") ?? "0")
  if (declared > maxBytes) return null
  if (!(req.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) return null
  const raw = await req.text()
  if (raw.length > maxBytes) return null
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

/** Plain text: NFKC, no control characters or markup brackets, collapsed spaces, capped. */
export function cleanText(v: unknown, max: number): string {
  if (typeof v !== "string") return ""
  return v
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f-\u009f<>`{}\[\]\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
}
