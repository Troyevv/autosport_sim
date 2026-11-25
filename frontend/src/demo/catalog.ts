import type { GameCatalog } from '../catalog'
import { cars } from './garage'
import { PEOPLE, CANDIDATES, SUPPLIERS, WORLD } from './roster'
import { schedule, programs, products, sponsors } from './programs'
import { GRID } from './timing'

const messages = [
  {
    id: 'floor',
    title: 'Днище B: финальные испытания',
    from: 'Елена Морозова',
    body: 'Основной цикл испытаний завершён. Следующая проверка в аэротрубе перед квалификацией.',
    route: 'development',
  },
  {
    id: 'contract',
    title: 'Контракт Лукаса Вебера',
    from: 'Спортивный отдел',
    body: 'Соглашение истекает в конце сезона. Агент готов обсудить условия продления.',
    route: 'people',
  },
  {
    id: 'weather',
    title: 'Прогноз на Лазурном кольце',
    from: 'Марко Риччи',
    body: 'Ожидается сухой старт. Возможен кратковременный дождь во второй половине дистанции.',
    route: 'race',
  },
] as const
const projects = [
  {
    id: 'floor',
    name: 'Днище B',
    category: 'Аэродинамика',
    description: 'Перераспределение воздушного потока под днищем. Финальный цикл испытаний в аэротрубе.',
    gain: '+0,18 с / круг',
    engineers: 18,
    days: 2,
    progress: 68,
    cost: 240000000,
  },
  {
    id: 'cooling',
    name: 'Система охлаждения',
    category: 'Надёжность',
    description: 'Новые каналы охлаждения силовой установки для жарких этапов сезона.',
    gain: '+6 надёжности',
    engineers: 12,
    days: 7,
    progress: 36,
    cost: 110000000,
  },
  {
    id: 'wing',
    name: 'Переднее антикрыло C',
    category: 'Аэродинамика',
    description: 'Новая геометрия закрылков для медленных поворотов.',
    gain: '+0,12 с / круг',
    engineers: 10,
    days: 8,
    progress: 0,
    cost: 180000000,
  },
  {
    id: 'brakes',
    name: 'Тормозные каналы',
    category: 'Охлаждение',
    description: 'Контроль температуры дисков на тяжёлых торможениях.',
    gain: '+4 надёжности',
    engineers: 6,
    days: 5,
    progress: 0,
    cost: 85000000,
  },
]
const orders = [
  { id: 'helix', team: 'Helix Endurance', product: 'GT8 Sequential', units: 4, load: 8 },
  { id: 'north', team: 'NORTH Racing', product: 'VP6 Hybrid', units: 2, load: 12 },
]
const frames = [
  { lap: 14, radio: 'Келлер: «Баланс хороший. Теряем сцепление на выходе». ' },
  { lap: 15, radio: 'Стратег: отрыв до Уорда стабилен.' },
  { lap: 16, radio: 'Вебер: «Шины в рабочем диапазоне». ' },
  { lap: 17, radio: 'Инженер: окно остановки по плану A.' },
]
const facilities = [
  {
    id: 'tunnel',
    name: 'Аэродинамическая труба',
    level: 3,
    cost: 240000000,
    detail: 'Измерения прижимной силы и сопротивления.',
  },
  {
    id: 'factory',
    name: 'Производственный центр',
    level: 4,
    cost: 180000000,
    detail: 'Изготовление узлов и запасных деталей.',
  },
  {
    id: 'academy',
    name: 'Гоночная академия',
    level: 2,
    cost: 95000000,
    detail: 'Подготовка молодых пилотов и персонала.',
  },
]
const clients = [
  { team: 'VANTA Racing', series: 'Formula World', product: 'VP6 Hybrid', until: 2029 },
  { team: 'ATLAS Motorsport', series: 'Formula World', product: 'VP6 Hybrid', until: 2028 },
  { team: 'VANTA GT', series: 'GT World Series', product: 'GT8 Sequential', until: 2030 },
  { team: 'Vertex Endurance', series: 'Endurance Cup', product: 'GT8 Sequential', until: 2029 },
]
const partner = {
  name: 'HELIX',
  category: 'Технический партнёр',
  sum: 2.4,
  zone: 'Кожух двигателя',
  expires: '2030',
  color: '#84b2ac',
}
export const catalog: GameCatalog = {
  reports: {
    developmentBudget: 1280000000,
    developmentPlan: 2400000000,
    paceGain: '+0,42 с',
    teamRating: 82,
    annualBudget: 11200000000,
    annualUsed: 43,
    forecast: 2130000000,
    groupValue: 28400000000,
    groupGrowth: '+12,8%',
    trust: 88,
    orderBook: 3280000000,
    deliveryRate: '98,4%',
  },
  people: PEOPLE,
  candidates: CANDIDATES,
  suppliers: SUPPLIERS,
  world: WORLD,
  grid: GRID,
  projects,
  programs,
  products,
  orders,
  schedule,
  sponsors,
  cars,
  messages,
  replay: { lapSeconds: 89.6, startSeconds: 20 * 60 + 13, timeScale: 8 },
  frames,
  raceCars: {
    kel: { personId: 'keller', energy: 68, lastLap: '1:29.470' },
    web: { personId: 'weber', energy: 82, lastLap: '1:29.830' },
  },
  facilities,
  clients,
  partner,
  shiftLoads: [0, 90, 76, 64],
  spending: [3.8, 4.6, 5.1, 6.2, 5.4, 4.8],
  costShares: [
    ['Разработка и техника', 42],
    ['Персонал', 28],
    ['Логистика', 18],
    ['Инфраструктура', 12],
  ] as const,
}
