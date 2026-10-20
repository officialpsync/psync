// app/accept-invite/page.tsx
"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase"

export default function AcceptInvitePage() {
  const router = useRouter()
  const supabase = createClient()

  const [checking, setChecking] = useState(true)
  const [email, setEmail] = useState<string | null>(null)
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Supabase's magic-link callback establishes the session client-side
    // automatically (detectSessionInUrl). Give it a beat, then check.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        setError("This invite link is invalid or has expired. Ask your gym owner to resend it.")
        setChecking(false)
        return
      }
      setEmail(session.user.email ?? null)
      setChecking(false)
    })
  }, [supabase])

  async function handleSubmit() {
    setError(null)
    if (password.length < 8) { setError("Password must be at least 8 characters"); return }
    if (password !== confirm) { setError("Passwords don't match"); return }

    setSaving(true)
    const { error: pwError } = await supabase.auth.updateUser({ password })
    if (pwError) {
      setError(pwError.message)
      setSaving(false)
      return
    }

    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch("/api/staff/accept-invite", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
    })
    const body = await res.json()
    setSaving(false)

    if (!res.ok) {
      setError(body.error ?? "Something went wrong")
      return
    }

    router.replace("/dashboard")
  }

  if (checking) return <div className="ps-page" style={{ textAlign: "center", paddingTop: 80 }}>Checking your invite…</div>

  return (
    <div className="ps-page ps-page--narrow" style={{ paddingTop: 60, maxWidth: 420, margin: "0 auto" }}>
      <h1 className="ps-title">Set your password</h1>
      {email && <p className="ps-subtitle">Finishing setup for {email}</p>}

      {error ? (
        <div className="ps-error" style={{ marginTop: 16 }}>{error}</div>
      ) : (
        <div className="ps-form-grid" style={{ marginTop: 20 }}>
          <div className="ps-field ps-span-2">
            <label className="ps-label">Password</label>
            <input className="ps-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
          </div>
          <div className="ps-field ps-span-2">
            <label className="ps-label">Confirm password</label>
            <input className="ps-input" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
          <div className="ps-span-2">
            <button type="button" className="ps-btn ps-btn--primary" onClick={handleSubmit} disabled={saving} style={{ width: "100%" }}>
              <span>{saving ? "Setting up…" : "Set password & continue"}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
