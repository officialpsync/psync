interface MacroCardProps {
  label: string
  value: number
  unit: string
  target: number
  color: string      // kept for API compatibility; tone below is derived from label
  colorDim: string
}

const TONE: Record<string, string> = {
  Calories: "amber",
  Protein: "blue",
  Carbs: "green",
  Fat: "purple",
}

export default function MacroCard({ label, value, unit, target }: MacroCardProps) {
  const pct = target > 0 ? Math.round((value / target) * 100) : 0
  const clampedPct = Math.min(pct, 100)

  const band = (() => {
    if (label === "Fat") {
      if (pct > 130) return "over"
      if (pct < 80) return "under"
      return "ok"
    }
    if (label === "Protein") {
      if (pct < 85) return "under"
      return "ok"
    }
    if (pct > 110) return "over"
    if (pct < 90) return "under"
    return "ok"
  })()

  const tone = TONE[label] ?? "blue"
  const pillClass = band === "over" ? "db-pill--red" : band === "under" ? "db-pill--amber" : `db-pill--${tone === "amber" ? "amber" : tone === "purple" ? "purple" : tone === "green" ? "green" : "blue"}`

  return (
    <div className={`db-card db-macro db-tone-${tone}`}>
      <div className="db-macro-head">
        <span className="db-macro-label">{label}</span>
        <span className={`db-pill ${pillClass}`}>{pct}%</span>
      </div>
      <div className="db-macro-value">
        {Math.round(value)}
        <span className="db-macro-unit">{unit}</span>
      </div>
      <div className="db-macro-target">Target {target}{unit}</div>
      <div className="db-progress" style={{ marginTop: 10 }}>
        <span style={{ transform: `scaleX(${clampedPct / 100})`, background: band === "over" ? "var(--red-fill)" : band === "under" ? "var(--amber-fill)" : "var(--t-grad)" }} />
      </div>
    </div>
  )
}
