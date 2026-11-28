import React, { useState } from 'react'
import { money, dateLabel } from './core'
import { EmptyState } from './ui'
import './business-panels.css'

export function CashChart({ forecast, large = false }) {
  const [scenario, setScenario] = useState('base_cents'),
    [selected, setSelected] = useState(0)
  const rows = forecast.map((x) => ({ ...x, value: x[scenario] })),
    max = Math.max(...rows.map((x) => x.value), 1),
    min = Math.min(...rows.map((x) => x.value), max * 0.8),
    range = max - min || 1
  const points = rows.map((x, i) => [
    25 + (i * 650) / Math.max(1, rows.length - 1),
    120 - ((x.value - min) / range) * 90,
  ])
  const picked = rows[Math.min(selected, rows.length - 1)]
  return (
    <div className={'cash-chart ' + (large ? 'large' : '')}>
      <div className="chart-heading">
        <div>
          <span className="eyebrow">Горизонт · 6 месяцев</span>
          <h3>Денежная позиция</h3>
        </div>
        <select
          value={scenario}
          aria-label="Сценарий прогноза"
          onChange={(e) => setScenario(e.target.value)}
        >
          <option value="base_cents">Базовый сценарий</option>
          <option value="negative_cents">Негативный</option>
          <option value="optimistic_cents">Оптимистичный</option>
        </select>
      </div>
      {rows.length ? (
        <>
          <div className="chart-focus">
            <strong>{money(picked?.value)}</strong>
            <small>{dateLabel(picked?.date)}</small>
          </div>
          <svg viewBox="0 0 700 155" role="img" aria-label="Прогноз денежных средств">
            <defs>
              <linearGradient id="cashFill" x2="0" y2="1">
                <stop stopColor="var(--org-accent)" stopOpacity=".3" />
                <stop offset="1" stopColor="var(--org-accent)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[30, 75, 120].map((y) => (
              <line key={y} x1="25" x2="675" y1={y} y2={y} stroke="#504942" strokeDasharray="3 5" />
            ))}
            <polygon
              points={'25,145 ' + points.map((x) => x.join(',')).join(' ') + ' 675,145'}
              fill="url(#cashFill)"
            />
            <polyline
              points={points.map((x) => x.join(',')).join(' ')}
              fill="none"
              stroke="var(--org-accent)"
              strokeWidth="2.5"
            />
            {points.map(([x, y], i) => (
              <g key={i}>
                <circle cx={x} cy={y} r={selected === i ? 5 : 3} fill="var(--org-accent)" />
                <circle
                  cx={x}
                  cy={y}
                  r="16"
                  fill="transparent"
                  tabIndex={0}
                  role="button"
                  aria-label={dateLabel(rows[i].date) + ': ' + money(rows[i].value)}
                  onClick={() => setSelected(i)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setSelected(i)
                    }
                  }}
                  onFocus={() => setSelected(i)}
                  onMouseEnter={() => setSelected(i)}
                />
              </g>
            ))}
          </svg>
          <div className="chart-months">
            {rows.map((x, i) => (
              <button
                key={x.date}
                className={i === selected ? 'active' : ''}
                onClick={() => setSelected(i)}
              >
                {new Date(x.date).toLocaleDateString('ru', { month: 'short' })}
              </button>
            ))}
          </div>
        </>
      ) : (
        <EmptyState
          title="Прогноз не раскрыт"
          description="Для выбранного счёта нет опубликованного прогноза."
        />
      )}
    </div>
  )
}
