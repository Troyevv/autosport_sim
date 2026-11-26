import { useState } from 'react'
import { Facts, Progress } from '../../ui/components'
import { CountryFlag } from '../Country'
import type { World } from '../api'
import type { Dossier } from './model'
import { shortDate } from './model'
export const mediaTraits: Record<string, string> = {
  charisma: 'Харизматичность',
  diplomacy: 'Дипломатичность',
  candor: 'Прямолинейность',
  temper: 'Вспыльчивость',
  privacy: 'Закрытость',
  provocation: 'Провокативность',
  self_criticism: 'Самокритичность',
  arrogance: 'Высокомерие',
}
export type Audience = {
  event: string
  name: string
  date: string
  series: string
  country: string
  home: boolean
  attention: number
  pressure: number
  openness: number
  conflict: number
  accountability: number
  influence: number
  motivation: number
}
export function MediaProfile({ data, world }: { data: Dossier; world: World }) {
  const p = data.person
  const schedule = data.calendar_context
  const [event, select] = useState(schedule.find((e) => e.home)?.event || schedule[0]?.event || '')
  const selected = schedule.find((e) => e.event === event)
  return (
    <>
      <h3>Репутация и аудитория</h3>
      <Facts
        items={[
          ['Профессиональная репутация', p.reputation],
          ['Авторитет среди коллег', p.authority],
          ['Медийная популярность', p.popularity],
        ]}
      />
      <h3>Региональная популярность</h3>
      <div className="staff-local-audience">
        {Object.entries(p.regional_popularity)
          .sort((a, b) => b[1] - a[1])
          .map(([id, n]) => (
            <div key={id}>
              <CountryFlag id={id} countries={world.countries} />
              <span>{world.countries[id]}</span>
              <strong>{n} / 100</strong>
            </div>
          ))}
      </div>
      <h3>Публичный характер</h3>
      <div className="staff-skills">
        {Object.entries({ ...p.media_traits, loyalty: p.loyalty }).map(([id, value]) => (
          <div key={id}>
            <span>{mediaTraits[id] || 'Лояльность'}</span>
            <strong>{value}</strong>
            <Progress value={value} />
          </div>
        ))}
      </div>
      {p.position === 'driver' && (
        <section className="path-block">
          <h3>Внимание на этапе</h3>
          {selected ? (
            <>
              <label className="staff-label">
                Этап по действующему назначению
                <select value={event} onChange={(e) => select(e.target.value)}>
                  {schedule.map((e) => (
                    <option key={e.event} value={e.event}>
                      {shortDate(e.date)} · {e.name}
                      {e.home ? ' · домашний' : ''}
                    </option>
                  ))}
                </select>
              </label>
              <div>
                <CountryFlag id={selected.country} countries={world.countries} />{' '}
                {world.countries[selected.country]} · {selected.home ? 'Домашний этап' : 'Выездной этап'}
              </div>
              <Facts
                items={[
                  ['Ожидаемое внимание', selected.attention],
                  ['Психологическое давление', selected.pressure],
                  ['Мотивация', selected.motivation],
                  ['Открытость', selected.openness],
                  ['Риск публичного конфликта', selected.conflict],
                  ['Готовность признать ошибку', selected.accountability],
                  ['Влияние публичной позиции', selected.influence],
                ]}
              />
              <p className="muted">
                Оценка учитывает аудиторию в стране этапа, характер и способность справляться с давлением.
              </p>
            </>
          ) : (
            <p>В календаре нет будущих этапов по действующему назначению.</p>
          )}
        </section>
      )}
    </>
  )
}
