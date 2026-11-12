"use client";

import { useState } from "react";
import { ArrowRight, Phone, ShieldCheck, Dumbbell, AlertCircle, Loader2 } from "lucide-react";
import { fetchMemberByPhone, fetchMemberById, setCachedMemberId } from "../lib/portalState";
import type { PortalMember } from "../types";
import { supabase } from "@/lib/supabase";

interface PortalGateProps {
  onMemberLoaded: (m: PortalMember) => void;
}

export function PortalGate({ onMemberLoaded }: PortalGateProps) {
  const [inputVal, setInputVal] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const clean = inputVal.trim();
    if (!clean) return;

    setLoading(true);
    setError(null);

    // Check if UUID or phone number
    let member: PortalMember | null = null;
    if (clean.length > 20 && clean.includes("-")) {
      member = await fetchMemberById(clean);
    } else {
      member = await fetchMemberByPhone(clean);
    }

    if (!member) {
      // Try fetching by ID directly if 36 chars
      if (clean.length === 36) {
        member = await fetchMemberById(clean);
      }
    }

    if (member) {
      setCachedMemberId(member.id);
      onMemberLoaded(member);
    } else {
      setError("No member found. Make sure your phone number or Member ID matches what is registered at the gym desk.");
      setLoading(false);
    }
  }

  async function handleLoadSampleMember() {
    setLoading(true);
    setError(null);
    try {
      const { data, error: qErr } = await supabase
        .from("members")
        .select("*, branches(name, address, phone)")
        .limit(1)
        .maybeSingle();

      if (qErr || !data) {
        setError("No members exist yet in the database. Add a member in the dashboard first.");
        setLoading(false);
        return;
      }
      const m = data as unknown as PortalMember;
      setCachedMemberId(m.id);
      onMemberLoaded(m);
    } catch {
      setError("Failed to fetch demo member.");
      setLoading(false);
    }
  }

  return (
    <div className="portal-root" style={{ alignItems: "center" }}>
      <div className="portal-container" style={{ minHeight: "auto", padding: "40px 20px" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 16 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 20,
              background: "var(--accent)",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 10px 25px rgba(0, 113, 227, 0.35)",
            }}
          >
            <Dumbbell size={32} strokeWidth={2.4} />
          </div>

          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>Psync Member Portal</h1>
            <p style={{ fontSize: 13.5, color: "var(--text-secondary)", marginTop: 6, lineHeight: 1.4 }}>
              Your digital gym pass, daily workout split, and personalized nutrition plan.
            </p>
          </div>
        </div>

        <div className="portal-card" style={{ marginTop: 28, padding: 20 }}>
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 12.5, fontWeight: 650, color: "var(--text-secondary)" }}>
                Registered Mobile Number or Member ID
              </span>
              <div style={{ position: "relative" }}>
                <input
                  type="text"
                  value={inputVal}
                  onChange={(e) => setInputVal(e.target.value)}
                  placeholder="e.g. 9876543210 or paste link"
                  autoFocus
                  style={{
                    width: "100%",
                    padding: "12px 14px 12px 40px",
                    borderRadius: 12,
                    border: "1px solid var(--border-mid)",
                    background: "var(--surface-2)",
                    fontSize: 15,
                    outline: "none",
                    fontVariantNumeric: "tabular-nums",
                  }}
                />
                <Phone
                  size={17}
                  style={{ position: "absolute", left: 14, top: 15, color: "var(--text-tertiary)" }}
                />
              </div>
            </label>

            {error && (
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "flex-start",
                  fontSize: 12,
                  color: "var(--red)",
                  background: "var(--red-dim)",
                  padding: "10px 12px",
                  borderRadius: 10,
                }}
              >
                <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !inputVal.trim()}
              className="ps-btn ps-btn--primary"
              style={{
                width: "100%",
                padding: "13px",
                borderRadius: 12,
                fontSize: 14.5,
                fontWeight: 650,
                display: "flex",
                justifyContent: "center",
                gap: 8,
              }}
            >
              {loading ? (
                <Loader2 size={18} className="ps-spin" />
              ) : (
                <>
                  <span>Open My Gym Pass</span>
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 11.5,
              color: "var(--text-tertiary)",
              borderTop: "1px solid var(--separator)",
              paddingTop: 14,
              marginTop: 4,
            }}
          >
            <ShieldCheck size={16} style={{ color: "var(--green)" }} />
            <span>One-tap WhatsApp links automatically log you in and save your pass.</span>
          </div>
        </div>

        <div style={{ marginTop: 24, textAlign: "center" }}>
          <button
            type="button"
            onClick={handleLoadSampleMember}
            disabled={loading}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--accent)",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              textDecoration: "underline",
              padding: 8,
            }}
          >
            Or preview with an existing gym member
          </button>
        </div>
      </div>
    </div>
  );
}
