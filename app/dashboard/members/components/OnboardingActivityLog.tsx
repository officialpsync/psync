"use client";

import { useEffect, useState } from "react";
import {
  Send,
  Eye,
  Save,
  CheckCircle2,
  Sparkles,
  Clock,
  User,
  ShieldCheck,
  RefreshCw,
  Loader2,
  Salad,
  Dumbbell,
} from "lucide-react";

type Activity = {
  id: string;
  event_type: string;
  actor_type: string;
  actor_name: string | null;
  metadata: any;
  created_at: string;
};

export function OnboardingActivityLog({ memberId }: { memberId: string }) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadActivities() {
    try {
      setLoading(true);
      const res = await fetch(`/api/portal/onboarding/activity?memberId=${memberId}`);
      const data = await res.json();
      if (res.ok) {
        setActivities(data.activities || []);
      }
    } catch (e) {
      console.warn("Failed to load onboarding activities:", e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadActivities();
  }, [memberId]);

  function getEventIcon(type: string) {
    switch (type) {
      case "dispatched":
        return <Send size={14} color="#3b82f6" />;
      case "viewed_in_app":
        return <Eye size={14} color="#8b5cf6" />;
      case "draft_saved":
        return <Save size={14} color="#f59e0b" />;
      case "submitted":
        return <CheckCircle2 size={14} color="#10b981" />;
      case "profile_synced":
        return <ShieldCheck size={14} color="#059669" />;
      case "ai_diet_triggered":
        return <Salad size={14} color="#f59e0b" />;
      case "ai_workout_triggered":
        return <Dumbbell size={14} color="#6366f1" />;
      default:
        return <Clock size={14} color="var(--text-tertiary)" />;
    }
  }

  function getEventLabel(type: string) {
    switch (type) {
      case "dispatched":
        return "Onboarding Form Dispatched";
      case "viewed_in_app":
        return "Opened in Psync Member App";
      case "draft_saved":
        return "Draft Answers Autosaved";
      case "submitted":
        return "Form Submitted by Member";
      case "profile_synced":
        return "Profile Synced & Approved";
      case "ai_diet_triggered":
        return "AI Diet Plan Generation Triggered";
      case "ai_workout_triggered":
        return "AI Workout Plan Generation Triggered";
      default:
        return type.replace(/_/g, " ");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-tertiary)", fontWeight: 700 }}>
          Onboarding Audit & Activity Log
        </span>
        <button
          type="button"
          className="ps-icon-btn"
          onClick={loadActivities}
          style={{ width: 24, height: 24 }}
          title="Refresh activity"
        >
          <RefreshCw size={12} className={loading ? "ps-spin" : ""} />
        </button>
      </div>

      {loading ? (
        <div style={{ padding: "16px 0", textAlign: "center", color: "var(--text-tertiary)", fontSize: "0.8rem" }}>
          <Loader2 size={16} className="ps-spin" style={{ margin: "0 auto 6px" }} />
          Loading audit trail...
        </div>
      ) : activities.length === 0 ? (
        <div style={{ padding: "14px", background: "var(--surface-sunken)", borderRadius: 8, textAlign: "center", color: "var(--text-tertiary)", fontSize: "0.8rem" }}>
          No onboarding activity recorded yet.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {activities.map((act) => (
            <div
              key={act.id}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                padding: "8px 12px",
                background: "var(--surface-sunken)",
                borderRadius: 8,
                fontSize: "0.8rem",
              }}
            >
              <div
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: "50%",
                  background: "var(--surface)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  marginTop: 2,
                }}
              >
                {getEventIcon(act.event_type)}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <strong style={{ color: "var(--text-primary)" }}>{getEventLabel(act.event_type)}</strong>
                  <span style={{ fontSize: "0.7rem", color: "var(--text-tertiary)" }}>
                    {new Date(act.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: 2 }}>
                  By {act.actor_name || act.actor_type}
                  {act.metadata?.doctor_exercise_restriction && (
                    <span style={{ color: "#ef4444", marginLeft: 6, fontWeight: 600 }}>
                      • Doctor restriction noted
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
