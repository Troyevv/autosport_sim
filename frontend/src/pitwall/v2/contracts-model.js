export const CONTRACT_TYPES = {
  driver: {
    name: 'Контракт пилота',
    plural: 'Пилоты',
    icon: 'Helmet',
    code: 'DRV',
    question: 'Кто выйдет на старт под нашими цветами?',
    route: 'market',
    action: 'Подобрать пилота',
  },
  staff: {
    name: 'Трудовой договор',
    plural: 'Сотрудники',
    icon: 'Users',
    code: 'STF',
    question: 'Кому доверим работу команды?',
    route: 'market',
    action: 'Подобрать специалиста',
  },
  leadership: {
    name: 'Мандат руководителя',
    plural: 'Руководство',
    icon: 'Building2',
    code: 'DIR',
    question: 'Каких результатов ждёт собственник?',
    route: 'leadership',
    action: 'Обсудить полномочия',
  },
  sponsor: {
    name: 'Спонсорское соглашение',
    plural: 'Спонсорство',
    icon: 'Handshake',
    code: 'SPN',
    question: 'Какую ценность мы создаём для партнёра?',
    route: 'commercial',
    tab: 'brands',
    action: 'Выбрать партнёра',
  },
  supply: {
    name: 'Договор поставки',
    plural: 'Поставки',
    icon: 'Package',
    code: 'SUP',
    question: 'Что получит клиент и на каких условиях?',
    route: 'commercial',
    tab: 'supplies',
    action: 'Открыть поставки',
  },
  technical: {
    name: 'Техническое партнёрство',
    plural: 'Партнёрства',
    icon: 'Wrench',
    code: 'TEC',
    question: 'Как далеко простирается сотрудничество?',
    route: 'commercial',
    tab: 'brands',
    action: 'Обсудить пакет',
  },
  funding: {
    name: 'Финансирование пилота',
    plural: 'Поддержка пилотов',
    icon: 'HeartHandshake',
    code: 'FND',
    question: 'Как поддержка превратится в возможность?',
    route: 'funding',
    action: 'Открыть финансирование',
  },
  academy: {
    name: 'Академическое соглашение',
    plural: 'Академии',
    icon: 'GraduationCap',
    code: 'ACD',
    question: 'В чьё будущее инвестирует академия?',
    route: 'academy',
    action: 'Открыть академию',
  },
  facilitylease: {
    name: 'Доступ к инфраструктуре',
    plural: 'Аренда',
    icon: 'Factory',
    code: 'FAC',
    question: 'Какие мощности и в какие даты нам нужны?',
    route: 'facilities',
    tab: 'rent',
    action: 'Выбрать мощности',
  },
  loan: {
    name: 'Заёмное финансирование',
    plural: 'Займы',
    icon: 'Landmark',
    code: 'CRD',
    question: 'Сможет ли организация обслуживать долг?',
    route: 'capital',
    tab: 'loans',
    action: 'Проверить финансирование',
  },
  investment: {
    name: 'Решение о капитале',
    plural: 'Инвестиции',
    icon: 'ChartNoAxesCombined',
    code: 'CAP',
    question: 'Кто вкладывает средства и получает контроль?',
    route: 'capital',
    action: 'Открыть капитал',
  },
}
export const CONTRACT_STATUS = {
  sent: 'Ожидает ответа',
  pending: 'Ожидает ответа',
  countered: 'Встречное предложение',
  counter: 'Встречное предложение',
  agreed: 'Готов к подписи',
  accepted: 'Условия приняты',
  signed: 'Подписан',
  active: 'Действует',
  ended: 'Завершён',
  expired: 'Истёк',
  withdrawn: 'Отозван',
  rejected: 'Отказ',
  terminated: 'Расторгнут',
  paid: 'Погашен',
  scheduled: 'Вступит в силу',
}
export const collection = (value) =>
  Array.isArray(value) ? value : value && typeof value === 'object' ? Object.values(value) : []
export const mergeContracts = (base, local) => [
  ...new Map([...collection(base), ...collection(local)].map((x) => [x.id, x])).values(),
]
export const contractMoney = (n) =>
  n == null || !Number.isFinite(Number(n))
    ? 'Не раскрыто'
    : new Intl.NumberFormat('ru-RU', {
        style: 'currency',
        currency: 'EUR',
        maximumFractionDigits: Number(n) % 100 ? 2 : 0,
      }).format(Number(n) / 100)
export const contractDate = (value) =>
  value
    ? new Date(value + 'T12:00:00Z').toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      })
    : 'Не указана'
export const contractDays = (start, end) =>
  start && end
    ? Math.max(0, Math.round((new Date(end + 'T12:00:00Z') - new Date(start + 'T12:00:00Z')) / 86400000))
    : null
export function classifyContractSpec(spec) {
  if (spec.contractType && CONTRACT_TYPES[spec.contractType]) return spec.contractType
  const title = spec.title || ''
  if (/аренд|бронирован|мощност/i.test(title)) return 'facilitylease'
  if (/за[её]м|кредит/i.test(title)) return 'loan'
  if (/инвестиц|акционер|дол[июя]|дивиденд|капитал/i.test(title)) return 'investment'
  if (/мандат|цели менеджера|полномочия/i.test(title)) return 'leadership'
  if (/поставк/i.test(title)) return 'supply'
  if (/коммерческ|спонсор|частей пакета|ответ партн[её]ра/i.test(title)) return 'sponsor'
  if (/финансирован|поддержк.*пилот/i.test(title)) return 'funding'
  if (/академ.*соглаш|стипенд/i.test(title)) return 'academy'
  if (/подписать.*контракт|предложение ·|трудовой|расторжени.*договор/i.test(title)) return 'staff'
  return null
}
export function contractRegister(g) {
  const { game, world, role } = g,
    c = game.career
  const people = collection(game.personnel?.items || game.personnel),
    orgName = (id) => world.organizations?.[id]?.name || world.names?.[id] || id || 'Сторона не раскрыта'
  const personName = (id) =>
    people.find((x) => x.id === id)?.name || world.names?.[id] || 'Имя не раскрыто'
  const own = c.org,
    records = [],
    date = c.date
  const add = (type, data, title, counterparty, route, tab = '', entity = '', extra = {}) => {
    const status =
      data.status ||
      (data.end && data.end <= date ? 'ended' : data.start && data.start > date ? 'scheduled' : 'active')
    records.push({
      id: type + ':' + (data.id || data.seat || records.length),
      type,
      data,
      title,
      counterparty,
      status,
      route,
      tab,
      entity,
      ...extra,
    })
  }
  for (const seat of collection(c.assignments)) {
    if (seat.org !== own) continue
    const person = seat.occupant
    if (
      !person ||
      person.id === c.player_id ||
      person.id === 'player' ||
      ['owner', 'manufacturer'].includes(seat.position)
    )
      continue
    const dossier = game.dossiers?.[person.id],
      current = dossier?.current || {}
    const type =
      seat.position === 'driver' ? 'driver' : seat.position === 'manager' ? 'leadership' : 'staff'
    add(
      type,
      {
        ...current,
        id: current.id || seat.id,
        person: person.id,
        position: seat.position,
        series: seat.series,
        org: own,
        seat: seat.id,
        salary_cents:
          current.salary_cents ?? people.find((x) => x.id === person.id)?.financial?.wage_cents,
        status: 'active',
      },
      person.name,
      person.id,
      'person',
      'contract',
      person.id,
      {
        person,
        seat,
        disclosed: !!dossier,
        editable:
          role === 'owner'
            ? seat.position === 'manager' || !!seat.academy
            : !seat.academy && !['owner', 'manager', 'manufacturer'].includes(seat.position),
      },
    )
  }
  for (const item of collection(c.offers)) {
    const person = people.find((x) => x.id === item.person),
      seat = collection(c.assignments).find((x) => x.id === item.seat),
      type =
        seat?.position === 'driver' ? 'driver' : seat?.position === 'manager' ? 'leadership' : 'staff'
    add(type, item, personName(item.person), item.person, 'contracts', 'negotiations', '', {
      person,
      seat,
      negotiation: true,
    })
  }
  const commercialBase = game.projections?.commercial || {}
  for (const item of collection(commercialBase.contracts)) {
    if (item.org !== own && item.sponsor !== own) continue
    const name =
      item.sponsor === own
        ? orgName(item.org)
        : collection(commercialBase.brands).find((x) => x.id === item.sponsor)?.name ||
          orgName(item.sponsor)
    add(
      item.role === 'technical' ? 'technical' : 'sponsor',
      item,
      name,
      item.sponsor === own ? item.org : item.sponsor,
      'commercial',
      'contracts',
      item.id,
    )
  }
  for (const item of collection(commercialBase.supplies)) {
    if (item.org !== own && item.sponsor !== own) continue
    add(
      'supply',
      item,
      orgName(item.sponsor === own ? item.org : item.sponsor),
      item.sponsor === own ? item.org : item.sponsor,
      'commercial',
      'supplies',
      item.id,
    )
  }
  for (const item of collection(commercialBase.offers)) {
    if (item.org !== own && item.sponsor !== own) continue
    const name =
      item.sponsor === own
        ? orgName(item.org)
        : collection(commercialBase.brands).find((x) => x.id === item.sponsor)?.name ||
          orgName(item.sponsor)
    add(
      item.technical ? 'technical' : 'sponsor',
      item,
      name,
      item.sponsor === own ? item.org : item.sponsor,
      'commercial',
      'offers',
      '',
      { negotiation: true },
    )
  }
  const funds = collection(game.funding)
  for (const item of funds.filter((x) => x.source !== 'academy'))
    add('funding', item, personName(item.person), item.person, 'funding', '', '', {
      person: people.find((x) => x.id === item.person),
    })
  for (const item of collection(c.scholarships)) {
    const fund = funds.find((x) => x.id === item.id) || funds.find((x) => x.id === item.funding)
    add('academy', { ...fund, ...item }, personName(item.person), item.person, 'academy', '', '', {
      person: people.find((x) => x.id === item.person),
      academy: collection(c.academies).find((x) => x.id === item.academy),
      editable: role === 'owner',
    })
  }
  const mandate = c.mandate
  if (mandate)
    add(
      'leadership',
      {
        ...mandate,
        date: mandate.date || collection(mandate.history).at(-1)?.date,
        id: 'mandate:' + own,
        status: 'active',
        org: own,
      },
      'Полномочия менеджера',
      mandate.manager,
      'leadership',
      '',
      '',
      {
        person: people.find((x) => x.id === mandate.manager),
        mandate: true,
        editable: role === 'owner',
      },
    )
  for (const item of collection(game.projections.capital?.loans))
    add('loan', item, item.lender || 'Финансирование организации', item.lender, 'capital', 'loans', '')
  for (const item of collection(game.projections.capital?.history).filter((x) =>
    ['investment', 'issue', 'sale'].includes(x.kind),
  ))
    add(
      'investment',
      { ...item, status: 'signed' },
      item.title || 'Решение о капитале',
      own,
      'capital',
      'history',
      '',
    )
  const assets = collection(game.projections.facilities?.assets)
  for (const item of collection(game.projections.facilities?.bookings)) {
    const asset = assets.find((x) => x.id === item.facility)
    if (item.org !== own && asset?.owner !== own) continue
    add(
      'facilitylease',
      item,
      game.projections?.facilities?.types?.[asset?.kind] || 'Доступ к объекту',
      item.org === own ? asset?.owner : item.org,
      'facilities',
      'bookings',
      '',
      { asset },
    )
  }
  return records
}
