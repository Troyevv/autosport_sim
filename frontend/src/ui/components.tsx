import { useEffect, useRef, type ReactNode, type ButtonHTMLAttributes } from 'react'
import { X } from 'lucide-react'
import { useUI } from './context'
export function Button({
  primary = false,
  children,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean }) {
  return (
    <button type="button" className={'btn ' + (primary ? 'btn-primary ' : '') + className} {...props}>
      {children}
    </button>
  )
}
export function Header({
  section,
  title,
  sub,
  children,
}: {
  section: string
  title: string
  sub: string
  children?: ReactNode
}) {
  return (
    <header className="screen-head">
      <div>
        <div className="eyebrow">{section}</div>
        <h1>{title}</h1>
        <p className="screen-subtitle">{sub}</p>
      </div>
      {children && <div className="head-actions">{children}</div>}
    </header>
  )
}
export function Panel({
  title,
  action,
  children,
}: {
  title: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="panel">
      <header className="panel-head">
        <h2>{title}</h2>
        {action}
      </header>
      {children}
    </section>
  )
}
export function Progress({ value }: { value: number }) {
  return (
    <div className="progress-track" aria-hidden="true">
      <span style={{ width: value + '%' }} />
    </div>
  )
}
export function Stats({ items }: { items: [string, ReactNode, ReactNode, ReactNode?][] }) {
  return (
    <div className="kpi-grid">
      {items.map(([label, value, note, icon]) => (
        <article key={label} className="kpi">
          <div className="kpi-label">
            {icon}
            {label}
          </div>
          <div className="kpi-value">{value}</div>
          <div className="kpi-note">{note}</div>
        </article>
      ))}
    </div>
  )
}
export function Choices<T extends string>({
  items,
  active,
  onChange,
  segmented = false,
  label,
}: {
  items: ReadonlyArray<readonly [T, string]>
  active: T
  onChange: (v: T) => void
  segmented?: boolean
  label: string
}) {
  return (
    <div className={segmented ? 'segmented' : 'tabs'} role="group" aria-label={label}>
      {items.map(([id, name]) => (
        <button
          key={id}
          className={(segmented ? '' : 'tab ') + (active === id ? 'active' : '')}
          aria-pressed={active === id}
          onClick={() => onChange(id)}
        >
          {name}
        </button>
      ))}
    </div>
  )
}
export function Table({
  columns,
  rows,
  label,
}: {
  columns: string[]
  rows: { id: string; cells: ReactNode[]; active?: boolean }[]
  label: string
}) {
  return (
    <div className="table-wrap" role="region" aria-label={label} tabIndex={0}>
      <table className="data-table">
        <caption className="sr-only">{label}</caption>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c} scope="col">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className={row.active ? 'highlight' : ''}>
              {row.cells.map((cell, i) => (
                <td key={columns[i]} data-label={columns[i]}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
export function Facts({ items }: { items: ReadonlyArray<readonly [string, ReactNode]> }) {
  return (
    <dl className="facts">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  )
}
export function Dialog({
  title,
  children,
  onClose,
}: {
  title: string
  children: ReactNode
  onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const el = ref.current!
    const trigger = document.activeElement
    el.showModal()
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      el.close()
      document.body.style.overflow = overflow
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus({ preventScroll: true })
    }
  }, [])
  useEffect(() => {
    const el = ref.current!
    const next =
      el.querySelector<HTMLElement>(
        'input[type="search"], input:not([type="checkbox"]):not([readonly]), select',
      ) ?? el.querySelector<HTMLElement>('button')
    next?.focus({ preventScroll: true })
  }, [title])
  return (
    <dialog
      className="modal native-dialog"
      ref={ref}
      aria-label={title}
      onKeyDown={(e) => {
        if (e.key !== 'Tab') return
        const items = [
          ...e.currentTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea, [tabindex="0"]',
          ),
        ].filter((el) => el.getClientRects().length)
        const first = items[0],
          last = items.at(-1)
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last?.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first?.focus()
        }
      }}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => {
        if (e.target !== e.currentTarget) return
        const rect = e.currentTarget.getBoundingClientRect()
        if (
          e.clientX < rect.left ||
          e.clientX > rect.right ||
          e.clientY < rect.top ||
          e.clientY > rect.bottom
        )
          onClose()
      }}
    >
      <header className="modal-head">
        <h2>{title}</h2>
        <button className="icon-btn" aria-label="Закрыть" onClick={onClose}>
          <X aria-hidden="true" size={18} />
        </button>
      </header>
      <div className="modal-body">{children}</div>
    </dialog>
  )
}
export function Confirm({
  children,
  action,
  onConfirm,
}: {
  children: ReactNode
  action: string
  onConfirm: () => void
}) {
  const { close } = useUI()
  return (
    <>
      <div>{children}</div>
      <div className="form-actions">
        <Button onClick={close}>Отмена</Button>
        <Button
          primary
          onClick={() => {
            onConfirm()
            close()
          }}
        >
          {action}
        </Button>
      </div>
    </>
  )
}
