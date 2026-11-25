import { useState } from 'react'
import { Building2, Flag, Factory, Zap, Cog, SlidersHorizontal, Plus } from 'lucide-react'
import { useGame, useUI } from '../ui/context'
import { Header, Choices, Panel, Stats, Button, Facts, Confirm, Progress, Table } from '../ui/components'
import { millions, type Series } from '../game'
import { Mandates, Capacity, Terms } from './PlanningForms'
function Allocation() {
  const { data, state, send } = useGame(),
    { close } = useUI(),
    [shares, setShares] = useState(state.shares)
  const total = Object.values(shares).reduce((a, b) => a + b, 0)
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (total === 100) {
          send({ type: 'allocate', shares })
          close()
        }
      }}
    >
      <p>Распределите 100% финансирования между программами.</p>
      {data.programs.map((p) => (
        <label key={p.id} className="field">
          {p.name}, %
          <input
            type="number"
            required
            min="0"
            max="100"
            value={Number.isNaN(shares[p.id]) ? '' : shares[p.id]}
            onChange={(e) => setShares({ ...shares, [p.id]: e.target.valueAsNumber })}
          />
        </label>
      ))}
      <p aria-live="polite">Сумма долей: {Number.isNaN(total) ? '—' : total}% из 100%</p>
      <button className="btn btn-primary" disabled={total !== 100}>
        Утвердить бюджет
      </button>
    </form>
  )
}
function Goal({ series }: { series: Series }) {
  const { state, send } = useGame(),
    { close } = useUI(),
    [value, setValue] = useState(state.goals[series])
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        send({ type: 'goal', series, value })
        close()
      }}
    >
      <label className="field">
        Цель на сезон
        <input required maxLength={90} value={value} onChange={(e) => setValue(e.target.value)} />
      </label>
      <button className="btn btn-primary" disabled={!value.trim()}>
        Сохранить цель
      </button>
    </form>
  )
}
function Banner({ production = false }: { production?: boolean }) {
  const Icon = production ? Factory : Building2
  return (
    <div className="management-role-banner">
      <span className="management-role-icon">
        <Icon aria-hidden="true" size={20} />
      </span>
      <div>
        <strong>
          {production ? 'Вы — производитель двигателей и коробок передач' : 'Вы — владелец VANTA Group'}
        </strong>
        <p>
          {production
            ? 'Контролируйте спецификации изделий, мощности и поставки клиентам.'
            : 'Финансируйте программы и определяйте цели руководителей. Гоночная тактика делегирована менеджерам.'}
        </p>
      </div>
      <span className="chip">{production ? 'ПРОИЗВОДИТЕЛЬ' : 'ВЛАДЕЛЕЦ'}</span>
    </div>
  )
}
export function Organization() {
  const { data, state, send } = useGame(),
    { open, go } = useUI(),
    [tab, setTab] = useState('programs')
  return (
    <section className="screen">
      <Header
        section="Кабинет владельца / VANTA Group"
        title="Организация"
        sub="Три программы. Одна гоночная философия."
      >
        <Button onClick={() => open('Полномочия руководителей', <Mandates />)}>Полномочия</Button>
        <Button primary onClick={() => open('Распределить бюджет', <Allocation />)}>
          <SlidersHorizontal aria-hidden="true" size={15} />
          Распределить бюджет
        </Button>
      </Header>
      <Banner />
      <Stats
        items={[
          ['Гоночные программы', '03', 'Формула · GT · Выносливость'],
          ['Общий резерв', millions(state.balanceCents), 'Доступно для инвестиций'],
          [
            'Стоимость группы',
            millions(data.reports.groupValue),
            data.reports.groupGrowth + ' к прошлому сезону',
          ],
          ['Доверие совета', data.reports.trust + ' / 100', 'Цели согласованы'],
        ]}
      />
      <div className="management-tabs">
        <Choices
          label="Управление организацией"
          items={[
            ['programs', 'Гоночные программы'],
            ['facilities', 'Инфраструктура'],
            ['goals', 'Цели и руководители'],
          ]}
          active={tab}
          onChange={setTab}
        />
      </div>
      {tab === 'programs' ? (
        <div className="management-program-grid">
          {data.programs.map((p) => (
            <article key={p.id} className="panel management-program" style={{ borderTopColor: p.color }}>
              <div className="management-program-top">
                <span className="management-program-glyph" style={{ color: p.color }}>
                  <Flag aria-hidden="true" />
                </span>
                <span className="chip">2028</span>
              </div>
              <div className="eyebrow">{p.series}</div>
              <h2>{p.name}</h2>
              <div className="management-program-rank">
                <strong>{p.rank}</strong>
                <span>
                  МЕСТО
                  <br />
                  <b>{p.points} очков</b>
                </span>
              </div>
              <Facts
                items={[
                  ['Руководитель', p.director],
                  ['Доля бюджета', state.shares[p.id] + '%'],
                  ['Цель сезона', state.goals[p.id]],
                ]}
              />
              <Progress value={state.shares[p.id]} />
              <Button
                onClick={() => {
                  send({ type: 'series', series: p.id })
                  go('world')
                }}
              >
                Открыть программу
              </Button>
            </article>
          ))}
        </div>
      ) : tab === 'facilities' ? (
        <div className="card-grid">
          {data.facilities.map((f) => (
            <Panel key={f.id} title={f.name}>
              <div className="panel-body">
                <p>{f.detail}</p>
                <Facts
                  items={[
                    ['Уровень', f.level + Number(state.facilities.includes(f.id))],
                    ['Инвестиция', millions(f.cost)],
                  ]}
                />
                <Button
                  disabled={state.facilities.includes(f.id) || f.cost > state.balanceCents}
                  onClick={() =>
                    open(
                      f.name,
                      <Confirm
                        action="Утвердить инвестицию"
                        onConfirm={() => send({ type: 'facility', id: f.id })}
                      >
                        Улучшить объект за {millions(f.cost)} из резерва группы?
                      </Confirm>,
                    )
                  }
                >
                  {state.facilities.includes(f.id) ? 'Объект улучшен' : 'Рассмотреть инвестицию'}
                </Button>
              </div>
            </Panel>
          ))}
        </div>
      ) : (
        <Panel title="Цели сезона">
          <Table
            label="Руководители"
            columns={['Программа', 'Руководитель', 'Цель', 'Действие']}
            rows={data.programs.map((p) => ({
              id: p.id,
              cells: [
                p.name,
                p.director,
                state.goals[p.id],
                <Button onClick={() => open(p.name, <Goal series={p.id} />)}>Изменить цель</Button>,
              ],
            }))}
          />
        </Panel>
      )}
    </section>
  )
}
export function Production() {
  const { data, state, send } = useGame(),
    { open, go } = useUI(),
    [tab, setTab] = useState('products')
  const startSpec = (id: string) => {
    const p = data.products.find((x) => x.id === id)!
    open(
      p.name,
      <Confirm action="Начать разработку" onConfirm={() => send({ type: 'spec', id })}>
        Открыть демонстрационный проект следующей спецификации {p.name} для клиентских команд?
      </Confirm>,
    )
  }
  return (
    <section className="screen">
      <Header
        title="Производство"
        section="Инженерная компания / VANTA Powertrain"
        sub="Создавайте технику, с которой выигрывают ваши клиенты."
      >
        <Button onClick={() => open('План производства', <Capacity />)}>
          <SlidersHorizontal aria-hidden="true" size={16} />
          Мощности
        </Button>
        <Button
          primary
          onClick={() =>
            open(
              'Разработать изделие',
              <>
                {data.products.map((p) => (
                  <div key={p.id} className="result">
                    <strong>{p.name}</strong>
                    <Button disabled={state.specs.includes(p.id)} onClick={() => startSpec(p.id)}>
                      {state.specs.includes(p.id) ? 'В разработке' : 'Выбрать'}
                    </Button>
                  </div>
                ))}
              </>,
            )
          }
        >
          <Plus aria-hidden="true" size={16} />
          Разработать изделие
        </Button>
      </Header>
      <Banner production />
      <Stats
        items={[
          ['Клиентские команды', '04', 'В трёх дисциплинах'],
          ['Загрузка производства', state.load + '%', 'Свободный резерв · ' + (100 - state.load) + '%'],
          ['Портфель заказов', millions(data.reports.orderBook), 'Исходные обязательства'],
          ['Надёжность поставок', data.reports.deliveryRate, 'За последние 12 месяцев'],
        ]}
      />
      <div className="management-tabs">
        <Choices
          label="Производство"
          items={[
            ['products', 'Линейка изделий'],
            ['orders', 'Заказы'],
            ['clients', 'Клиентские команды'],
          ]}
          active={tab}
          onChange={setTab}
        />
      </div>
      {tab === 'products' ? (
        <div className="management-product-grid">
          {data.products.map((p, i) => (
            <article className="panel" key={p.id}>
              <div className="management-product-visual">
                {i ? <Cog aria-hidden="true" size={76} /> : <Zap aria-hidden="true" size={76} />}
                <span />
              </div>
              <div className="management-product-body">
                <div className="eyebrow">{p.type}</div>
                <h2>{p.name}</h2>
                <p className="muted">{p.sub}</p>
                <div className="management-product-stats">
                  {[
                    ['Мощность', p.power],
                    ['Надёжность', p.reliability],
                    ['Эффективность', p.efficiency],
                  ].map(([n, v]) => (
                    <div key={n}>
                      <span>{n}</span>
                      <strong>
                        {v}
                        <small>/100</small>
                      </strong>
                      <Progress value={Number(v)} />
                    </div>
                  ))}
                </div>
                <div className="management-product-price">
                  <strong>{millions(state.terms[p.id].cents)}</strong>
                  <span>{state.terms[p.id].support}</span>
                </div>
                <Button onClick={() => open(p.name, <Terms id={p.id} />)}>Параметры</Button>{' '}
                <Button disabled={state.specs.includes(p.id)} onClick={() => startSpec(p.id)}>
                  {state.specs.includes(p.id) ? 'Спецификация в разработке' : 'Новая спецификация'}
                </Button>
              </div>
            </article>
          ))}
        </div>
      ) : tab === 'orders' ? (
        <Panel title="Заказы клиентов">
          <Table
            label="Заказы"
            columns={['Клиент', 'Изделие', 'Партия', 'Мощности', 'Состояние']}
            rows={data.orders.map((o) => {
              const accepted = state.orders.includes(o.id),
                done = state.completed.includes(o.id)
              return {
                id: o.id,
                cells: [
                  o.team,
                  o.product,
                  o.units + ' шт.',
                  o.load + '%',
                  <Button
                    disabled={done || (!accepted && o.load + state.load > 100)}
                    onClick={() =>
                      open(
                        o.team,
                        <Confirm
                          action={accepted ? 'Завершить заказ' : 'Принять заказ'}
                          onConfirm={() => send({ type: accepted ? 'finishOrder' : 'order', id: o.id })}
                        >
                          {o.product} · {o.units} шт. {accepted ? 'Освободится' : 'Потребуется'} {o.load}%
                          мощности.
                        </Confirm>,
                      )
                    }
                  >
                    {done ? 'Поставлено' : accepted ? 'Завершить заказ' : 'Рассмотреть заказ'}
                  </Button>,
                ],
              }
            })}
          />
        </Panel>
      ) : (
        <Panel
          title="Клиентские команды"
          action={<Button onClick={() => go('race')}>Наблюдать гонку</Button>}
        >
          <Table
            label="Клиенты"
            columns={['Команда', 'Серия', 'Изделие', 'Контракт до']}
            rows={data.clients.map((c) => ({ id: c.team, cells: [c.team, c.series, c.product, c.until] }))}
          />
        </Panel>
      )}
    </section>
  )
}
