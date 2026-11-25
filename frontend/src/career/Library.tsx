import { useState, type FormEvent } from 'react'
import { ArrowRight, Building2, Factory, Flag, FolderOpen, Headset, Upload } from 'lucide-react'
import { roles } from '../ui/labels'
import type { Role } from '../game'
import { dateLabel } from '../game'
import { Button, Panel } from '../ui/components'
import { api, post, explain, type World, type Save, type Asset } from './api'

export const careerUrl = (id: string) => '?career=' + encodeURIComponent(id)
export function Brand() {
  return (
    <div className="brand">
      <div className="brand-stripes">
        <i />
        <i />
        <i />
      </div>
      <div>
        <div className="brand-word">APEX</div>
        <small>MOTORSPORT MANAGER</small>
      </div>
    </div>
  )
}
export function Library({ world, saves, media }: { world: World; saves: Save[]; media: Asset[] }) {
  const [role, setRole] = useState<Role>('manager'),
    [series, setSeries] = useState('f1')
  const [chosen, setChosen] = useState(''),
    [name, setName] = useState(''),
    [seed, setSeed] = useState('')
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [assets, setAssets] = useState(media)
  const organizations = Object.values(world.organizations)
    .filter((o) => o.programs.includes(series) && o.kind === (role === 'manufacturer' ? 'supplier' : 'team'))
    .sort((a, b) => a.name.localeCompare(b.name))
  const org = organizations.some((o) => o.id === chosen) ? chosen : organizations[0]?.id
  const create = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const save = await api<Save>(
        'careers',
        post({
          name: name.trim(),
          role,
          org,
          series,
          seed: seed === '' ? crypto.getRandomValues(new Uint32Array(1))[0] : Number(seed),
        }),
      )
      location.assign(careerUrl(save.id))
    } catch (e) {
      setError(explain(e))
      setBusy(false)
    }
  }
  async function upload(file: File, pack: boolean) {
    setBusy(true)
    setError('')
    try {
      if (pack) {
        await api('media/import', { method: 'POST', body: file })
        setAssets(await api<Asset[]>('media'))
      } else {
        const save = await api<Save>('careers/import', { method: 'POST', body: file })
        location.assign(careerUrl(save.id))
      }
    } catch (e) {
      setError(explain(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <main className="career-library">
      <header className="library-bar">
        <Brand />
        <a className="btn" href="?demo=1">
          Открыть деморежим <ArrowRight size={15} />
        </a>
      </header>
      <div className="screen">
        <section className="library-hero">
          <div className="eyebrow">Центр управления · сезон {world.origin.season}</div>
          <h1>Карьера в автоспорте</h1>
          <p>Formula 1 · Formula 2 · Formula 3 · DTM · FIA WEC</p>
        </section>
        {error && (
          <p className="career-error" role="alert">
            {error}
          </p>
        )}
        <div className="library-layout">
          <Panel title="Новая карьера" action={<Flag size={17} />}>
            <form className="career-form" onSubmit={create}>
              <fieldset disabled={busy}>
                <legend className="eyebrow">Рабочее место</legend>
                <div className="career-roles">
                  {(Object.keys(roles) as Role[]).map((r) => {
                    const Icon = { manager: Headset, owner: Building2, manufacturer: Factory }[r]
                    return (
                      <button type="button" key={r} aria-pressed={r === role} onClick={() => setRole(r)}>
                        <Icon size={21} />
                        <b>{roles[r].name}</b>
                        <small>{roles[r].work}</small>
                      </button>
                    )
                  })}
                </div>
                <div className="career-fields">
                  <label>
                    Имя игрока
                    <input
                      required
                      maxLength={64}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      autoComplete="off"
                    />
                  </label>
                  <label>
                    Чемпионат
                    <select value={series} onChange={(e) => setSeries(e.target.value)}>
                      {Object.values(world.championships).map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Организация
                    <select value={org} onChange={(e) => setChosen(e.target.value)}>
                      {organizations.map((o) => (
                        <option value={o.id} key={o.id}>
                          {o.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Seed мира
                    <input
                      type="number"
                      min="0"
                      max="4294967295"
                      placeholder="Автоматически"
                      value={seed}
                      onChange={(e) => setSeed(e.target.value)}
                    />
                  </label>
                </div>
                <Button primary type="submit" disabled={!name.trim() || !org}>
                  Создать карьеру <ArrowRight size={15} />
                </Button>
              </fieldset>
            </form>
          </Panel>
          <div className="career-stack">
            <Panel title="Сохранённые карьеры" action={<FolderOpen size={17} />}>
              {saves.length ? (
                saves.map((s) => (
                  <a className="result" key={s.id} href={careerUrl(s.id)}>
                    <span>
                      <strong>{world.organizations[s.org].name}</strong>
                      <small>
                        {s.name} · {roles[s.role].name} · {dateLabel(s.date, true)}
                      </small>
                    </span>
                    <ArrowRight size={16} />
                  </a>
                ))
              ) : (
                <p className="panel-body muted">Здесь появятся ваши сохранения.</p>
              )}
              <FileInput
                label="Импортировать сохранение"
                accept=".json"
                busy={busy}
                onFile={(f) => upload(f, false)}
              />
            </Panel>
            <Panel title="Локальная медиатека">
              <div className="panel-body">
                <p aria-live="polite">Доступно изображений: {assets.length}</p>
                <small className="muted">Портреты, форма и эмблемы из ZIP-пакета.</small>
                {assets.some((a) => a.anatomy) && (
                  <p>
                    <a href="/portraits.html">Сравнить портреты и форму</a>
                  </p>
                )}
              </div>
              <FileInput label="Подключить ZIP" accept=".zip" busy={busy} onFile={(f) => upload(f, true)} />
            </Panel>
          </div>
        </div>
      </div>
    </main>
  )
}
function FileInput({
  label,
  accept,
  busy,
  onFile,
}: {
  label: string
  accept: string
  busy: boolean
  onFile: (f: File) => void
}) {
  return (
    <label className="career-upload">
      <Upload size={16} />
      {label}
      <input
        type="file"
        aria-label={label}
        disabled={busy}
        accept={accept}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onFile(f)
          e.target.value = ''
        }}
      />
    </label>
  )
}
