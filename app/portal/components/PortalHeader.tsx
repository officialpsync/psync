"use client";

import { QrCode, LogOut, Smartphone } from "lucide-react";
import type { PortalMember } from "../types";

interface PortalHeaderProps {
  member: PortalMember;
  onOpenQR: () => void;
  onLogout: () => void;
}

export function PortalHeader({ member, onOpenQR, onLogout }: PortalHeaderProps) {
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
