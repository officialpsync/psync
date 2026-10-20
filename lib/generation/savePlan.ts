// lib/generation/savePlan.ts
// Ported from Nayamai. Psync changes: saves to member_diet_plans and
// supersedes by member_id instead of client_id.
//
// AI is used ONLY for human-readable guideline text. It has zero involvement
// in recipe selection or nutrition numbers. If OPENROUTER_API_KEY is not set,
// guidelines are simply skipped and the plan still saves.

import type { SupabaseClient } from '@supabase/supabase-js'

/** Calls OpenRouter for 5 general guidelines. Returns [] on any failure or timeout. */
export async function fetchGuidelines(prompt: string, timeoutMs: number): Promise<string[]> {
  if (!process.env.OPENROUTER_API_KEY) return []
  try {
    const controller = new AbortController()
    const aiTimeout  = setTimeout(() => controller.abort(), timeoutMs)

    const aiRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
      }),
    })

    clearTimeout(aiTimeout)

    if (aiRes.ok) {
      const aiData = await aiRes.json()
      const raw    = aiData.choices?.[0]?.message?.content || '{}'
      const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim())
      if (Array.isArray(parsed.general_guidelines)) {
        return parsed.general_guidelines
      }
    }
  } catch (_) {
    // fall through
  }
  return []
}

/**
 * Inserts a new active plan, then marks the member's other active plans as
 * superseded. Returns the saved row, or an error message if the insert failed.
 */
export async function insertPlan(
  supabase: SupabaseClient,
  memberId: string,
  row: Record<string, any>,
): Promise<{ plan: any | null; error?: string }> {
  const { data: newPlan, error: insertErr } = await supabase
    .from('member_diet_plans').insert(row).select().single()

  if (insertErr || !newPlan) {
    return { plan: null, error: insertErr?.message }
  }

  const { error: supersedeErr } = await supabase
    .from('member_diet_plans')
    .update({ status: 'superseded' })
    .eq('member_id', memberId)
    .neq('id', newPlan.id)
    .eq('status', 'active')

  if (supersedeErr) {
    console.warn('Failed to supersede previous plans:', supersedeErr.message)
  }

  return { plan: newPlan }
}
