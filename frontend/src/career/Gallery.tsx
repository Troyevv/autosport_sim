import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { api, explain, type Asset, type World } from './api'
import { Portrait } from './Portrait'
import '../base.css'
import './career.css'
import './gallery.css'

const looks = [
  {
    name: 'Aston Martin',
    id: 'team-aston-martin-aramco-f1-team',
    color: '#00795e',
    driver: true,
  },
  {
    name: 'McLaren',
    id: 'team-mclaren-formula-1-team',
    color: '#eb8818',
    driver: true,
  },
  {
    name: 'Персонал Ferrari',
    id: 'team-scuderia-ferrari',
    color: '#ae293c',
    driver: false,
  },
  {
    name: 'Michelin',
    id: 'supplier-michelin',
    color: '#235799',
    driver: false,
  },
  { name: 'Свободный агент', id: null, color: '#85878a', driver: false },
]
function Gallery({ world, media }: { world: World; media: Asset[] }) {
  const names: Record<string, string> = {}
  const appointments = new Map<string, { org: string; position: string }>()
  for (const seat of Object.values(world.assignments)) {
    const face = world.faces[seat.person]
    names[face] = world.names[seat.person]
    appointments.set(face, seat)
  }
  const subjects = media.filter((a) => a.kind === 'generated-head' && a.anatomy).sort((a, b) =>
    Number(appointments.has(b.entity)) - Number(appointments.has(a.entity)) ||
    (names[a.entity] ?? a.entity).localeCompare(names[b.entity] ?? b.entity, 'ru'),
  )
  let reserve = 0
  for (const face of subjects) {
    if (!names[face.entity]) names[face.entity] = 'Резерв · ' + (++reserve)
  }
  const [id, select] = useState(subjects[0]?.entity ?? '')
  const [page, setPage] = useState(0)
  const pageSize = 12
  const pages = Math.ceil(subjects.length / pageSize)
  const [overview, setOverview] = useState(true)
  const source = subjects.find((a) => a.entity === id)
  return (
    <>
      <h1>Галерея портретов</h1>
      <p>Примерка формы разных организаций. Выбор комплекта здесь не меняет карьеру.</p>
      {!subjects.length && <p>Студийная библиотека недоступна.</p>}
      <button onClick={() => setOverview(!overview)}>
        {overview ? 'Сравнить комплекты' : 'Все портреты'}
      </button>
      {overview ? (
        <>
        {pages > 1 && <nav aria-label="Страницы галереи">
          <button disabled={page === 0} onClick={() => setPage(page - 1)}>Назад</button>
          <span aria-live="polite">{page + 1} / {pages}</span>
          <button disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Далее</button>
        </nav>}
        <section className="studio-grid">
          {subjects.slice(page * pageSize, (page + 1) * pageSize).map((a, i) => {
            const seat = appointments.get(a.entity)
            const team = seat && world.organizations[seat.org]
            const look = team && seat ? { ...team, driver: seat.position === 'driver' } : looks[i % looks.length]
            return (
              <figure key={a.entity}>
                <Portrait
                  showShoulders
                  person={{
                    name: names[a.entity],
                    origin: 'generated',
                    face: a.entity,
                  }}
                  org={look.id}
                  color={look.color}
                  driver={look.driver}
                  media={media}
                />
                <figcaption>
                  {names[a.entity]} · {look.name}
                </figcaption>
              </figure>
            )
          })}
        </section>
        </>
      ) : (
        <>
          <label>
            Персонаж{' '}
            <select value={id} onChange={(e) => select(e.target.value)}>
              {Object.entries(names).map(([key, name]) => (
                <option key={key} value={key}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <section>
            {looks.map((look) => (
              <figure key={look.name}>
                <Portrait
                  showShoulders
                  person={{
                    name: names[id],
                    origin: 'generated',
                    face: id,
                  }}
                  org={look.id}
                  color={look.color}
                  driver={look.driver}
                  media={media}
                />
                <figcaption>{look.name}</figcaption>
              </figure>
            ))}
          </section>
          {source ? (
            <p>
              {source.author} · {source.license} · {source.changes} <a href={source.source}>Источник</a>
            </p>
          ) : (
            <p>Изображение недоступно.</p>
          )}
        </>
      )}
    </>
  )
}
const root = createRoot(document.getElementById('gallery')!)
Promise.all([api<World>('world'), api<Asset[]>('media')])
  .then(([world, media]) => root.render(<Gallery world={world} media={media} />))
  .catch((e) => root.render(<p role="alert">{explain(e)}</p>))
