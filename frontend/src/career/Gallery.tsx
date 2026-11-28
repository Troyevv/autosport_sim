import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { api, explain, type Asset, type World } from './api'
import { Portrait } from './Portrait'
import '../base.css'
import './career.css'
import './gallery.css'

function Gallery({ world, media }: { world: World; media: Asset[] }) {
  const teams = Object.values(world.organizations).filter((o) => o.kind === 'team')
  const supplier = Object.values(world.organizations).find((o) => o.kind === 'supplier')
  const looks = [
    ...teams
      .slice(0, 3)
      .map((org, i) => ({ org, position: i === 0 ? 'driver' : i === 1 ? 'mechanic' : 'chassis' })),
    ...(supplier ? [{ org: supplier, position: 'technical-advisor' }] : []),
    { org: undefined, position: 'staff' },
  ]
  const names = Object.fromEntries(Object.entries(world.faces).map(([id, face]) => [face, world.names[id]]))
  const appointments = new Map<string, { org: string; position: string }>()
  for (const seat of Object.values(world.assignments)) {
    const face = world.faces[seat.person]
    appointments.set(face, seat)
  }
  const subjects = media
    .filter((a) => a.kind === 'generated-head' && a.anatomy)
    .sort(
      (a, b) =>
        Number(appointments.has(b.entity)) - Number(appointments.has(a.entity)) ||
        (names[a.entity] ?? a.entity).localeCompare(names[b.entity] ?? b.entity, 'ru'),
    )
  let reserve = 0
  for (const face of subjects) {
    if (!names[face.entity]) names[face.entity] = 'Резерв · ' + ++reserve
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
          {pages > 1 && (
            <nav aria-label="Страницы галереи">
              <button disabled={page === 0} onClick={() => setPage(page - 1)}>
                Назад
              </button>
              <span aria-live="polite">
                {page + 1} / {pages}
              </span>
              <button disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>
                Далее
              </button>
            </nav>
          )}
          <section className="studio-grid">
            {subjects.slice(page * pageSize, (page + 1) * pageSize).map((a) => {
              const seat = appointments.get(a.entity)
              const team = seat && world.organizations[seat.org]
              return (
                <figure key={a.entity}>
                  <Portrait
                    person={{
                      name: names[a.entity],
                      origin: 'generated',
                      face: a.entity,
                      position: seat?.position,
                    }}
                    org={team?.id ?? null}
                    organization={team}
                    color={team?.color ?? '#797b80'}
                    driver={seat?.position === 'driver'}
                    media={media}
                  />
                  <figcaption>
                    {names[a.entity]} · {team?.name ?? 'Свободный агент'}
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
              <figure key={look.position}>
                <Portrait
                  person={{
                    name: names[id],
                    origin: 'generated',
                    face: id,
                    position: look.position,
                  }}
                  org={look.org?.id ?? null}
                  organization={look.org}
                  color={look.org?.color ?? '#797b80'}
                  driver={look.position === 'driver'}
                  media={media}
                />
                <figcaption>{look.org?.name ?? 'Свободный агент'}</figcaption>
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
