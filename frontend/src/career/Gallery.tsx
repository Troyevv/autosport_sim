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
  const [id, select] = useState(
    media.find((a) => a.kind === 'head' && a.anatomy)?.entity ?? 'person-fernando-alonso',
  )
  const subjects = media.filter((a) => ['head', 'generated-head'].includes(a.kind) && a.anatomy)
    .sort((a, b) => Number(b.kind === 'head') - Number(a.kind === 'head'))
  const [page, setPage] = useState(0)
  const pageSize = 12
  const pages = Math.ceil(subjects.length / pageSize)
  const [overview, setOverview] = useState(true)
  const generated = media.filter((a) => a.kind === 'generated-head')
  const names = {
    ...world.names,
    ...Object.fromEntries(generated.map((a, i) => [a.entity, 'Студийный портрет ' + (i + 1)])),
  }
  const source = media.find((a) => ['head', 'generated-head'].includes(a.kind) && a.entity === id)
  return (
    <>
      <h1>Галерея портретов</h1>
      <p>Примерка формы разных организаций. Выбор комплекта здесь не меняет карьеру.</p>
      {!subjects.length && <p>Для просмотра студийных портретов подключите ZIP на главном экране.</p>}
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
            const entry =
              a.kind === 'head' && Object.values(world.entries).find((e) => e.crew.includes(a.entity))
            const team = entry && world.organizations[entry.org]
            const look = team ? { ...team, driver: true } : looks[i % looks.length]
            return (
              <figure key={a.entity}>
                <Portrait
                  showShoulders
                  person={{
                    name: names[a.entity],
                    origin: a.kind === 'head' ? 'real' : 'generated',
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
                    origin: id.startsWith('generated-') ? 'generated' : 'real',
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
            <p>В локальной медиатеке нет фотографии этого человека.</p>
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
