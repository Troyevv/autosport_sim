import React, { useEffect, useRef, useState } from 'react'
import * as Icons from 'lucide-react'
export function Icon({ name, size = 18, ...p }) {
  const I = Icons[name] || Icons.Circle
  return <I size={size} {...p} />
}
export function Button({ variant = 'primary', icon, children, type = 'button', className = '', ...p }) {
  return (
    <button type={type} className={'button ' + variant + ' ' + className} {...p}>
      {icon}
      {children}
    </button>
  )
}
export function Badge({ tone = 'neutral', children }) {
  return <span className={'badge ' + tone}>{children}</span>
}
export function PageHeading({ eyebrow, title, description, actions }) {
  return (
    <header className="page-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="heading-actions">{actions}</div>}
    </header>
  )
}
export const PageHeader = PageHeading
export function Panel({ title, subtitle, actions, children, className = '' }) {
  return (
    <section className={'panel ' + className}>
      {(title || actions) && (
        <header>
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          {actions}
        </header>
      )}
      <div className="panel-body">{children}</div>
    </section>
  )
}
export function Tabs({ items, value, onChange }) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current,
      active = el?.querySelector('[aria-selected="true"]')
    if (!el || !active) return
    const a = active.getBoundingClientRect(),
      b = el.getBoundingClientRect()
    if (a.left < b.left) el.scrollLeft -= b.left - a.left + 8
    else if (a.right > b.right) el.scrollLeft += a.right - b.right + 8
  }, [value])
  return (
    <div ref={ref} className="tabs" role="tablist" aria-label="Разделы экрана">
      {items.map((t, i) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={value === t.id}
          tabIndex={value === t.id ? 0 : -1}
          onClick={() => onChange(t.id)}
          onKeyDown={(e) => {
            let n = i
            if (e.key === 'ArrowRight') n = (i + 1) % items.length
            else if (e.key === 'ArrowLeft') n = (i - 1 + items.length) % items.length
            else if (e.key === 'Home') n = 0
            else if (e.key === 'End') n = items.length - 1
            else return
            e.preventDefault()
            onChange(items[n].id)
            e.currentTarget.parentElement.children[n].focus()
          }}
        >
          {t.label}
          {t.count != null && <small>{t.count}</small>}
        </button>
      ))}
    </div>
  )
}
export function EmptyState({ title, description, action }) {
  return (
    <div className="empty-state">
      <Icon name="Flag" size={28} />
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  )
}

export function DataTable({columns,rows,empty='Нет записей',onRowClick}){return rows.length?<table className="data-table"><thead><tr>{columns.map(c=><th key={c.key}>{c.label}</th>)}</tr></thead><tbody>{rows.map((r,i)=><tr key={r.id||r.key||i} onClick={()=>onRowClick?.(r)}>{columns.map(c=><td key={c.key} data-label={c.label}>{c.render?c.render(r):r[c.key]??'—'}</td>)}</tr>)}</tbody></table>:<EmptyState title={empty}/>}
export function Facts({rows}){return <dl className="detail-list">{rows.map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>}
export function Select({label,options=[],...p}){return <label><span>{label}</span><select {...p}>{options.map(o=>typeof o==='string'?<option key={o}>{o}</option>:<option key={o.value??o.id} value={o.value??o.id} disabled={o.disabled}>{o.label??o.name}</option>)}</select></label>}
export function Input({label,...p}){return <label><span>{label}</span><input {...p}/></label>}
