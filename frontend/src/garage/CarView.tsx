import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { areaNames, clamp, geometry, type Catalog, type Decal, type Livery } from './model'
import { floorPass, measureStudio, concreteResponse, illuminate } from './studio'
import { compose, loadMarks, material } from './render'

type Props = {
  model: string
  regulation: string
  installed: Record<string, string>
  livery: Livery
  catalog: Catalog
  selected?: Decal
  onMove?: (x: number, y: number) => void
  label: string
  highlight?: boolean
}
export function CarView({
  model,
  regulation,
  installed,
  livery,
  catalog,
  selected,
  onMove,
  label,
  highlight,
}: Props) {
  const ref = useRef<HTMLCanvasElement>(null)
  const floor = useRef<HTMLCanvasElement>(null)
  const [status, setStatus] = useState('loading'),
    [attempt, retry] = useState(0)
  const [adjusted, setAdjusted] = useState(false)
  const g = geometry[model]
  useEffect(() => {
    let active = true
    let resize: ResizeObserver | undefined
    Promise.all([
      material({ model, regulation, installed }),
      loadMarks(livery, catalog),
      concreteResponse(),
    ])
      .then(([src, marks, concrete]) => {
        if (!active || !ref.current) return
        const car = ref.current,
          ground = floor.current!,
          stage = car.closest<HTMLElement>('.studio-stage, .large-car')!
        const draw = () => {
          const rig = measureStudio(stage, car)
          setAdjusted(compose(car, src, model, livery, catalog, marks))
          illuminate(car, src, geometry[model].contacts, rig.lights)
          floorPass(ground, car, geometry[model].contacts, rig, src, concrete)
        }
        draw()
        let width = stage.clientWidth,
          height = stage.clientHeight
        resize = new ResizeObserver(() => {
          if (width === stage.clientWidth && height === stage.clientHeight) return
          width = stage.clientWidth
          height = stage.clientHeight
          draw()
        })
        resize.observe(stage)
        setStatus('ready')
      })
      .catch(() => {
        if (active) setStatus('error')
      })
    return () => {
      active = false
      resize?.disconnect()
    }
  }, [model, regulation, installed, livery, catalog, attempt])
  function move(e: PointerEvent<HTMLCanvasElement>) {
    if (!onMove || !selected || !e.currentTarget.hasPointerCapture(e.pointerId)) return
    const r = e.currentTarget.getBoundingClientRect(),
      [x, y, w, h] = g.zones[selected.zone]
    onMove(clamp(((e.clientX - r.left) / r.width - x) / w), clamp(((e.clientY - r.top) / r.height - y) / h))
  }
  const zone = selected && highlight ? g.zones[selected.zone] : undefined
  return (
    <div className="car-stand" data-state={status}>
      <div
        className="car-cutout"
        style={{
          width: `min(${(g.length / 5.65) * 93}cqw, ${(g.size[0] / g.size[1]) * 94}cqh)`,
          aspectRatio: g.size.join(' / '),
        }}
      >
        <canvas className="garage-floor" aria-hidden="true" ref={floor} />
        <canvas
          className="garage-body"
          aria-label={label}
          role="img"
          ref={ref}
          width={g.size[0]}
          height={g.size[1]}
          style={{ touchAction: onMove ? 'none' : 'pan-y', cursor: onMove ? 'crosshair' : undefined }}
          onPointerDown={(e) => {
            if (onMove && selected) {
              e.currentTarget.setPointerCapture(e.pointerId)
              move(e)
            }
          }}
          onPointerMove={move}
          onPointerUp={(e) => {
            if (e.currentTarget.hasPointerCapture(e.pointerId))
              e.currentTarget.releasePointerCapture(e.pointerId)
          }}
        />
        {zone && (
          <span
            className="decal-region"
            aria-label={areaNames[selected!.zone]}
            style={{
              left: zone[0] * 100 + '%',
              top: zone[1] * 100 + '%',
              width: zone[2] * 100 + '%',
              height: zone[3] * 100 + '%',
            }}
          />
        )}
      </div>
      {status === 'loading' && (
        <span className="car-message" role="status">
          Загрузка модели…
        </span>
      )}
      {highlight && adjusted && (
        <small className="decal-note" role="status">
          Знак привязан к ближайшей окрашиваемой точке панели.
        </small>
      )}
      {status === 'error' && (
        <button
          className="btn car-message"
          onClick={() => {
            setStatus('loading')
            retry(attempt + 1)
          }}
        >
          Модель недоступна · Повторить
        </button>
      )}
    </div>
  )
}
