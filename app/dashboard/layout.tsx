import type { Viewport } from "next";
import { Suspense } from "react";
import { Sidebar } from "./components/Sidebar";

// viewport-fit=cover lets the tab bar and top bar use the iPhone safe-area insets.
// Zoom is never disabled; inputs are 16px on touch devices instead.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: "#f5f5f7",
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="ps-shell">
      <Sidebar />
      <main className="ps-main">
        <Suspense>{children}</Suspense>
      </main>
    </div>
  );
}
