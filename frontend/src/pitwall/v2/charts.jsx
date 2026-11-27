import React, { useEffect, useId, useMemo, useState } from 'react'
import { Icon } from '../ui'
import './charts.css'

const COLORS = ['#dd9e71', '#9cb6d1', '#e1c66f', '#b89cbf', '#d2786c']
const number = (v) => typeof v === 'number' && Number.isFinite(v)
const precise = (v) =>
  number(v) ? new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 6 }).format(v) : String(v ?? '—')
const short = (v) =>
  number(v)
    ? new Intl.NumberFormat('ru-RU', {
        maximumFractionDigits: 2,
        notation: Math.abs(v) >= 100000 ? 'compact' : 'standard',
      }).format(v)
    : String(v ?? '—')
const clean = (rows) => (Array.isArray(rows) ? rows : []).filter(Boolean)

/** An accessible, dependency-free view of source rows, never a data generator.
 * rows: {label,value,low?,high?}; series: {key,label,color}; Gantt {label,start,end}.
 * All units, provenance, estimation status and comparison caveats belong to callers.
 */
export function DataChart({
  type,
  kind,
  rows: inputRows,
  data,
  title,
  description,
  unit = '',
  source = '',
  note,
  series: inputSeries,
  xLabel = '',
  yLabel = '',
  height = 250,
  onSelect,
  selected,
  formatValue = precise,
  formatAxisValue = short,
  className = '',
  emptyMessage = 'Для этого сравнения ещё нет наблюдений.',
  onSource,
}) {
  const chartType = type || kind || 'line',
    rows = clean(inputRows || data),
    uid = useId().replace(/:/g, '')
  const [compact, setCompact] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width:650px)').matches,
  )
  useEffect(() => {
    const q = window.matchMedia('(max-width:650px)'),
      update = () => setCompact(q.matches)
    update()
    q.addEventListener('change', update)
    return () => q.removeEventListener('change', update)
  }, [])
  const series = useMemo(
    () =>
      inputSeries?.length
        ? inputSeries.map((s, i) => ({ ...s, color: s.color || COLORS[i % COLORS.length] }))
        : [{ key: 'value', label: 'Значение', color: COLORS[0] }],
    [inputSeries, unit],
  )
  const [hidden, setHidden] = useState([]),
    [focus, setFocus] = useState(null),
    [table, setTable] = useState(false)
  const active = series.filter((s) => !hidden.includes(s.key))
  const picked =
    focus !== null && rows[focus] ? focus : selected != null && rows[selected] ? selected : null
  const f = (v) => (number(v) ? formatValue(v) : String(v ?? '—'))
  const axisF = (v) => (number(v) ? formatAxisValue(v) : String(v ?? '—'))
  const select = (i, commit = false) => {
    setFocus(i)
    if (commit) onSelect?.(rows[i], i)
  }
  const controls = (e) => {
    if (!rows.length) return
    let n = picked ?? -1
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') n = (n + 1) % rows.length
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') n = (n - 1 + rows.length) % rows.length
    else if (e.key === 'Home') n = 0
    else if (e.key === 'End') n = rows.length - 1
    else if (e.key === 'Escape') {
      setFocus(null)
      return
    } else if ((e.key === 'Enter' || e.key === ' ') && n >= 0) {
      e.preventDefault()
      onSelect?.(rows[n], n)
      return
    } else return
    e.preventDefault()
    select(n)
  }
  const gantt = chartType === 'gantt',
    horizontal = chartType === 'comparison',
    scatter = chartType === 'scatter'
  const dateAxis = gantt && rows.some((r) => typeof r.start === 'string' && /\d{4}-\d{2}/.test(r.start))
  const time = (v) => (dateAxis ? Date.parse(v) : Number(v))
  const crossYear =
    dateAxis &&
    new Set(
      rows
        .flatMap((r) => [r.start, r.end])
        .filter((v) => typeof v === 'string')
        .map((v) => v.slice(0, 4)),
    ).size > 1
  const timeLabel = (v, detail = false) =>
    dateAxis
      ? new Date(v).toLocaleDateString('ru-RU', {
          day: 'numeric',
          month: 'short',
          ...(detail || crossYear ? { year: 'numeric' } : {}),
        })
      : f(v)
  const W = compact ? (gantt ? 640 : 420) : 760,
    H = Math.max(190, Number(height) || 250),
    P = {
      l: horizontal ? (compact ? 190 : 168) : gantt ? (compact ? 190 : 168) : compact ? 46 : 62,
      r: compact ? 14 : 20,
      t: 18,
      b: 42,
    }
  const innerW = W - P.l - P.r,
    innerH = H - P.t - P.b
  const values = rows.flatMap((r) => active.flatMap((s) => [r[s.key], r.low, r.high].filter(number)))
  let min = Math.min(...values, 0),
    max = values.length ? Math.max(...values, 0) : 1
  if (chartType === 'line' || chartType === 'band' || scatter) {
    min = values.length ? Math.min(...values) : 0
    max = values.length ? Math.max(...values) : 1
    const pad = (max - min || Math.abs(max) * 0.1 || 1) * 0.12
    min -= pad
    max += pad
  }
  if (max === min) max = min + 1
  const x = (i) => P.l + (rows.length <= 1 ? innerW / 2 : (i / (rows.length - 1)) * innerW),
    y = (v) => P.t + innerH - ((v - min) / (max - min)) * innerH
  const barX = (v) => P.l + ((v - min) / (max - min)) * innerW
  const ticks = Array.from({ length: 5 }, (_, i) => min + ((max - min) * i) / 4)
  const rowLabel = (r, i) => String(r.label ?? r.name ?? i + 1)
  const readable = (r, i) =>
    rowLabel(r, i) +
    ': ' +
    (gantt
      ? timeLabel(time(r.start), true) + ' — ' + timeLabel(time(r.end), true)
      : active.map((s) => s.label + ' ' + f(r[s.key]) + (unit ? ' ' + unit : '')).join('; ')) +
    (number(r.low) && number(r.high) ? '; диапазон ' + f(r.low) + '–' + f(r.high) : '')
  const xValues = rows.map((r, i) => (number(r.x) ? r.x : i)),
    xMin = Math.min(...xValues, 0),
    xMax = Math.max(...xValues, 1),
    sx = (v) => P.l + ((v - xMin) / (xMax - xMin || 1)) * innerW
  const tickEvery = Math.max(1, Math.ceil(rows.length / (compact ? 4 : 6)))
  const bands = rows.some((r) => number(r.low) && number(r.high))
  const bandRows = rows.map((r, i) => ({ r, i })).filter(({ r }) => number(r.low) && number(r.high))
  const tt = rows[picked]
  const range = rows
      .map((r) => [time(r.start), time(r.end)])
      .flat()
      .filter(Number.isFinite),
    gmin = Math.min(...range, 0),
    gStart = range.length ? Math.min(...range) : 0,
    gEnd = range.length ? Math.max(...range) : 1,
    gx = (v) => P.l + ((v - gStart) / (gEnd - gStart || 1)) * innerW
  const accessibleTitle = title || 'График'
  return (
    <section className={'pw-chart ' + className} aria-label={accessibleTitle}>
      <header className="pw-chart-heading">
        <div>
          {title && <h3>{title}</h3>}
          {description && <p>{description}</p>}
        </div>
        <button
          className="pw-chart-view"
          type="button"
          aria-pressed={table}
          onClick={() => setTable(!table)}
        >
          <Icon name={table ? 'ChartNoAxesCombined' : 'Table2'} size={15} />
          {table ? 'График' : 'Данные'}
        </button>
      </header>
      {active.length > 0 && series.length > 1 && (
        <div className="pw-chart-legend" aria-label="Ряды графика">
          {series.map((s) => (
            <button
              type="button"
              key={s.key}
              aria-pressed={!hidden.includes(s.key)}
              onClick={() =>
                setHidden(
                  hidden.includes(s.key)
                    ? hidden.filter((k) => k !== s.key)
                    : active.length > 1
                      ? [...hidden, s.key]
                      : hidden,
                )
              }
              style={{ '--series-color': s.color }}
            >
              <i />
              {s.label}
              {hidden.includes(s.key) && <span className="pw-sr-only"> · скрыт</span>}
            </button>
          ))}
        </div>
      )}
      {!rows.length ? (
        <div className="pw-chart-empty">
          <Icon name="ChartNoAxesCombined" size={28} />
          <strong>Нет исходных наблюдений</strong>
          <p>{emptyMessage}</p>
        </div>
      ) : table ? (
        <div className="pw-chart-table" tabIndex="0" aria-label="Исходные значения графика">
          <table>
            <caption>
              {accessibleTitle}
              {unit ? ' · ' + unit : ''}
            </caption>
            <thead>
              <tr>
                <th scope="col">{xLabel || 'Наблюдение'}</th>
                {gantt ? (
                  <>
                    <th scope="col">Начало</th>
                    <th scope="col">Окончание</th>
                  </>
                ) : (
                  <>
                    {active.map((s) => (
                      <th scope="col" key={s.key}>
                        {s.label}
                        {unit ? ' · ' + unit : ''}
                      </th>
                    ))}
                    {bands && (
                      <>
                        <th scope="col">Нижняя граница</th>
                        <th scope="col">Верхняя граница</th>
                      </>
                    )}
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id || i}>
                  <th scope="row">
                    {onSelect ? (
                      <button type="button" onClick={() => select(i, true)}>
                        {rowLabel(r, i)}
                      </button>
                    ) : (
                      rowLabel(r, i)
                    )}
                  </th>
                  {gantt ? (
                    <>
                      <td>{timeLabel(time(r.start), true)}</td>
                      <td>{timeLabel(time(r.end), true)}</td>
                    </>
                  ) : (
                    <>
                      {active.map((s) => (
                        <td key={s.key}>{f(r[s.key])}</td>
                      ))}
                      {bands && (
                        <>
                          <td>{f(r.low)}</td>
                          <td>{f(r.high)}</td>
                        </>
                      )}
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <div className={'pw-chart-canvas ' + (gantt ? 'pw-chart-wide' : '')}>
            <div className="pw-chart-unit">
              {yLabel || unit || 'Значение'}
              {yLabel && unit ? ' · ' + unit : ''}
            </div>
            <svg
              viewBox={`0 0 ${W} ${H}`}
              role="group"
              aria-labelledby={`${uid}-title ${uid}-desc`}
              tabIndex="0"
              onKeyDown={controls}
            >
              <title id={`${uid}-title`}>{accessibleTitle}</title>
              <desc id={`${uid}-desc`}>
                {description || ''} {rows.length} наблюдений. Используйте стрелки для выбора, Enter для
                перехода. Исходные значения доступны кнопкой «Данные».
              </desc>
              {gantt ? (
                <>
                  {Array.from({ length: 5 }, (_, i) => gStart + ((gEnd - gStart) * i) / 4).map(
                    (v, i) => (
                      <g key={i}>
                        <line x1={gx(v)} x2={gx(v)} y1={P.t} y2={H - P.b} className="pw-chart-grid" />
                        <text
                          x={gx(v)}
                          y={H - 16}
                          textAnchor={i === 4 ? 'end' : i === 0 ? 'start' : 'middle'}
                        >
                          {timeLabel(v)}
                        </text>
                      </g>
                    ),
                  )}
                  {rows.map((r, i) => {
                    const gap = innerH / rows.length,
                      cy = P.t + gap * (i + 0.5)
                    return (
                      <g
                        key={r.id || i}
                        className="pw-chart-mark"
                        tabIndex="0"
                        role="button"
                        aria-label={readable(r, i)}
                        onFocus={() => select(i)}
                        onPointerEnter={() => select(i)}
                        onClick={() => select(i, true)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            select(i, true)
                          }
                        }}
                      >
                        <text x={P.l - 12} y={cy + 4} textAnchor="end">
                          {rowLabel(r, i).length > 23
                            ? rowLabel(r, i).slice(0, 21) + '…'
                            : rowLabel(r, i)}
                        </text>
                        <rect
                          x={P.l}
                          y={cy - 15}
                          width={innerW}
                          height={30}
                          fill={picked === i ? '#ffffff0c' : 'transparent'}
                        />
                        <rect
                          x={gx(time(r.start))}
                          y={cy - 8}
                          width={Math.max(4, gx(time(r.end)) - gx(time(r.start)))}
                          height={16}
                          rx={3}
                          fill={r.color || COLORS[i % COLORS.length]}
                          opacity={picked === null || picked === i ? 1 : 0.6}
                        />
                        {r.progress != null && (
                          <rect
                            x={gx(time(r.start))}
                            y={cy - 8}
                            width={Math.max(
                              0,
                              ((gx(time(r.end)) - gx(time(r.start))) *
                                Math.max(0, Math.min(100, r.progress))) /
                                100,
                            )}
                            height={16}
                            rx={3}
                            fill="#ffffff60"
                          />
                        )}
                      </g>
                    )
                  })}
                </>
              ) : horizontal ? (
                <>
                  {ticks.map((v, i) => (
                    <g key={i}>
                      <line x1={barX(v)} x2={barX(v)} y1={P.t} y2={H - P.b} className="pw-chart-grid" />
                      <text x={barX(v)} y={H - 17} textAnchor="middle">
                        {axisF(v)}
                      </text>
                    </g>
                  ))}
                  {rows.map((r, i) => {
                    const gap = innerH / rows.length,
                      bh = Math.min(15, (gap - 8) / active.length),
                      cy = P.t + gap * (i + 0.5)
                    return (
                      <g
                        key={r.id || i}
                        role="button"
                        tabIndex="0"
                        className="pw-chart-mark"
                        aria-label={readable(r, i)}
                        onFocus={() => select(i)}
                        onPointerEnter={() => select(i)}
                        onClick={() => select(i, true)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            select(i, true)
                          }
                        }}
                      >
                        <text x={P.l - 12} y={cy + 4} textAnchor="end">
                          {rowLabel(r, i).length > 23
                            ? rowLabel(r, i).slice(0, 21) + '…'
                            : rowLabel(r, i)}
                        </text>
                        <rect
                          x={P.l}
                          y={P.t + gap * i}
                          width={innerW}
                          height={gap}
                          fill={picked === i ? '#ffffff08' : 'transparent'}
                        />
                        {active.map(
                          (s, j) =>
                            number(r[s.key]) && (
                              <rect
                                key={s.key}
                                x={Math.min(barX(0), barX(r[s.key]))}
                                y={cy - (bh * active.length) / 2 + j * bh}
                                width={Math.max(2, Math.abs(barX(r[s.key]) - barX(0)))}
                                height={Math.max(3, bh - 2)}
                                rx={2}
                                fill={s.color}
                                opacity={picked === null || picked === i ? 1 : 0.5}
                              />
                            ),
                        )}
                      </g>
                    )
                  })}
                </>
              ) : (
                <>
                  {ticks.map((v, i) => (
                    <g key={i}>
                      <line x1={P.l} x2={W - P.r} y1={y(v)} y2={y(v)} className="pw-chart-grid" />
                      <text x={P.l - 10} y={y(v) + 4} textAnchor="end">
                        {axisF(v)}
                      </text>
                    </g>
                  ))}
                  {bands && (chartType === 'line' || chartType === 'band') && (
                    <polygon
                      points={[
                        ...bandRows.map(({ r, i }) => `${x(i)},${y(r.high)}`),
                        ...bandRows
                          .slice()
                          .reverse()
                          .map(({ r, i }) => `${x(i)},${y(r.low)}`),
                      ].join(' ')}
                      fill={active[0]?.color || COLORS[0]}
                      opacity=".15"
                    />
                  )}
                  {(chartType === 'line' || chartType === 'band') &&
                    active.map((s) => (
                      <polyline
                        key={s.key}
                        points={rows
                          .map((r, i) => (number(r[s.key]) ? `${x(i)},${y(r[s.key])}` : null))
                          .filter(Boolean)
                          .join(' ')}
                        fill="none"
                        stroke={s.color}
                        strokeWidth="2.7"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                      />
                    ))}
                  {rows.map((r, i) => {
                    const xx = scatter
                        ? sx(xValues[i])
                        : chartType === 'bar'
                          ? P.l + ((i + 0.5) * innerW) / rows.length
                          : x(i),
                      bw = (innerW / Math.max(rows.length, 1)) * 0.68
                    return (
                      <g
                        key={r.id || i}
                        className="pw-chart-mark"
                        role="button"
                        tabIndex="0"
                        aria-label={readable(r, i)}
                        onFocus={() => select(i)}
                        onPointerEnter={() => select(i)}
                        onClick={() => select(i, true)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            select(i, true)
                          }
                        }}
                      >
                        {picked === i && (
                          <line x1={xx} x2={xx} y1={P.t} y2={H - P.b} className="pw-chart-cursor" />
                        )}
                        {chartType === 'bar'
                          ? active.map(
                              (s, j) =>
                                number(r[s.key]) && (
                                  <rect
                                    key={s.key}
                                    x={
                                      P.l +
                                      ((i + 0.5) * innerW) / rows.length -
                                      bw / 2 +
                                      (j * bw) / active.length
                                    }
                                    y={Math.min(y(0), y(r[s.key]))}
                                    width={Math.max(2, bw / active.length - 3)}
                                    height={Math.max(2, Math.abs(y(r[s.key]) - y(0)))}
                                    rx="2"
                                    fill={s.color}
                                    opacity={picked === null || picked === i ? 1 : 0.55}
                                  />
                                ),
                            )
                          : active.map(
                              (s) =>
                                number(r[s.key]) && (
                                  <circle
                                    key={s.key}
                                    cx={xx}
                                    cy={y(r[s.key])}
                                    r={picked === i ? 5.5 : 3}
                                    fill={s.color}
                                    stroke={picked === i ? '#fff' : 'none'}
                                    strokeWidth="1.5"
                                  />
                                ),
                            )}
                        <rect
                          x={
                            chartType === 'bar'
                              ? P.l + (i * innerW) / rows.length
                              : Math.max(
                                  P.l - 8,
                                  xx - Math.max(24, innerW / Math.max(1, rows.length)) / 2,
                                )
                          }
                          y={P.t}
                          width={
                            chartType === 'bar'
                              ? innerW / rows.length
                              : Math.max(24, innerW / Math.max(1, rows.length))
                          }
                          height={innerH}
                          fill="transparent"
                        />
                        {(i % tickEvery === 0 || i === rows.length - 1) && (
                          <text
                            x={chartType === 'bar' ? P.l + ((i + 0.5) * innerW) / rows.length : xx}
                            y={H - 16}
                            textAnchor="middle"
                          >
                            {rowLabel(r, i).length > (compact ? 10 : 13)
                              ? rowLabel(r, i).slice(0, compact ? 9 : 12) + '…'
                              : rowLabel(r, i)}
                          </text>
                        )}
                      </g>
                    )
                  })}
                </>
              )}
            </svg>
            {xLabel && <span className="pw-chart-xlabel">{xLabel}</span>}
          </div>
          <div className="pw-chart-stepper">
            <button
              type="button"
              aria-label="Предыдущее наблюдение"
              onClick={() => select(((picked ?? 0) - 1 + rows.length) % rows.length)}
            >
              <Icon name="ChevronLeft" size={18} />
            </button>
            <span>{picked === null ? 'Выберите наблюдение' : `${picked + 1} / ${rows.length}`}</span>
            <button
              type="button"
              aria-label="Следующее наблюдение"
              onClick={() => select(((picked ?? -1) + 1) % rows.length)}
            >
              <Icon name="ChevronRight" size={18} />
            </button>
          </div>
          <div
            className={'pw-chart-readout ' + (tt ? 'has-pick' : '')}
            aria-live="polite"
            aria-atomic="true"
          >
            {tt ? (
              <>
                <strong>{rowLabel(tt, picked)}</strong>
                {gantt ? (
                  <span>
                    {timeLabel(time(tt.start), true)} — {timeLabel(time(tt.end), true)}
                    {tt.progress != null ? ' · ' + tt.progress + '% выполнено' : ''}
                  </span>
                ) : (
                  active.map((s) => (
                    <span key={s.key}>
                      <i style={{ background: s.color }} />
                      {s.label}: <b>{f(tt[s.key])}</b>
                      {unit ? ' ' + unit : ''}
                    </span>
                  ))
                )}
                {number(tt.low) && number(tt.high) && (
                  <span>
                    Диапазон: {f(tt.low)}–{f(tt.high)} {unit}
                  </span>
                )}
                {onSelect && (
                  <button type="button" onClick={() => onSelect(tt, picked)}>
                    К источнику <Icon name="ArrowUpRight" size={13} />
                  </button>
                )}
              </>
            ) : (
              <span>
                <Icon name="MousePointer2" size={13} /> Выберите точку касанием, курсором или стрелками
              </span>
            )}
          </div>
        </>
      )}
      {(source || note) && (
        <footer className="pw-chart-provenance">
          {source && (
            <span>
              <Icon name="Database" size={12} />
              {onSource ? (
                <button type="button" onClick={onSource}>
                  {source}
                </button>
              ) : (
                source
              )}
            </span>
          )}
          {note && <p>{note}</p>}
        </footer>
      )}
    </section>
  )
}
export default DataChart
