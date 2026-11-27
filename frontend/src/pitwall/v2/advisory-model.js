export const asList = (value) => (Array.isArray(value) ? value : Object.values(value || {}))
export const total = (rows, get = (value) => value) =>
  rows.reduce((sum, row) => sum + (Number(get(row)) || 0), 0)
export const shortDate = (value) =>
  value
    ? new Date(value + 'T12:00:00Z').toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
    : 'Дата не раскрыта'
export const number = (value, digits = 1) =>
  value == null || !Number.isFinite(Number(value))
    ? 'Не раскрыто'
    : Number(value).toLocaleString('ru-RU', { maximumFractionDigits: digits })
export const euro = (value, compact = false) =>
  value == null
    ? 'Не раскрыто'
    : new Intl.NumberFormat('ru-RU', {
        style: 'currency',
        currency: 'EUR',
        notation: compact ? 'compact' : 'standard',
        maximumFractionDigits: compact ? 1 : value % 100 ? 2 : 0,
      }).format(value / 100)
export const addDays = (date, days) =>
  new Date(new Date(date + 'T12:00:00Z').getTime() + days * 864e5).toISOString().slice(0, 10)
export const AXES = {
  chassis: 'Шасси',
  cooling: 'Охлаждение',
  engine: 'Силовая установка',
  transmission: 'Трансмиссия',
  tyre: 'Шины',
  brakes: 'Тормоза',
  'rear-wing': 'Заднее антикрыло',
  floor: 'Днище',
  suspension: 'Подвеска',
}
export const CATEGORIES = {
  personnel: 'Персонал',
  payroll: 'Зарплаты',
  'staff-payroll': 'Зарплаты сотрудников',
  investment: 'Инвестиции',
  'loan-interest': 'Проценты по займу',
  'loan-repayment': 'Погашение займа',
  engineering: 'Разработка',
  operations: 'Соревнования',
  commercial: 'Коммерция',
  facilities: 'Инфраструктура',
  infrastructure: 'Инфраструктура',
  reserve: 'Резерв',
  production: 'Производство',
  research: 'Исследования',
  development: 'Разработка',
  design: 'Проектирование',
  testing: 'Испытания',
  supply: 'Поставки',
  sponsorship: 'Спонсорство',
  'driver-backing': 'Финансирование пилотов',
  academy: 'Академия',
  opening: 'Начальный капитал',
  loan: 'Займы',
  maintenance: 'Обслуживание',
  shipping: 'Логистика',
  warranty: 'Гарантия',
  support: 'Поддержка',
  transfer: 'Переводы',
}
export const STAGES = {
  research: 'Исследование',
  'research-ready': 'Заключение',
  design: 'Проектирование',
  'design-ready': 'Чертёж готов',
  test: 'Испытание',
  review: 'Решение о выпуске',
  released: 'Выпущено',
  production: 'Изготовление',
  quality: 'Приёмка',
  stock: 'На складе',
  installed: 'Установлено',
  delivered: 'Поставлено',
  cancelled: 'Отменено',
  withdrawn: 'Отозвано',
}
export const METRICS = {
  mass_kg: ['Масса', 'кг'],
  base_drag_area_m2: ['Базовая площадь сопротивления', 'м²'],
  inlet_area_m2: ['Площадь воздухозаборника', 'м²'],
  rejection_kw: ['Теплоотвод', 'кВт'],
  power_kw: ['Мощность', 'кВт'],
  heat_kw: ['Тепловыделение', 'кВт'],
  peak_torque_nm: ['Пиковый момент', 'Н·м'],
  fuel_g_kwh: ['Удельный расход топлива', 'г/кВт·ч'],
  cooling_flow_kg_s: ['Расход теплоносителя', 'кг/с'],
  design_life_km: ['Проектный ресурс', 'км'],
  vertical_rate_n_mm: ['Радиальная жёсткость', 'Н/мм'],
  loaded_radius_m: ['Радиус под нагрузкой', 'м'],
  friction_coefficient: ['Коэффициент сцепления', 'коэф.'],
  window_low_c: ['Начало рабочего окна', '°C'],
  window_high_c: ['Конец рабочего окна', '°C'],
  wear_mm_100km: ['Износ', 'мм/100 км'],
  warmup_kj: ['Энергия прогрева', 'кДж'],
  max_load_n: ['Расчётная нагрузка', 'Н'],
  water_clearance_l_s: ['Отвод воды', 'л/с'],
  total_torque_nm: ['Тормозной момент', 'Н·м'],
  lift_area_m2: ['Эквивалентная площадь прижима', 'м²'],
  drag_area_m2: ['Эквивалентная площадь сопротивления', 'м²'],
  design_clearance_mm: ['Проектный просвет', 'мм'],
  wheel_rate_n_mm: ['Жёсткость колеса', 'Н/мм'],
  static_clearance_mm: ['Статический просвет', 'мм'],
  efficiency: ['КПД', 'коэф.'],
  input_limit_nm: ['Допустимый входной момент', 'Н·м'],
  first_ratio: ['Передаточное число I передачи', 'коэф.'],
  top_ratio: ['Передаточное число высшей передачи', 'коэф.'],
  shift_ms: ['Время переключения', 'мс'],
  loss_heat_kw: ['Тепловая нагрузка', 'кВт'],
  first_output_nm: ['Момент на I передаче', 'Н·м'],
  top_output_nm: ['Момент на высшей передаче', 'Н·м'],
  mechanical_loss_kw: ['Механические потери', 'кВт'],
  shift_interruption_ms: ['Разрыв тяги', 'мс'],
  shaft_kw: ['Мощность на валу', 'кВт'],
  torque_nm: ['Момент на валу', 'Н·м'],
  fuel_kg_h: ['Расход топлива', 'кг/ч'],
  thermal_efficiency: ['Тепловой КПД', 'коэф.'],
  required_cooling_kw: ['Необходимый теплоотвод', 'кВт'],
  contact_force_n: ['Сила сцепления', 'Н'],
  tread_loss_mm_100km: ['Износ протектора', 'мм/100 км'],
  warmup_energy_kj: ['Энергия прогрева', 'кДж'],
}
export const metric = (key) => METRICS[key] || [key, 'ед. источника']

export function orgName(g, id) {
  if (id === 'consolidated') return 'Консолидированный отчёт'
  if (id === 'person:player') return 'Личный счёт'
  if (id?.startsWith('owner:')) return 'Капитал владельца'
  if (id?.startsWith('academy:'))
    return g.game.career.academies?.find((a) => 'academy:' + a.id === id)?.name || 'Академия'
  if (g.world?.programs?.[id])
    return g.world.championships?.[g.world.programs[id].championship]?.name || 'Гоночная программа'
  return g.world?.organizations?.[id]?.name || id || 'Организация'
}
export const positionName = (g, position) =>
  g.world?.positions?.[position]?.name ||
  { supply: 'Снабжение', manufacturer: 'Руководитель производителя', owner: 'Владелец организации' }[
    position
  ] ||
  position ||
  'Ответственный не назначен'

export function currentSeats(g) {
  return g.game.career.assignments
}
export function person(g, id) {
  if (!id) return null
  const seat = currentSeats(g).find((s) => s.occupant?.id === id)
  const source =
    seat?.occupant || g.game.dossiers?.[id]?.person || asList(g.game.personnel).find((p) => p.id === id)
  return source
    ? { ...source, position: seat?.position || source.position, org: seat?.org || source.org }
    : null
}
export function staff(g, positions) {
  const seats = currentSeats(g).filter(
    (s) => s.org === g.game.career.org && s.occupant && s.occupant.id !== 'player',
  )
  for (const position of positions) {
    const seat = seats.find((s) => s.position === position)
    if (seat) return { ...seat.occupant, position: seat.position, org: seat.org }
  }
  return null
}
export const routeKind = (route) =>
  ['finance', 'budget', 'cap', 'commercial', 'economy'].includes(route)
    ? 'finance'
    : ['production', 'inventory', 'facilities'].includes(route)
      ? 'production'
      : [
            'people',
            'drivers',
            'staff',
            'market',
            'academy',
            'funding',
            'preparation',
            'leadership',
          ].includes(route)
        ? 'people'
        : ['capital'].includes(route)
          ? 'capital'
          : ['engineering', 'council', 'research', 'development', 'manufacturer', 'garage'].includes(
                route,
              )
            ? 'engineering'
            : null
export const SUPPORTED_ROUTES = [
  'finance',
  'budget',
  'cap',
  'production',
  'inventory',
  'facilities',
  'people',
  'drivers',
  'staff',
  'academy',
  'preparation',
  'leadership',
  'capital',
  'engineering',
  'council',
  'research',
  'development',
  'manufacturer',
]

export function financeModel(g, selectedScope) {
  const org = g.game.career.org,
    root = g.game.projections?.finance || {}
  const scopes = root.scopes || [org]
  const scope = scopes.includes(selectedScope) ? selectedScope : org
  const view =
    g.game.financeContexts?.[scope] ||
    (scope === org ? root : scope === 'person:player' ? g.game.projections?.['finance-player'] : {}) ||
    {}
  // `accounts` means available wallets. It is NOT the sum of the selected ledger.
  const accounts =
    view.scope === 'consolidated'
      ? view.accounts || [org]
      : [view.scope === 'organization' ? org : view.scope || org]
  const officerId = view.officer?.id
  const officer = person(g, officerId)
  const officerCandidate = asList(view.candidates).find((p) => p.id === officerId) || view.officer
  const year = g.game.career.date.slice(0, 4)
  const budget = g.game.budgets?.[year] || g.game.projections?.budget || {}
  const plan = budget.plan
  const allocations = Object.entries(plan?.allocations || {}).map(([key, limit]) => ({
    key,
    label: CATEGORIES[key] || key,
    limit: limit / 100,
    spent: (budget.actual?.[key] || 0) / 100,
    committed: (budget.reserved?.[key] || 0) / 100,
    available: (limit - (budget.actual?.[key] || 0) - (budget.reserved?.[key] || 0)) / 100,
  }))
  const obligations = asList(view.obligations)
    .slice()
    .sort((a, b) => a.due.localeCompare(b.due))
  const outgoing = obligations.filter((o) => o.amount_cents < 0)
  const firstDue = outgoing.find((o) => o.due >= g.game.career.date)?.due
  const nextOutgoing = total(
    outgoing.filter((o) => o.due === firstDue),
    (o) => -o.amount_cents,
  )
  const forecast = asList(view.forecast).map((f) => ({
    ...f,
    label: shortDate(f.date),
    base: f.base_cents / 100,
    low: f.negative_cents / 100,
    high: f.optimistic_cents / 100,
  }))
  const breakdown = Object.entries(view.breakdown || {}).map(([key, value]) => ({
    key,
    label: CATEGORIES[key] || key,
    income: (value.income_cents || 0) / 100,
    expense: (value.expense_cents || 0) / 100,
  }))
  return {
    scope,
    scopes,
    view,
    accounts,
    officer,
    officerSkill: officerCandidate?.skill,
    cash: view.cash_cents == null ? null : view.cash_cents,
    available: view.available_cents == null ? null : view.available_cents,
    reserve: view.reserve_cents || 0,
    forecast,
    obligations,
    nextOutgoing,
    firstDue,
    budget,
    plan,
    allocations,
    breakdown,
  }
}

export function engineeringModel(g) {
  const p = g.game.projections || {}
  const proposals = asList(p.council?.proposals)
  const projects = [
    ...asList(p.research?.projects),
    ...asList(p.development?.projects),
    ...asList(p.manufacturer?.projects),
  ].filter((x, i, a) => a.findIndex((y) => y.id === x.id) === i)
  const products = []
  if (g.role === 'manufacturer') {
    for (const product of asList(p.manufacturer?.catalog))
      products.push({
        id: product.entry + ':' + product.axis,
        entry: product.entry,
        axis: product.axis,
        label:
          product.title +
          ' · ' +
          (AXES[product.axis] || product.axis) +
          ' / ' +
          (g.world?.championships?.[product.series]?.short_name ||
            product.series?.toUpperCase() ||
            'Программа'),
        versions: asList(product.editions).map((v) => ({
          ...v,
          values: v.values || {},
          source: 'Каталог производителя',
          local: false,
        })),
      })
  } else {
    for (const [entry, report] of Object.entries(g.game.components || {})) {
      if (g.world?.entries?.[entry]?.org !== g.game.career.org) continue
      const grouped = {}
      for (const part of [...Object.values(report.parts || {}), ...asList(report.spares)]) {
        if (!part.parameters) continue
        const axis = part.slot
        grouped[axis] ||= []
        if (!grouped[axis].some((v) => v.id === part.specification))
          grouped[axis].push({
            id: part.specification,
            version: part.version,
            title: part.title,
            values: part.parameters,
            installed: report.parts?.[axis]?.specification === part.specification,
            source: 'Раскрытая спецификация своего автомобиля',
            local: false,
          })
      }
      for (const [axis, versions] of Object.entries(grouped))
        products.push({
          id: entry + ':' + axis,
          entry,
          axis,
          label: '№' + (g.world?.entries?.[entry]?.number || entry) + ' · ' + (AXES[axis] || axis),
          versions,
        })
    }
  }
  const capacity = Object.entries(p.development?.capacity || {}).map(([key, value]) => ({
    ...value,
    key,
    installed: value.owned ?? value.slots,
    used: value.used || 0,
  }))
  return { proposals, projects, products, capacity }
}

export function productionModel(g) {
  const p = g.game.projections || {}
  const items = [...asList(p.production?.items), ...asList(p.manufacturer?.inventory)].filter(
    (x, i, a) => a.findIndex((y) => y.id === x.id) === i,
  )
  const groups = Object.entries(AXES)
    .map(([key, label]) => ({
      key,
      label,
      stock: items.filter((i) => (i.slot || i.axis) === key && i.status === 'stock').length,
      installed: items.filter((i) => (i.slot || i.axis) === key && i.status === 'installed').length,
      inspection: items.filter(
        (i) => (i.slot || i.axis) === key && ['inspection', 'quality', 'repair'].includes(i.status),
      ).length,
    }))
    .filter((row) => row.stock + row.installed + row.inspection)
  const needs = asList(p.production?.needs)
  const capacity = asList(p.production?.capacity).map((row) => ({
    ...row,
    slots: total(asList(row.sites), (s) => s.slots),
    used: total(asList(row.sites), (s) => s.used),
  }))
  const projects = engineeringModel(g).projects
  const timeline = projects
    .filter((p) => p.commissioned && p.estimated_finish && !['cancelled', 'withdrawn'].includes(p.stage))
    .map((p) => ({
      id: p.id,
      label: p.title || AXES[p.axis] || 'Работа штаба',
      start: p.commissioned,
      end: p.estimated_finish,
      stage: p.stage,
      local: !!p.local,
      route:
        g.role === 'manufacturer'
          ? 'manufacturer'
          : p.kind === 'production'
            ? 'production'
            : p.kind === 'research'
              ? 'research'
              : 'development',
      tab: g.role === 'manufacturer' ? 'factory' : '',
      entity: p.id,
    }))
  const assets = [...asList(p.facilities?.assets)].filter((a) => a.owner === g.game.career.org)
  for (const a of assets)
    if (a.start && a.ready && ['construction', 'upgrade'].includes(a.status))
      timeline.push({
        id: a.id,
        label: p.facilities?.types?.[a.kind] || a.kind,
        start: a.start,
        end: a.ready,
        stage: a.status,
        local: !!a.local,
        route: 'facilities',
        tab: 'organization',
        entity: a.id,
      })
  for (const b of [...asList(p.facilities?.bookings)])
    if (b.start && b.end && (b.org === g.game.career.org || assets.some((a) => a.id === b.facility)))
      timeline.push({
        id: b.id,
        label:
          'Бронирование · ' +
          (p.facilities?.types?.[assets.find((a) => a.id === b.facility)?.kind] || 'мощность'),
        start: b.start,
        end: b.end,
        stage: 'booking',
        local: !!b.local,
        route: 'facilities',
        tab: 'bookings',
        entity: b.id,
      })
  return {
    items,
    groups,
    needs,
    capacity,
    timeline,
    assets,
    storage: p.production?.storage || {},
    windows: asList(p.facilities?.windows),
    projects,
  }
}

export function peopleModel(g) {
  const org = g.game.career.org,
    seats = currentSeats(g).filter((s) => s.org === org)
  const own = seats
    .filter((s) => s.occupant)
    .map((s) => ({
      ...s.occupant,
      position: s.position,
      seat: s.id,
      local: s.local,
      academy: s.academy,
    }))
  const vacant = seats.filter((s) => !s.occupant)
  const crews = []
  for (const row of asList(g.game.projections?.production?.capacity))
    if (row.crew && !crews.some((c) => c.label === row.crew.name))
      crews.push({ key: row.kind, label: row.crew.name, ...row.crew })
  const endedSoon = own
    .map((p) => {
      const current = g.game.dossiers?.[p.id]?.current
      return { ...p, contract: current?.end ? current : asList(current).find((c) => c?.end) }
    })
    .filter(
      (p) => p.contract?.end >= g.game.career.date && p.contract.end < addDays(g.game.career.date, 90),
    )
  return { seats, own, vacant, crews, endedSoon }
}

function baseBrief(g, kind, author) {
  return {
    id: kind + ':' + g.game.career.org,
    date: g.game.career.date,
    kind,
    author,
    authorRole: positionName(g, author?.position),
    source: 'Карьерная база · ' + shortDate(g.game.career.date),
    facts: [],
    options: [],
    limits: [],
    positions: [],
    urgency: { label: 'Плановое решение', tone: 'neutral' },
  }
}

export function buildBrief(g, route, context = {}) {
  const kind = routeKind(route),
    role = g.role
  if (!kind) return null
  if (kind === 'finance') {
    const f = financeModel(g, context.scope),
      b = baseBrief(g, kind, f.officer),
      horizon = f.forecast.at(-1),
      crossed = f.forecast.find((r) => r.low < 0)
    return {
      ...b,
      id: b.id + ':' + f.scope,
      eyebrow: 'Финансовая записка',
      authorRole: 'Ответственный за прогноз · ' + positionName(g, f.officer?.position),
      title: crossed
        ? 'Пессимистичный сценарий уходит ниже нуля'
        : 'Ближайшие выплаты нужно держать в резерве',
      summary:
        f.view.recommendation ||
        'Сопоставьте доступные деньги и подтверждённые обязательства перед новым решением.',
      consequence:
        'Деньги на счёте, сезонный бюджет и регламентный лимит ограничивают разные решения. Утверждённый бюджет сам по себе не оплачивает контракт.',
      urgency: {
        label: f.view.overdue_cents
          ? 'Есть просрочка'
          : crossed
            ? 'Проверить финансовый риск'
            : 'До ' + (f.firstDue ? shortDate(f.firstDue) : 'нового обязательства'),
        tone: f.view.overdue_cents || crossed ? 'warning' : 'neutral',
      },
      facts: [
        ['Доступно сейчас', euro(f.available, true)],
        ['Ближайшие выплаты', euro(f.nextOutgoing, true)],
        ['К концу прогноза', horizon ? euro(horizon.base * 100, true) : 'Нет прогноза'],
      ],
      competence:
        f.officerSkill == null
          ? null
          : { label: 'Доступная оценка качества прогноза', value: f.officerSkill },
      options: [
        {
          label: 'Разобрать обязательства',
          detail: f.firstDue
            ? 'Платежи к ' + shortDate(f.firstDue) + ' и связанные договоры'
            : 'Раскрыть будущие выплаты',
          route: 'finance',
          tab: 'terms',
          entity: f.obligations[0]?.id,
          cost: null,
        },
        {
          label: 'Сравнить сценарии',
          detail: 'Базовый, негативный и оптимистичный прогноз',
          analysis: 'forecast',
        },
        {
          label:
            role === 'manager' ? 'Подготовить запрос владельцу' : 'Пересмотреть распределение бюджета',
          detail:
            role === 'manager'
              ? 'Утверждение остаётся за владельцем'
              : 'Сопоставить лимиты и обязательства подразделений',
          route: 'budget',
          tab: role === 'manager' ? 'requests' : 'plan',
        },
      ],
      limits: [
        f.officer?.id === 'player'
          ? 'В исходной карьере ответственным назначен игрок. Отдельный финансовый директор не придуман.'
          : 'Назначение и компетенция ответственного взяты из финансовой проекции.',
        f.adjustment
          ? 'Локальные платежи сдвигают денежный остаток. Будущая экономика и риски после них повторно не рассчитываются.'
          : 'Сценарии — исходная оценка API на шесть месяцев, а не обещание результата.',
        'Диапазон сценариев не является статистическим доверительным интервалом.',
      ],
      source: 'finance / forecast / obligations · ' + orgName(g, f.scope),
    }
  }
  if (kind === 'engineering') {
    const e = engineeringModel(g),
      proposal =
        e.proposals.find((p) => p.id === context.proposal) ||
        e.proposals.find((p) => p.status === 'open') ||
        e.proposals[0]
    if (role !== 'manufacturer' && proposal) {
      const author = role === 'owner' ? staff(g, ['manager']) : person(g, proposal.lead),
        b = baseBrief(g, kind, author)
      const recommendation = asList(proposal.options)[proposal.recommended ?? 0]
      const proposalSummary = recommendation
        ? 'Предложение штаба: ' +
          recommendation.title.replace('Исследовать подвеска', 'Исследовать подвеску') +
          '. ' +
          (recommendation.result || '').replace('КБ', 'конструкторского бюро')
        : proposal.hypothesis
      const proposalImpact = recommendation
        ? 'Цена варианта — ' +
          euro(recommendation.cost_cents) +
          ', срок — ' +
          (recommendation.days ? recommendation.days + ' дн.' : 'без новой работы') +
          '. ' +
          (recommendation.risk || '')
        : 'Перед выбором сравните аргументы ведущего специалиста и ограничения смежных узлов.'
      const options = asList(proposal.options).map((o, index) => ({
        ...o,
        label: o.title?.replace('Исследовать подвеска', 'Исследовать подвеску'),
        detail: o.result?.replace('КБ', 'конструкторского бюро'),
        warning: o.risk,
        cost: o.cost_cents,
        days: o.days,
        recommended: index === proposal.recommended,
        route: 'council',
        tab: 'agenda',
        entity: proposal.id,
      }))
      return {
        ...b,
        id: proposal.id,
        date: proposal.date || b.date,
        eyebrow: role === 'owner' ? 'Доклад руководителя программы' : 'Вопрос инженерному штабу',
        title: proposal.observation || proposal.occasion,
        summary: proposalSummary,
        consequence:
          role === 'owner'
            ? 'Решение о конкретном исследовании или сборке принимает менеджер. Здесь доступны основания, стоимость и контроль руководителя.'
            : proposalImpact,
        urgency: {
          label: proposal.blocked ? 'Есть ограничение' : 'До изменения спецификации',
          tone: proposal.blocked ? 'warning' : 'neutral',
        },
        facts: [
          ['Предмет', proposal.subject],
          ['Ведущий специалист', person(g, proposal.lead)?.name || 'Не назначен'],
          [
            'Оценка автора',
            proposal.confidence == null ? 'Не раскрыта' : proposal.confidence + ' / 100',
          ],
        ],
        competence: null,
        options:
          role === 'owner'
            ? [
                {
                  label: 'Обсудить с менеджером',
                  detail: 'Мандат и цели руководителя',
                  route: 'leadership',
                  tab: 'mandate',
                  entity: author?.id,
                },
                {
                  label: 'Оценить финансирование',
                  detail: 'Бюджет программы и резерв',
                  route: 'budget',
                  tab: 'plan',
                },
              ]
            : options,
        positions: asList(proposal.positions).map((p) => ({ ...p, person: person(g, p.person) })),
        limits: [
          'Уверенность — оценка специалиста в исходной проекции, не вероятность победы или гарантия прироста.',
          proposal.blocked ||
            'Расчёт не доказывает поведение узла на трассе. Испытания и выпущенная спецификация — отдельные этапы.',
        ],
        source: 'council.proposals · ' + proposal.occasion,
        proposal,
      }
    }
    const author = staff(g, ['chief-engineer', 'technical-advisor']),
      b = baseBrief(g, kind, author),
      products = e.products,
      cases = asList(g.game.projections?.manufacturer?.cases)
    return {
      ...b,
      eyebrow: 'Технический директор · Продуктовый обзор',
      title: products.length
        ? 'Продукт начинается с проверяемой спецификации'
        : 'Инженерная программа ещё не сформирована',
      summary: products.length
        ? 'В каталоге ' +
          products.length +
          ' сочетаний продукта и клиентской программы. Раскрытые параметры можно сравнить без придуманного общего рейтинга.'
        : 'Выберите доступную программу и сформулируйте техническую задачу.',
      consequence:
        'Приоритет текущего продукта и следующего поколения делит одни и те же ресурсы. Новая редакция проходит испытания и выпуск до производства.',
      facts: [
        ['Продуктовых программ', products.length],
        ['Работ в эталоне', e.projects.length],
        ['Обращений в срезе', cases.length],
      ],
      options: [
        {
          label: 'Сравнить спецификации',
          detail: 'Параметры, единицы и расчётные режимы',
          analysis: 'comparison',
        },
        {
          label: 'Открыть клиентские задачи',
          detail: 'Только переданные по договору сведения',
          route: 'manufacturer',
          tab: 'cases',
        },
        {
          label: 'Распределить программу',
          detail: 'Приоритет текущего и следующего поколения',
          route: 'manufacturer',
          tab: 'program',
        },
      ],
      limits: [
        'Технические данные клиентов доступны в пределах действующего договора; сведения конкурентов не раскрываются.',
        'Пустая история испытаний и отказов не означает доказанную надёжность.',
      ],
      source: 'manufacturer.catalog / projects / cases',
    }
  }
  if (kind === 'production') {
    const p = productionModel(g),
      author = staff(
        g,
        role === 'owner'
          ? ['manager']
          : role === 'manufacturer'
            ? ['supply', 'chief-engineer']
            : ['chief-mechanic', 'supply'],
      ),
      b = baseBrief(g, kind, author),
      quantity = total(p.needs, (n) => n.quantity),
      damaged = p.items.filter((i) => i.damaged || i.rejected).length
    const decisionRoute =
      role === 'owner' ? 'leadership' : role === 'manufacturer' ? 'manufacturer' : 'production'
    return {
      ...b,
      eyebrow:
        role === 'owner' ? 'Доклад о готовности мощностей' : 'Снабжение и готовность производства',
      title: damaged
        ? 'Экземпляры требуют решения о состоянии'
        : quantity
          ? 'Есть рекомендации по резерву компонентов'
          : p.timeline.length
            ? 'Согласованные работы видны на календаре'
            : 'Мощности свободны для следующего решения',
      summary: quantity
        ? 'Исходная потребность предлагает ' +
          quantity +
          ' дополнительных экземпляров по ' +
          p.needs.length +
          ' позициям. Это рекомендация запаса, а не объявленная поломка.'
        : 'Сводка показывает реальные экземпляры, доступные мощности и утверждённые работы. Пустую очередь можно использовать для подготовки следующей программы.',
      consequence:
        role === 'owner'
          ? 'Владелец определяет инвестиции в мощности и оценивает руководителя; оперативную очередь утверждает менеджер.'
          : 'Чертёж не заменяет физический экземпляр. Производство, контроль качества и установка занимают отдельные этапы.',
      urgency: {
        label: damaged
          ? 'Проверить перед использованием'
          : quantity
            ? 'До следующей сборки'
            : 'Плановое решение',
        tone: damaged ? 'warning' : 'neutral',
      },
      facts: [
        ['На складе', p.items.filter((i) => i.status === 'stock').length + ' шт.'],
        ['Рекомендованный резерв', quantity + ' шт.'],
        ['Свободно хранения', p.storage.free == null ? 'Не раскрыто' : p.storage.free + ' мест'],
      ],
      options:
        role === 'owner'
          ? [
              {
                label: 'Обсудить готовность',
                detail: 'Мандат менеджера и цели программы',
                route: 'leadership',
                tab: 'mandate',
              },
              {
                label: 'Оценить мощности',
                detail: 'Инвестиции, состояние и бронирования',
                route: 'facilities',
                tab: 'capacity',
              },
            ]
          : [
              {
                label: quantity ? 'Открыть потребность' : 'Открыть производственную очередь',
                detail: quantity
                  ? 'Спецификация, способ и цена изготовления'
                  : 'Создать работу в существующем процессе',
                route: decisionRoute,
                tab: role === 'manufacturer' ? 'factory' : quantity ? 'needs' : 'queue',
                entity: p.needs[0]?.specification,
              },
              {
                label: 'Посмотреть экземпляры',
                detail: 'Состояние, ресурс и доступные действия',
                route: role === 'manufacturer' ? 'manufacturer' : 'inventory',
                tab: role === 'manufacturer' ? 'factory' : '',
              },
              {
                label: 'Сопоставить загрузку',
                detail: 'Мощности и доступный персонал',
                analysis: 'capacity',
              },
            ],
      limits: [
        'Исходная потребность не пересимулируется после локальных действий; изменённые экземпляры показаны отдельно.',
        'Дата на диаграмме — опубликованная или локальная оценка готовности. Завершение не происходит автоматически.',
      ],
      source: 'production.needs / items / capacity; facilities.windows',
    }
  }
  if (kind === 'people') {
    const p = peopleModel(g),
      author = staff(
        g,
        role === 'owner'
          ? ['manager', 'academy-director']
          : ['chief-engineer', 'chief-analyst', 'academy-director'],
      ),
      b = baseBrief(g, kind, author)
    const ownOperational = p.own.filter(
      (p) => !['owner', 'manager', 'manufacturer', 'driver'].includes(p.position),
    )
    return {
      ...b,
      eyebrow: role === 'owner' ? 'Руководители и ответственность' : 'Люди за результатом организации',
      title: p.vacant.length
        ? 'В структуре есть незакрытые места'
        : role === 'owner'
          ? 'Проверяйте руководителя по его мандату'
          : 'Состав есть. Теперь важны компетенции и нагрузка.',
      summary: p.vacant.length
        ? 'В текущем составе ' +
          p.vacant.length +
          ' незанятых мест. Сначала определите, какие из них входят в ваши полномочия.'
        : 'В своей организации доступны ' +
          ownOperational.length +
          ' ключевых специалистов. Сравнивайте профильные навыки, усталость и рабочую нагрузку.',
      consequence:
        role === 'owner'
          ? 'Владелец назначает менеджера и управляет своей академией. Он не заменяет главного инженера или пилота в обход менеджера.'
          : 'Найм не закрывает вопрос подготовки автоматически. Состав, компетенции, состояние и обязательства по контрактам нужно рассматривать вместе.',
      facts: [
        ['Занято мест', p.own.length],
        ['Вакансии', p.vacant.length],
        ['Производственные группы', p.crews.length],
      ],
      options:
        role === 'owner'
          ? [
              {
                label: 'Рассмотреть мандат',
                detail: 'Цели, полномочия и руководитель',
                route: 'leadership',
                tab: 'mandate',
              },
              { label: 'Открыть академию', detail: 'Воспитанники и ресурсы развития', route: 'academy' },
            ]
          : [
              {
                label: 'Сопоставить компетенции',
                detail: 'Только реальные навыки собственных сотрудников',
                analysis: 'skills',
              },
              {
                label: 'Проверить штат',
                detail: 'Назначения и доступные кадровые решения',
                route: 'staff',
              },
              {
                label: 'Подготовка и нагрузка',
                detail: 'Программы специалистов и состояние коллектива',
                route: 'preparation',
              },
            ],
      limits: [
        'Шкала навыков 0–100 относится к конкретной компетенции; общего выдуманного рейтинга здесь нет.',
        'История развития показывается только при наличии записей. Достижения команды не приписываются каждому её сотруднику.',
      ],
      source: 'career.assignments; personnel dossiers; production.capacity.crew',
    }
  }
  if (kind === 'capital') {
    const c = g.game.projections?.capital || {},
      author = staff(g, ['manager']),
      b = baseBrief(g, kind, author),
      v = c.valuation || {}
    return {
      ...b,
      eyebrow: 'Инвестиционная записка',
      title: 'Капитал должен работать на устойчивость программ',
      summary:
        'Оценка объединяет доступные в проекции деньги, активы, долг и договорную стоимость. Спортивный допуск остаётся отдельным правом.',
      consequence:
        'Покупка актива не создаёт автоматически команду, вакантный слот чемпионата или полномочия менеджера. Сначала оцените влияние на денежный резерв.',
      facts: [
        ['Оценка организации', euro(v.value_cents, true)],
        ['Стоимость активов', euro(v.assets_cents, true)],
        ['Долг', euro(v.debt_cents, true)],
      ],
      options: [
        {
          label: 'Сопоставить денежные сценарии',
          detail: 'Ликвидность перед инвестиционным решением',
          route: 'finance',
          tab: 'forecast',
        },
        {
          label: 'Рассмотреть активы и программы',
          detail: 'Владение, стоимость и спортивный допуск',
          route: 'capital',
          tab: 'assets',
        },
        {
          label: 'Оценить руководителя',
          detail: 'Стратегия через цели и мандат',
          route: 'leadership',
          tab: 'mandate',
        },
      ],
      limits: [
        'Стоимость из read model не является гарантированной ценой продажи.',
        'Управленческая записка собрана из доступной проекции; новой позиции менеджера или решения совета не сгенерировано.',
      ],
      source: 'capital.valuation / assets / programs',
    }
  }
  return null
}
