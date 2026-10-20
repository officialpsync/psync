"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { createClient } from "@/lib/supabase";

const supabase = createClient();

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) {
      setError("Enter your email and password to continue.");
      return;
    }
    setLoading(true);
    setError("");
    const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (authError) {
      setError(authError.message === "Invalid login credentials" ? "That email and password don't match. Check them and try again." : authError.message);
      setLoading(false);
      return;
    }
    router.push("/dashboard");
  }

  return (
    <div className="ps-auth">
      <div className="ps-auth-card">
        <div className="ps-auth-head">
          <div className="ps-logo ps-logo--lg">P</div>
          <h1 className="ps-auth-title">Sign in to Psync</h1>
          <p className="ps-auth-sub">Members, payments and attendance in one place.</p>
        </div>

        <form onSubmit={handleLogin} noValidate style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <label className="ps-field">
            <span className="ps-label">Email</span>
            <input
              className="ps-input"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@yourgym.com"
              autoFocus
            />
          </label>

          <label className="ps-field">
            <span className="ps-label">Password</span>
            <div className="ps-input-wrap">
              <input
                className="ps-input"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                enterKeyHint="go"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password"
                style={{ paddingRight: 48 }}
              />
              <span className="ps-input-trailing">
                <button
                  type="button"
                  className="ps-icon-btn"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </span>
            </div>
          </label>

          {error && <div className="ps-error" role="alert">{error}</div>}

          <button type="submit" className="ps-btn ps-btn--primary ps-btn--lg ps-btn--block" disabled={loading} style={{ marginTop: 6 }}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="ps-auth-foot">Built for gyms across India.</p>
      </div>
    </div>
  );
}
