import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Eye, Images, RotateCcw, Save, Undo2 } from 'lucide-react'
import { api, ApiError, explain, post, type Career, type World } from '../career/api'
import { Button, Choices, Dialog, Facts, Header, Panel } from '../ui/components'
import { CarView } from './CarView'
import { DecalPanel } from './DecalPanel'
import { geometry, partNames, sameLivery, type Catalog, type Livery } from './model'
import './garage.css'

type Props = { c: Career; world: World; updateCareer: (c: Career) => void }
type Draft = { current: Livery; past: Livery[] }
const tabs = [
  ['overview', 'Обзор'],
  ['livery', 'Ливрея'],
  ['sponsors', 'Спонсоры'],
  ['parts', 'Компоненты'],
] as const
export function SeasonGarage(props: Props) {
  const [catalog, setCatalog] = useState<Catalog>(),
    [error, setError] = useState(''),
    [attempt, retry] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    api<Catalog>('garage', { signal: controller.signal })
      .then(setCatalog)
      .catch((err) => {
        if (!controller.signal.aborted) setError(explain(err))
      })
    return () => controller.abort()
  }, [attempt])
  if (!catalog)
    return (
      <section className="screen">
        <h1>Гараж</h1>
        {error ? (
          <p role="alert">
            {error}{' '}
            <Button
              onClick={() => {
                setError('')
                retry(attempt + 1)
              }}
            >
              Повторить
            </Button>
          </p>
        ) : (
          <p role="status">Загрузка стартовой сетки…</p>
        )}
      </section>
    )
  return <Studio {...props} catalog={catalog} />
}
function Studio({ c, world, catalog, updateCareer }: Props & { catalog: Catalog }) {
  const entries = Object.values(world.entries)
  const [series, setSeries] = useState(c.series)
  const filtered = entries.filter((e) => e.championship === series)
  const [entryId, pick] = useState(() => filtered.find((e) => e.org === c.org)?.id || filtered[0].id)
  const entry = world.entries[entryId],
    car = world.cars[entry.car],
    org = world.organizations[entry.org]
  const { geometry: baseModel, livery: original } = catalog.entries[entryId]
  const configuration = c.garage_configurations[entry.car]
  const model =
    configuration.geometry && geometry[configuration.geometry] ? configuration.geometry : baseModel
  const [tab, setTab] = useState<(typeof tabs)[number][0]>('overview'),
    [dialog, open] = useState(''),
    [index, select] = useState(0)
  const [drafts, setDrafts] = useState<Record<string, Draft>>({}),
    [message, send] = useState(''),
    [error, setError] = useState('')
  const [wing, setWing] = useState('standard'),
    [saving, lock] = useState(false)
  const retry = useRef<{ signature: string; id: string } | null>(null)
  const saved = c.liveries[entryId] || original,
    draft = drafts[entryId],
    livery = draft?.current || saved
  const dirty = !sameLivery(livery, saved),
    own = entry.org === c.org && c.role !== 'manufacturer'
  const selected = livery.decals[index]
  function change(next: Livery, drag = false) {
    setDrafts((prev) => {
      const last = prev[entryId] || { current: saved, past: [] }
      const past = drag ? last.past : [...last.past.slice(-59), last.current]
      return { ...prev, [entryId]: { current: next, past } }
    })
    send('')
    setError('')
  }
  const lastDrag = useRef(false)
  function choose(id: string) {
    pick(id)
    select(0)
    setWing('standard')
    send('')
    setError('')
    open('')
    lastDrag.current = false
  }
  function undo() {
    if (!draft?.past.length) return
    const current = draft.past[draft.past.length - 1]
    setDrafts({ ...drafts, [entryId]: { current, past: draft.past.slice(0, -1) } })
    select(Math.max(0, Math.min(index, current.decals.length - 1)))
    send('')
  }
  async function save() {
    if (saving || !dirty || !own) return
    lock(true)
    setError('')
    send('')
    const signature = JSON.stringify([entryId, livery, c.revision])
    if (retry.current?.signature !== signature) retry.current = { signature, id: crypto.randomUUID() }
    try {
      const next = await api<Career>(
        'careers/' + c.id + '/commands',
        post({
          command_id: retry.current.id,
          revision: c.revision,
          action: 'save-livery',
          paint: { entry: entryId, livery },
        }),
      )
      updateCareer(next)
      send('Ливрея сохранена в карьере')
      retry.current = null
    } catch (e) {
      setError(explain(e))
      if (e instanceof ApiError && e.status === 409) {
        try {
          updateCareer(await api<Career>('careers/' + c.id))
          retry.current = null
        } catch (err) {
          setError(explain(err))
        }
      }
    } finally {
      lock(false)
    }
  }
  const installed = useMemo(
    () =>
      wing === 'standard' ? configuration.installed : { ...configuration.installed, 'rear-wing': wing },
    [wing, configuration],
  )
  const viewProps = {
    model,
    regulation: configuration.regulation,
    livery,
    catalog,
    installed,
    label: car.name + ' №' + livery.number,
  }
  return (
    <section className="screen season-garage">
      <Header
        section={world.championships[series].name + ' / Технический центр'}
        title="Гараж"
        sub={org.name + ' · Сезон ' + world.origin.season}
      >
        <Button onClick={() => open('gallery')}>
          <Images size={16} />
          Стартовая сетка
        </Button>
      </Header>
      <div className="garage-selectors">
        <label>
          Чемпионат
          <select
            value={series}
            disabled={saving}
            onChange={(e) => {
              const s = e.target.value,
                grid = entries.filter((v) => v.championship === s)
              setSeries(s)
              choose((grid.find((v) => v.org === c.org) || grid[0]).id)
            }}
          >
            {Object.values(world.championships).filter((s) => s.playable !== false).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Заявка
          <select value={entryId} disabled={saving} onChange={(e) => choose(e.target.value)}>
            {filtered.map((e) => (
              <option value={e.id} key={e.id}>
                №{catalog.entries[e.id].livery.number} · {world.organizations[e.org].name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <Choices label="Раздел гаража" items={tabs} active={tab} onChange={setTab} />
      <div className={'studio-layout' + (tab === 'livery' || tab === 'sponsors' ? ' editing' : '')}>
        <section className="studio-panel">
          <div className="studio-stage">
            <header>
              <small>
                {entry.category.toUpperCase()} / {world.origin.season}
              </small>
              <h2>{car.name}</h2>
              <span>{org.name}</span>
            </header>
            <button
              className="studio-expand"
              onClick={() => open('preview')}
              aria-label="Увеличить предпросмотр"
            >
              <Eye size={18} />
            </button>
            <div
              onPointerDownCapture={() => {
                lastDrag.current = false
              }}
              onPointerUpCapture={() => {
                lastDrag.current = false
              }}
            >
              <CarView
                key={entryId}
                {...viewProps}
                selected={selected}
                highlight={tab === 'sponsors'}
                onMove={
                  tab === 'sponsors' && selected
                    ? (x, y) => {
                        const group = lastDrag.current
                        change(
                          {
                            ...livery,
                            decals: livery.decals.map((d, i) => (i === index ? { ...d, x, y } : d)),
                          },
                          group,
                        )
                        lastDrag.current = true
                      }
                    : undefined
                }
              />
            </div>
            <footer>
              <span>{world.championships[series].short_name || world.championships[series].name}</span>
              <b>№ {livery.number}</b>
            </footer>
          </div>
          <div className="studio-status">
            <span>
              <i style={{ background: livery.colors[0] }} />
              {dirty ? 'Черновик' : c.liveries[entryId] ? 'Карьерная ливрея' : 'Стартовая ливрея'}
            </span>
            <span>{catalog.patterns[livery.pattern].name}</span>
          </div>
        </section>
        <aside className="studio-controls">
          {tab === 'overview' && (
            <Panel title="Паспорт автомобиля">
              <Facts
                items={[
                  ['Заявка', '№ ' + original.number],
                  ['Класс', entry.category],
                  ['Команда', org.name],
                  ['Экипаж', c.crews[entry.id].map((id) => world.names[id]).join(', ') || 'Вакантно'],
                ]}
              />
              <div className="garage-fields">
                <Button primary onClick={() => setTab('livery')}>
                  Открыть редактор
                </Button>
              </div>
            </Panel>
          )}
          {tab === 'livery' && (
            <Panel title="Окраска кузова">
              <div className="garage-fields">
                <div className="paint-swatches">
                  {livery.colors.map((v, i) => (
                    <label key={i}>
                      <input
                        aria-label={['Основной цвет', 'Дополнительный цвет', 'Акцентный цвет'][i]}
                        type="color"
                        value={v}
                        onChange={(e) =>
                          change({
                            ...livery,
                            colors: livery.colors.map((color, j) => (j === i ? e.target.value : color)),
                          })
                        }
                      />
                      <span>{['Основной', 'Второй', 'Акцент'][i]}</span>
                      <small>{v.toUpperCase()}</small>
                    </label>
                  ))}
                </div>
                <label>
                  Палитра
                  <select
                    value={livery.colors.join(' ')}
                    onChange={(e) => change({ ...livery, colors: e.target.value.split(' ') })}
                  >
                    {[
                      ['Стартовая', original.colors.join(' ')],
                      ['Графит и кармин', '#292c31 #ba3344 #f1eee4'],
                      ['Серебро и кобальт', '#bdc6ce #234ca0 #e7b655'],
                      ...([
                        original.colors.join(' '),
                        '#292c31 #ba3344 #f1eee4',
                        '#bdc6ce #234ca0 #e7b655',
                      ].includes(livery.colors.join(' '))
                        ? []
                        : [['Своя палитра', livery.colors.join(' ')]]),
                    ].map(([name, colors]) => (
                      <option value={colors} key={colors}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Рисунок
                  <select
                    value={livery.pattern}
                    onChange={(e) => change({ ...livery, pattern: e.target.value })}
                  >
                    {Object.entries(catalog.patterns).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Гоночный номер
                  <input
                    value={livery.number}
                    inputMode="numeric"
                    maxLength={3}
                    pattern="[0-9]{1,3}"
                    onChange={(e) => {
                      if (/^\d{0,3}$/.test(e.target.value)) change({ ...livery, number: e.target.value })
                    }}
                  />
                </label>
                {!livery.number && <p role="alert">Введите от одной до трёх цифр.</p>}
              </div>
            </Panel>
          )}
          {tab === 'sponsors' && (
            <Panel title="Декали и слои">
              <DecalPanel
                allowed={catalog.entries[entryId].allowed_assets}
                catalog={catalog}
                decals={livery.decals}
                index={index}
                select={select}
                change={(decals) => change({ ...livery, decals })}
              />
            </Panel>
          )}
          {tab === 'parts' && (
            <Panel title="Конфигурация машины">
              <div className="garage-fields">
                <label>
                  Антикрыло в предпросмотре
                  <select value={wing} onChange={(e) => setWing(e.target.value as typeof wing)}>
                    <option value="standard">Стартовый профиль</option>
                    {Object.keys(geometry[model].variants['rear-wing'] || {}).map(key => (
                      <option key={key} value={key}>Низкий профиль · пример</option>
                    ))}
                  </select>
                </label>
                <small>Регламент {car.regulation}</small>
                <div className="garage-parts">
                  {geometry[model].parts.map(([id]) => (
                    <span key={id}>
                      <Check size={12} />
                      {partNames[id]}
                    </span>
                  ))}
                </div>
              </div>
            </Panel>
          )}
          {(tab === 'livery' || tab === 'sponsors' || dirty) && (
            <div className="panel garage-fields">
              <div className="garage-tools">
                <Button disabled={!draft?.past.length || saving} onClick={undo}>
                  <Undo2 size={15} />
                  Отменить
                </Button>
                <Button
                  disabled={sameLivery(livery, original) || saving}
                  onClick={() => {
                    change(original)
                    select(0)
                  }}
                >
                  <RotateCcw size={15} />
                  Исходная
                </Button>
              </div>
              {dirty && (
                <Button
                  disabled={saving}
                  onClick={() => {
                    change(saved)
                    select(0)
                  }}
                >
                  Сбросить черновик
                </Button>
              )}
              {own ? (
                <Button primary disabled={!dirty || saving || !livery.number} onClick={save}>
                  <Save size={16} />
                  {saving ? 'Сохранение…' : 'Сохранить в карьере'}
                </Button>
              ) : (
                <small>Для чужой команды доступен предпросмотр изменений.</small>
              )}
            </div>
          )}
          {message && (
            <p className="garage-feedback" role="status">
              <Check size={15} />
              {message}
            </p>
          )}
          {error && (
            <p className="career-error" role="alert">
              {error}
            </p>
          )}
        </aside>
      </div>
      <a
        className="garage-credits"
        href="/assets/garage/2025-v1/CREDITS.txt"
        target="_blank"
        rel="noreferrer"
      >
        Источники графики и лицензии
      </a>
      {dialog && (
        <Dialog
          title={
            dialog === 'gallery'
              ? 'Стартовая сетка · ' + series.toUpperCase()
              : car.name + ' · №' + livery.number
          }
          onClose={() => open('')}
        >
          {dialog === 'preview' ? (
            <div className="large-car">
              <CarView {...viewProps} />
            </div>
          ) : (
            <div className="grid-cars">
              {filtered.map((e) => {
                const preset = catalog.entries[e.id]
                return (
                  <button key={e.id} onClick={() => choose(e.id)}>
                    <img
                      loading="lazy"
                      src={'/assets/garage/2025-v1/grid/' + e.id + '.webp'}
                      alt={world.cars[e.car].name}
                    />
                    <span>
                      <b>№ {preset.livery.number}</b> {world.organizations[e.org].name}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </Dialog>
      )}
    </section>
  )
}
