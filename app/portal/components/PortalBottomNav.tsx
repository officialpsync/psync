"use client";

import { Home, Dumbbell, Salad, Calendar, User } from "lucide-react";
import type { PortalTab } from "../types";

interface PortalBottomNavProps {
  activeTab: PortalTab;
  onChangeTab: (tab: PortalTab) => void;
  hasWorkout: boolean;
  hasDiet: boolean;
}

export function PortalBottomNav({
  activeTab,
  onChangeTab,
  hasWorkout,
  hasDiet,
}: PortalBottomNavProps) {
  const tabs: { id: PortalTab; label: string; icon: typeof Home; badge?: boolean }[] = [
    { id: "pass", label: "Home", icon: Home },
    { id: "workout", label: "Workout", icon: Dumbbell, badge: hasWorkout },
    { id: "diet", label: "Diet", icon: Salad, badge: hasDiet },
    { id: "classes", label: "Classes", icon: Calendar },
    { id: "profile", label: "Profile", icon: User },
  ];

  return (
    <nav className="portal-nav" aria-label="Member portal navigation">
      <div className="portal-nav-inner">
        {tabs.map((t) => {
          const Icon = t.icon;
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onChangeTab(t.id)}
              className={`portal-tab-btn ${isActive ? "active" : ""}`}
              aria-label={t.label}
              aria-selected={isActive}
            >
              <div className="portal-tab-icon">
                <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                {t.badge && !isActive && <span className="portal-tab-indicator" />}
              </div>
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
