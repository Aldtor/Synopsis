// Hand-rolled SVG charts — no chart dependency, green liquid-glass theme.
// All text uses the existing high-contrast tokens: near-white #F2F7F3 and
// sage #C2D6C9 on the dark glass panels. Bars use the emerald family only
// (#059669, #10B981, #34D399, #6EE7B7, #A7F3D0); absent uses the existing
// semantic red #F87171, never blue/purple.
import React from 'react'

const EMERALDS = ['#34D399', '#10B981', '#6EE7B7', '#059669', '#A7F3D0']

export function BarChart({ title, subtitle, data, valueLabel }) {
  const max = Math.max(1, ...data.map((d) => d.count))
  const W = 560
  const H = 220
  const top = 18
  const bottom = 34
  const barH = (H - top - bottom) / Math.max(1, data.length)
  return (
    <div className="chart-card card">
      <h3>{title}</h3>
      {subtitle && <p className="muted small">{subtitle}</p>}
      {data.length === 0 || data.every((d) => d.count === 0) ? (
        <div className="empty-state"><p>No data yet.</p></div>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title} className="chart-svg">
          {data.map((d, i) => {
            const y = top + i * barH
            const w = (d.count / max) * (W - 170)
            return (
              <g key={d.code || d.department}>
                <text x="0" y={y + barH / 2 + 4} fill="#C2D6C9" fontSize="12">{d.code || d.department}</text>
                <rect x="70" y={y + 4} width={Math.max(w, d.count > 0 ? 4 : 0)} height={Math.max(barH - 10, 6)} rx="5" fill={EMERALDS[i % EMERALDS.length]} />
                <text x={76 + w} y={y + barH / 2 + 4} fill="#F2F7F3" fontSize="12" fontWeight="700">{d.count}</text>
              </g>
            )
          })}
        </svg>
      )}
      {valueLabel && <p className="muted small">{valueLabel}</p>}
    </div>
  )
}

export function AttendanceTrendChart({ data }) {
  const max = Math.max(1, ...data.map((d) => Math.max(d.present, d.absent)))
  const W = 560
  const H = 240
  const top = 22
  const bottom = 36
  const left = 30
  const plotW = W - left - 10
  const plotH = H - top - bottom
  const step = data.length > 0 ? plotW / data.length : plotW
  const barW = Math.max(4, Math.min(14, step * 0.32))
  return (
    <div className="chart-card card">
      <h3>Attendance trend — last 14 days</h3>
      <p className="muted small">Present (emerald) vs absent (red) per day. Leave / half-day records are not counted in either bar.</p>
      {data.length === 0 ? (
        <div className="empty-state"><p>No attendance data yet.</p></div>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Attendance trend, present versus absent" className="chart-svg">
          {[0, 0.5, 1].map((f) => {
            const y = top + plotH * (1 - f)
            return (
              <g key={f}>
                <line x1={left} x2={W - 10} y1={y} y2={y} stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
                <text x={left - 5} y={y + 4} fill="#C2D6C9" fontSize="11" textAnchor="end">{Math.round(max * f)}</text>
              </g>
            )
          })}
          {data.map((d, i) => {
            const x = left + i * step + step / 2
            const ph = (d.present / max) * plotH
            const ah = (d.absent / max) * plotH
            return (
              <g key={d.date}>
                <rect x={x - barW - 2} y={top + plotH - ph} width={barW} height={ph} rx="3" fill="#34D399" />
                <rect x={x + 2} y={top + plotH - ah} width={barW} height={ah} rx="3" fill="#F87171" />
                <text x={x} y={H - 18} fill="#C2D6C9" fontSize="10" textAnchor="middle">{d.label.slice(0, 6)}</text>
                {d.present > 0 && <text x={x - barW / 2 - 2} y={top + plotH - ph - 4} fill="#F2F7F3" fontSize="10" textAnchor="middle">{d.present}</text>}
              </g>
            )
          })}
        </svg>
      )}
      <p className="chart-legend"><span className="legend-swatch legend-present" /> Present <span className="legend-swatch legend-absent" /> Absent</p>
    </div>
  )
}
