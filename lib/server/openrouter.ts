// lib/server/openrouter.ts
// The only place that talks to OpenRouter. Key comes from the environment and
// never leaves the server. Replies must match a JSON schema or they're rejected.
import "./guard"

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions"
export const DEFAULT_MODEL = "openai/gpt-4o-mini"

export interface AIUsage { model: string; promptTokens: number; completionTokens: number; costUsd: number | null }

export class AIError extends Error {
  constructor(message: string, public usage?: AIUsage) { super(message) }
}

export async function chatJSON<T>(opts: {
  system: string
  user: string
  schemaName: string
  schema: Record<string, unknown>
  maxTokens: number
  timeoutMs: number
}): Promise<{ data: T; usage: AIUsage }> {
  const key = process.env.OPENROUTER_API_KEY
  if (!key) throw new AIError("AI is not configured")
  const model = process.env.OPENROUTER_MODEL || DEFAULT_MODEL

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs)
  let res: Response
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL || "https://psync-olive.vercel.app",
        "X-Title": "Psync",
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: opts.maxTokens,
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.user },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: opts.schemaName, strict: true, schema: opts.schema },
        },
        provider: {
          require_parameters: true, // only providers that honour the JSON schema
          data_collection: "deny",  // skip providers that may train on prompts
        },
        usage: { include: true },
      }),
    })
  } catch (e) {
    throw new AIError(e instanceof Error && e.name === "AbortError" ? "AI took too long" : "AI request failed")
  } finally {
    clearTimeout(timer)
  }

  const body = await res.json().catch(() => null) as {
    model?: string
    choices?: { message?: { content?: string }; finish_reason?: string }[]
    usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number }
    error?: { message?: string }
  } | null

  const usage: AIUsage = {
    model: body?.model ?? model,
    promptTokens: body?.usage?.prompt_tokens ?? 0,
    completionTokens: body?.usage?.completion_tokens ?? 0,
    costUsd: typeof body?.usage?.cost === "number" ? body.usage.cost : null,
  }

  if (!res.ok || !body) {
    // Log the provider's reason server-side only; never echo it to the browser
    console.error("OpenRouter error", res.status, body?.error?.message)
    throw new AIError("AI request failed", usage)
  }

  const choice = body.choices?.[0]
  if (choice?.finish_reason === "length") throw new AIError("AI reply was cut off", usage)
  try {
    return { data: JSON.parse(choice?.message?.content ?? "") as T, usage }
  } catch {
    throw new AIError("AI reply was not valid JSON", usage)
  }
}
