"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { X, Sparkles, Sun } from "lucide-react";

interface QRCodeModalProps {
  memberId: string;
  memberName: string;
  branchName?: string;
  onClose: () => void;
}

export function QRCodeModal({ memberId, memberName, branchName, onClose }: QRCodeModalProps) {
  const [dataUrl, setDataUrl] = useState<string>("");

  useEffect(() => {
    QRCode.toDataURL(memberId, {
      width: 280,
      margin: 1,
      color: {
        dark: "#000000",
        light: "#ffffff",
      },
      errorCorrectionLevel: "M",
    })
      .then((url) => setDataUrl(url))
      .catch((err) => console.error("QR Code Error:", err));
  }, [memberId]);

  return (
    <div className="portal-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="portal-modal-card" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", width: "100%", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700, color: "var(--accent)" }}>
            <Sparkles size={16} /> Digital Gym Pass
          </div>
          <button
            onClick={onClose}
            className="ps-icon-btn"
            style={{ width: 28, height: 28 }}
            aria-label="Close"
          >
            <X size={17} />
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <div style={{ fontSize: 18, fontWeight: 750, color: "var(--text-primary)" }}>{memberName}</div>
          {branchName && <div style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>{branchName}</div>}
        </div>

        <div
          style={{
            background: "#ffffff",
            padding: 14,
            borderRadius: 20,
            boxShadow: "0 4px 20px rgba(0, 0, 0, 0.08)",
            border: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: 220,
            width: "100%",
          }}
        >
          {dataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={dataUrl}
              alt={`QR Code Pass for ${memberName}`}
              style={{ width: 220, height: 220, display: "block" }}
            />
          ) : (
            <div style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Generating QR Code…</div>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--text-secondary)" }}>
          <Sun size={14} /> Turn up screen brightness at scanner
        </div>

        <div
          style={{
            fontFamily: "monospace",
            fontSize: 10.5,
            color: "var(--text-tertiary)",
            background: "var(--fill)",
            padding: "4px 10px",
            borderRadius: 6,
            wordBreak: "break-all",
          }}
        >
          ID: {memberId.slice(0, 8)}…{memberId.slice(-6)}
        </div>
      </div>
    </div>
  );
}
