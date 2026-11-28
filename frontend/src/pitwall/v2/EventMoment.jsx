import React from 'react'
import { useGame } from '../core/context'
import { OrganizationMark } from './identity'
import { Icon, Button } from '../ui'
import './events.css'

export default function EventMoment({ event, kind }) {
  const g = useGame(),
    org = g.world.organizations[g.game.career.org],
    project = [
      ...(g.game.projections.development?.projects || []),
      ...(g.game.projections.manufacturer?.projects || []),
    ].find((p) => p.id === event.project),
    person = g.game.personnel.find((p) => p.id === event.person || p.id === event.entity)
  const success = kind === 'release',
    technical = ['release', 'withdraw'].includes(kind)
  const copy = {
    release: [
      'Редакция выпущена.',
      'Теперь чертёж можно передать в производство. Для установки по-прежнему нужны физический экземпляр, приёмка и предусмотренный регламентом допуск.',
    ],
    withdraw: [
      'Редакция отозвана.',
      'Новые заказы и поставки по этой редакции остановлены. Существующие физические экземпляры остаются в учёте: проверьте их назначение отдельно.',
    ],
    departure: [
      'Совместная работа завершена.',
      'Договор прекращён вашим решением. Проверьте образовавшееся штатное место и сохранённые обязательства перед следующим назначением.',
    ],
    'partnership-end': [
      'Партнёрство завершено.',
      'Прекращение соглашения зафиксировано. Сопоставьте действующие обязательства и коммерческий план перед поиском нового партнёра.',
    ],
    'supply-end': [
      'Договор поставки прекращён.',
      'Права технического сотрудничества по этому договору прекращены. Проверьте клиентскую программу и оставшиеся действующие соглашения.',
    ],
    'funding-end': [
      'Поддержка прекращена.',
      'Договор финансирования завершён вашим решением. Последствия и компенсация сохраняются в соответствующем деле.',
    ],
  }[kind]
  const route = technical
    ? g.role === 'manufacturer'
      ? 'manufacturer'
      : 'development'
    : kind === 'departure'
      ? 'people'
      : kind === 'funding-end'
        ? 'funding'
        : 'commercial'
  return (
    <div className={'event-moment ' + (success ? 'positive' : 'consequential')}>
      <header>
        <OrganizationMark size={42} />
        <div>
          <span>РЕШЕНИЕ ОРГАНИЗАЦИИ</span>
          <strong>{org.name}</strong>
        </div>
        <small>{event.date}</small>
      </header>
      <div className="event-mark">
        <Icon
          name={
            success
              ? 'ShieldCheck'
              : technical
                ? 'FileWarning'
                : kind === 'departure'
                  ? 'UserRoundMinus'
                  : 'Unplug'
          }
          size={42}
        />
        <span>{success ? 'ВЫПУСК РЕДАКЦИИ' : 'ИЗМЕНЕНИЕ ОБЯЗАТЕЛЬСТВ'}</span>
      </div>
      <h2>{copy[0]}</h2>
      {(project || person) && (
        <p className="event-entity">
          {project
            ? (g.world.entries[project.entry]?.name ||
                g.world.cars[g.world.entries[project.entry]?.car]?.name ||
                'Техническая программа') +
              ' · редакция ' +
              (project.version || '—')
            : person.name}
        </p>
      )}
      <p>{copy[1]}</p>
      <div className="event-proof">
        <Icon name="History" size={18} />
        <span>Изменение сохранено в карьере. Документы и обязательства отражают принятое решение.</span>
      </div>
      <footer>
        <Button
          onClick={() => {
            g.closeDialog()
            g.navigate(
              route,
              technical
                ? g.role === 'manufacturer'
                  ? 'research'
                  : 'archive'
                : kind === 'supply-end'
                  ? 'supplies'
                  : '',
              technical ? event.project || '' : '',
            )
          }}
        >
          {technical
            ? 'Открыть техническое дело'
            : kind === 'departure'
              ? 'Проверить состав'
              : 'Открыть связанные договоры'}
          <Icon name="ArrowRight" size={16} />
        </Button>
        <Button variant="ghost" onClick={g.closeDialog}>
          Вернуться к работе
        </Button>
      </footer>
    </div>
  )
}
