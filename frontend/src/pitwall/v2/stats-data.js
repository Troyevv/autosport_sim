/** Statistics read model for the reference. No simulation, no extrapolated results.
 * Public world facts and the active career only. Never merge private data across roles.
 */
export const STAT_CATEGORIES = [
  {
    id: 'drivers',
    label: 'Пилоты',
    icon: 'UserRound',
    singular: 'Пилот',
    description:
      'Составы, допуски и карьерные связи. Спортивные результаты появятся после завершённых сессий.',
  },
  {
    id: 'staff',
    label: 'Персонал',
    icon: 'UsersRound',
    singular: 'Специалист',
    description: 'Люди за результатом: назначения, специализации и подтверждённое участие в работе.',
  },
  {
    id: 'teams',
    label: 'Команды',
    icon: 'Flag',
    singular: 'Команда',
    description: 'Гоночные программы, составы, автомобили и технические партнёры единого мира.',
  },
  {
    id: 'manufacturers',
    label: 'Производители',
    icon: 'Factory',
    singular: 'Производитель',
    description:
      'Продукция и публичные связи поставок. Результаты клиентов отделены от результатов производителя.',
  },
  {
    id: 'circuits',
    label: 'Трассы',
    icon: 'Route',
    singular: 'Трасса',
    description: 'Календарь, чемпионаты и версии трасс. Рекорды разных конфигураций не объединяются.',
  },
  {
    id: 'championships',
    label: 'Чемпионаты',
    icon: 'Trophy',
    singular: 'Чемпионат',
    description:
      'Регламенты, участники, календарь и граница между реальной предысторией и вашей карьерой.',
  },
  {
    id: 'vehicles',
    label: 'Автомобили и компоненты',
    icon: 'CarFront',
    singular: 'Автомобиль',
    description:
      'Поколения, технические партнёры и доступные спецификации без вымышленных рейтингов скорости.',
  },
  {
    id: 'academies',
    label: 'Академии',
    icon: 'GraduationCap',
    singular: 'Академия',
    description: 'Известные академии, воспитанники и соглашения в пределах доступа текущей карьеры.',
  },
  {
    id: 'countries',
    label: 'Страны',
    icon: 'Globe2',
    singular: 'Страна',
    description:
      'Представительство в игровом мире. Гражданство спортсмена и страна команды считаются раздельно.',
  },
  {
    id: 'sponsors',
    label: 'Спонсоры',
    icon: 'Handshake',
    singular: 'Спонсор',
    description: 'Коммерческие бренды и подтверждённые соглашения текущей организации.',
  },
]
export const factContext = (f) => f.body?.data?.context || f.body?.context || {}
export const FACT_KINDS = {
  'entry-result': 'Классификация заявки',
  lap: 'Хронометраж круга',
  record: 'Подтверждённый рекорд',
  'session-start': 'Начало сессии',
  'session-end': 'Завершение сессии',
  achievement: 'Достижение',
  appointment: 'Назначение',
  licence: 'Лицензия',
  'starting-licence': 'Допуск к серии',
  scholarship: 'Академическое соглашение',
  'financial-obligation': 'Платёжное обязательство',
  engineering: 'Инженерное решение',
  business: 'Коммерческое решение',
  people: 'Кадровое решение',
  calendar: 'Событие календаря',
  day: 'Рабочий день',
  save: 'Сохранение',
  livery: 'Ливрея',
}
export const AXIS_NAMES = {
  engine: 'Двигатель',
  transmission: 'Трансмиссия',
  chassis: 'Шасси',
  tyre: 'Шины',
}
const unique = (x) => [...new Set(x.filter(Boolean))]
const nameSort = (a, b) => a.name.localeCompare(b.name, 'ru')

export function buildStatisticsIndex(g) {
  const w = g.world,
    game = g.game,
    c = game.career,
    people = game.personnel || [],
    entries = Object.values(w.entries || {}),
    cars = w.cars || {},
    orgs = w.organizations || {},
    events = w.events || [],
    facts = game.projections?.statistics?.items || []
  const logos = Object.fromEntries(
    (g.data.media || []).filter((m) => m.kind === 'logo').map((m) => [m.entity, m.local_url]),
  )
  const country = (id) => w.countries[id] || id || 'Не указана'
  const orgName = (id) => orgs[id]?.name || id || 'Свободный агент'
  const personMap = Object.fromEntries(people.map((p) => [p.id, p]))
  const factsByPerson = {},
    factsByOrg = {}
  facts
    .filter((f) => f.access === 'public')
    .forEach((f) => {
      const x = factContext(f)
      for (const id of new Set([x.person, ...(f.body?.data?.crew || [])].filter(Boolean)))
        (factsByPerson[id] ??= []).push(f)
      if (x.org) (factsByOrg[x.org] ??= []).push(f)
    })
  const personRows = people.map((p) => ({
    id: p.id,
    name: p.name,
    type: p.position === 'driver' ? 'drivers' : 'staff',
    country: p.country,
    org: p.org || '',
    series: p.programs || [],
    role: w.positions[p.position]?.name || p.position,
    meta: orgName(p.org),
    detail: p.specialty || '',
    age: p.age,
    position: p.position,
    face: p.face,
    source: 'Публичный кадровый справочник текущей карьеры',
    _person: p,
  }))
  const teamRows = Object.values(orgs)
    .filter((o) => o.kind === 'team')
    .map((o) => {
      const owned = entries.filter((e) => e.org === o.id)
      return {
        id: o.id,
        name: o.name,
        type: 'teams',
        country: o.country,
        org: o.id,
        series: o.programs || [],
        meta: o.base || country(o.country),
        detail: (o.programs || []).map((s) => w.championships[s]?.name || s).join(' · '),
        count: owned.length,
        countLabel: 'заявок',
        logo: logos[o.id],
        color: o.color,
        entries: owned,
        people: people.filter((p) => p.org === o.id),
        source: 'Организации, программы и заявки мира',
        _org: o,
      }
    })
  const makerRows = Object.values(orgs)
    .filter((o) => o.kind !== 'team')
    .map((o) => {
      const supplied = entries.filter((e) => Object.values(cars[e.car]?.suppliers || {}).includes(o.id))
      return {
        id: o.id,
        name: o.name,
        type: 'manufacturers',
        country: o.country,
        org: o.id,
        series: o.programs || [],
        meta: o.base || country(o.country),
        detail: (o.lines || []).map((x) => AXIS_NAMES[x] || x).join(' · '),
        count: unique(supplied.map((e) => e.org)).length,
        countLabel: 'клиентов в заявках',
        logo: logos[o.id],
        color: o.color,
        entries: supplied,
        lines: o.lines || [],
        source: 'Указанные поставщики автомобилей в заявках',
        _org: o,
      }
    })
  const tracks = new Map()
  events.forEach((e) => {
    if (!e.track_id) return
    if (!tracks.has(e.track_id))
      tracks.set(e.track_id, {
        id: e.track_id,
        name: e.circuit || e.name,
        type: 'circuits',
        country: e.country,
        org: '',
        series: [],
        events: [],
        source: 'Календарь мира · track_id, circuit, country',
      })
    const t = tracks.get(e.track_id)
    t.events.push(e)
    if (e.country) t.country = e.country
    t.series = unique([...t.series, e.series])
  })
  const circuitRows = [...tracks.values()].map((t) => ({
    ...t,
    meta: country(t.country),
    detail: t.series.map((s) => w.championships[s]?.name || s).join(' · '),
    count: t.events.filter((e) => e.kind === 'round').length,
    countLabel: 'этапов в календаре',
  }))
  const championshipRows = Object.entries(w.championships || {}).map(([id, s]) => {
    const enrolled = entries.filter((e) => e.championship === id)
    return {
      id,
      name: s.name,
      type: 'championships',
      series: [id],
      country: '',
      org: '',
      meta: s.discipline,
      detail: (s.classes || []).join(' · '),
      count: enrolled.length,
      countLabel: 'заявок',
      logo: logos[id],
      entries: enrolled,
      events: events.filter((e) => e.series === id),
      rules: s,
      source: 'Регламент и календарь сезона 2025',
    }
  })
  const vehicleRows = entries.map((e) => {
    const car = cars[e.car] || {}
    return {
      id: e.car,
      name: car.name || e.car,
      type: 'vehicles',
      series: [e.championship],
      country: orgs[e.org]?.country,
      org: e.org,
      meta: orgName(e.org) + ' · №' + e.number,
      detail: e.category,
      entry: e,
      car,
      source: 'Гараж · версия поколения и поставщики заявки',
    }
  })
  const academyRows = (c.academies || []).map((a) => {
    const scholarships = (c.scholarships || []).filter((s) => s.academy === a.id)
    return {
      id: a.id,
      name: a.name,
      type: 'academies',
      country: orgs[a.org]?.country,
      org: a.org,
      series: orgs[a.org]?.programs || [],
      meta: orgName(a.org),
      detail: 'Доступ текущей организации',
      count: unique(scholarships.map((s) => s.person)).length,
      countLabel: 'воспитанников',
      scholarships,
      academy: a,
      source: 'Академии и соглашения активной карьеры',
      internal: a.org === c.org,
    }
  })
  const brands = game.projections?.commercial?.brands || [],
    contracts = game.projections?.commercial?.contracts || []
  const sponsorRows = brands.map((b) => {
    const agreements = contracts.filter((x) => x.sponsor === b.id && x.status === 'signed')
    return {
      id: b.id,
      name: b.name,
      type: 'sponsors',
      country: b.country,
      org: '',
      series: b.series || [],
      meta: country(b.country),
      detail: b.category || 'Коммерческий партнёр',
      logo: logos[b.id],
      agreements,
      markets: b.markets || [],
      count: agreements.length,
      countLabel: 'соглашений в карьере',
      source: 'Каталог коммерческих брендов; только известные соглашения',
      brand: b,
    }
  })
  const countryRows = Object.entries(w.countries || {})
    .map(([id, name]) => {
      const persons = personRows.filter((p) => p.country === id),
        teams = teamRows.filter((o) => o.country === id),
        makers = makerRows.filter((o) => o.country === id),
        circuits = circuitRows.filter((t) => t.country === id)
      return {
        id,
        name,
        type: 'countries',
        country: id,
        org: '',
        series: unique([...persons, ...teams, ...makers, ...circuits].flatMap((p) => p.series)),
        meta: id,
        detail: teams.length + ' команд · ' + makers.length + ' производителей',
        count: persons.filter((p) => p.type === 'drivers').length,
        countLabel: 'пилотов',
        persons,
        teams,
        makers,
        circuits,
        source: 'Гражданство людей и страна регистрации организаций в каталоге',
      }
    })
    .filter((x) => x.persons.length || x.teams.length || x.makers.length || x.circuits.length)
  const byType = {
    drivers: personRows.filter((p) => p.type === 'drivers'),
    staff: personRows.filter((p) => p.type === 'staff'),
    teams: teamRows,
    manufacturers: makerRows,
    circuits: circuitRows,
    championships: championshipRows,
    vehicles: vehicleRows,
    academies: academyRows,
    countries: countryRows,
    sponsors: sponsorRows,
  }
  Object.keys(byType).forEach((k) => byType[k].sort(nameSort))
  const all = Object.values(byType).flat(),
    lookup = Object.fromEntries(all.map((p) => [p.type + ':' + p.id, p]))
  return {
    byType,
    all,
    lookup,
    logos,
    facts,
    factsByPerson,
    factsByOrg,
    personMap,
    country,
    orgName,
    entries,
    cars,
    orgs,
    events,
    career: c,
    world: w,
  }
}

export function profileRows(item, index) {
  const w = index.world
  const orgLink =
    item.org && index.orgs[item.org]
      ? {
          label: index.orgName(item.org),
          type: index.orgs[item.org].kind === 'team' ? 'teams' : 'manufacturers',
          id: item.org,
        }
      : null
  const common = [
    ['Страна', index.country(item.country)],
    ['Чемпионаты', item.series.map((s) => w.championships[s]?.name || s).join(', ') || 'Не закреплены'],
  ]
  switch (item.type) {
    case 'drivers':
    case 'staff':
      return [
        ['Организация', orgLink || 'Свободный агент'],
        ['Роль', item.role],
        ['Возраст', item.age != null ? item.age + ' лет' : 'Нет публичных данных'],
        ['Специализация', item.detail || 'Не указана'],
        ...common,
      ]
    case 'teams':
      return [
        ['База', item._org.base || 'Не указана'],
        ['Заявки', item.entries.length],
        ['Сотрудники в справочнике', item.people.length],
        ...common,
      ]
    case 'manufacturers':
      return [
        ['База', item._org.base || 'Не указана'],
        ['Продукция', item.lines.map((a) => AXIS_NAMES[a] || a).join(', ') || 'Не указана'],
        ['Команды-клиенты', item.count],
        ['Заявки с продукцией', item.entries.length],
        ...common,
      ]
    case 'circuits':
      return [
        ['Календарный идентификатор', item.id],
        ['Гоночные этапы в календаре', item.count],
        ['Длина / конфигурация', 'Геометрия ещё не подключена'],
        ...common,
      ]
    case 'championships':
      return [
        ['Дисциплина', item.rules.discipline],
        ['Классы', item.rules.classes.join(', ')],
        ['Заявки', item.entries.length],
        ['Экипаж', item.rules.crew?.join('–') + ' пилотов'],
        ['Версия правил', item.rules.rules_id],
        ['Сезон', item.rules.season_id],
      ]
    case 'vehicles':
      return [
        ['Команда', orgLink],
        ['Конструктор', item.car.constructor || 'Не указан'],
        ['Категория', item.entry.category],
        ['Год', item.car.season],
        ['Поколение', item.car.generation],
        ['Регламент', item.car.regulation],
      ]
    case 'academies':
      return [
        ['Организация', orgLink],
        ['Воспитанники', item.count],
        ['Доступ', 'Текущая организация'],
        ...common,
      ]
    case 'countries':
      return [
        ['Пилоты', item.count],
        ['Специалисты', item.persons.filter((p) => p.type === 'staff').length],
        ['Команды', item.teams.length],
        ['Производители', item.makers.length],
        ['Трассы в календарях', item.circuits.length],
      ]
    case 'sponsors':
      return [
        ['Бренд', item.name],
        ['Страна', index.country(item.country)],
        ['Рынки', item.markets.map(index.country).join(', ') || 'Не указаны'],
        ['Известные соглашения', item.agreements.length],
        ['Граница доступа', 'Публичный бренд; договоры своей организации'],
      ]
    default:
      return common
  }
}
