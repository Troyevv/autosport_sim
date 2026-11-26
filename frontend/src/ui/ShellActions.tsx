import { useState } from 'react'
import { Mail, MailOpen, Search as SearchIcon, Check, Headset, Building2, Factory } from 'lucide-react'
import { useGame, useUI } from './context'
import { routes, home } from './navigation'
import { Button, Confirm } from './components'
import { roles } from '../ui/labels'
import { Profile } from '../screens/People'
import type { Role } from '../game'
export function Roles() {
  const { state, send } = useGame(),
    { go, close } = useUI()
  return (
    <div>
      {(Object.keys(roles) as Role[]).map((r) => {
        const Icon = { manager: Headset, owner: Building2, manufacturer: Factory }[r]
        return (
          <button
            key={r}
            className={'role-option ' + (state.role === r ? 'active' : '')}
            onClick={() => {
              send({ type: 'role', role: r })
              close()
              go(home(r))
            }}
          >
            <Icon aria-hidden="true" size={20} />
            <span>
              <strong>{roles[r].name}</strong>
              <small>{roles[r].work}</small>
            </span>
            {state.role === r && <Check aria-hidden="true" size={16} />}
          </button>
        )
      })}
    </div>
  )
}
export function Inbox() {
  const { state, data, send } = useGame(),
    { open, go } = useUI()
  return (
    <div className="inbox-list">
      {data.messages.map((m) => (
        <button
          key={m.id}
          className="inbox-item"
          onClick={() => {
            send({ type: 'read', id: m.id })
            open(
              m.title,
              <>
                <p className="eyebrow">{m.from}</p>
                <p>{m.body}</p>
                <div className="form-actions">
                  <Button onClick={() => go(m.route)}>Перейти в раздел</Button>
                </div>
              </>,
            )
          }}
        >
          <span className="inbox-icon">
            {state.read.includes(m.id) ? (
              <MailOpen aria-hidden="true" size={16} />
            ) : (
              <Mail aria-hidden="true" size={16} />
            )}
          </span>
          <span>
            <strong>{m.title}</strong>
            <small>{m.from}</small>
          </span>
          <small>{state.read.includes(m.id) ? 'Прочитано' : 'Новое'}</small>
        </button>
      ))}
    </div>
  )
}
export function Search() {
  const [q, setQ] = useState(''),
    { state, data } = useGame(),
    { open, go } = useUI()
  const rows = [
    ...routes
      .filter((r) => !r.role || r.role === state.role)
      .map((r) => ({ title: r.name, note: 'Раздел', fn: () => go(r.id) })),
    ...data.people.map((p) => ({
      title: p.name,
      note: p.role,
      fn: () => open(p.name, <Profile person={p} />),
    })),
  ].filter((x) => x.title.toLowerCase().includes(q.trim().toLowerCase()))
  return (
    <>
      <label className="people-search">
        <SearchIcon aria-hidden="true" size={17} />
        <input
          autoFocus
          type="search"
          placeholder="Раздел, пилот, разработка…"
          aria-label="Поиск по игре"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </label>
      {rows.map((r) => (
        <button className="result" key={r.title} onClick={r.fn}>
          <strong>{r.title}</strong>
          <small>{r.note}</small>
        </button>
      ))}
      {!rows.length && <div className="empty-state">Ничего не найдено. Попробуйте другое название.</div>}
    </>
  )
}
export function Settings() {
  const { state, send } = useGame(),
    { open, go } = useUI()
  return (
    <>
      <a className="btn" href="./">К списку карьер</a>
      <p>Демонстрационный режим. Изменения действуют до обновления страницы.</p>
      <label className="toggle-row">
        Анимации интерфейса{' '}
        <input
          type="checkbox"
          checked={state.motion}
          onChange={(e) => send({ type: 'motion', enabled: e.target.checked })}
        />
      </label>
      <label className="toggle-row">
        Компактные таблицы{' '}
        <input
          type="checkbox"
          checked={state.compact}
          onChange={(e) => send({ type: 'compact', enabled: e.target.checked })}
        />
      </label>
      <Button
        onClick={() =>
          open(
            'Сбросить демонстрацию?',
            <Confirm
              action="Сбросить"
              onConfirm={() => {
                send({ type: 'reset' })
                go('overview')
              }}
            >
              Восстановятся исходные дата, роль, состав проектов и переговоры.
            </Confirm>,
          )
        }
      >
        Сбросить демонстрацию
      </Button>
    </>
  )
}
