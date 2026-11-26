import { useState, type FormEvent } from 'react'
import { Button, Dialog, Facts, Header, Panel } from '../../ui/components'
import type { SectionProps } from '../Sections'
import { usePersonnel } from '../staff/model'
import { money, type Career } from '../api'
import { useOrder } from './useOrder'
const labels: Record<string, string> = {
  invest: 'Внести капитал',
  dividend: 'Распределить дивиденды',
  loan: 'Получить кредит',
  equity: 'Продать долю',
  repay: 'Погасить кредит',
  restructure: 'Реструктурировать',
  asset: 'Сделка с объектом',
  'program-sale': 'Сделка с программой',
}
const events: Record<string, string> = {
  depreciation:'Амортизация',
  repay: 'Погашение',
  sale: 'Смена владельца',
  issue: 'Дополнительная эмиссия',
  insolvent: 'Неплатёжеспособность',
  bankrupt: 'Банкротство',
  restructure: 'Реструктуризация',
  sell: 'Продажа',
  buy: 'Покупка',
  admit: 'Допуск',
  withdraw: 'Выход',
  replace: 'Замена',
}
type View = {
  valuation: Record<string, number>
  owner_cents: number
  personal_cents: number
  shares: Record<string, number>
  loans: {
    id: string
    principal_cents: number
    months: number
    rate_bps: number
    remaining_cents: number
    restructured: boolean
  }[]
  crisis: { status: string }
  history: { reference: string; kind: string; date: string; amount_cents?: number }[]
  assets: { id: string; kind: string; owner: string; book_cents: number }[]
  programs: { id: string; org: string; status: string; series: string }[]
}
export function Capital({ c, world, updateCareer }: SectionProps & { updateCareer: (c: Career) => void }) {
  const req = usePersonnel<View>('careers/' + c.id + '/capital', c.revision),
    v = req.data,
    order = useOrder(c, updateCareer),
    [action, set] = useState(''),
    [target, choose] = useState(''),
    [side, direction] = useState('')
  const owner = c.role !== 'manager',
    open = (a: string, k = '', s = '') => {
      order.clear()
      set(a)
      choose(k)
      direction(s)
    }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget),
      amt = Math.round(Number(f.get('amount')) * 100)
    const payload: Record<string, unknown> = {
      invest: { amount_cents: amt, source: f.get('source') },
      dividend: { amount_cents: amt },
      loan: { principal_cents: amt, months: Number(f.get('months')) },
      equity: { basis_points: Math.round(Number(f.get('percent')) * 100), issue: f.get('issue') === 'new' },
      repay: { loan: target },
      restructure: { loan: target },
      asset: { asset: target, side },
      'program-sale': { program: target, side },
    }
    if (await order.send('finance-' + action, payload[action])) set('')
  }
  return (
    <section className="screen finance-desk">
      <Header
        section={world.organizations[c.org].name}
        title="Капитал и кредит"
        sub="Оценка организации, собственники и обязательства"
      />
      {req.error && <p role="alert">{req.error}</p>}
      {v && (
        <>
          <Panel title="Стоимость организации">
            <Facts
              items={[
                ['Расчётная стоимость', money(v.valuation.value_cents)],
                ['Денежные средства', money(v.valuation.cash_cents)],
                ['Активы', money(v.valuation.assets_cents)],
                ['Оценка будущих договоров', money(v.valuation.contract_value_cents)],
                ['Долг', money(v.valuation.debt_cents)],
                ['Просрочено', money(v.valuation.overdue_cents)],
                [
                  'Состояние',
                  {
                    solvent: 'Платёжеспособна',
                    recovered: 'Платежи восстановлены',
                    insolvent: 'Неплатёжеспособность',
                    bankrupt: 'Банкротство',
                  }[v.crisis.status],
                ],
              ]}
            />
          </Panel>
          <Panel title="Собственники">
            <Facts
              items={[
                ...(owner
                  ? ([
                      ['Средства владельца', money(v.owner_cents)],
                      ['Личный капитал', money(v.personal_cents)],
                    ] as [string, string][])
                  : []),
                ...Object.entries(v.shares).map(
                  ([k, n]) =>
                    [k === 'capital:fund' ? 'Инвестиционный фонд' : 'Владелец', n / 100 + '%'] as const,
                ),
              ]}
            />
            {owner && (
              <div className="panel-body finance-actions">
                {['invest', 'dividend', 'equity'].map((a) => (
                  <Button key={a} onClick={() => open(a)}>
                    {labels[a]}
                  </Button>
                ))}
              </div>
            )}
          </Panel>
          <Panel
            title="Кредитный портфель"
            action={owner && <Button onClick={() => open('loan')}>Получить кредит</Button>}
          >
            {!v.loans.length && <p className="panel-body">Организация ещё не привлекала кредиты.</p>}
            {v.loans.map((l) => (
              <div className="result rights-row" key={l.id}>
                <span>
                  <strong>
                    {money(l.remaining_cents)} · {l.rate_bps / 100}% годовых
                  </strong>
                  <small>
                    Выдано {money(l.principal_cents)} на {l.months} мес.
                  </small>
                </span>
                {owner && l.remaining_cents > 0 && (
                  <>
                    <Button onClick={() => open('repay', l.id)}>Погасить</Button>
                    {!l.restructured && (
                      <Button onClick={() => open('restructure', l.id)}>Реструктурировать</Button>
                    )}
                  </>
                )}
              </div>
            ))}
          </Panel>
          <Panel title="Активы и программы">
            {[
              ...v.assets.map((a) => ({
                id: a.id,
                name: a.kind + ' · ' + money(a.book_cents),
                org: a.owner,
                action: 'asset',
              })),
              ...v.programs.map((p) => ({
                id: p.id,
                name:
                  (world.championships[p.series]?.name ?? p.series) +
                  ' · ' +
                  ({ admitted: 'Допущена', withdrawn: 'Ожидает допуска', closed: 'Закрыта' }[p.status] ??
                    p.status),
                org: p.org,
                action: 'program-sale',
              })),
            ].map((a) => (
              <div key={a.id} className="result">
                <strong>{a.name}</strong>
                {owner && (
                  <Button onClick={() => open(a.action, a.id, a.org === c.org ? 'sell' : 'buy')}>
                    {a.org === c.org ? 'Продать' : 'Приобрести'}
                  </Button>
                )}
              </div>
            ))}
          </Panel>
          <Panel title="История решений">
            {v.history.length ? (
              v.history.map((r, i) => (
                <div className="result" key={i}>
                  {r.date} · {events[r.kind] ?? r.kind} {r.amount_cents ? money(r.amount_cents) : ''}
                </div>
              ))
            ) : (
              <p className="panel-body">Зарегистрированных решений нет.</p>
            )}
          </Panel>
        </>
      )}
      {action && (
        <Dialog title={labels[action]} onClose={() => set('')}>
          <form className="finance-form" onSubmit={submit}>
            {['invest', 'dividend', 'loan'].includes(action) && (
              <label>
                Сумма, EUR
                <input name="amount" type="number" min=".01" step=".01" required />
              </label>
            )}
            {action === 'loan' && (
              <label>
                Срок, месяцев
                <input name="months" type="number" defaultValue="12" min="2" max="60" />
              </label>
            )}
            {action === 'invest' && (
              <label>
                Источник
                <select name="source">
                  <option value="owner">Счёт владельца</option>
                  <option value="personal">Личный капитал</option>
                </select>
              </label>
            )}
            {action === 'equity' && (
              <>
                <label>
                  Доля, %<input type="number" min=".01" max="100" step=".01" required name="percent" />
                </label>
                <label>
                  Получатель средств
                  <select name="issue">
                    <option value="new">Организация · эмиссия</option>
                    <option value="secondary">Владелец · продажа доли</option>
                  </select>
                </label>
              </>
            )}
            {target && (
              <p>
                {target} ·{' '}
                {side === 'sell'
                  ? 'Продажа по оценке'
                  : side === 'buy'
                    ? 'Покупка по оценке'
                    : action === 'repay'
                      ? 'Основной долг и начисленные проценты'
                      : 'Отсрочка первого платежа и пересмотр процентов'}
              </p>
            )}
            {order.error && <p role="alert">{order.error}</p>}
            <Button primary type="submit" disabled={order.busy}>
              Подтвердить
            </Button>
          </form>
        </Dialog>
      )}
    </section>
  )
}
