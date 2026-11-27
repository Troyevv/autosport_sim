import React from 'react'
import { useGame } from '../core'
import { CarView } from '../../garage/CarView'
import { geometry } from '../../garage/model'
import { GarageWall } from '../../garage/GarageWall'
import { Portrait } from '../../career/Portrait'
/**
 * @param {{entryId?:string,entry?:string|{id:string},studio?:boolean,className?:string} &
 * Partial<Pick<import('react').ComponentProps<typeof CarView>,'livery'|'selected'|'onMove'|'highlight'|'installed'>>} props
 */
export function RaceCar({
  entryId,
  entry,
  livery,
  studio = true,
  selected,
  onMove,
  highlight = false,
  installed: installedOverride,
  className = '',
}) {
  const g = useGame()
  const id =
    entryId ||
    (typeof entry === 'string' ? entry : entry?.id) ||
    g.selectedEntry ||
    Object.values(g.world.entries).find(
      (e) => e.org === g.game.career.org && e.championship === g.game.career.series,
    )?.id
  const e = g.world.entries[id],
    catalog = g.game.garageCatalog || g.game.projections?.garage || g.data.catalog
  if (!e || !catalog?.entries?.[id])
    return <div className="car-unavailable">Выберите автомобиль с доступной визуальной моделью.</div>
  const car = g.world.cars[e.car],
    preset = catalog.entries[id],
    cfg = g.game.career.garage_configurations?.[e.car]
  const model = cfg?.geometry && geometry[cfg.geometry] ? cfg.geometry : preset.geometry
  const colors = livery || g.game.career.liveries?.[id] || preset.livery
  return (
    <div className={'studio-stage ' + (!studio ? 'transparent-stage ' : '') + className}>
      {studio && ['garage', 'livery'].includes(g.route) && (
        <GarageWall org={g.world.organizations[e.org]} media={g.data.media} />
      )}
      <CarView
        model={model}
        regulation={cfg?.regulation || car.regulation}
        installed={installedOverride || cfg?.installed || {}}
        livery={colors}
        catalog={catalog}
        selected={selected}
        onMove={onMove}
        highlight={highlight}
        label={car.name + ' · ' + g.world.organizations[e.org].name + ' · №' + e.number}
      />
    </div>
  )
}
export function PersonPortrait({ person, id, size, role, className = '' }) {
  const g = useGame(),
    p = person || g.game.personnel.find((x) => x.id === id)
  if (!p) return <span className="portrait-missing">?</span>
  const current = g.game.personnelById?.get(p.id) || p
  const org = current.org ?? null
  const o = g.world.organizations[org]
  return (
    <span
      className={'person-portrait ' + className}
      style={size ? { width: size, height: size * 1.2 } : undefined}
    >
      <Portrait
        person={p}
        org={org}
        color={o?.color || '#6b7981'}
        driver={(current.position || role) === 'driver'}
        organization={o}
        media={g.data.media || []}
        showShoulders
      />
    </span>
  )
}
