import { useState } from 'react'
import { Download, Handshake } from 'lucide-react'
import { useGame, useUI } from '../ui/context'
import { Header, Choices, Panel, Stats, Button, Table, Facts, Confirm, Progress } from '../ui/components'
import { millions, eur, dateLabel } from '../game'
export function Development() {
  const { state } = useGame()
  return (
    <section className="screen">
      <Header
        section="Технический центр"
        title="Разработка"
        sub="Проекты и протоколы испытаний доступны в сохранённой карьере."
      />
      <a
        className="btn btn-primary"
        href={'/?section=development&role=' + encodeURIComponent(state.role) + '#saves'}
      >
        Открыть карьеры
      </a>
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
      <details className="demo-summary">
        <summary>Сводные показатели</summary>
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
      </details>
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
