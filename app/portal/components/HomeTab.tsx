"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import {
  QrCode,
  Flame,
  Calendar,
  Dumbbell,
  Salad,
  ChevronRight,
  ShieldAlert,
  Sparkles,
  MapPin,
  Clock,
  CheckCircle2,
} from "lucide-react";
import type {
  PortalMember,
  PortalMembership,
  PortalAttendanceLog,
  PortalWorkoutProgram,
  PortalDietPlan,
  PortalTab,
} from "../types";

interface HomeTabProps {
  member: PortalMember;
  membership: PortalMembership | null;
  attendance: PortalAttendanceLog[];
  workout: PortalWorkoutProgram | null;
  diet: PortalDietPlan | null;
  onOpenQR: () => void;
  onSwitchTab: (tab: PortalTab) => void;
}

export function HomeTab({
  member,
  membership,
  attendance,
  workout,
  diet,
  onOpenQR,
  onSwitchTab,
}: HomeTabProps) {
  const [miniQrUrl, setMiniQrUrl] = useState<string>("");

  useEffect(() => {
    QRCode.toDataURL(member.id, {
      width: 140,
      margin: 1,
      color: { dark: "#000000", light: "#ffffff" },
    }).then(setMiniQrUrl).catch(() => {});
  }, [member.id]);

  // Membership calculations
  const planName = membership?.membership_plans?.name || "Membership Plan";
  const endDateStr = membership?.end_date;
  const daysLeft = endDateStr
    ? Math.ceil((new Date(endDateStr).getTime() - Date.now()) / 86400000)
    : null;

  const isExpired = daysLeft !== null && daysLeft < 0;
  const isExpiring = daysLeft !== null && daysLeft >= 0 && daysLeft <= 7;
  const badgeClass = isExpired ? "expired" : isExpiring ? "expiring" : "active";
  const badgeText = isExpired
    ? "Expired"
    : isExpiring
    ? `${daysLeft} days left`
    : daysLeft !== null
    ? `${daysLeft} days remaining`
    : "Active";

  // Attendance streak calculations
  const now = Date.now();
  const visitsThisMonth = attendance.filter((a) => {
    const d = new Date(a.check_in_at).getTime();
    return now - d <= 30 * 86400000;
  }).length;

  const lastVisit = attendance[0]?.check_in_at
    ? new Date(attendance[0].check_in_at).toLocaleDateString("en-IN", {
        month: "short",
        day: "numeric",
      })
    : "None yet";

  // Active workout program preview
  const workoutProg = workout?.workout_programs;
  const firstDay = workoutProg?.days?.[0];

  // Active diet preview
  const targetKcal = diet?.target_kcal || diet?.plan_json?.day_total?.calories || 0;
  const nextMeal = diet?.plan_json?.meals?.[0];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* ── DIGITAL PASS HERO CARD ── */}
      <section className="portal-pass-card">
        <div className="portal-pass-top">
          <div>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.7)", fontWeight: 650 }}>
              {member.branches?.name || "Psync Fitness"}
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, marginTop: 2 }}>{member.full_name}</div>
          </div>
          <div className={`portal-pass-badge ${badgeClass}`}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }} />
            <span>{badgeText}</span>
          </div>
        </div>

        <div className="portal-pass-body">
          <div className="portal-pass-qr-wrap" onClick={onOpenQR} title="Tap to enlarge QR Pass">
            {miniQrUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={miniQrUrl} alt="QR Code" style={{ width: 84, height: 84 }} />
            ) : (
              <div style={{ width: 84, height: 84, display: "grid", placeItems: "center" }}>
                <QrCode size={40} color="#000" />
              </div>
            )}
          </div>

          <div className="portal-pass-details">
            <div className="portal-pass-plan">{planName}</div>
            <div className="portal-pass-expiry">
              {endDateStr ? `Valid till ${new Date(endDateStr).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}` : "Ongoing membership"}
            </div>
            <button
              type="button"
              onClick={onOpenQR}
              style={{
                background: "rgba(255,255,255,0.18)",
                border: "none",
                color: "#fff",
                borderRadius: 8,
                padding: "5px 10px",
                fontSize: 11.5,
                fontWeight: 650,
                cursor: "pointer",
                marginTop: 6,
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                width: "fit-content",
              }}
            >
              <QrCode size={13} /> Tap to expand pass
            </button>
          </div>
        </div>
      </section>

      {/* ── EXPIRY WARNING NOTICE ── */}
      {isExpiring && (
        <div
          style={{
            background: "var(--amber-dim)",
            border: "1px solid rgba(255, 159, 10, 0.3)",
            borderRadius: 16,
            padding: "12px 14px",
            display: "flex",
            alignItems: "center",
            gap: 10,
            fontSize: 12.5,
            color: "var(--amber)",
          }}
        >
          <ShieldAlert size={18} style={{ flexShrink: 0 }} />
          <span>Your gym membership expires in <b>{daysLeft} days</b>. Contact the front desk to renew.</span>
        </div>
      )}

      {/* ── STATS TILES ── */}
      <div className="portal-stat-grid">
        <div className="portal-stat-tile">
          <div className="portal-stat-head">
            <span>Visits (30 Days)</span>
            <Calendar size={14} style={{ color: "var(--accent)" }} />
          </div>
          <div className="portal-stat-value">{visitsThisMonth}</div>
          <div className="portal-stat-sub">Last visit: {lastVisit}</div>
        </div>

        <div className="portal-stat-tile">
          <div className="portal-stat-head">
            <span>Workout Streak</span>
            <Flame size={14} style={{ color: "var(--amber-fill)" }} />
          </div>
          <div className="portal-stat-value">
            {visitsThisMonth > 0 ? `${Math.min(visitsThisMonth, 5)} days` : "0 days"}
          </div>
          <div className="portal-stat-sub">Keep the momentum going!</div>
        </div>
      </div>

      {/* ── TODAY'S ASSIGNED WORKOUT GLANCE ── */}
      <div className="portal-card">
        <div className="portal-card-header">
          <div className="portal-card-title">
            <Dumbbell size={16} style={{ color: "var(--accent)" }} />
            <span>Assigned Routine</span>
          </div>
          <button
            type="button"
            onClick={() => onSwitchTab("workout")}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--accent)",
              fontSize: 12,
              fontWeight: 650,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 2,
            }}
          >
            Open Plan <ChevronRight size={14} />
          </button>
        </div>

        {workoutProg ? (
          <div
            onClick={() => onSwitchTab("workout")}
            style={{
              background: "var(--surface-2)",
              borderRadius: 14,
              padding: "12px 14px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              cursor: "pointer",
            }}
          >
            <div>
              <div style={{ fontSize: 14.5, fontWeight: 700 }}>{workoutProg.name}</div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                {workoutProg.days_per_week} days/week • {workoutProg.difficulty} • {firstDay ? firstDay.day_name : "Split"}
              </div>
            </div>
            <div style={{ width: 32, height: 32, borderRadius: 10, background: "var(--accent-dim)", display: "grid", placeItems: "center", color: "var(--accent)" }}>
              <ChevronRight size={17} />
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 12.5, color: "var(--text-secondary)", padding: "6px 0" }}>
            No active workout routine assigned yet. Ask your trainer to assign one in Psync!
          </div>
        )}
      </div>

      {/* ── TODAY'S DIET PLAN GLANCE ── */}
      <div className="portal-card">
        <div className="portal-card-header">
          <div className="portal-card-title">
            <Salad size={16} style={{ color: "var(--green)" }} />
            <span>Nutrition & Diet</span>
          </div>
          <button
            type="button"
            onClick={() => onSwitchTab("diet")}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--green)",
              fontSize: 12,
              fontWeight: 650,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 2,
            }}
          >
            View Meals <ChevronRight size={14} />
          </button>
        </div>

        {diet ? (
          <div
            onClick={() => onSwitchTab("diet")}
            style={{
              background: "var(--green-dim)",
              borderRadius: 14,
              padding: "12px 14px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              cursor: "pointer",
            }}
          >
            <div>
              <div style={{ fontSize: 14.5, fontWeight: 700, color: "var(--text-primary)" }}>
                {targetKcal ? `${Math.round(targetKcal)} kcal Target` : "Active Diet Plan"}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                {nextMeal ? `Includes ${cleanMealName(nextMeal.recipe_name || nextMeal.meal_type)}` : `${diet.plan_json?.meals?.length || 0} balanced meals planned`}
              </div>
            </div>
            <div style={{ width: 32, height: 32, borderRadius: 10, background: "rgba(52, 199, 89, 0.2)", display: "grid", placeItems: "center", color: "var(--green)" }}>
              <ChevronRight size={17} />
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 12.5, color: "var(--text-secondary)", padding: "6px 0" }}>
            No active meal plan assigned yet. Ask your dietitian or trainer to create one.
          </div>
        )}
      </div>

      {/* ── GYM INFO FOOTER ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "8px 4px", fontSize: 11.5, color: "var(--text-tertiary)", textAlign: "center" }}>
        <div>Powered by <b>Psync</b> for {member.branches?.name || "your gym"}</div>
        {member.branches?.address && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
            <MapPin size={12} /> {member.branches.address}
          </div>
        )}
      </div>
    </div>
  );
}

function cleanMealName(name?: string | null): string {
  if (!name) return "meal";
  return name.replace(/\s*recipe$/i, "").replace(/^recipe\s*[-–]\s*/i, "").trim();
}
