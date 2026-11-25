import { useState } from 'react'
import { Check, ShieldCheck, Wrench } from 'lucide-react'
import { useGame, useUI } from '../ui/context'
import { Header, Panel, Button, Choices, Facts, Progress, Confirm } from '../ui/components'
export function Garage() {
  const { state, data, send } = useGame(),
    { open } = useUI(),
    [tab, setTab] = useState('overview')
  const car = data.cars[state.series],
    series = data.world[state.series],
    parts = car.parts
  const partners = state.partnerSigned ? [...data.sponsors, data.partner] : data.sponsors
  return (
    <section className="screen">
      <Header
        title="Гараж"
        section={'Технический центр / ' + series.title}
        sub="Каждая деталь имеет значение."
      >
        <span className="chip green">
          <ShieldCheck aria-hidden="true" size={15} />
          Допущен к гонке
        </span>
      </Header>
      <Choices
        label="Гараж"
        items={[
          ['overview', 'Обзор'],
          ['livery', 'Ливрея'],
          ['sponsors', 'Спонсоры'],
          ['parts', 'Компоненты'],
        ]}
        active={tab}
        onChange={setTab}
      />
      <div className="garage-layout">
        <section className="garage-scene panel">
          <header>
            <div className="eyebrow">{series.title} / 2028</div>
            <h2>{car.model}</h2>
            <p>{car.team.toUpperCase()}</p>
            <span className="chip">ШАССИ {car.chassis} / ГОТОВ</span>
          </header>
          <button
            className="car-photo"
            aria-label={'Рассмотреть боковой вид ' + car.model}
            onClick={() =>
              open(
                car.model + ' · боковой вид',
                <img
                  className="full-car"
                  alt={car.team + ' ' + car.model + ' строго сбоку под прожекторами гаража'}
                  src={car.image}
                />,
              )
            }
          >
            <img src={car.image} alt={'Боковой вид ' + car.model + ', номер ' + car.number} />
          </button>
          <footer>
            <span>ГАРАЖ 01</span>
            <span>
              {car.driver.toUpperCase()} · #{car.number}
            </span>
          </footer>
        </section>
        <aside className="stack">
          {tab === 'overview' ? (
            <>
              <Panel title="Состояние болида">
                <div className="panel-body">
                  <div className="car-rating">
                    <b>{car.rating}</b>
                    <span>
                      Рейтинг автомобиля<small>{car.rank}-я машина в пелотоне</small>
                    </span>
                  </div>
                  <h3>Готовность к этапу</h3>
                  {['Техническая проверка пройдена', 'Ливрея утверждена', 'Комплект шин получен'].map(
                    (v) => (
                      <p className="checkline" key={v}>
                        <Check aria-hidden="true" size={14} />
                        {v}
                      </p>
                    ),
                  )}
                </div>
              </Panel>
              <Panel title="Ресурс компонентов">
                <div className="panel-body">
                  {parts.slice(0, 3).map((c) => (
                    <div className="metric" key={c.name}>
                      <span>
                        {c.name}
                        <b>{c.life}%</b>
                      </span>
                      <Progress value={c.life} />
                    </div>
                  ))}
                  <Button onClick={() => setTab('parts')}>
                    <Wrench aria-hidden="true" size={14} />
                    Все компоненты
                  </Button>
                </div>
              </Panel>
            </>
          ) : tab === 'livery' ? (
            <Panel title="Паспорт ливреи">
              <div className="panel-body">
                <div className="eyebrow">VANTA / FACTORY SPEC</div>
                <h2>{car.livery}</h2>
                <div className="swatches">
                  {car.colors.map(([c, n]) => (
                    <span key={n}>
                      <i style={{ background: c }} />
                      {n}
                    </span>
                  ))}
                </div>
                <Facts
                  items={[
                    ['Номер', car.number],
                    ['Шаблон', car.model + ' · ' + series.short],
                    ['Покрытие', 'Сатин'],
                  ]}
                />
                <p className="modal-callout">
                  Статичный боковой вид. Редактор окраски, масок и декалей запланирован в задаче #4.
                </p>
              </div>
            </Panel>
          ) : tab === 'sponsors' ? (
            <Panel title="Партнёры и зоны">
              {partners.map((s) => (
                <div className="result" key={s.name}>
                  <strong>{s.name}</strong>
                  <span>{s.zone}</span>
                </div>
              ))}
              <p className="panel-body muted">
                Список демонстрирует условия размещения. Изображение показывает заводскую ливрею.
              </p>
            </Panel>
          ) : (
            <Panel title="Установленные компоненты">
              {parts.map((c) => (
                <div className="part" key={c.name}>
                  <div className="eyebrow">{c.model}</div>
                  <h3>{c.name}</h3>
                  <div className="metric">
                    <span>
                      Ресурс<b>{c.life}%</b>
                    </span>
                    <Progress value={c.life} />
                  </div>
                  {state.role === 'manager' && (
                    <Button
                      disabled={state.inspected.includes(state.series + ':' + c.model)}
                      onClick={() =>
                        open(
                          c.name,
                          <Confirm
                            action="Отметить проверку"
                            onConfirm={() => send({ type: 'inspect', id: state.series + ':' + c.model })}
                          >
                            Подтвердить осмотр {c.model} перед этапом?
                          </Confirm>,
                        )
                      }
                    >
                      {state.inspected.includes(state.series + ':' + c.model)
                        ? 'Осмотр пройден'
                        : 'Проверить компонент'}
                    </Button>
                  )}
                </div>
              ))}
            </Panel>
          )}
        </aside>
      </div>
    </section>
  )
}
