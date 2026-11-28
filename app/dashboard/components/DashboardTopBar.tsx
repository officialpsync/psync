"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bell, Power, Sun, Moon, SlidersHorizontal, LayoutGrid, Check,
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import { MemberActivityFeed } from "./MemberActivityFeed";

const supabase = createClient();

type DashboardTopBarProps = {
  userName?: string;
  orgName?: string;
  logoUrl?: string | null;
  orgId?: string | null;
  followupsCount?: number;
  isDark?: boolean;
  onToggleTheme?: () => void;
  editing?: boolean;
  onToggleEditing?: () => void;
  onOpenCustomize?: () => void;
  hiddenWidgetsCount?: number;
};

export function DashboardTopBar({
  userName = "Test Boaz",
  orgName = "My Gym",
  logoUrl = null,
  orgId = null,
  followupsCount = 1,
  isDark = false,
  onToggleTheme,
  editing = false,
  onToggleEditing,
  onOpenCustomize,
  hiddenWidgetsCount = 0,
}: DashboardTopBarProps) {
  const router = useRouter();
  const [currentTime, setCurrentTime] = useState<string>("");

  // Keep live time updated
  useEffect(() => {
    function updateClock() {
      const now = new Date();
      const timeFormatted = now.toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
      setCurrentTime(timeFormatted);
    }

    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  async function handleSignOut() {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error("Sign out error:", err);
    }
    router.replace("/login");
  }

  // Display user's display name in greeting
  const displayName = userName.trim() || "Test Boaz";

  return (
    <div className="db-topbar">
      <style>{TOPBAR_CSS}</style>

      {/* ── Left: Greeting ── */}
      <div className="db-topbar-left">
        <span className="db-topbar-greeting">
          Hi, {displayName}
        </span>
      </div>

      {/* ── Center: Live Time Clock ── */}
      <div className="db-topbar-center" aria-label="Current time">
        <span className="db-topbar-time">{currentTime || "\u00a0"}</span>
      </div>

      {/* ── Right: Badges, Profile & Actions ── */}
      <div className="db-topbar-right">
        {/* Live Notification Bell with Activity Feed */}
        <MemberActivityFeed orgId={orgId} pillBadge={true} />

        {/* Divider */}
        <span className="db-topbar-divider" aria-hidden />

        {/* Gym & User Stacked Names */}
        <div className="db-topbar-identity">
          <span className="db-topbar-org" title={orgName}>
            {orgName}
          </span>
          <span className="db-topbar-user" title={displayName}>
            {displayName}
          </span>
        </div>

        {/* Avatar with Green Online Indicator */}
        <Link
          href="/dashboard/settings"
          className="db-topbar-avatar-wrap"
          title={`${orgName} settings`}
          aria-label="Gym settings"
        >
          <div className="db-topbar-avatar">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt={orgName} />
            ) : (
              <span className="db-topbar-avatar-txt">prim</span>
            )}
          </div>
          <span className="db-topbar-online" title="Online" />
        </Link>

        {/* Sign Out / Power Button */}
        <button
          type="button"
          className="db-topbar-iconbtn db-topbar-power"
          onClick={handleSignOut}
          title="Sign out of dashboard"
          aria-label="Sign out"
        >
          <Power size={18} strokeWidth={2} />
        </button>

        {/* Secondary Dashboard Tools: Theme & Layout Customize */}
        {(onToggleTheme || onOpenCustomize || onToggleEditing) && (
          <>
            <span className="db-topbar-divider" aria-hidden />

            {onToggleTheme && (
              <button
                type="button"
                className="db-topbar-iconbtn"
                onClick={onToggleTheme}
                title={isDark ? "Switch to light mode" : "Switch to dark mode"}
                aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
              >
                {isDark ? <Sun size={16} /> : <Moon size={16} />}
              </button>
            )}

            {onOpenCustomize && !editing && (
              <button
                type="button"
                className="db-topbar-iconbtn"
                onClick={onOpenCustomize}
                title={`Customize widgets${hiddenWidgetsCount > 0 ? ` (${hiddenWidgetsCount} hidden)` : ""}`}
                aria-label="Customize widgets"
              >
                <SlidersHorizontal size={15} />
                {hiddenWidgetsCount > 0 && <span className="db-count">{hiddenWidgetsCount}</span>}
              </button>
            )}

            {onToggleEditing && (
              <button
                type="button"
                className={`db-topbar-iconbtn ${editing ? "db-topbar-iconbtn--active" : ""}`}
                onClick={onToggleEditing}
                title={editing ? "Done editing layout" : "Edit layout"}
                aria-label={editing ? "Done editing layout" : "Edit layout"}
              >
                {editing ? <Check size={16} strokeWidth={2.6} /> : <LayoutGrid size={15} />}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const TOPBAR_CSS = `
.db-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: 58px;
  height: 58px;
  padding: 0 20px;
  background: var(--surface, #ffffff);
  border: 1px solid var(--separator, #e5e7eb);
  border-radius: 14px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.02);
  margin-bottom: 22px;
  position: relative;
  box-sizing: border-box;
  user-select: none;
}

.db-topbar-left {
  display: flex;
  align-items: center;
  min-width: 0;
  z-index: 2;
}

.db-topbar-greeting {
  font-size: 15.5px;
  font-weight: 750;
  color: var(--text-primary, #1e293b);
  letter-spacing: -0.015em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.db-topbar-center {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  z-index: 1;
}

.db-topbar-time {
  font-size: 19px;
  font-weight: 700;
  color: var(--text-primary, #0f172a);
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.db-topbar-right {
  display: flex;
  align-items: center;
  gap: 12px;
  z-index: 2;
}

.db-topbar-iconbtn {
  position: relative;
  width: 34px;
  height: 34px;
  min-width: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--text-secondary, #64748b);
  border-radius: 9px;
  cursor: pointer;
  text-decoration: none;
  transition: all 140ms ease;
}

.db-topbar-iconbtn:hover {
  background: var(--surface-2, rgba(0, 0, 0, 0.05));
  color: var(--text-primary, #0f172a);
}

.db-topbar-iconbtn--active {
  background: var(--accent, #0a84ff) !important;
  color: #ffffff !important;
}

.db-topbar-power:hover {
  color: #ef4444 !important;
  background: rgba(239, 68, 68, 0.08) !important;
}

.db-topbar-pill {
  position: absolute;
  top: -4px;
  right: -6px;
  min-width: 17px;
  height: 16px;
  padding: 0 4.5px;
  border-radius: 999px;
  background: #f43f5e;
  color: #ffffff;
  font-size: 10px;
  font-weight: 750;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1.5px solid var(--surface, #ffffff);
  box-shadow: 0 1px 3px rgba(244, 63, 94, 0.4);
  line-height: 1;
}

.db-topbar-divider {
  width: 1px;
  height: 22px;
  background: var(--separator, #e5e7eb);
  margin: 0 2px;
}

.db-topbar-identity {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: center;
  text-align: right;
  min-width: 0;
}

.db-topbar-org {
  font-size: 13.5px;
  font-weight: 700;
  color: var(--text-primary, #1e293b);
  line-height: 1.25;
  white-space: nowrap;
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.db-topbar-user {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-tertiary, #64748b);
  line-height: 1.2;
  margin-top: 1.5px;
  white-space: nowrap;
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.db-topbar-avatar-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-decoration: none;
  flex-shrink: 0;
}

.db-topbar-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #7c3aed 0%, #4c1d95 100%);
  color: #ffffff;
  box-shadow: 0 2px 6px rgba(124, 58, 237, 0.3);
}

.db-topbar-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.db-topbar-avatar-txt {
  font-size: 12px;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: #ffffff;
  text-transform: lowercase;
}

.db-topbar-online {
  position: absolute;
  bottom: 0px;
  right: 0px;
  width: 9.5px;
  height: 9.5px;
  border-radius: 50%;
  background: #10b981;
  border: 2px solid var(--surface, #ffffff);
  box-shadow: 0 0 0 1px rgba(16, 185, 129, 0.25);
}

@media (max-width: 860px) {
  .db-topbar-center {
    display: none;
  }
}

@media (max-width: 600px) {
  .db-topbar {
    padding: 0 12px;
    height: auto;
    min-height: 52px;
    gap: 8px;
  }
  .db-topbar-identity {
    display: none;
  }
  .db-topbar-greeting {
    font-size: 14px;
  }
}
`;
