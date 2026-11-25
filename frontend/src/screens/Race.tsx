import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Flag, Play, Pause, Radio, Sun } from 'lucide-react'
import { useGame, useUI } from '../ui/context'
import { Header, Button, Choices, Panel, Facts, Progress, Confirm } from '../ui/components'
const course =
  'M91 232 C49 216 56 155 76 118 Q96 76 156 70 C203 62 237 85 271 77 S366 44 408 62 L450 86 Q482 105 450 120 C423 132 357 109 325 121 Q297 137 331 148 L395 169 Q426 185 398 200 C371 219 330 200 307 182 Q273 155 249 178 L215 201 Q195 216 176 205 L155 192 Q142 184 128 204 L113 227 Q103 239 91 232 Z'
function Circuit({ selected, select }: { selected: string; select: (id: string) => void }) {
  const { state, data } = useGame(),
    path = useRef<SVGPathElement>(null),
    [positions, setPositions] = useState<{ x: number; y: number }[]>([])
  useLayoutEffect(() => {
    const line = path.current!,
      length = line.getTotalLength(),
      offset = data.frames[state.frame].offset
    setPositions(
      data.grid.map((d) => {
        const pos = line.getPointAtLength(((1.57 + offset - d.gap / 90) % 1) * length)
        return { x: pos.x, y: pos.y }
      }),
    )
  }, [state.frame, data])
  return (
    <svg className="circuit-map" viewBox="20 24 480 232" role="group" aria-label="Карта Лазурного кольца">
      <defs>
        <pattern id="grid" width="16" height="16" patternUnits="userSpaceOnUse">
          <path d="M16 0H0V16" fill="none" stroke="#33404d" strokeWidth=".45" />
        </pattern>
      </defs>
      <rect width="540" height="300" fill="url(#grid)" />
      <path d={course} fill="none" stroke="#404d5b" strokeWidth="10" />
      <path ref={path} d={course} fill="none" stroke="#13181e" strokeWidth="7" />
      <path d={course} fill="none" stroke="#7b8794" strokeWidth=".8" strokeDasharray="3 3" />
      <g fill="#86939f" fontSize="9" letterSpacing="1.4">
        <text x="108" y="145">
          CÔTE D’AZUR
        </text>
        <text x="86" y="56">
          СЕКТОР 1
        </text>
        <text x="396" y="46">
          СЕКТОР 2
        </text>
        <text x="244" y="235">
          СЕКТОР 3
        </text>
      </g>
      {data.grid.map((d, i) => {
        const point = positions[i]
        return (
          point && (
            <g
              key={d.id}
              role="button"
              aria-label={'На карте: ' + d.name}
              tabIndex={0}
              onClick={() => select(d.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  select(d.id)
                }
              }}
              transform={'translate(' + point.x + ' ' + point.y + ')'}
            >
              <circle
                r={5}
                stroke={d.id === selected ? 'white' : '#13181e'}
                strokeWidth={d.id === selected ? 2 : 1}
                fill={d.color}
              />
              {d.id === selected && (
                <text y="-10" fill="#fff" textAnchor="middle" fontSize="10">
                  {d.code}
                </text>
              )}
            </g>
          )
        )
      })}
    </svg>
  )
}
function PitPlan({ id }: { id: string }) {
  const { state, send } = useGame(),
    { close } = useUI(),
    [tyre, setTyre] = useState('Medium')
  return (
    <>
      <label className="field">
        Состав шин
        <select value={tyre} onChange={(e) => setTyre(e.target.value)}>
          {['Soft', 'Medium', 'Hard'].map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </label>
      <p>Записать остановку в демонстрационный план экипажа.</p>
      <div className="form-actions">
        <Button onClick={close}>Отмена</Button>
        <Button
          primary
          onClick={() => {
            send({ type: 'strategy', id, field: 'pit', value: tyre })
            close()
          }}
        >
          {state.strategy[id].pit ? 'Изменить план' : 'Подтвердить пит-стоп'}
        </Button>
      </div>
    </>
  )
}
function Driver({ id, select }: { id: 'kel' | 'web'; select: (id: string) => void }) {
  const { state, data, send } = useGame(),
    { open } = useUI(),
    car = data.raceCars[id],
    p = data.people.find((p) => p.id === car.personId)!,
    driver = data.grid.find((d) => d.id === id)!,
    cmd = state.strategy[id]
  return (
    <article className="race-driver">
      <div className="race-driver-heading">
        <button className="race-driver-identity" onClick={() => select(id)}>
          <span className="race-number">{p.number}</span>
          <span>
            <small>{p.name.split(' ')[0]}</small>
            <strong>{p.name.split(' ')[1].toUpperCase()}</strong>
          </span>
        </button>
        <strong>P{driver.position}</strong>
      </div>
      <Facts
        items={[
          ['Последний круг', car.lastLap],
          ['Шины', driver.tyre + ' · ресурс ' + driver.life + '%'],
          ['Запас энергии', car.energy + '%'],
        ]}
      />
      <Progress value={driver.life} />
      {state.role === 'manager' ? (
        <>
          <div className="race-command-label">Темп пилота</div>
          <Choices
            segmented
            label={'Темп ' + p.name}
            items={['Экономия', 'Баланс', 'Атака'].map((v) => [v, v])}
            active={cmd.pace}
            onChange={(value) => send({ type: 'strategy', id, field: 'pace', value })}
          />
          <div className="race-driver-actions">
            <label>
              Энергия
              <select
                value={cmd.energy}
                onChange={(e) => send({ type: 'strategy', id, field: 'energy', value: e.target.value })}
              >
                {['Баланс', 'Накопление', 'Расход'].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            {cmd.pit ? (
              <Button
                onClick={() =>
                  open(
                    'Отменить пит-стоп?',
                    <Confirm
                      action="Отменить остановку"
                      onConfirm={() => send({ type: 'strategy', id, field: 'pit', value: '' })}
                    >
                      {p.name} · план {cmd.pit}
                    </Confirm>,
                  )
                }
              >
                Отменить · {cmd.pit}
              </Button>
            ) : (
              <Button onClick={() => open('План пит-стопа · ' + p.name, <PitPlan id={id} />)}>
                Пит-стоп
              </Button>
            )}
          </div>
        </>
      ) : (
        <div className="race-delegated">Тактика делегирована менеджеру</div>
      )}
    </article>
  )
}
export function Race() {
  const { data, state, send } = useGame(),
    { open } = useUI(),
    [selected, select] = useState('kel'),
    [playing, play] = useState(false),
    [speed, setSpeed] = useState('1'),
    [intervals, toggle] = useState(false)
  const frame = data.frames[state.frame],
    current = data.grid.find((d) => d.id === selected)!
  useEffect(() => {
    if (!playing) return
    const timer = setInterval(() => send({ type: 'nextFrame' }), 8000 / Number(speed))
    return () => clearInterval(timer)
  }, [playing, speed, send])
  return (
    <section className="race-screen">
      <Header
        section="Гоночный уик-энд / Этап 06 · Formula World"
        title="Гоночный центр"
        sub="Гран-при Лазурного берега · 21 мая 2028"
      >
        <Button
          onClick={() =>
            open(
              'Брифинг перед этапом',
              <>
                <Facts
                  items={[
                    ['Трасса', 'Лазурное кольцо · 4,82 км'],
                    ['Дистанция', '58 кругов'],
                    ['Стартовый план', 'Medium → Hard'],
                    ['Цель', 'Обе машины в первой восьмёрке'],
                  ]}
                />
                <p>
                  Четыре постановочных кадра демонстрируют тайминг и радио. Команды записываются в план
                  показа.
                </p>
              </>,
            )
          }
        >
          <Flag aria-hidden="true" size={15} />
          Брифинг
        </Button>
      </Header>
      <div className="race-sessionbar">
        <div className="race-session-state">
          <i className="race-status-light" />
          {playing ? 'ПОКАЗ КАДРОВ' : 'ПОКАЗ НА ПАУЗЕ'}
          <span className="race-demo-label">Демонстрация гонки</span>
        </div>
        <div className="race-session-controls">
          <span className="race-clock">{frame.clock}</span>
          <Choices
            segmented
            label="Скорость показа"
            items={['1', '4', '16'].map((v) => [v, v + '×'])}
            active={speed}
            onChange={setSpeed}
          />
          <button className="race-play" onClick={() => play(!playing)}>
            {playing ? <Pause aria-hidden="true" size={14} /> : <Play aria-hidden="true" size={14} />}{' '}
            {playing ? 'Пауза' : 'Начать показ'}
          </button>
        </div>
      </div>
      <div className="race-layout">
        <div>
          <div className="race-map-panel">
            <div className="race-map-top">
              <div className="race-lap">
                <span>КРУГ</span>
                <strong>{frame.lap}</strong>
                <small>/ 58</small>
              </div>
              <div className="race-conditions">
                <span>
                  <Sun aria-hidden="true" size={17} /> 26°
                </span>
                <span>Трасса 38°</span>
              </div>
            </div>
            <div className="race-map-stage">
              <Circuit {...{ selected, select }} />
            </div>
            <div className="race-map-footer">
              <span>4,82 км · 18 поворотов</span>
              <b>
                {current.code} · P{current.position}
              </b>
            </div>
          </div>
          <div className="race-driver-grid">
            <Driver id="kel" select={select} />
            <Driver id="web" select={select} />
          </div>
        </div>
        <section className="race-timing">
          <div className="race-panel-heading">
            <h2>Хронометраж</h2>
            <button className="race-text-button" onClick={() => toggle(!intervals)}>
              {intervals ? 'Интервалы' : 'От лидера'}
            </button>
          </div>
          <div className="race-table-head">
            <span>П.</span>
            <span>Пилот</span>
            <span>{intervals ? 'Интервал' : 'Отрыв'}</span>
            <span>Шины</span>
          </div>
          <div className="race-timing-rows">
            {data.grid.map((d, i) => (
              <button
                key={d.id}
                aria-pressed={selected === d.id}
                className={'race-timing-row ' + (selected === d.id ? 'is-selected' : '')}
                onClick={() => select(d.id)}
              >
                <span>{d.position}</span>
                <span
                  className="race-timing-driver"
                  style={{ borderLeft: '2px solid ' + d.color, paddingLeft: 7 }}
                >
                  {d.name}
                </span>
                <span className="mono">
                  {i ? '+' + (intervals ? d.interval : d.gap).toFixed(3) : 'Лидер'}
                </span>
                <span>
                  {d.tyre} · {d.life}%
                </span>
              </button>
            ))}
          </div>
        </section>
      </div>
      <div className="race-bottom-grid">
        <Panel title="Командное радио" action={<Radio aria-hidden="true" size={16} />}>
          {[...state.radio, { lap: frame.lap, text: frame.radio }].map((line, i) => (
            <div className="result" key={i}>
              <strong>К{line.lap}</strong>
              <span>{line.text}</span>
            </div>
          ))}
        </Panel>
        <Panel title="Стратегия дистанции">
          <div className="panel-body">
            <div className="eyebrow">План A / сухая трасса</div>
            <div className="stints">
              <span>Medium · 1–25</span>
              <span>Hard · 26–58</span>
            </div>
            <p className="muted">Плановое окно остановки на 25-м круге. Условия показа фиксированы.</p>
          </div>
        </Panel>
      </div>
    </section>
  )
}
