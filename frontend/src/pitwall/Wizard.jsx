import React, { useEffect, useRef, useState } from 'react'
import { useGame, dateLabel, money } from './core'
import { Button, Badge, Icon, Tabs } from './ui'
import { RaceCar, PersonPortrait } from './visuals'

import { PaletteFields } from './BrandPalette'
import { organizationPalette } from './v2/brand'
import { OrganizationMark, identityVars } from './v2/identity'
const roles = [
  [
    'manager',
    'Менеджер команды',
    'Побеждать — ваша работа.',
    'Соберите людей, развивайте автомобиль и принимайте спортивные решения.',
    'f1-16',
  ],
  [
    'owner',
    'Владелец организации',
    'Постройте своё наследие.',
    'Финансируйте программы, назначайте руководителей и развивайте академию.',
    'f1-4',
  ],
  [
    'manufacturer',
    'Производитель',
    'Станьте силой за победой.',
    'Создавайте компоненты, работайте с клиентами и управляйте производством.',
    'freca-5',
  ],
]
export function Page({ children, back = 'menu', backText = 'Главное меню', onBack, style }) {
  const g = useGame()
  return (
    <div className="menu-page" style={style}>
      <header>
        <Button variant="ghost" onClick={() => (onBack ? onBack() : g.navigate(back))}>
          <Icon name="ArrowLeft" />
          {backText}
        </Button>
        <b>
          AUTOSPORT <i>SIM</i>
        </b>
      </header>
      <div className="menu-content">{children}</div>
      <footer>
        AUTOSPORT SIM / 2025 <span>PIT WALL / 02</span>
      </footer>
    </div>
  )
}
export function Wizard() {
  const g = useGame(),
    [step, setStep] = useState(0),
    [role, setRole] = useState(
      roles.some((r) => r[0] === g.preferredRole) ? g.preferredRole : 'manager',
    ),
    [series, setSeries] = useState('f1'),
    [org, setOrg] = useState(''),
    [q, setQ] = useState(''),
    [name, setName] = useState('Александр'),
    [country, setCountry] = useState('RU'),
    [seed, setSeed] = useState(42),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [palettes, setPalettes] = useState({})
  const w = g.world
  const orgs = Object.values(w.organizations).filter(
    (o) =>
      o.playable !== false &&
      o.programs.includes(series) &&
      o.kind === (role === 'manufacturer' ? 'supplier' : 'team'),
  )
  const current = orgs.find((o) => o.id === org) || orgs[0]
  const palette = current && role !== 'manager' ? palettes[current.id] : null
  const entryFor = (series, org) =>
    Object.values(w.entries).find((e) => e.championship === series && (!org || e.org === org))?.id
  useEffect(() => {
    document.querySelector('.menu-page')?.scrollTo(0, 0)
  }, [step])
  async function create(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await g.createCareer({
        name: name.trim(),
        country,
        role,
        series,
        org: current.id,
        seed: Number(seed),
        ...(palette ? {brand_palette:palette} : {}),
      })
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Page style={step > 1 && current ? identityVars(palette ? {...current,brand_palette:palette} : current) : undefined} backText="Назад" onBack={() => (step ? setStep(step - 1) : g.navigate('menu'))}>
      <nav className="wizard-steps">
        {['Роль', 'Чемпионат', 'Организация', 'Ваш профиль'].map((s, i) => (
          <button
            key={s}
            disabled={i > step}
            onClick={() => setStep(i)}
            className={step === i ? 'active' : ''}
          >
            <span>{i < step ? '✓' : String(i + 1).padStart(2, '0')}</span>
            {s}
          </button>
        ))}
      </nav>
      <span className="eyebrow">Новая карьера / 2025</span>
      <h1>
        {
          [
            'С какой стороны пит-лейна?',
            'Выберите арену.',
            'Ваша следующая глава.',
            'Представьтесь паддоку.',
          ][step]
        }
      </h1>
      <p className="menu-lead">
        {
          [
            'Три роли меняют ваш круг решений. Мир и его правила остаются общими.',
            'От первых шагов в формулах до мировых чемпионатов. У каждой серии свои люди, машины и правила.',
            'Выберите действующую организацию. Её сотрудники, обязательства и техническая программа станут вашей отправной точкой.',
            'Карьера начнётся 1 февраля 2025 года. До первых стартов есть время познакомиться с людьми и подготовить программу.',
          ][step]
        }
      </p>
      {step === 0 && (
        <div className="role-grid">
          {roles.map(([id, t, tag, d, e]) => (
            <button
              className="role-card"
              key={id}
              onClick={() => {
                setRole(id)
                setStep(1)
              }}
            >
              <RoleChoiceArt role={id} entry={e} />
              <div>
                <span>{tag}</span>
                <h2>{t}</h2>
                <p>{d}</p>
                <b>
                  Выбрать роль <Icon name="ArrowRight" />
                </b>
              </div>
            </button>
          ))}
        </div>
      )}
      {step === 1 && (
        <div className="series-grid">
          {Object.values(w.championships).map((s) => (
            <button
              className="series-card"
              key={s.id}
              onClick={() => {
                if (s.playable === false) {
                  g.openDialog({
                    title: s.name,
                    description:
                      'Этот картинговый чемпионат развивается в общем мире. Сейчас собственная карьера здесь не создаётся.',
                  })
                  return
                }
                setSeries(s.id)
                setOrg('')
                setQ('')
                setOrg('')
                setStep(2)
              }}
            >
              <small>{s.discipline}</small>
              <h2>{s.name}</h2>
              {entryFor(s.id) && g.data.catalog?.entries?.[entryFor(s.id)] && (
                <RaceCar entryId={entryFor(s.id)} studio={false} />
              )}
              <footer>
                <span>
                  Заявки · {Object.values(w.entries).filter((e) => e.championship === s.id).length}
                </span>
                <Badge>{s.playable === false ? 'Юниорский мир' : 'Сезон 2025'}</Badge>
              </footer>
            </button>
          ))}
        </div>
      )}
      {step === 2 && (
        <>
          <div className="toolbar">
            <Badge tone="accent">{w.championships[series].name}</Badge>
            <input
              aria-label="Найти организацию"
              placeholder="Найти организацию"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <span>Организации: {orgs.length}</span>
          </div>
          <div className="org-grid">
            {orgs
              .filter((o) => o.name.toLowerCase().includes(q.toLowerCase()))
              .map((o) => (
                <button
                  className={'org-card ' + (o.id === current?.id ? 'selected' : '')}
                  style={identityVars(o)}
                  key={o.id}
                  aria-pressed={o.id === current?.id}
                  onClick={() => setOrg(o.id)}
                >
                  <small>
                    {w.countries[o.country] || o.country} · {o.base}
                  </small>
                  <h2>{o.name}</h2>
                  {entryFor(series, o.id) ? (
                    <RaceCar entryId={entryFor(series, o.id)} studio={false} />
                  ) : (
                    <div className="maker-symbol">
                      <Icon name="Workflow" size={56} />
                      <span>
                        {(o.lines || [])
                          .map(
                            (l) =>
                              ({
                                engine: 'Силовые установки',
                                gearbox: 'Трансмиссии',
                                transmission: 'Трансмиссии',
                                tyres: 'Шины',
                                tyre: 'Шины',
                              })[l] || l,
                          )
                          .join(' / ')}
                      </span>
                    </div>
                  )}
                  <p>
                    {role === 'manufacturer' ? 'Производитель компонентов' : 'Гоночная программа'} ·{' '}
                    {w.championships[series].name}
                  </p>
                </button>
              ))}
          </div>
          <div className="wizard-next">
            <strong>{current?.name}</strong>
            <Button disabled={!current} onClick={() => setStep(3)}>
              Продолжить <Icon name="ArrowRight" />
            </Button>
          </div>
        </>
      )}
      {step === 3 && (
        <div className="profile-layout">
          <form className="stack" onSubmit={create}>
            <label>
              <span>Ваше имя</span>
              <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={64} />
            </label>
            <label>
              <span>Гражданство</span>
              <select value={country} onChange={(e) => setCountry(e.target.value)}>
                {Object.entries(w.countries)
                  .sort((a, b) => a[1].localeCompare(b[1], 'ru'))
                  .map(([id, n]) => (
                    <option key={id} value={id}>
                      {n}
                    </option>
                  ))}
              </select>
            </label>
            <details>
              <summary>Параметры мира</summary>
              <label>
                <span>Seed мира</span>
                <input
                  aria-label="Seed мира"
                  type="number"
                  min="0"
                  max="4294967295"
                  step="1"
                  required
                  value={seed}
                  onChange={(e) => setSeed(e.target.value)}
                />
                <small>Одинаковое значение воспроизводит стартовые параметры.</small>
              </label>
            </details>
            {role !== 'manager' && <details className="wizard-brand"><summary>Фирменные цвета организации</summary>
              <PaletteFields org={current} value={palette || organizationPalette(current)} onChange={next=>setPalettes(prev=>({...prev,[current.id]:next}))}/>
            </details>}
            <p className="profile-note">
              Единый игровой мир развивается вместе с вашей карьерой. Гражданство влияет на публичный
              профиль персонажа.
            </p>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy ? 'Создаём игровой мир…' : 'Начать карьеру'}
              <Icon name="ArrowRight" />
            </Button>
          </form>
          <aside className="panel">
            <div className="panel-body stack">
              <span className="eyebrow">Ваша отправная точка</span>
              <h2>{current.name}</h2>
              {entryFor(series, current.id) && <RaceCar entryId={entryFor(series, current.id)} />}
              <p>{roles.find((r) => r[0] === role)[1]}</p>
              <strong>{w.championships[series].name}</strong>
              <small>1 февраля 2025 · мир {seed}</small>
            </div>
          </aside>
        </div>
      )}
    </Page>
  )
}

function RoleChoiceArt({ role, entry }) {
  const g = useGame()
  if (role === 'manager') return <RaceCar entryId={entry} />
  const team = g.world.entries[entry]?.org
  const car = g.world.cars[g.world.entries[entry]?.car]
  const suppliers = [...new Set(Object.values(car?.suppliers || {}))].slice(0,2)
  const manager = Object.values(g.world.assignments).find(a => a.position === 'manager' && a.org === team)?.person
  return (
    <div className={'role-choice-art role-art-' + role}>
      {role === 'owner' ? (
        <>
          {team && <OrganizationMark orgId={team} size={45} />}
          <span>СОВЕТ ОРГАНИЗАЦИИ</span>
          <strong>
            Капитал.
            <br />
            Люди.
            <br />
            Направление.
          </strong>
          {manager && <PersonPortrait id={manager} />}
          <small>Цели → полномочия → оценка</small>
        </>
      ) : (
        <>
          <div className="maker-marks">
            {suppliers.map(id=><OrganizationMark key={id} orgId={id} size={43}/>)}
          </div>
          <span>ПРОМЫШЛЕННАЯ ПРОГРАММА</span>
          <strong>
            Ваша техника.
            <br />
            Их результат.
          </strong>
          <Icon name="Factory" size={70} />
          <small>Продукция · мощности · клиенты</small>
        </>
      )}
    </div>
  )
}
