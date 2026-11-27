import React, { useState } from 'react'
import { useGame } from './core'
import { Button } from './ui'
import { Portrait } from '../career/Portrait'
import { categoryFor, clothingFor, standard, uniformCategories } from '../career/uniform'
import { useOrder } from '../career/finance/useOrder'
import { OrganizationMark } from './v2/identity'

const swatches = { primary: 'Основной', secondary: 'Дополнительный', accent: 'Акцентный' }
const designs = { panels: 'Боковые вставки', chevron: 'Шеврон', shoulders: 'Контрастные плечи' }
const placements = {
  left: 'Левая сторона груди',
  right: 'Правая сторона груди',
  center: 'По центру',
  none: 'Без эмблемы',
}
function Choice({ label, value, options, onChange }) {
  return (
    <label>
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {Object.entries(options).map(([id, text]) => (
          <option key={id} value={id}>
            {text}
          </option>
        ))}
      </select>
    </label>
  )
}
export function UniformEditor({ org }) {
  const g = useGame(),
    c = g.game.career,
    order = useOrder(c, g.updateCareer, 'uniform')
  const [category, choose] = useState(org.kind === 'supplier' ? 'advisor' : 'driver')
  const [view, setView] = useState('portrait'),
    [model, selectModel] = useState('')
  const [draft, edit] = useState(c.organization_uniforms?.[org.id] || {}),
    [mounts, place] = useState({}),
    [saved, inform] = useState('')
  const pattern =
    draft[category] || (category === 'executive' ? draft.engineering : undefined) || standard
  const staff = g.game.personnel.filter((p) => p.org === org.id)
  const subject =
    staff.find((p) => p.id === model) ||
    staff.find((p) => categoryFor(p.position) === category) ||
    staff.find((p) => p.face) ||
    g.game.personnel.find((p) => p.face)
  const rights = (c.clothing_rights || []).filter((r) => r.org === org.id)
  const key = (r) => r.contract + '/' + r.right.zone
  const surface = category === 'driver' ? 'suit' : 'uniform'
  function updatePattern(field, value) {
    edit({ ...draft, [category]: { ...pattern, [field]: value } })
    inform('')
  }
  function placement(r) {
    return (
      mounts[key(r)] || {
        contract: r.contract,
        zone: r.right.zone,
        remove: !r.mount,
        scale: r.mount ? Math.round(r.mount.scale * 100) : r.right.share,
        x: r.mount ? Math.round(r.mount.x * 100) : Math.round((r.right.offset || 0) + r.right.share / 2),
      }
    )
  }
  function move(r, change) {
    place({ ...mounts, [key(r)]: { ...placement(r), ...change } })
    inform('')
  }
  const preview = subject
    ? clothingFor(
        rights,
        org.id,
        category,
        { ...subject, programs: subject.programs || org.programs },
        g.world.entries,
      ).map((r) => {
        const p = placement(r)
        return { ...r, mount: p.remove ? null : { x: p.x / 100, scale: p.scale / 100 } }
      })
    : []
  return (
    <form
      className="uniform-editor"
      onSubmit={async (e) => {
        e.preventDefault()
        if (
          await order.send('organization-uniform', {
            patterns: draft,
            placements: Object.values(mounts),
          })
        ) {
          place({})
          inform('Форма сохранена в карьере.')
        }
      }}
    >
      <div className="uniform-preview">
        <header>
          <OrganizationMark organization={org} size={40} />
          <span>{org.name}</span>
          <div className="uniform-camera" aria-label="Режим примерки">
            {[
              ['portrait', 'На сотруднике'],
              ['garment', 'Только форма'],
            ].map(([id, name]) => (
              <button type="button" key={id} aria-pressed={view === id} onClick={() => setView(id)}>
                {name}
              </button>
            ))}
          </div>
        </header>
        {subject && (
          <Portrait
            person={subject}
            view={view}
            org={org.id}
            organization={org}
            category={category}
            pattern={pattern}
            sponsors={preview}
            color={org.color}
            driver={category === 'driver'}
            media={g.data.media}
          />
        )}
        <div>
          <small>ПРИМЕРКА</small>
          <h2>{uniformCategories[category]}</h2>
        </div>
      </div>
      <div className="uniform-controls">
        <h2>Редактор экипировки</h2>
        <Choice
          label="Категория сотрудников"
          value={category}
          options={uniformCategories}
          onChange={choose}
        />
        <Choice
          label="Сотрудник для примерки"
          value={model}
          options={{
            '': 'По должности',
            ...Object.fromEntries(staff.filter((p) => p.face).map((p) => [p.id, p.name])),
          }}
          onChange={selectModel}
        />
        <fieldset className="uniform-designs">
          <legend>Дизайн кроя</legend>
          <div>
            {Object.entries(designs).map(([id, label]) => (
              <button
                type="button"
                key={id}
                aria-label={label}
                aria-pressed={pattern.design === id}
                onClick={() => updatePattern('design', id)}
              >
                {subject && (
                  <Portrait
                    person={subject}
                    view="garment"
                    org={org.id}
                    organization={org}
                    category={category}
                    pattern={{ ...pattern, design: id }}
                    color={org.color}
                    driver={category === 'driver'}
                    media={g.data.media}
                  />
                )}
                <span>{label}</span>
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>Распределение фирменных цветов</legend>
          {Object.entries({ base: 'Основа', insert: 'Вставки и рукава', piping: 'Кант и детали' }).map(
            ([id, label]) => (
              <div className="uniform-swatch-row" key={id}>
                <span>{label}</span>
                <div role="group" aria-label={label}>
                  {Object.entries(swatches).map(([swatch, title]) => {
                    const color = org.brand_palette?.[swatch] || org.brand_palette.secondary
                    return (
                      <button
                        type="button"
                        key={swatch}
                        aria-label={label + ' · ' + title + ' ' + color}
                        aria-pressed={pattern[id] === swatch}
                        title={title + ' ' + color}
                        onClick={() => updatePattern(id, swatch)}
                      >
                        <i style={{ background: color }} />
                        {title}
                      </button>
                    )
                  })}
                </div>
              </div>
            ),
          )}
        </fieldset>
        <Choice
          label="Эмблема организации"
          value={pattern.badge}
          options={placements}
          onChange={(v) => updatePattern('badge', v)}
        />
        {!g.data.media.some((a) => a.kind === 'logo' && a.entity === (org.logo_asset || org.id)) && (
          <small>В каталоге нет подтверждённой эмблемы этой организации.</small>
        )}
        <fieldset>
          <legend>Спонсорские размещения</legend>
          {!rights.some((r) => r.right.zone === surface) && (
            <p>Действующих прав на эту поверхность нет.</p>
          )}
          {rights
            .filter((r) => r.right.zone === surface)
            .map((r) => {
              const p = placement(r)
              return (
                <section key={key(r)}>
                  <label>
                    <input
                      type="checkbox"
                      checked={!p.remove}
                      disabled={!r.image && !r.mount}
                      onChange={(e) => move(r, { remove: !e.target.checked })}
                    />{' '}
                    {r.name}
                  </label>
                  <small>
                    {r.right.share}% площади · {r.series.join(', ').toUpperCase()}
                    {r.person ? ' · персональное право' : ''}
                  </small>
                  {!r.image && <small>Графический знак отсутствует в каталоге.</small>}
                  {!p.remove &&
                    [
                      ['x', 'Положение', 0],
                      ['scale', 'Размер', 10],
                    ].map(([field, label, min]) => (
                      <label key={field}>
                        {label} · {p[field]}%
                        <input
                          type="range"
                          min={min}
                          max="100"
                          value={p[field]}
                          onChange={(e) => move(r, { [field]: Number(e.target.value) })}
                        />
                      </label>
                    ))}
                </section>
              )
            })}
        </fieldset>
        <div className="uniform-actions">
          <Button type="submit" disabled={order.busy}>
            Сохранить форму
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              edit({})
              place({})
              inform('Стандартные шаблоны восстановлены. Сохраните форму, чтобы применить изменения.')
            }}
          >
            Восстановить стандартную форму
          </Button>
        </div>
        {order.error && <p role="alert">{order.error}</p>}
        {saved && <p role="status">{saved}</p>}
      </div>
    </form>
  )
}
