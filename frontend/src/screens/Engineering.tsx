import { useState } from 'react'
import {
  DraftingCompass,
  Layers,
  Users,
  Plus,
  Download,
  Handshake,
  Wallet,
  ChartNoAxesCombined,
  Clock3,
} from 'lucide-react'
import { useGame, useUI } from '../ui/context'
import { Header, Choices, Panel, Stats, Button, Table, Facts, Confirm, Progress } from '../ui/components'
import { millions, eur, dateLabel } from '../game'
import { Engineers } from './PlanningForms'
function ProjectPicker() {
  const { data, state, send } = useGame(),
    { open } = useUI()
  return (
    <>
      {data.projects.slice(2).map((p) => (
        <div className="result" key={p.id}>
          <div>
            <small>{p.category}</small>
            <strong>{p.name}</strong>
            <p>
              {p.days} дней · {millions(p.cost)}
            </p>
          </div>
          <Button
            disabled={state.projects.some((x) => x.id === p.id) || p.cost > state.balanceCents}
            onClick={() =>
              open(
                p.name,
                <Confirm action="Начать разработку" onConfirm={() => send({ type: 'project', id: p.id })}>
                  <p>{p.description}</p>
                  <Facts
                    items={[
                      ['Стоимость', millions(p.cost)],
                      ['Инженеры', p.engineers],
                      ['Срок', p.days + ' дней'],
                      ['Ожидаемый эффект', p.gain],
                    ]}
                  />
                </Confirm>,
              )
            }
          >
            {state.projects.some((x) => x.id === p.id) ? 'В программе' : 'Выбрать'}
          </Button>
        </div>
      ))}
    </>
  )
}
function Radar() {
  return (
    <svg
      viewBox="0 0 320 205"
      role="img"
      aria-label="Профиль V28: аэродинамика 88, надёжность 82, скорость 90, шасси 84, охлаждение 76"
      className="chart-svg"
    >
      <g transform="translate(160 104)" stroke="#363e49" fill="none">
        {[1, 0.75, 0.5, 0.25].map((k) => (
          <polygon key={k} transform={'scale(' + k + ')'} points="0,-72 76,-22 47,60 -47,60 -76,-22" />
        ))}
        <polygon points="0,-61 56,-17 40,52 -38,50 -61,-19" stroke="#c65b71" fill="#9d3d552f" />
      </g>
      <g fill="#a4afbe" textAnchor="middle" fontSize="10">
        <text x="160" y="18">
          Аэродинамика
        </text>
        <text x="265" y="78">
          Надёжность
        </text>
        <text x="224" y="188">
          Скорость
        </text>
        <text x="98" y="188">
          Шасси
        </text>
        <text x="57" y="78">
          Охлаждение
        </text>
      </g>
    </svg>
  )
}
export function Development() {
  const { state, data, send } = useGame(),
    { open, go } = useUI(),
    manager = state.role === 'manager'
  return (
    <section className="screen">
      <Header
        section="Технический центр / V28"
        title="Разработка"
        sub="От первого расчёта до преимущества на трассе."
      >
        <Button onClick={() => open('Распределение инженеров', <Engineers />)}>
          <Users aria-hidden="true" size={15} />
          Инженеры
        </Button>
        {manager && (
          <Button primary onClick={() => open('Новый проект', <ProjectPicker />)}>
            <Plus aria-hidden="true" size={15} />
            Новый проект
          </Button>
        )}
      </Header>
      <Stats
        items={[
          [
            'Текущие проекты',
            String(state.projects.filter((p) => !p.installed).length).padStart(2, '0'),
            'Программа модернизации',
            <Layers aria-hidden="true" size={15} />,
          ],
          [
            'Инженерный состав',
            Object.values(state.engineers).reduce((sum, n) => sum + n, 0) + ' / 60',
            'Опыт команды · 86/100',
            <Users aria-hidden="true" size={15} />,
          ],
          [
            'Бюджет разработок',
            millions(data.reports.developmentBudget),
            'План на сезон · ' + millions(data.reports.developmentPlan),
            <Wallet aria-hidden="true" size={15} />,
          ],
          [
            'Темп развития',
            data.reports.paceGain,
            'С начала сезона',
            <ChartNoAxesCombined aria-hidden="true" size={15} />,
          ],
        ]}
      />
      <div className="management-dev-layout">
        <div>
          <div className="management-section-label">
            <h2>Программа модернизации</h2>
            <span className="muted">{state.projects.length} проекта</span>
          </div>
          <div className="management-projects">
            {state.projects.map((p) => (
              <article key={p.id} className="panel management-project">
                <div className="management-project-icon">
                  <DraftingCompass aria-hidden="true" />
                </div>
                <div className="management-project-info">
                  <div className="management-project-heading">
                    <div>
                      <div className="eyebrow">{p.category}</div>
                      <h2>{p.name}</h2>
                    </div>
                    <span className="chip">{p.progress}%</span>
                  </div>
                  <p>{p.description}</p>
                  <Progress value={p.progress} />
                  <div className="management-project-details">
                    <span>
                      <Users aria-hidden="true" size={13} />
                      {p.engineers} инженеров
                    </span>
                    <span>
                      <Clock3 aria-hidden="true" size={13} />
                      {p.days} дн.
                    </span>
                    <strong>{p.gain}</strong>
                  </div>
                  <div className="management-project-bottom">
                    <span className="muted">
                      {p.installed
                        ? 'Установлено'
                        : p.days
                          ? 'Испытания и разработка'
                          : 'Готов к установке'}
                    </span>
                    <Button
                      className="btn-sm"
                      onClick={() =>
                        open(
                          p.name,
                          <>
                            <p>{p.description}</p>
                            <Facts
                              items={[
                                ['Срок', p.days + ' дн.'],
                                ['Готовность', p.progress + '%'],
                                ['Стоимость', millions(p.cost)],
                                ['Целевой эффект', p.gain],
                              ]}
                            />
                            {manager && !p.installed && !p.days && (
                              <Confirm
                                action="Установить"
                                onConfirm={() => send({ type: 'install', id: p.id })}
                              >
                                Установить обновление на демонстрационное шасси?
                              </Confirm>
                            )}
                          </>,
                        )
                      }
                    >
                      {!p.days && !p.installed && manager ? 'Установить' : 'Подробности'}
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
        <aside>
          <Panel title="Баланс характеристик V28">
            <div className="management-radar-wrap">
              <Radar />
            </div>
          </Panel>
          <article className="panel management-advisor">
            <div className="management-advisor-head">
              <img alt="" src="/assets/morozova.webp" />
              <div>
                <strong>Елена Морозова</strong>
                <small>Технический директор</small>
              </div>
            </div>
            <blockquote>
              «Главный резерв — работа днища в медленных поворотах. Следующая проверка перед квалификацией».
            </blockquote>
            <Button onClick={() => go('calendar')}>Посмотреть календарь</Button>
          </article>
        </aside>
      </div>
    </section>
  )
}
export function Finance() {
  const { data, state, send } = useGame(),
    { go, open } = useUI(),
    [tab, setTab] = useState('overview')
  const partners = state.partnerSigned ? [...data.sponsors, data.partner] : data.sponsors
  const ledger = (
    <Table
      label="Журнал операций"
      columns={['Дата', 'Операция', 'Движение средств']}
      rows={state.ledger.map((l) => ({
        id: l.id,
        cells: [
          dateLabel(l.date),
          l.label,
          <strong className={l.cents > 0 ? 'positive' : 'negative'}>
            {l.cents > 0 ? '+' : ''}
            {eur(l.cents / 100)}
          </strong>,
        ],
      }))}
    />
  )
  function exportReport() {
    const blob = new Blob(
      [
        '\uFEFF' +
          [
            'Дата;Операция;Сумма (евро)',
            ...state.ledger.map((l) => [l.date, l.label, l.cents / 100].join(';')),
          ].join('\r\n'),
      ],
      { type: 'text/csv;charset=utf-8' },
    )
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'apex-demo-ledger.csv'
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return (
    <section className="screen">
      <Header
        title="Финансы"
        section="Бизнес / VANTA Group"
        sub="Ресурсы команды. Сегодня и на дистанции сезона."
      >
        <Button onClick={exportReport}>
          <Download aria-hidden="true" size={15} />
          Выгрузить отчёт
        </Button>
        {state.role !== 'manufacturer' && (
          <Button
            primary
            disabled={state.partnerSigned}
            onClick={() =>
              open(
                'Предложение HELIX',
                <Confirm action="Подписать контракт" onConfirm={() => send({ type: 'partner' })}>
                  <p>
                    Техническое партнёрство до 2030 года. Аванс €1,2 млн появится в демонстрационном
                    журнале.
                  </p>
                  <Facts
                    items={[
                      ['Зона', data.partner.zone],
                      ['Стоимость сезона', '€2,4 млн'],
                    ]}
                  />
                </Confirm>,
              )
            }
          >
            <Handshake aria-hidden="true" size={15} />
            {state.partnerSigned ? 'HELIX подписан' : 'Предложения партнёров'}
          </Button>
        )}
      </Header>
      <Stats
        items={[
          ['Доступные средства', millions(state.balanceCents), 'Общий резерв VANTA Group'],
          [
            'Бюджет сезона',
            millions(data.reports.annualBudget),
            'Освоено ' + data.reports.annualUsed + '% годового плана',
          ],
          [
            'Спонсорские контракты',
            millions(partners.reduce((sum, p) => sum + Math.round(p.sum * 100000000), 0)),
            partners.length + ' действующих партнёра',
          ],
          ['Прогноз на конец года', millions(data.reports.forecast), 'Исходный демонстрационный план'],
        ]}
      />
      <div className="management-tabs">
        <Choices
          label="Финансовые отчёты"
          items={[
            ['overview', 'Обзор бюджета'],
            ['sponsors', 'Спонсоры и контракты'],
            ['ledger', 'Все операции'],
          ]}
          active={tab}
          onChange={setTab}
        />
      </div>
      {tab === 'sponsors' ? (
        <div className="card-grid">
          {partners.map((s) => (
            <Panel key={s.name} title={s.name} action={<span className="chip green">Действует</span>}>
              <div className="panel-body">
                <p>{s.category}</p>
                <Facts
                  items={[
                    ['Выплаты в год', millions(s.sum * 100000000)],
                    ['Зона', s.zone],
                    ['Окончание', s.expires],
                  ]}
                />
                <Button onClick={() => go('garage')}>Открыть гараж</Button>
              </div>
            </Panel>
          ))}
        </div>
      ) : (
        <>
          {tab === 'overview' && (
            <div className="section-grid block-gap">
              <Panel title="Расходы по месяцам" action={<span className="chip">млн евро</span>}>
                <div className="spending-chart">
                  {data.spending.map((v, i) => (
                    <div key={i}>
                      <small>{v.toLocaleString('ru-RU')}</small>
                      <i style={{ height: v * 20 }} />
                      <small>{['ДЕК', 'ЯНВ', 'ФЕВ', 'МАР', 'АПР', 'МАЙ'][i]}</small>
                    </div>
                  ))}
                </div>
              </Panel>
              <Panel title="Распределение бюджета">
                <div className="panel-body">
                  {data.costShares.map(([label, v]) => (
                    <div className="metric" key={label}>
                      <span>
                        {label}
                        <b>{v}%</b>
                      </span>
                      <Progress value={v} />
                    </div>
                  ))}
                </div>
              </Panel>
            </div>
          )}
          <Panel title={tab === 'overview' ? 'Последние операции' : 'Журнал операций'}>{ledger}</Panel>
        </>
      )}
    </section>
  )
}
