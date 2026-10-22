// lib/server/rateLimit.ts
// Shared-state rate limits in Upstash Redis. In-memory limits don't work on
// Vercel: every request can land on a different server instance.
import "./guard"
import { Ratelimit } from "@upstash/ratelimit"
import { Redis } from "@upstash/redis"

// Vercel's Upstash integration names these KV_*; Upstash's own docs use UPSTASH_*
const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL
const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN

export const redis: Redis | null = url && token ? new Redis({ url, token }) : null

const limiters = new Map<string, Ratelimit>()

/** Sliding-window burst limit, e.g. 5 per minute per user. */
export async function burst(name: string, id: string, max: number, window: `${number} ${"s" | "m" | "h"}`) {
  if (!redis) return { ok: false as const, retryAfter: 60, unavailable: true }
  const key = `${name}:${max}:${window}`
  let rl = limiters.get(key)
  if (!rl) {
    rl = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(max, window), prefix: `rl:${name}` })
    limiters.set(key, rl)
  }
  const r = await rl.limit(id)
  return { ok: r.success, retryAfter: Math.max(1, Math.ceil((r.reset - Date.now()) / 1000)), unavailable: false }
}

/** Today's date in India, so daily limits reset at Indian midnight. */
export function istDay(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })
}

/**
 * Atomically takes one unit from a daily allowance. INCR is atomic, so two
 * simultaneous requests can never both take the last unit.
 */
export async function reserveDaily(key: string, limit: number) {
  if (!redis) return { ok: false as const, used: 0, unavailable: true }
  const used = await redis.incr(key)
  if (used === 1) await redis.expire(key, 60 * 60 * 26)
  if (used > limit) {
    await redis.decr(key)
    return { ok: false as const, used: limit, unavailable: false }
  }
  return { ok: true as const, used, unavailable: false }
}

/** Gives a unit back when the AI call failed, so a provider error doesn't eat the allowance. */
export async function releaseDaily(key: string) {
  if (redis) await redis.decr(key)
}
