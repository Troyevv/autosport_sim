import React, { useEffect, useMemo, useState } from 'react'
import { useGame, useStored } from '../core'
import { Button, Badge, Icon, Tabs } from '../ui'
import { PersonPortrait } from '../visuals'
import {
  CONTRACT_TYPES,
  CONTRACT_STATUS,
  classifyContractSpec,
  contractRegister,
  contractMoney as money,
  contractDate as date,
  contractDays,
  collection,
} from './contracts-model'
import './contracts.css'
import { OrganizationMark } from './identity'
export { classifyContractSpec } from './contracts-model'
const terms = {
  equal: 'Равноправный пилот',
  first: 'Первый пилот',
  second: 'Второй пилот',
  standard: 'В рамках должности',
  independent: 'Самостоятельное руководство',
  supervised: 'Под контролем руководителя',
  engine: 'Двигатель',
  transmission: 'Трансмиссия',
  tyre: 'Шины',
  chassis: 'Шасси',
  client: 'Клиентская поставка',
  technical: 'Техническое партнёрство',
  works: 'Заводская программа',
  performance: 'Спортивный результат',
  development: 'Развитие молодых',
  economy: 'Финансовая устойчивость',
  race: 'Ближайшая гонка',
  intermediate: 'Промежуточный',
  season: 'Сезон',
  long: 'Долгосрочный',
  required: 'Обязательно',
  desired: 'Желательно',
  lease: 'Аренда',
  outsource: 'Аутсорсинг',
}
const label = (v) => terms[v] || v || 'Не раскрыто'
const orgName = (g, id) =>
  g.world.organizations?.[id]?.name ||
  g.game.projections?.commercial?.brands?.find((x) => x.id === id)?.name ||
  g.world.names?.[id] ||
  'Сторона не раскрыта'
const yes = (v) => (v == null ? 'Не раскрыто' : v ? 'Согласовано' : 'Не включено')
const dayAfter = (start, days) => {
  const value = new Date(Date.parse((start || '') + 'T12:00:00Z') + Number(days) * 86400000)
  return Number.isFinite(value.getTime()) ? value.toISOString().slice(0, 10) : null
}
const stateTone = (s) =>
  ['signed', 'active', 'agreed', 'accepted', 'paid'].includes(s)
    ? 'positive'
    : ['counter', 'countered', 'sent', 'pending', 'scheduled'].includes(s)
      ? 'warning'
      : 'neutral'

export function ContractMark({ name, color, small = false }) {
  const g = useGame(),
    org = Object.values(g.world.organizations || {}).find((x) => x.name === name)
  if (org)
    return (
      <OrganizationMark orgId={org.id} size={small ? 44 : 54} className="contract-organization-mark" />
    )
  return (
    <span
      className={'contract-mark ' + (small ? 'small' : '')}
      style={{ '--document-accent': color || 'var(--org-accent, #d9c9ad)' }}
      aria-hidden="true"
    >
      <span>
        {(name || 'AS')
          .replace(/^(Team |Scuderia |Supplier )/i, '')
          .split(/\s+/)
          .map((x) => x[0])
          .join('')
          .slice(0, 3)
          .toUpperCase()}
      </span>
      <i />
    </span>
  )
}
export function ContractDialogHeader({ spec, g }) {
  const type = classifyContractSpec(spec),
    meta = CONTRACT_TYPES[type]
  if (!meta) return null
  const org = g.world.organizations[g.game.career.org]
  return (
    <div className={'contract-dialog-heading contract-kind-' + type}>
      <ContractMark name={org?.name} color={g.game.career.team_color || org?.color} />
      <div>
        <span className="contract-eyebrow">
          {org?.name} / {meta.name}
        </span>
        <h2>{spec.title}</h2>
        <small>
          {spec.confirm ? 'Итоговое решение' : 'Переговорная комната'} · {date(g.game.career.date)}
        </small>
      </div>
      <span className="contract-document-code">
        {meta.code}
        <br />
        <small>CONFIDENTIAL</small>
      </span>
    </div>
  )
}
export function ContractParties({
  person,
  counterparty,
  organization,
  subtitle,
  type = 'staff',
  compact = false,
}) {
  const g = useGame(),
    org = g.world.organizations[organization || g.game.career.org],
    name = counterparty || person?.name || 'Выберите вторую сторону'
  return (
    <div className={'contract-parties ' + (compact ? 'compact' : '')}>
      <div className="contract-party">
        <ContractMark name={org?.name} color={org?.color} />
        <div>
          <span>Организация</span>
          <strong>{org?.name || 'Организация'}</strong>
          <small>
            {g.role === 'owner'
              ? 'Собственник'
              : g.role === 'manufacturer'
                ? 'Руководитель производителя'
                : 'Менеджер команды'}
          </small>
        </div>
      </div>
      <div className="contract-party-link">
        <Icon name="Handshake" size={23} />
      </div>
      <div className="contract-party">
        {person ? <PersonPortrait person={person} size={54} /> : <ContractMark name={name} small />}
        <div>
          <span>
            {['sponsor', 'technical'].includes(type)
              ? 'Партнёр'
              : type === 'supply'
                ? 'Клиент / поставщик'
                : type === 'academy'
                  ? 'Воспитанник'
                  : 'Участник соглашения'}
          </span>
          <strong>{name}</strong>
          <small>{subtitle || CONTRACT_TYPES[type]?.name}</small>
        </div>
      </div>
    </div>
  )
}
export function ContractFrame({
  type = 'staff',
  title,
  eyebrow,
  person,
  counterparty,
  subtitle,
  children,
  aside,
  footer,
  className = '',
}) {
  const g = useGame(),
    org = g.world.organizations[g.game.career.org],
    meta = CONTRACT_TYPES[type] || CONTRACT_TYPES.staff
  return (
    <section
      className={'contract-frame contract-kind-' + type + ' ' + className}
      style={{ '--document-accent': g.game.career.team_color || org?.color || '#d9c9ad' }}
    >
      <header className="contract-frame-mast">
        <div>
          <span className="contract-eyebrow">{eyebrow || meta.name}</span>
          <h3>{title || meta.question}</h3>
        </div>
        <span className="contract-document-code">
          {meta.code}
          <small> AUTOSPORT SIM</small>
        </span>
      </header>
      {(person || counterparty) && (
        <ContractParties person={person} counterparty={counterparty} subtitle={subtitle} type={type} />
      )}
      <div className={'contract-frame-columns ' + (!aside ? 'single' : '')}>
        <div className="contract-document-body">{children}</div>
        {aside && <aside className="contract-aside">{aside}</aside>}
      </div>
      {footer && <footer className="contract-frame-footer">{footer}</footer>}
    </section>
  )
}
export function ContractClause({ number, title, children, className = '' }) {
  return (
    <section className={'contract-clause ' + className}>
      <header>
        <span>{String(number).padStart(2, '0')}</span>
        <h4>{title}</h4>
      </header>
      <div>{children}</div>
    </section>
  )
}
export function ContractFacts({ rows }) {
  return (
    <dl className="contract-facts">
      {rows.filter(Boolean).map(([key, value], i) => (
        <div key={key + i}>
          <dt>{key}</dt>
          <dd>{value ?? 'Не раскрыто'}</dd>
        </div>
      ))}
    </dl>
  )
}
export function ContractComparison({ rows, currentLabel = 'Сейчас', proposedLabel = 'Предложение' }) {
  return (
    <div className="contract-comparison">
      <div className="contract-comparison-head">
        <span>Условие</span>
        <span>{currentLabel}</span>
        <span>{proposedLabel}</span>
      </div>
      {rows.map(([key, current, proposed], i) => (
        <div className="contract-comparison-row" key={key + i}>
          <strong>{key}</strong>
          <span data-label={currentLabel}>{current ?? 'Не раскрыто'}</span>
          <b data-label={proposedLabel}>{proposed ?? 'Не раскрыто'}</b>
        </div>
      ))}
    </div>
  )
}
export function ContractImpact({
  now,
  recurring,
  after,
  rows = [],
  note,
  title = 'Последствия решения',
}) {
  return (
    <div className="contract-impact">
      <span className="contract-eyebrow">{title}</span>
      {now != null && (
        <div className="contract-impact-main">
          <small>При подписании</small>
          <strong>{money(now)}</strong>
        </div>
      )}
      <ContractFacts
        rows={[
          ...(recurring != null ? [['Затем / месяц', money(recurring)]] : []),
          ...(after != null ? [['Останется доступно', money(after)]] : []),
          ...rows,
        ]}
      />
      {note && <p>{note}</p>}
    </div>
  )
}
export function ContractTimeline({
  events = [],
  initialDate,
  initialText = 'Условия раскрыты в созданной карьере',
}) {
  const list = events.length
    ? events
    : [
        {
          date: initialDate,
          title: initialText,
          detail: 'Более ранняя история переговоров не предоставлена источником.',
        },
      ]
  return (
    <ol className="contract-timeline">
      {list.map((x, i) => (
        <li key={i}>
          <i />
          <div>
            <small>{x.date ? date(x.date) : 'Дата события не раскрыта'}</small>
            <strong>
              {x.title || x.message || x.response || CONTRACT_STATUS[x.status] || 'Изменение условий'}
            </strong>
            {x.detail && <p>{x.detail}</p>}
          </div>
        </li>
      ))}
    </ol>
  )
}
export function ContractSeal({
  date: when,
  future = false,
  label: sealLabel = 'Соглашение подписано',
  eyebrow = 'Стороны согласовали условия',
  datePrefix = 'Начало обязательств',
}) {
  return (
    <div className="contract-seal" role="status">
      <span className="contract-seal-icon">
        <Icon name="Check" size={27} />
      </span>
      <div>
        <span className="contract-eyebrow">{eyebrow}</span>
        <strong>{sealLabel}</strong>
        <p>
          {datePrefix}
          {when ? ' · ' + date(when) : ' · дата не раскрыта'}
        </p>
      </div>
      <Icon name="BadgeCheck" size={42} />
    </div>
  )
}
export function ContractSigningSummary({
  type = 'staff',
  person,
  counterparty,
  rows = [],
  amount,
  start,
  end,
  note,
}) {
  return (
    <div className="contract-signing-summary">
      <ContractParties person={person} counterparty={counterparty} type={type} />
      <div className="contract-signing-line">
        <Icon name="PenLine" size={32} />
        <div>
          <span className="contract-eyebrow">На вашей подписи</span>
          <h3>
            {{
              investment: 'Решение изменит капитал и контроль',
              loan: 'Организация принимает долговое обязательство',
              facilitylease: 'Мощности будут зарезервированы',
              academy: 'Академия принимает воспитанника',
              funding: 'Производитель принимает обязательства поддержки',
              driver: 'Пилот связывает будущее с командой',
              staff: 'Специалист присоединится к работе организации',
              leadership: 'У руководителя появится новый мандат',
              supply: 'Договор определит права клиента',
              technical: 'Стороны закрепят границы сотрудничества',
              sponsor: 'Партнёр получит согласованные права',
            }[type] || 'Соглашение создаст обязательства'}
          </h3>
        </div>
      </div>
      <ContractFacts
        rows={[
          ...(amount != null ? [['Платёж сейчас', money(amount)]] : []),
          ...(start ? [['Вступление в силу', date(start)]] : []),
          ...(end ? [['Окончание', date(end)]] : []),
          ...rows,
        ]}
      />
      {note && <p className="contract-note">{note}</p>}
    </div>
  )
}

function EmploymentDocument({ record }) {
  const g = useGame(),
    d = record.data,
    position = g.world.positions?.[d.position]?.name || label(d.position)
  return (
    <>
      <ContractClause
        number={1}
        title={record.type === 'driver' ? 'Спортивное назначение' : 'Должность и ответственность'}
      >
        <ContractFacts
          rows={[
            [
              record.type === 'driver' ? 'Роль в составе' : 'Должность',
              record.type === 'driver' ? label(d.driver_status) || position : position,
            ],
            ['Программа', g.world.championships[d.series]?.name || 'Организация'],
            ['Начало', date(d.start)],
            ['Окончание, не включая', date(d.end)],
          ]}
        />
        {record.type === 'driver' ? (
          <div className="contract-permission-line">
            <span>
              <Icon name="Flag" />
              Внешние выступления <b>{yes(d.outside_starts)}</b>
            </span>
            <span>
              <Icon name="Combine" />
              Совмещение обязанностей <b>{yes(d.combined_duties)}</b>
            </span>
          </div>
        ) : (
          <p className="contract-clause-statement">
            {d.remit ? label(d.remit) : 'Объём полномочий раскрывается в досье сотрудника.'}
          </p>
        )}
      </ContractClause>
      <ContractClause number={2} title="Вознаграждение и выход">
        <ContractFacts
          rows={[
            ['Оклад / месяц', money(d.salary_cents)],
            ['Бонус при подписании', money(d.bonus_cents)],
            ['Выкуп / компенсация', money(d.buyout_cents)],
          ]}
        />
        <p className="contract-note">
          Дата подписания и дата начала работы различаются. Будущее назначение не освобождает нынешнее
          место автоматически.
        </p>
      </ContractClause>
    </>
  )
}
function SponsorshipDocument({ record }) {
  const g = useGame(),
    d = record.data
  return (
    <>
      <div className="contract-financial-head">
        <span>Гарантированная часть</span>
        <strong>{money(d.fixed_cents)}</strong>
        <small>за период договора · выплаты раз в {d.interval || '—'} мес.</small>
      </div>
      <ContractClause number={1} title="Ценность партнёрства">
        <ContractFacts
          rows={[
            ['Программа', g.world.championships[d.series]?.name],
            ['Начало', date(d.start)],
            ['Окончание', date(d.end)],
            ['Аванс', money(d.advance_cents)],
            ['Бонус', money(d.bonus_cents)],
            ['Условие бонуса', d.podium ? 'Место не ниже ' + d.podium : 'Не раскрыто'],
          ]}
        />
      </ContractClause>
      <ContractClause number={2} title="Присутствие бренда">
        <div className="contract-rights-map">
          {collection(d.rights).map((r, i) => (
            <div key={i}>
              <span>
                {{
                  garage: 'Боксы',
                  press: 'Пресс-стена',
                  hospitality: 'Гостевая зона',
                  suit: 'Комбинезон',
                  uniform: 'Форма',
                  launch: 'Презентация',
                  flank: 'Борт',
                  upper: 'Верх кузова',
                  nose: 'Нос',
                  sill: 'Порог',
                  shoulder: 'Плечо',
                  wing: 'Антикрыло',
                }[r.zone] || r.zone}
              </span>
              <div>
                <i style={{ left: (r.offset || 0) + '%', width: r.share + '%' }} />
              </div>
              <b>{r.share}%</b>
            </div>
          ))}
        </div>
        <ContractFacts
          rows={[
            ['Мероприятия', d.appearances],
            ['Эксклюзивность в категории', yes(d.exclusive)],
            ['Право продления', yes(d.renew)],
            ['Компенсация при выходе', money(d.compensation_cents)],
          ]}
        />
      </ContractClause>
      {record.type === 'technical' &&
        (d.product || d.technical ? (
          <SupplyDocument record={record} compact />
        ) : (
          <p className="contract-note">
            Этот документ описывает коммерческую часть технического партнёрства. Доступ к поддержке,
            испытаниям и совместной разработке проверяется по отдельному договору поставки.
          </p>
        ))}
    </>
  )
}
function SupplyDocument({ record, compact = false }) {
  const g = useGame(),
    d = record.data
  return (
    <>
      <div className={'contract-product-band ' + (compact ? 'compact' : '')}>
        <Icon
          name={
            d.product === 'engine' ? 'Gauge' : d.product === 'transmission' ? 'Settings2' : 'Package'
          }
          size={46}
        />
        <div>
          <span className="contract-eyebrow">{label(d.partnership)}</span>
          <h4>{label(d.product)}</h4>
          <p>{g.world.championships[d.series]?.name || 'Технический пакет'}</p>
        </div>
        <strong>
          {money(d.sale_cents)}
          <small>Поставка после скидки</small>
        </strong>
      </div>
      <ContractClause number={compact ? 3 : 1} title="Граница технического сотрудничества">
        <div className="contract-entitlements">
          {[
            ['support', 'Headset', 'Техническая поддержка', 'Работа консультантов'],
            ['testing', 'FlaskConical', 'Испытания', 'Доступ по договору'],
            ['development', 'GitBranch', 'Совместная разработка', 'Техническая кооперация'],
          ].map(([key, icon, title, sub]) => (
            <div key={key} className={d[key] ? 'enabled' : ''}>
              <Icon name={icon} />
              <strong>{title}</strong>
              <span>{yes(d[key])}</span>
              <small>{sub}</small>
            </div>
          ))}
        </div>
      </ContractClause>
      <ContractClause number={compact ? 4 : 2} title="Поставка и обязательства">
        <ContractFacts
          rows={[
            ['Каталожная стоимость', money(d.list_cents)],
            ['Скидка', money(d.discount_cents)],
            ['Начало', date(d.start)],
            ['Окончание', date(d.end)],
            ['Финансирование места', money(d.seat_cents)],
            ['Автомобили в программе', d.entries?.length ?? 'Не раскрыто'],
          ]}
        />
        <p className="contract-note">
          Права действуют в срок договора. Соглашение на будущий период не открывает доступ к испытаниям
          или разработке сегодня.
        </p>
      </ContractClause>
    </>
  )
}
function FundingDocument({ record }) {
  const g = useGame(),
    d = record.data,
    academy = record.type === 'academy'
  return (
    <>
      <div className="contract-backing-hero">
        <Icon name={academy ? 'GraduationCap' : 'HeartHandshake'} size={40} />
        <div>
          <span className="contract-eyebrow">
            {academy ? record.academy?.name || 'Программа развития' : 'Поддержка производителя'}
          </span>
          <h4>
            {money(d.monthly_cents)}
            <small>в месяц</small>
          </h4>
        </div>
      </div>
      <ContractClause number={1} title={academy ? 'Путь воспитанника' : 'Получатель поддержки'}>
        <ContractFacts
          rows={[
            ['Команда', d.team ? orgName(g, d.team) : 'Без привязки к команде'],
            ['Начало', date(d.start)],
            ['Окончание', date(d.end)],
            ['Зарезервировано', money(d.reserved_cents)],
            ['Уже выплачено', money(d.paid_cents)],
          ]}
        />
      </ContractClause>
      <ContractClause number={2} title={academy ? 'Права академии' : 'Условия поддержки'}>
        <ContractFacts
          rows={
            academy
              ? [
                  ['Опцион', yes(d.option)],
                  ['Срок опциона', d.option_days ? d.option_days + ' дней' : 'Не раскрыт'],
                  ['Приоритет', yes(d.priority)],
                  ['Опцион исполнен', yes(d.exercised)],
                ]
              : [
                  ['Переносимость', yes(d.portable)],
                  ['Гарантия места', yes(d.guarantee)],
                  ['Компенсация', money(d.exit_cents)],
                  ['Минимум стартов', d.minimum_starts],
                ]
          }
        />
        <p className="contract-note">
          {academy
            ? 'Соглашение академии и трудовой договор пилота — отдельные обязательства. Лимит резервирования зависит от бюджета и компетенции руководителя.'
            : 'Гарантия требует действующего договора пилота с командой клиента на весь срок. Поддержка не заменяет назначение на гоночное место.'}
        </p>
      </ContractClause>
    </>
  )
}
function LeadershipDocument({ record }) {
  const d = record.data
  if (!record.mandate) return <EmploymentDocument record={record} />
  return (
    <>
      <div className="contract-directive">
        <span className="contract-eyebrow">Решение собственника</span>
        <h4>
          {{
            performance: 'Спортивный результат',
            development: 'Развитие молодых',
            economy: 'Финансовая устойчивость',
            technical: 'Техническое развитие',
          }[d.goal] || label(d.goal)}
        </h4>
        <p>
          {label(d.horizon)} · {label(d.priority)}
        </p>
      </div>
      <ContractClause number={1} title="Ресурсы и границы">
        <ContractFacts
          rows={[
            ['Лимит месячного оклада', money(d.limit_cents)],
            ['Автономия', d.autonomy == null ? 'Не раскрыта' : d.autonomy + ' / 100'],
            ['Последний ответ', d.response],
          ]}
        />
      </ContractClause>
      <ContractClause number={2} title="Отношения с руководителем">
        <ContractFacts
          rows={[
            ['Доверие', d.trust == null ? 'Не раскрыто' : d.trust + ' / 100'],
            ['Удовлетворённость', d.satisfaction == null ? 'Не раскрыта' : d.satisfaction + ' / 100'],
          ]}
        />
        <p className="contract-note">
          Цели передаются менеджеру. Владелец не назначает пилотов и не управляет техническими работами
          через этот документ.
        </p>
      </ContractClause>
    </>
  )
}
function CapitalDocument({ record }) {
  const d = record.data,
    loan = record.type === 'loan'
  return (
    <>
      <div className="contract-financial-head">
        <span>{loan ? 'Сумма финансирования' : 'Объём решения'}</span>
        <strong>{money(d.principal_cents ?? d.amount_cents)}</strong>
        <small>
          {loan ? 'Обязательство организации' : 'Источник и получатель учитываются раздельно'}
        </small>
      </div>
      <ContractClause number={1} title={loan ? 'Обслуживание долга' : 'Вложение и контроль'}>
        <ContractFacts
          rows={
            loan
              ? [
                  ['Остаток долга', money(d.remaining_cents)],
                  [
                    'Ставка',
                    d.rate_bps != null
                      ? d.rate_bps / 100 + '%'
                      : d.rate_bp != null
                        ? d.rate_bp / 100 + '%'
                        : d.rate_percent != null
                          ? d.rate_percent + '%'
                          : 'Не раскрыта',
                  ],
                  ['Создан', date(d.start || d.created)],
                  ['Срок', d.months ? d.months + ' мес.' : 'По раскрытому графику'],
                  ['Окончание', d.due || d.end ? date(d.due || d.end) : 'По графику займа'],
                  ['Статус', CONTRACT_STATUS[d.status] || d.status],
                ]
              : [
                  ['Дата', date(d.date)],
                  [
                    'Вид сделки',
                    { investment: 'Взнос в организацию', issue: 'Выпуск акций', sale: 'Продажа доли' }[
                      d.kind
                    ] || label(d.kind),
                  ],
                  [
                    'Доля инвестора',
                    d.basis_points != null ? d.basis_points / 100 + '%' : 'Не меняется по этому решению',
                  ],
                ]
          }
        />
      </ContractClause>
      <ContractClause number={2} title="Контроль после решения">
        <p className="contract-clause-statement">
          {loan
            ? 'Полученные средства увеличивают кассу. Погашение проверяется по свободным деньгам и существующему остатку долга.'
            : 'Выпуск новых акций и продажа своей доли имеют разных получателей средств. Право решений собственника зависит от контрольного пакета.'}
        </p>
      </ContractClause>
    </>
  )
}
function FacilityDocument({ record }) {
  const g = useGame(),
    d = record.data,
    a = record.asset
  return (
    <>
      <div className="contract-facility-hero">
        <Icon name="Factory" size={52} />
        <div>
          <span className="contract-eyebrow">{label(d.mode)}</span>
          <h4>{g.game.projections.facilities?.types?.[a?.kind] || record.title}</h4>
          <p>
            {g.world.countries[a?.country] || 'Местоположение не раскрыто'} ·{' '}
            {a?.level ? 'уровень ' + a.level : 'мощности по договору'}
          </p>
        </div>
      </div>
      <ContractClause number={1} title="Зарезервированное окно">
        <ContractFacts
          rows={[
            ['Владелец объекта', a?.owner ? orgName(g, a.owner) : 'Не раскрыт'],
            ['Пользователь', orgName(g, d.org)],
            ['Начало', date(d.start)],
            ['Окончание', date(d.end)],
            ['Единицы мощности', d.units],
            ['Стоимость', money(d.cost_cents)],
          ]}
        />
      </ContractClause>
      <ContractClause number={2} title="Доступ к работе">
        <p className="contract-clause-statement">
          Бронирование даёт доступ к мощности в выбранном интервале. Работы и персонал назначаются в
          соответствующей инженерной программе.
        </p>
      </ContractClause>
    </>
  )
}
export function ContractDocument({ record, compact = false }) {
  const g = useGame(),
    d = record.data,
    meta = CONTRACT_TYPES[record.type],
    own = g.world.organizations[g.game.career.org],
    closed = ['signed', 'active', 'accepted', 'scheduled'].includes(record.status),
    body =
      record.type === 'driver' || record.type === 'staff' ? (
        <EmploymentDocument record={record} />
      ) : record.type === 'sponsor' || record.type === 'technical' ? (
        <SponsorshipDocument record={record} />
      ) : record.type === 'supply' ? (
        <SupplyDocument record={record} />
      ) : record.type === 'funding' || record.type === 'academy' ? (
        <FundingDocument record={record} />
      ) : record.type === 'leadership' ? (
        <LeadershipDocument record={record} />
      ) : record.type === 'facilitylease' ? (
        <FacilityDocument record={record} />
      ) : (
        <CapitalDocument record={record} />
      )
  return (
    <article
      className={'contract-paper ' + (compact ? 'compact' : '')}
      style={{ '--document-accent': own?.color || '#d9c9ad' }}
    >
      <header className="contract-paper-header">
        <ContractMark name={own?.name} color={own?.color} />
        <div>
          <span>{own?.name}</span>
          <small>
            {meta.name} / {meta.code}
          </small>
        </div>
        <Badge tone={stateTone(record.status)}>{CONTRACT_STATUS[record.status] || record.status}</Badge>
      </header>
      <div className="contract-paper-title">
        <span className="contract-eyebrow">{meta.name}</span>
        <h2>{record.title}</h2>
        <p>
          {record.negotiation
            ? 'Условия открытых переговоров'
            : d.start
              ? date(d.start) + ' — ' + date(d.end)
              : meta.question}
        </p>
      </div>
      {record.person && (
        <div className="contract-paper-person">
          <PersonPortrait person={record.person} size={66} />
          <div>
            <strong>{record.person.name}</strong>
            <span>{g.world.positions[record.person.position]?.name || 'Участник соглашения'}</span>
          </div>
          <button type="button" onClick={() => g.openPerson(record.person.id)}>
            <Icon name="ArrowUpRight" />
            Досье
          </button>
        </div>
      )}
      <div className="contract-paper-content">{body}</div>
      {closed && (
        <ContractSeal
          date={d.start || d.date || d.signed_at}
          future={d.start > g.game.career.date}
          eyebrow={record.mandate ? 'Решение собственника' : 'Стороны согласовали условия'}
          datePrefix={
            record.mandate ? 'Дата решения' : d.start ? 'Начало обязательств' : 'Дата соглашения'
          }
          label={
            record.mandate
              ? d.response?.includes('ожида')
                ? 'Мандат передан менеджеру'
                : 'Мандат действует'
              : record.status === 'active'
                ? 'Условия действуют'
                : 'Подписание зафиксировано'
          }
        />
      )}
      <footer className="contract-paper-footer">
        <span>
          <Icon name="LockKeyhole" size={13} />
          Доступно вашей роли
        </span>
        <span>{'Данные действующей карьеры'}</span>
      </footer>
    </article>
  )
}

export default function ContractWorkspace() {
  const g = useGame(),
    [filters, setFilters] = useStored('v2.agreements.filters', {
      type: 'all',
      status: 'all',
      query: '',
    }),
    [mobileDocument, setMobileDocument] = useState(Boolean(g.entity))
  const register = useMemo(() => contractRegister(g), [g.game, g.world, g.role])
  const selectedType = CONTRACT_TYPES[filters.type],
    counts = Object.fromEntries(
      Object.keys(CONTRACT_TYPES).map((type) => [type, register.filter((r) => r.type === type).length]),
    )
  const [pageSize, setPageSize] = useState(30)
  const filtered = register.filter(
    (r) =>
      (filters.type === 'all' || r.type === filters.type) &&
      (filters.status === 'all' ||
        (filters.status === 'open'
          ? r.negotiation && !['signed', 'accepted', 'rejected', 'withdrawn'].includes(r.status)
          : filters.status === 'current'
            ? ['active', 'signed', 'accepted'].includes(r.status)
            : filters.status === 'future'
              ? r.data.start > g.game.career.date
              : ['terminated', 'ended', 'withdrawn', 'rejected', 'expired'].includes(r.status))) &&
      (!filters.query ||
        [r.title, CONTRACT_TYPES[r.type].name, r.data.position, r.data.id]
          .join(' ')
          .toLowerCase()
          .includes(filters.query.toLowerCase())),
  )
  const selected = filtered.find((x) => x.id === g.entity) || filtered[0]
  const pending = register.filter(
    (x) => x.negotiation && ['pending', 'sent', 'counter', 'countered', 'agreed'].includes(x.status),
  )
  const roleCopy =
    g.role === 'owner'
      ? [
          'Совет директоров',
          'Обязательства, которые определяют будущее.',
          'Руководители, академии и капитал. Оперативные решения остаются в полномочиях менеджера.',
        ]
      : g.role === 'manufacturer'
        ? [
            'Коммерческая дирекция',
            'Договорённости превращают технологии в бизнес.',
            'Стоимость поставок, права клиентов и работа технических специалистов.',
          ]
        : [
            'Кабинет руководителя',
            'Люди. Партнёры. Обязательства.',
            'Каждое соглашение связано с местом в составе, ресурсом команды или следующим решением.',
          ]
  useEffect(() => {
    setPageSize(30)
  }, [filters.type, filters.status, filters.query])
  function select(record) {
    g.navigate('agreements', '', record.id)
    setMobileDocument(true)
  }
  function update(patch) {
    setFilters((p) => ({ ...p, ...patch }))
    setMobileDocument(false)
  }
  const meta = selected ? CONTRACT_TYPES[selected.type] : selectedType || CONTRACT_TYPES.staff
  return (
    <div className={'contract-workspace ' + (mobileDocument ? 'show-document' : '')}>
      <header className="agreements-hero">
        <div>
          <span className="contract-eyebrow">{roleCopy[0]} / Договорная комната</span>
          <h1>{roleCopy[1]}</h1>
          <p>{roleCopy[2]}</p>
        </div>
        <div className="agreements-hero-stamp">
          <Icon name="PenLine" size={30} />
          <strong>{pending.length}</strong>
          <span>
            открытых
            <br />
            переговоров
          </span>
        </div>
      </header>
      <div className="agreements-toolbar">
        <label className="agreements-search">
          <Icon name="Search" />
          <input
            type="search"
            aria-label="Поиск соглашений"
            placeholder="Человек, партнёр, документ…"
            value={filters.query}
            onChange={(e) => update({ query: e.target.value })}
          />
          {filters.query && (
            <button
              type="button"
              aria-label="Очистить поиск соглашений"
              onClick={() => update({ query: '' })}
            >
              <Icon name="X" />
            </button>
          )}
        </label>
        <label>
          <span>Состояние</span>
          <select value={filters.status} onChange={(e) => update({ status: e.target.value })}>
            <option value="all">Все документы</option>
            <option value="current">Действующие</option>
            <option value="open">Открытые переговоры</option>
            <option value="future">Будущие</option>
            <option value="archive">Завершённые</option>
          </select>
        </label>
        <Button onClick={() => g.navigate(meta.route, meta.tab || '')}>
          {meta.action}
          <Icon name="ArrowUpRight" size={17} />
        </Button>
      </div>
      <nav className="agreements-category-strip" aria-label="Виды соглашений">
        <button aria-pressed={filters.type === 'all'} onClick={() => update({ type: 'all' })}>
          Все <b>{register.length}</b>
        </button>
        {Object.entries(CONTRACT_TYPES)
          .filter(
            ([type]) => g.role !== 'manufacturer' || !['driver', 'academy', 'leadership'].includes(type),
          )
          .map(([type, t]) => (
            <button key={type} aria-pressed={filters.type === type} onClick={() => update({ type })}>
              <Icon name={t.icon} size={17} />
              {t.plural}
              <b>{counts[type]}</b>
            </button>
          ))}
      </nav>
      <div className="agreements-desk">
        <aside className="agreements-register">
          <header>
            <span>{filters.type === 'all' ? 'Реестр соглашений' : selectedType.plural}</span>
            <b>{filtered.length}</b>
          </header>
          <div className="agreements-register-list">
            {filtered.slice(0, pageSize).map((r) => (
              <button
                key={r.id}
                className={'agreement-entry ' + (r.id === selected?.id ? 'selected' : '')}
                aria-current={r.id === selected?.id ? 'true' : undefined}
                onClick={() => select(r)}
              >
                <span className="agreement-entry-code">{CONTRACT_TYPES[r.type].code}</span>
                <div>
                  <span>{CONTRACT_TYPES[r.type].name}</span>
                  <strong>{r.title}</strong>
                  <small>
                    {r.data.end
                      ? 'До ' + date(r.data.end)
                      : r.mandate
                        ? 'Цели и полномочия'
                        : 'Срок в досье'}
                    {' · '}
                    {CONTRACT_STATUS[r.status] || r.status}
                  </small>
                </div>
                <Icon name="ChevronRight" size={16} />
              </button>
            ))}
            {filtered.length > pageSize && (
              <Button variant="ghost" onClick={() => setPageSize((n) => n + 30)}>
                Ещё {Math.min(30, filtered.length - pageSize)} документов
              </Button>
            )}
            {!filtered.length && (
              <div className="agreements-empty">
                <Icon name={selectedType?.icon || 'FileSearch'} size={40} />
                <h3>{filters.query ? 'Совпадений нет' : 'Соглашений этого типа пока нет'}</h3>
                <p>
                  {filters.query
                    ? 'Измените имя или фильтры.'
                    : 'Подписанные договоры появятся в этом реестре.'}
                </p>
                <Button variant="secondary" onClick={() => g.navigate(meta.route, meta.tab || '')}>
                  {meta.action}
                </Button>
              </div>
            )}
          </div>
        </aside>
        <section className="agreement-reading-pane" aria-label="Выбранное соглашение">
          <button className="agreements-mobile-back" onClick={() => setMobileDocument(false)}>
            <Icon name="ArrowLeft" size={17} />К реестру · {filtered.length}
          </button>
          {selected ? (
            <>
              <div className="agreement-context-bar">
                <span>
                  <Icon name={meta.icon} size={17} />
                  {selected.negotiation ? 'Переговоры продолжаются' : 'Договорное дело'}
                </span>
                <Button
                  variant="secondary"
                  onClick={() => g.navigate(selected.route, selected.tab, selected.entity)}
                >
                  {selected.negotiation
                    ? 'Перейти к переговорам'
                    : selected.editable === false
                      ? 'Открыть контекст'
                      : 'Открыть связанные решения'}
                  <Icon name="ArrowUpRight" size={16} />
                </Button>
              </div>
              <ContractDocument record={selected} />
              <section className="agreement-provenance">
                <div>
                  <span className="contract-eyebrow">История дела</span>
                  <h3>{selected.negotiation ? 'Каждый раунд имеет причину' : 'Решения и источники'}</h3>
                </div>
                <ContractTimeline
                  events={selected.data.history || []}
                  initialDate={selected.data.date || selected.data.signed_at}
                  initialText={'Условия действующего договора'}
                />
                {!selected.disclosed && ['driver', 'staff'].includes(selected.type) && (
                  <p className="contract-note">
                    Часть условий доступна после загрузки личного досье. Неизвестные суммы не заменяются
                    нулём.
                  </p>
                )}
              </section>
            </>
          ) : (
            <div className="agreement-no-selection">
              <Icon name="Files" size={70} />
              <h2>Здесь будет документ</h2>
              <p>
                Выберите соглашение в реестре или начните новый разговор с сотрудником либо партнёром.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
