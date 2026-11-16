"use client";

import { QrCode, LogOut, Smartphone } from "lucide-react";
import type { PortalMember, GymOccupancy } from "../types";

interface PortalHeaderProps {
  member: PortalMember;
  gymOccupancy?: GymOccupancy | null;
  onOpenQR: () => void;
  onLogout: () => void;
}

export function PortalHeader({ member, gymOccupancy, onOpenQR, onLogout }: PortalHeaderProps) {
  const initial = member.full_name.charAt(0).toUpperCase();

  return (
    <header className="portal-header">
      <div className="portal-brand">
        <div className="portal-avatar">
          {member.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={member.photo_url} alt={member.full_name} />
          ) : (
            <span>{initial}</span>
          )}
        </div>
        <div className="portal-header-info">
          <span className="portal-header-name">{member.full_name}</span>
          <span className="portal-header-branch">
            {member.branches?.name || "Psync Gym"}
            {typeof gymOccupancy?.activeMembersPresent === "number" && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  marginLeft: 8,
                  fontSize: "0.75rem",
                  color: "#a1f432",
                  fontWeight: 600,
                }}
              >
                <span
                  style={{
                    display: "inline-block",
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    backgroundColor: "#a1f432",
                    boxShadow: "0 0 6px rgba(161, 244, 50, 0.8)",
                  }}
                />
                {gymOccupancy.activeMembersPresent} inside
              </span>
            )}
          </span>
        </div>
      </div>

      <div className="portal-header-actions">
        <a
          href={`psync://portal?m=${member.id}`}
          className="portal-app-link"
          title="Open in Psync Member App"
        >
          <Smartphone size={13} strokeWidth={2.4} />
          <span>App</span>
        </a>

        <button
          type="button"
          onClick={onOpenQR}
          className="portal-qr-btn"
          aria-label="Show Digital Pass"
        >
          <QrCode size={15} strokeWidth={2.4} />
          <span>Pass</span>
        </button>

        <button
          type="button"
          onClick={onLogout}
          className="ps-icon-btn"
          title="Switch member"
          aria-label="Switch member"
          style={{ width: 32, height: 32, color: "var(--text-tertiary)" }}
        >
          <LogOut size={16} />
        </button>
      </div>
    </header>
  );
}
