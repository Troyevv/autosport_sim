import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { areaNames, clamp, type Catalog, type Decal } from './model'
import { Button } from '../ui/components'

type Props = {
  allowed: string[]
  catalog: Catalog
  decals: Decal[]
  index: number
  select: (n: number) => void
  change: (decals: Decal[]) => void
}
export function DecalPanel({ allowed, catalog, decals, index, select, change }: Props) {
  const d = decals[index]
  const assets = allowed.map((k) => [k, catalog.sponsors[k]] as const)
  function replace(patch: Partial<Decal>) {
    change(decals.map((v, i) => (i === index ? { ...v, ...patch } : v)))
  }
  function reorder(to: number) {
    const next = [...decals]
    next.splice(to, 0, next.splice(index, 1)[0])
    change(next)
    select(to)
  }
  return (
    <div className="garage-fields">
      <div className="decal-layers" aria-label="Слои декалей">
        {decals.map((v, i) => (
          <button
            key={i}
            aria-pressed={i === index}
            className={i === index ? 'selected' : ''}
            onClick={() => select(i)}
          >
            {i + 1} · {catalog.sponsors[v.asset].name}
          </button>
        ))}
      </div>
      <Button
        disabled={decals.length >= 16}
        onClick={() => {
          change([...decals, { asset: 'relay', zone: 'flank', x: 0.5, y: 0.5, scale: 0.7, angle: 0 }])
          select(decals.length)
        }}
      >
        <Plus size={15} />
        Добавить знак
      </Button>
      {d && (
        <>
          <div className="field-pair">
            <label>
              Знак
              <select
                value={d.asset}
                onChange={(e) => {
                  const rule = catalog.sponsors[e.target.value]
                  replace({
                    asset: e.target.value,
                    zone: rule.zones.includes(d.zone) ? d.zone : rule.zones[0],
                    scale: Math.min(d.scale, rule.maxScale),
                  })
                }}
              >
                {assets.map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Зона
              <select
                value={d.zone}
                onChange={(e) => replace({ zone: e.target.value as Decal['zone'], x: 0.5, y: 0.5 })}
              >
                {catalog.sponsors[d.asset].zones.map((k) => (
                  <option key={k} value={k}>
                    {areaNames[k]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="field-pair">
            {(['x', 'y', 'scale', 'angle'] as const).map((k, i) => {
              const factor = k === 'angle' ? 1 : 100,
                min = k === 'angle' ? -180 : k === 'scale' ? 10 : 0,
                max = k === 'angle' ? 180 : k === 'scale' ? catalog.sponsors[d.asset].maxScale * 100 : 100
              return (
                <label key={k}>
                  {['По горизонтали, %', 'По вертикали, %', 'Размер, %', 'Поворот, °'][i]}
                  <input
                    type="number"
                    min={min}
                    max={max}
                    step={1}
                    value={Math.round(d[k] * factor)}
                    onChange={(e) => {
                      if (Number.isFinite(e.target.valueAsNumber))
                        replace({ [k]: clamp(e.target.valueAsNumber, min, max) / factor })
                    }}
                  />
                </label>
              )
            })}
          </div>
          <p className="garage-hint">Коснитесь выделенной зоны на машине или перетащите знак внутри неё.</p>
          <div className="garage-tools">
            <Button
              aria-label="На слой выше"
              disabled={index === decals.length - 1}
              onClick={() => reorder(index + 1)}
            >
              <ArrowUp size={16} />
            </Button>
            <Button aria-label="На слой ниже" disabled={!index} onClick={() => reorder(index - 1)}>
              <ArrowDown size={16} />
            </Button>
            <Button
              onClick={() => {
                change(decals.filter((_, i) => i !== index))
                select(Math.max(0, index - 1))
              }}
            >
              <Trash2 size={15} />
              Удалить
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
