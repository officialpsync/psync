import { LucideIcon, TrendingUp, TrendingDown } from "lucide-react"

interface StatCardProps {
  label: string
  value: string
  sub?: string
  icon: LucideIcon
  color: string
  colorDim: string
  trend?: { value: string; up: boolean }
}

export default function StatCard({ label, value, sub, icon: Icon, color, colorDim, trend }: StatCardProps) {
  return (
    <div style={{
      background: "var(--surface)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius-lg)",
      padding: "20px 22px 18px",
      display: "flex",
      flexDirection: "column",
      gap: 14,
      boxShadow: "var(--shadow-sm)",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <span style={{
          fontSize: 11,
          fontWeight: 600,
          color: "var(--text-tertiary)",
          letterSpacing: "0.05em",
          textTransform: "uppercase",
        }}>
          {label}
        </span>
        <div style={{
          width: 32,
          height: 32,
          borderRadius: "var(--radius-sm)",
          background: colorDim,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}>
          <Icon size={15} color={color} strokeWidth={2} />
        </div>
      </div>

      <div>
        <div style={{
          fontSize: 30,
          fontWeight: 700,
          color: "var(--text-primary)",
          letterSpacing: "-0.04em",
          lineHeight: 1,
          fontVariantNumeric: "tabular-nums",
        }}>
          {value}
        </div>
        {sub && (
          <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 5 }}>
            {sub}
          </div>
        )}
      </div>

      {trend && (
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          paddingTop: 12,
          borderTop: "1px solid var(--border)",
        }}>
          {trend.up
            ? <TrendingUp size={12} color="var(--green)" strokeWidth={2} />
            : <TrendingDown size={12} color="var(--red)" strokeWidth={2} />
          }
          <span style={{ fontSize: 11, color: trend.up ? "var(--green)" : "var(--red)", fontWeight: 600 }}>
            {trend.value}
          </span>
          <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>vs last month</span>
        </div>
      )}
    </div>
  )
}
