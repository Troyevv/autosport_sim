import { useEffect, useMemo, useRef, useState, type ReactNode, type PointerEvent } from 'react'
import { areaNames, clamp, geometry, type Catalog, type Decal, type Livery } from './model'
import { floorPass, parkCar, workshop, concreteResponse, illuminate } from './studio'
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
  wall?: ReactNode
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
  wall,
  highlight,
}: Props) {
  const ref = useRef<HTMLCanvasElement>(null)
  const floor = useRef<HTMLCanvasElement>(null)
  const [status, setStatus] = useState('loading'),
    [attempt, retry] = useState(0)
  const [adjusted, setAdjusted] = useState(false)
  const g = geometry[model]
  const parking = useMemo(() => parkCar(g), [g])
  useEffect(() => {
    let active = true
    Promise.all([
      material({ model, regulation, installed }),
      loadMarks(livery, catalog),
      concreteResponse(),
    ])
      .then(([src, marks, concrete]) => {
        if (!active || !ref.current) return
        const car = ref.current
        setAdjusted(compose(car, src, model, livery, catalog, marks))
        illuminate(car, src, g.contacts, parking.lights)
        floorPass(floor.current!, car, g.contacts, parking, src, concrete)
        setStatus('ready')
      })
      .catch(() => {
        if (active) setStatus('error')
      })
    return () => {
      active = false
    }
  }, [g, parking, model, regulation, installed, livery, catalog, attempt])
  function move(e: PointerEvent<HTMLCanvasElement>) {
    if (!onMove || !selected || !e.currentTarget.hasPointerCapture(e.pointerId)) return
    const r = e.currentTarget.getBoundingClientRect(),
      [x, y, w, h] = g.zones[selected.zone]
    onMove(clamp(((e.clientX - r.left) / r.width - x) / w), clamp(((e.clientY - r.top) / r.height - y) / h))
  }
  const zone = selected && highlight ? g.zones[selected.zone] : undefined
  return (
    <div className="car-stand" data-state={status} data-geometry={model}>
      <div className="workshop-plate">
        {wall}
        <div
          className="car-cutout"
          style={{
            width: (parking.width / workshop.width) * 100 + '%',
            left: (parking.left / workshop.width) * 100 + '%',
            top: (parking.top / workshop.height) * 100 + '%',
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
