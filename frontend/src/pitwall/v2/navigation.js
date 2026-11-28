const item = (route, label, tab = '') => [route, label, tab]
const group = (id, label, icon, children = [], extra = {}) => ({ id, label, icon, children, ...extra })
const archive = group('world', 'Мир автоспорта', 'Globe2', [
  item('world', 'Чемпионаты и участники'),
  item('calendar', 'Календарь мира'),
  item('statistics', 'Статистика и история'),
])
export function roleNavigation(role) {
  if (role === 'owner')
    return [
      group('overview', 'Портфель владельца', 'Landmark'),
      group('briefings', 'Доклады руководителей', 'MessagesSquare', [
        item('briefings', 'Совет организации', 'capital'),
        item('briefings', 'Технический доклад', 'engineering'),
        item('engineering', 'Программа: обзор'),
        item('inbox', 'Входящие'),
      ]),
      group('leadership', 'Люди и полномочия', 'UserRoundCheck', [
        item('leadership', 'Мандат руководителя'),
        item('staff', 'Ключевые специалисты'),
        item('market', 'Назначение руководителя'),
        item('contracts', 'Кадровые договоры'),
      ]),
      group('capital', 'Капитал и развитие', 'ChartNoAxesCombined', [
        item('capital', 'Собственность', 'ownership'),
        item('capital', 'Активы', 'assets'),
        item('capital', 'Гоночные программы', 'programs'),
        item('facilities', 'База и инвестиции'),
      ]),
      group('finance', 'Финансовая стратегия', 'Wallet', [
        item('finance', 'Денежный прогноз', 'forecast'),
        item('budget', 'Распределение бюджета'),
        item('cap', 'Лимиты и регламент'),
        item('economy', 'Экономика и рынки'),
      ]),
      group('academy', 'Академия и будущее', 'GraduationCap', [
        item('academy', 'Академия'),
        item('funding', 'Финансирование пилотов'),
        item('preparation', 'Программы подготовки'),
      ]),
      group('commercial', 'Партнёрства', 'Handshake', [
        item('commercial', 'Спонсоры и соглашения'),
        item('rights', 'Коммерческие права'),
      ]),
      group('agreements', 'Договорная комната', 'FileSignature'),
      archive,
    ]
  if (role === 'manufacturer')
    return [
      group('overview', 'Предприятие', 'Factory'),
      group('briefings', 'Технический совет', 'MessagesSquare', [
        item('briefings', 'Доклады специалистов', 'manufacturer'),
        item('inbox', 'Входящие и запросы'),
      ]),
      group(
        'products',
        'Продукты и поколения',
        'Layers',
        [
          item('manufacturer', 'Каталог продукции', 'catalog'),
          item('manufacturer', 'Программы и ресурсы', 'program'),
          item('manufacturer', 'Исследования и разработки', 'research'),
          item('manufacturer', 'История продукции', 'history'),
        ],
        { destination: 'manufacturer', defaultTab: 'catalog' },
      ),
      group(
        'industrial',
        'Промышленный контур',
        'Cog',
        [
          item('manufacturer', 'Испытания и производство', 'factory'),
          item('production', 'Очередь и качество'),
          item('inventory', 'Склад экземпляров'),
          item('facilities', 'Мощности и инфраструктура'),
        ],
        { destination: 'manufacturer', defaultTab: 'factory' },
      ),
      group(
        'clients',
        'Клиенты и поддержка',
        'Headset',
        [
          item('manufacturer', 'Клиентские организации', 'clients'),
          item('manufacturer', 'Обращения', 'cases'),
          item('manufacturer', 'Консультанты', 'advisors'),
          item('manufacturer', 'Диагностика', 'diagnosis'),
          item('manufacturer', 'Гарантийные решения', 'warranty'),
        ],
        { destination: 'manufacturer', defaultTab: 'clients' },
      ),
      group('staff', 'Люди и экспертиза', 'Users', [
        item('staff', 'Специалисты'),
        item('market', 'Кадровый рынок'),
        item('contracts', 'Кадровые контракты'),
        item('preparation', 'Развитие сотрудников'),
        item('leadership', 'Руководство'),
      ]),
      group('commercial', 'Коммерческие программы', 'Handshake', [
        item('commercial', 'Соглашения с клиентами'),
        item('rights', 'Права и бренд'),
        item('agreements', 'Договорная комната'),
      ]),
      group('finance', 'Финансы и капитал', 'Wallet', [
        item('finance', 'Деньги и прогноз'),
        item('budget', 'Бюджет предприятия'),
        item('capital', 'Капитал и активы'),
        item('economy', 'Экономика и рынки'),
      ]),
      archive,
    ]
  return [
    group('overview', 'Командный пункт', 'RadioTower'),
    group('briefings', 'Разговор со штабом', 'MessagesSquare', [
      item('briefings', 'Доклады специалистов', 'council'),
      item('inbox', 'Входящие'),
      item('calendar', 'Календарь команды'),
    ]),
    group('garage', 'Машины и подготовка', 'CarFront', [
      item('garage', 'Гараж'),
      item('livery', 'Ливреи'),
      item('drivers', 'Пилоты и экипажи'),
      item('preparation', 'Подготовка команды'),
    ]),
    group('engineering', 'Инженерный штаб', 'Wrench', [
      item('engineering', 'Техническая программа'),
      item('council', 'Совещания и решения'),
      item('research', 'Исследования'),
      item('development', 'Разработка и испытания'),
      item('cap', 'Регламент и квоты'),
    ]),
    group('production', 'Цех и обеспечение', 'Factory', [
      item('production', 'Производство'),
      item('inventory', 'Склад'),
      item('manufacturer', 'Поставщики'),
      item('facilities', 'Инфраструктура'),
    ]),
    group('staff', 'Люди команды', 'Users', [
      item('staff', 'Сотрудники'),
      item('market', 'Кадровый рынок'),
      item('contracts', 'Переговоры'),
      item('academy', 'Академия'),
      item('funding', 'Финансирование пилотов'),
      item('leadership', 'Цели и мандат'),
    ]),
    group('finance', 'Ресурсы и обязательства', 'Wallet', [
      item('finance', 'Денежный прогноз'),
      item('budget', 'Выделенный бюджет'),
      item('commercial', 'Коммерческие договоры'),
      item('rights', 'Рекламные права'),
      item('capital', 'Собственность'),
      item('economy', 'Экономика'),
      item('agreements', 'Договорная комната'),
    ]),
    archive,
  ]
}
export function activeNavigation(nav, route, tab) {
  return (
    nav.find((g) =>
      g.children.some(([r, , t]) => r === route && (t ? tab === t : route !== 'manufacturer')),
    ) ||
    nav.find(
      (g) => (g.destination || g.id) === route && (!g.defaultTab || g.defaultTab === (tab || 'catalog')),
    ) ||
    nav.find((g) => g.id === route)
  )
}
export const peopleRoutes = [
  'people',
  'drivers',
  'staff',
  'market',
  'contracts',
  'academy',
  'funding',
  'preparation',
  'leadership',
  'person',
]
export const engineeringRoutes = [
  'engineering',
  'council',
  'research',
  'development',
  'production',
  'inventory',
  'manufacturer',
]
export const businessRoutes = [
  'finance',
  'budget',
  'cap',
  'commercial',
  'rights',
  'economy',
  'facilities',
  'capital',
]
