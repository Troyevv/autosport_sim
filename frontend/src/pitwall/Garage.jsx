import React, { useEffect, useRef, useState } from 'react'
import { useGame, useStored, dateLabel, money } from './core'
import {
  Badge,
  Button,
  Icon,
  Panel,
  PageHeading,
  Tabs,
  Select,
  DataTable,
  EmptyState,
  Facts,
} from './ui'
import { RaceCar } from './visuals'
import { areaNames, geometry, partNames } from '../garage/model'
import './garage.css'
import { useOrder } from '../career/finance/useOrder'
import { usePersonnel } from '../career/staff/model'
import { Components } from '../garage/Components'
export default function Garage() {
  const g = useGame(),
    { world, game } = g
  const [series, setSeries] = useState(world.entries[g.entity]?.championship || game.career.series),
    [chosen, setChosen] = useState(g.entity || g.selectedEntry || '')
  const entries = Object.values(world.entries).filter(
      (e) => e.championship === series && game.garageCatalog.entries[e.id],
    ),
    entry =
      entries.find((e) => e.id === chosen) ||
      entries.find((e) => e.org === game.career.org) ||
      entries[0]
  const [wing, setWing] = useState('standard')
  const result = usePersonnel(
    entry ? 'careers/' + game.career.id + '/components/' + encodeURIComponent(entry.id) : null,
    game.career.revision,
  )
  useEffect(() => {
    if (g.entity && world.entries[g.entity]) {
      setChosen(g.entity)
      setSeries(world.entries[g.entity].championship)
    }
  }, [g.entity])
  if (!entry)
    return (
      <EmptyState
        title="В этой серии нет визуальных моделей"
        description="Выберите один из девяти чемпионатов с автомобилями."
      />
    )
  const car = world.cars[entry.car],
    org = world.organizations[entry.org],
    catalog = game.garageCatalog || g.data.catalog,
    paint = game.career.liveries[entry.id] || catalog.entries[entry.id].livery,
    own = entry.org === game.career.org && g.role !== 'manufacturer',
    tab = g.route === 'livery' ? 'livery' : g.tab || 'overview',
    desk = result.data || {},
    parts = desk.parts || {},
    cfg = game.career.garage_configurations[entry.car] || {},
    model = cfg.geometry && geometry[cfg.geometry] ? cfg.geometry : catalog.entries[entry.id].geometry
  function select(id) {
    setChosen(id)
    g.setSelectedEntry(id)
    setWing('standard')
  }
  function passport(part, slot) {
    const p = part
    g.openDialog({
      title: p.label || slot,
      content: (
        <div className="stack">
          <Badge tone="accent">Экземпляр {p.serial}</Badge>
          <h3>{p.title || 'Физический компонент'}</h3>
          <Facts
            rows={[
              ['Редакция', p.version],
              ['Установлен', car.name + ' · №' + entry.number],
              ['Пробег', (Number(p.distance_m || 0) / 1000).toLocaleString('ru-RU') + ' км'],
              ['Износ', (Number(p.wear_ppm || 0) / 10000).toLocaleString('ru-RU') + '%'],
              [
                'Остаточный ресурс',
                p.remaining_m == null
                  ? 'Нет подтверждённой оценки'
                  : (p.remaining_m / 1000).toLocaleString('ru-RU') + ' км',
              ],
            ]}
          />
          <details>
            <summary>Параметры спецификации</summary>
            <Facts rows={quantities(p.parameters || {})} />
          </details>
          <details>
            <summary>Регистрационные данные</summary>
            <code>{p.instance || p.id}</code>
            <br />
            <code>{p.specification}</code>
          </details>
          {own && g.role === 'manager' && (
            <Button onClick={() => g.navigate('inventory', '', p.instance || p.id)}>
              Склад и замена экземпляра <Icon name="ArrowRight" />
            </Button>
          )}
        </div>
      ),
    })
  }
  return (
    <>
      <PageHeading
        eyebrow={org.name + ' / ' + world.championships[series].name}
        title={tab === 'livery' ? 'Ливрея ' + car.name : car.name + ' · №' + entry.number}
        actions={
          <div className="garage-selectors">
            <select
              aria-label="Чемпионат гаража"
              value={series}
              onChange={(e) => {
                setSeries(e.target.value)
                setChosen('')
              }}
            >
              {Object.values(world.championships)
                .filter((s) => s.playable !== false)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
            <select aria-label="Автомобиль" value={entry.id} onChange={(e) => select(e.target.value)}>
              {entries.map((e) => (
                <option key={e.id} value={e.id}>
                  №{e.number} · {world.organizations[e.org].name}
                </option>
              ))}
            </select>
          </div>
        }
      />
      <Tabs
        value={tab}
        onChange={(t) => g.navigate(t === 'livery' ? 'livery' : 'garage', t, entry.id)}
        items={[
          { id: 'overview', label: 'Автомобиль' },
          {
            id: 'components',
            label: 'Компоненты',
            count: Object.keys(parts).length,
          },
          { id: 'livery', label: 'Ливрея' },
          { id: 'sponsors', label: 'Размещения' },
          { id: 'history', label: 'История сборки' },
        ]}
      />
      {tab === 'overview' && (
        <>
          <section className="garage-hero">
            <RaceCar entryId={entry.id} livery={paint} />
            <div>
              <span className="eyebrow">{entry.category} / Сезон 2025</span>
              <h2>{car.name}</h2>
              <p>
                {org.name} · {org.base}
              </p>
            </div>
            <footer>
              <Badge tone="good">
                {desk.history?.length ? 'Обновлённая сборка' : 'Стартовая спецификация'}
              </Badge>
              <Button onClick={() => g.navigate('livery', '', entry.id)}>
                {own ? 'Редактировать ливрею' : 'Посмотреть ливрею'}
                <Icon name="ArrowRight" />
              </Button>
            </footer>
          </section>
          <div className="two-col garage-overview">
            <Panel title="Экипаж">
              <div className="garage-crew">
                {(game.career.crews[entry.id] || entry.crew).map((id) => (
                  <button key={id} onClick={() => g.openPerson(id)}>
                    <Icon name="UserRound" />
                    <span>
                      <strong>{game.personnel.find((p) => p.id === id)?.name || world.names[id]}</strong>
                      <small>Досье и действующий контракт</small>
                    </span>
                    <Icon name="ArrowUpRight" />
                  </button>
                ))}
              </div>
            </Panel>
            <Panel title="Технические партнёры">
              <Facts
                rows={Object.entries(car.suppliers || {}).map(([k, id]) => [
                  {
                    engine: 'Силовая установка',
                    gearbox: 'Трансмиссия',
                    transmission: 'Трансмиссия',
                    tyres: 'Шины',
                    tyre: 'Шины',
                  }[k] || k,
                  <button className="link-button" onClick={() => g.openOrganization(id)}>
                    {world.organizations[id]?.name || id}
                  </button>,
                ])}
              />
              <Button variant="ghost" onClick={() => g.navigate('manufacturer', 'clients')}>
                Договоры и поддержка
              </Button>
            </Panel>
          </div>
        </>
      )}
      {result.error && (
        <p role="alert">
          {result.error} <Button onClick={result.retry}>Повторить</Button>
        </p>
      )}
      {tab === 'components' && (
        <>
          <div className="components-car">
            <RaceCar
              entryId={entry.id}
              livery={paint}
              installed={wing === 'standard' ? cfg.installed : { ...cfg.installed, 'rear-wing': wing }}
            />
            <Badge>Каждая деталь имеет собственный серийный номер</Badge>
          </div>
          <Panel
            className="garage-components-panel"
            title="Установленные компоненты"
            actions={
              <Button variant="ghost" onClick={() => g.navigate('inventory')}>
                Открыть склад
              </Button>
            }
          >
            <DataTable
              rows={Object.entries(parts).map(([slot, p]) => ({
                ...p,
                slot,
                id: slot,
              }))}
              columns={[
                {
                  key: 'label',
                  label: 'Узел',
                  render: (p) => (
                    <button className="link-button" onClick={() => passport(p, p.slot)}>
                      {p.label}
                      <Icon name="ArrowUpRight" size={13} />
                    </button>
                  ),
                },
                {
                  key: 'version',
                  label: 'Редакция',
                  render: (p) => 'Ред. ' + p.version,
                },
                { key: 'serial', label: 'Серийный номер' },
                {
                  key: 'distance_m',
                  label: 'Пробег',
                  render: (p) => (Number(p.distance_m || 0) / 1000).toLocaleString('ru-RU') + ' км',
                },
                {
                  key: 'remaining_m',
                  label: 'Ресурс',
                  render: (p) =>
                    p.remaining_m == null
                      ? 'После проверки'
                      : (p.remaining_m / 1000).toLocaleString('ru-RU') + ' км',
                },
                {
                  key: 'wear_ppm',
                  label: 'Состояние',
                  render: (p) => (
                    <Badge tone={p.damaged ? 'danger' : 'good'}>
                      {p.damaged
                        ? 'Нужна проверка'
                        : p.wear_ppm
                          ? 'Износ ' + (p.wear_ppm / 10000).toFixed(1) + '%'
                          : 'Без износа'}
                    </Badge>
                  ),
                },
              ]}
              empty="Паспорт этого автомобиля не входит в доступные проекции. Его общая конструкция видна в гараже."
            />
          </Panel>
          <div className="two-col">
            <Panel title="Автомобиль в сборе">
              <Facts rows={quantities(desk.assembly || {})} />
              <p className="muted">Параметры текущей сборки по паспорту автомобиля.</p>
            </Panel>
            <Panel title="Визуальные модули">
              <Select
                label="Антикрыло в предпросмотре"
                value={wing}
                onChange={(e) => setWing(e.target.value)}
                options={[
                  { value: 'standard', label: 'Установленный профиль' },
                  ...Object.keys(geometry[model]?.variants?.['rear-wing'] || {}).map((value) => ({
                    value,
                    label: 'Низкий профиль · пример',
                  })),
                ]}
              />
              <p className="muted">Предпросмотр формы не меняет техническую спецификацию.</p>
              <div className="toolbar">
                {(geometry[model]?.parts || []).map(([id]) => (
                  <Badge key={id}>{partNames[id] || id}</Badge>
                ))}
              </div>
            </Panel>
          </div>
        </>
      )}
      {tab === 'components' && own && (
        <details>
          <summary>Управление физическими экземплярами</summary>
          <Components entry={entry.id} c={game.career} update={g.updateCareer} />
        </details>
      )}
      {tab === 'history' && (
        <details>
          <summary>Паспорта сборки и учёт использования</summary>
          <Components historyOnly entry={entry.id} c={game.career} update={g.updateCareer} />
        </details>
      )}
      {tab === 'livery' && <Livery key={entry.id} {...{ entry, paint, catalog, own }} />}
      {tab === 'sponsors' && (
        <Panel
          className="garage-sponsors-panel"
          title="Знаки на автомобиле"
          actions={
            own && (
              <Button onClick={() => g.navigate('livery', '', entry.id)}>
                Редактировать размещение
              </Button>
            )
          }
        >
          <p className="muted">
            Ливрея и коммерческие обязательства связаны через разрешённые знаки и зоны. Добавление
            изображения само по себе не создаёт рекламный договор.
          </p>
          <DataTable
            rows={paint.decals.map((d, i) => ({ ...d, id: i }))}
            columns={[
              {
                key: 'asset',
                label: 'Партнёр',
                render: (d) => catalog.sponsors[d.asset]?.name || d.asset,
              },
              { key: 'zone', label: 'Зона', render: (d) => areaNames[d.zone] },
              {
                key: 'scale',
                label: 'Масштаб',
                render: (d) => Math.round(d.scale * 100) + '%',
              },
              { key: 'angle', label: 'Поворот', render: (d) => d.angle + '°' },
            ]}
          />
          <Button variant="ghost" onClick={() => g.navigate('rights')}>
            Рекламные права и исполнение
          </Button>
        </Panel>
      )}
      {tab === 'history' && (
        <Panel title="История сборки и оформления">
          <DataTable
            rows={(desk.history || []).map((x) => ({
              ...x,
              title: parts[x.slot]?.label,
              description: x.mechanic,
            }))}
            columns={[
              { key: 'date', label: 'Дата', render: (r) => dateLabel(r.date) },
              { key: 'title', label: 'Изменение' },
              {
                key: 'description',
                label: 'Основание',
                render: (r) => r.description || r.detail,
              },
            ]}
            empty="После начала учёта сборка и ливрея этого автомобиля ещё не менялись."
          />
        </Panel>
      )}
    </>
  )
}
function Livery({ entry, paint, catalog, own }) {
  const g = useGame(),
    [drafts, setDrafts] = useStored('garage.drafts', {}),
    [past, setPast] = useState([]),
    [layer, setLayer] = useState(0),
    [panel, setPanel] = useState('paint'),
    [zones, setZones] = useState(false)
  const order = useOrder(g.game.career, g.updateCareer, 'paint')
  const savedDraft = drafts[entry.id]
  const draft = savedDraft?.base === JSON.stringify(paint) ? savedDraft.value : paint
  const setDraft = (next) =>
    setDrafts((p) => ({ ...p, [entry.id]: { base: JSON.stringify(paint), value: next } }))
  const dragActive = useRef(false)
  useEffect(() => {
    const end = () => {
      dragActive.current = false
    }
    window.addEventListener('pointerup', end)
    return () => window.removeEventListener('pointerup', end)
  }, [])
  const dirty = JSON.stringify(draft) !== JSON.stringify(paint),
    selected = draft.decals[layer],
    allowed = catalog.entries[entry.id].allowed_assets,
    areas = (id) => catalog.entries[entry.id].commercial_zones?.[id] || catalog.sponsors[id]?.zones || []
  function update(next, drag = false) {
    if (!own) return
    if (!drag || !dragActive.current) setPast((p) => [...p.slice(-49), draft])
    if (drag) dragActive.current = true
    setDraft(next)
  }
  function changeDecal(key, value) {
    if (!selected) return
    update({
      ...draft,
      decals: draft.decals.map((d, i) => (i === layer ? { ...d, [key]: value } : d)),
    })
  }
  function save() {
    if (!/^\d{1,3}$/.test(draft.number)) {
      g.notify('Введите бортовой номер от 1 до 3 цифр.', 'error')
      return
    }
    g.confirm({
      title: 'Сохранить ливрею?',
      description:
        'Цвета, рисунок и размещения будут сохранены для автомобиля №' +
        entry.number +
        '. Технические компоненты сохранят свои паспорта.',
      confirmLabel: 'Сохранить',
      onConfirm: async () => {
        await order.send('save-livery', { entry: entry.id, livery: draft }, true)
        setPast([])
        setDrafts((p) => {
          const n = { ...p }
          delete n[entry.id]
          return n
        })
      },
    })
  }
  function add() {
    const options = allowed.map((id) => ({
      value: id,
      label: catalog.sponsors[id]?.name || id,
    }))
    g.openForm({
      title: 'Добавить разрешённый знак',
      fields: [
        {
          name: 'asset',
          label: 'Партнёр',
          type: 'select',
          options,
          required: true,
        },
        {
          name: 'zone',
          label: 'Зона',
          type: 'select',
          options: Object.entries(areaNames).map(([value, label]) => ({
            value,
            label,
          })),
        },
      ],
      validate: (v) => {
        return !areas(v.asset).includes(v.zone)
          ? 'Этот знак недопустим в выбранной зоне. Выберите зону из условий партнёра.'
          : null
      },
      onSubmit: (v) => {
        const s = catalog.sponsors[v.asset]
        update({
          ...draft,
          decals: [
            ...draft.decals,
            {
              asset: v.asset,
              zone: v.zone,
              x: 0.5,
              y: 0.5,
              scale: Math.min(0.3, s.maxScale || 0.3),
              angle: 0,
            },
          ],
        })
        setLayer(draft.decals.length)
        setPanel('decals')
      },
    })
  }
  return (
    <>
      <div className={'livery-workspace ' + (dirty ? 'dirty' : '')}>
        <section className="livery-stage">
          <header>
            <span>
              <Icon name="Palette" />
              Ателье / №{entry.number} {dirty && <Badge tone="warning">Не сохранено</Badge>}
            </span>
            <div>
              <button
                className="icon-button"
                aria-label="Развернуть просмотр ливреи"
                onClick={() =>
                  g.openDialog({
                    title: 'Просмотр ливреи',
                    wide: true,
                    content: <RaceCar entryId={entry.id} livery={draft} />,
                  })
                }
              >
                <Icon name="Maximize" />
              </button>
              <button
                className="icon-button"
                aria-label="Отменить изменение"
                disabled={!past.length}
                onClick={() => {
                  setDraft(past.at(-1))
                  setPast((p) => p.slice(0, -1))
                }}
              >
                <Icon name="Undo2" />
              </button>
              <button
                className="icon-button"
                aria-label="Показать зоны размещения"
                onClick={() => setZones(!zones)}
              >
                <Icon name="Eye" />
              </button>
            </div>
          </header>
          <RaceCar
            entryId={entry.id}
            livery={draft}
            selected={selected}
            highlight={zones}
            onMove={
              own && selected
                ? (x, y) =>
                    update(
                      {
                        ...draft,
                        decals: draft.decals.map((d, i) => (i === layer ? { ...d, x, y } : d)),
                      },
                      true,
                    )
                : undefined
            }
          />
          <p>
            <Icon name="Move" size={16} />
            {own
              ? 'Перетаскивайте выбранный знак на машине. Точные значения — в свойствах слоя. Черновик сохраняется при переходах.'
              : 'Автомобиль другой организации доступен для просмотра. Изменения выполняет её команда.'}
          </p>
        </section>
        <aside className="livery-controls">
          <Tabs
            value={panel}
            onChange={setPanel}
            items={[
              { id: 'paint', label: 'Цвет и рисунок' },
              { id: 'decals', label: 'Размещения', count: draft.decals.length },
            ]}
          />
          {panel === 'paint' ? (
            <fieldset disabled={!own}>
              <legend>Палитра команды</legend>
              <Select
                label="Готовая палитра"
                value={draft.colors.join(' ')}
                onChange={(e) => update({ ...draft, colors: e.target.value.split(' ') })}
                options={[
                  {
                    value: catalog.entries[entry.id].livery.colors.join(' '),
                    label: 'Стартовая',
                  },
                  {
                    value: '#292c31 #ba3344 #f1eee4',
                    label: 'Графит и кармин',
                  },
                  {
                    value: '#bdc6ce #234ca0 #e7b655',
                    label: 'Серебро и кобальт',
                  },
                  { value: draft.colors.join(' '), label: 'Текущая палитра' },
                ].filter((x, i, a) => a.findIndex((y) => y.value === x.value) === i)}
              />
              {['Основной цвет', 'Второй цвет', 'Акцент'].map((t, i) => (
                <label className="color-setting" key={t}>
                  <span>{t}</span>
                  <input
                    type="color"
                    aria-label={t}
                    value={draft.colors[i]}
                    onChange={(e) =>
                      update({
                        ...draft,
                        colors: draft.colors.map((c, j) => (i === j ? e.target.value : c)),
                      })
                    }
                  />
                  <code>{draft.colors[i]}</code>
                </label>
              ))}
              <Select
                label="Рисунок"
                value={draft.pattern}
                onChange={(e) => update({ ...draft, pattern: e.target.value })}
                options={Object.entries(catalog.patterns).map(([value, x]) => ({
                  value,
                  label: x.name,
                }))}
              />
              <label>
                <span>Бортовой номер</span>
                <input
                  value={draft.number}
                  inputMode="numeric"
                  pattern="[0-9]{1,3}"
                  maxLength={3}
                  onChange={(e) =>
                    /^\d{0,3}$/.test(e.target.value) && update({ ...draft, number: e.target.value })
                  }
                />
              </label>
              <p>Рисунок ложится на маски исходной модели. Свет, тень, стекло и шины сохраняются.</p>
            </fieldset>
          ) : (
            <div className="stack">
              <div className="decal-layers">
                {draft.decals.map((d, i) => (
                  <button key={i} className={layer === i ? 'active' : ''} onClick={() => setLayer(i)}>
                    <span>{catalog.sponsors[d.asset]?.name || d.asset}</span>
                    <small>{areaNames[d.zone]}</small>
                    <Icon name="ChevronRight" size={14} />
                  </button>
                ))}
              </div>
              {own && (
                <Button variant="secondary" disabled={draft.decals.length >= 16} onClick={add}>
                  <Icon name="Plus" />
                  Добавить знак
                </Button>
              )}
              {selected && (
                <fieldset disabled={!own}>
                  <legend>Свойства выбранного слоя</legend>
                  <Select
                    label="Знак"
                    value={selected.asset}
                    onChange={(e) => {
                      const asset = e.target.value
                      update({
                        ...draft,
                        decals: draft.decals.map((d, i) =>
                          i === layer
                            ? {
                                ...d,
                                asset,
                                zone: areas(asset).includes(d.zone) ? d.zone : areas(asset)[0],
                                scale: Math.min(d.scale, catalog.sponsors[asset].maxScale),
                              }
                            : d,
                        ),
                      })
                    }}
                    options={allowed.map((value) => ({
                      value,
                      label: catalog.sponsors[value]?.name || value,
                    }))}
                  />
                  <Select
                    label="Зона"
                    value={selected.zone}
                    onChange={(e) =>
                      update({
                        ...draft,
                        decals: draft.decals.map((d, i) =>
                          i === layer ? { ...d, zone: e.target.value, x: 0.5, y: 0.5 } : d,
                        ),
                      })
                    }
                    options={Object.entries(areaNames)
                      .filter(([id]) => areas(selected.asset).includes(id))
                      .map(([value, label]) => ({ value, label }))}
                  />
                  <div className="form-grid">
                    {[
                      ['x', 'По горизонтали', 0, 1, 0.01],
                      ['y', 'По вертикали', 0, 1, 0.01],
                      ['scale', 'Масштаб', 0.1, catalog.sponsors[selected.asset]?.maxScale || 1, 0.01],
                      ['angle', 'Поворот', -180, 180, 1],
                    ].map(([key, label, min, max, step]) => (
                      <label key={key}>
                        <span>{label}</span>
                        <input
                          type="number"
                          min={min}
                          max={max}
                          step={step}
                          value={Number(selected[key]).toFixed(key === 'angle' ? 0 : 2)}
                          onChange={(e) =>
                            changeDecal(key, Math.min(max, Math.max(min, Number(e.target.value))))
                          }
                        />
                      </label>
                    ))}
                  </div>
                  <div className="toolbar">
                    <Button
                      variant="ghost"
                      onClick={() => {
                        if (layer > 0) {
                          const a = [...draft.decals]
                          ;[a[layer - 1], a[layer]] = [a[layer], a[layer - 1]]
                          update({ ...draft, decals: a })
                          setLayer(layer - 1)
                        }
                      }}
                      disabled={layer === 0}
                    >
                      Ниже
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        if (layer < draft.decals.length - 1) {
                          const a = [...draft.decals]
                          ;[a[layer + 1], a[layer]] = [a[layer], a[layer + 1]]
                          update({ ...draft, decals: a })
                          setLayer(layer + 1)
                        }
                      }}
                      disabled={layer === draft.decals.length - 1}
                    >
                      Выше
                    </Button>
                    <Button
                      variant="danger"
                      onClick={() => {
                        update({
                          ...draft,
                          decals: draft.decals.filter((d, i) => i !== layer),
                        })
                        setLayer(0)
                      }}
                    >
                      Удалить
                    </Button>
                  </div>
                </fieldset>
              )}
            </div>
          )}
        </aside>
      </div>
      {dirty && (
        <div className="livery-savebar">
          <Button
            className="livery-preview"
            variant="secondary"
            onClick={() =>
              g.openDialog({
                title: 'Просмотр ливреи',
                wide: true,
                content: <RaceCar entryId={entry.id} livery={draft} />,
              })
            }
          >
            Просмотр
          </Button>
          <Button
            variant="ghost"
            onClick={() =>
              g.confirm({
                title: 'Вернуть стартовое оформление?',
                description:
                  'Цвета, рисунок и знаки будут взяты из исходного каталога. Изменение останется черновиком до сохранения.',
                onConfirm: () => update(catalog.entries[entry.id].livery),
              })
            }
          >
            Исходная
          </Button>
          <Button
            variant="ghost"
            onClick={() =>
              g.confirm({
                title: 'Сбросить черновик?',
                description: 'Несохранённые изменения этой машины будут отменены.',
                onConfirm: () => {
                  setDrafts((p) => {
                    const n = { ...p }
                    delete n[entry.id]
                    return n
                  })
                  setPast([])
                },
              })
            }
          >
            Сбросить
          </Button>
          <Button disabled={!/^\d{1,3}$/.test(draft.number)} onClick={save}>
            <Icon name="Save" />
            Сохранить ливрею
          </Button>
        </div>
      )}
    </>
  )
}
const units = {
  mass_kg: ['Масса', 'кг'],
  clearance_mm: ['Просвет под нагрузкой', 'мм'],
  lift_area_m2: ['Площадь прижима (ClA)', 'м²'],
  drag_area_m2: ['Площадь сопротивления (CdA)', 'м²'],
  thermal_margin_kw: ['Резерв охлаждения', 'кВт'],
  sustainable_wheel_kw: ['Длительная мощность на колёсах', 'кВт'],
  base_drag_area_m2: ['Сопротивление кузова (CdA)', 'м²'],
  inlet_area_m2: ['Сечение воздухозаборника', 'м²'],
  rejection_kw: ['Отвод тепла', 'кВт'],
  power_kw: ['Мощность', 'кВт'],
  heat_kw: ['Тепловыделение', 'кВт'],
  vertical_rate_n_mm: ['Жёсткость комплекта', 'Н/мм'],
  total_torque_nm: ['Суммарный тормозной момент', 'Н·м'],
  input_limit_nm: ['Допустимый входной момент', 'Н·м'],
  peak_torque_nm: ['Пиковый момент', 'Н·м'],
  brake_force_n: ['Предельная тормозная сила', 'Н'],
  friction_coefficient: ['Коэффициент сцепления', ''],
  loaded_radius_m: ['Радиус под нагрузкой', 'м'],
  design_clearance_mm: ['Расчётный просвет', 'мм'],
  wheel_rate_n_mm: ['Вертикальная жёсткость', 'Н/мм'],
  static_clearance_mm: ['Статический просвет', 'мм'],
  efficiency: ['КПД трансмиссии', ''],
}
const fmt = (n) => n.toLocaleString('ru-RU', { maximumFractionDigits: 3 })
function quantities(values) {
  return Object.entries(values).map(([k, v]) => [
    units[k]?.[0] ||
      {
        peak_torque_nm: 'Пиковый момент',
        fuel_g_kwh: 'Удельный расход',
        cooling_flow_kg_s: 'Поток охлаждения',
        design_life_km: 'Проектный ресурс',
        window_low_c: 'Нижняя граница окна',
        window_high_c: 'Верхняя граница окна',
        wear_mm_100km: 'Износ на 100 км',
        warmup_kj: 'Энергия прогрева',
        max_load_n: 'Предельная нагрузка',
        water_clearance_l_s: 'Отвод воды',
        first_ratio: 'Первая передача',
        top_ratio: 'Высшая передача',
        shift_ms: 'Время переключения',
        loss_heat_kw: 'Потери в тепло',
      }[k] ||
      k,
    fmt(v) +
      ' ' +
      (units[k]?.[1] ||
        {
          fuel_g_kwh: 'г/кВт·ч',
          cooling_flow_kg_s: 'кг/с',
          design_life_km: 'км',
          window_low_c: '°C',
          window_high_c: '°C',
          wear_mm_100km: 'мм',
          warmup_kj: 'кДж',
          max_load_n: 'Н',
          water_clearance_l_s: 'л/с',
          shift_ms: 'мс',
          loss_heat_kw: 'кВт',
        }[k] ||
        ''),
  ])
}
