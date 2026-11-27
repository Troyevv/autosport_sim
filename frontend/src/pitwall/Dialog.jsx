import React, { useRef, useState, useEffect } from 'react'
import { useGame } from './core'
import { identityVars } from './v2/identity'
import { classifyContractSpec, ContractDialogHeader } from './v2/Contracts'
export function Dialog({ spec, close }) {
  const g = useGame(),
    contractType = classifyContractSpec(spec)
  const ref = useRef(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  useEffect(() => {
    const before = document.activeElement
    ref.current?.querySelector('input,select,textarea,button')?.focus()
    return () => before?.focus?.()
  }, [])
  async function submit(e) {
    e.preventDefault()
    const v = Object.fromEntries(new FormData(e.currentTarget))
    const problem = spec.validate?.(v)
    if (problem) {
      setError(problem)
      return
    }
    setBusy(true)
    try {
      await spec.onSubmit?.(v)
      close()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }
  useEffect(() => {
    if (error) ref.current?.querySelector('[role=alert]')?.focus()
  }, [error])
  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && close()}>
      <section
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={spec.title}
        style={identityVars(g.world.organizations[g.game.career.org])}
        className={
          'modal ' +
          (spec.wide ? 'wide ' : '') +
          (contractType ? 'contract-dialog contract-kind-' + contractType : '')
        }
        onKeyDown={(e) => {
          if (e.key === 'Escape') close()
          if (e.key === 'Tab') {
            const els = Array.from(
              ref.current.querySelectorAll(
                'button:not([disabled]),input,select,textarea,[tabindex="0"]',
              ),
            )
            if (e.shiftKey && document.activeElement === els[0]) {
              e.preventDefault()
              els.at(-1)?.focus()
            } else if (!e.shiftKey && document.activeElement === els.at(-1)) {
              e.preventDefault()
              els[0]?.focus()
            }
          }
        }}
      >
        <header>
          {contractType ? (
            <ContractDialogHeader spec={spec} g={g} />
          ) : (
            <span>
              <small>Решение организации</small>
              <h2>{spec.title}</h2>
            </span>
          )}
          <button aria-label="Закрыть окно" className="icon-button" onClick={close}>
            ×
          </button>
        </header>
        <div className="modal-content">
          {(spec.description || spec.body) && <p>{spec.description || spec.body}</p>}
          {spec.content}
          {spec.fields && (
            <form onSubmit={submit} className="stack">
              <div className="form-grid">
                {spec.fields.map((f) => (
                  <label key={f.name || f.key} className={f.wide ? 'span-all' : ''}>
                    <span>{f.label}</span>
                    {f.type === 'select' || f.options ? (
                      <select
                        name={f.name || f.key}
                        defaultValue={f.defaultValue ?? f.value ?? f.initial ?? ''}
                        required={f.required}
                      >
                        {f.options?.map((o) =>
                          typeof o === 'string' ? (
                            <option key={o}>{o}</option>
                          ) : (
                            <option value={o.value ?? o.id} key={o.value ?? o.id} disabled={o.disabled}>
                              {o.label ?? o.name}
                            </option>
                          ),
                        )}
                      </select>
                    ) : f.type === 'textarea' ? (
                      <textarea
                        name={f.name || f.key}
                        defaultValue={f.defaultValue ?? f.value ?? f.initial}
                        required={f.required}
                      />
                    ) : (
                      <input
                        type={f.type || 'text'}
                        name={f.name || f.key}
                        defaultValue={f.defaultValue ?? f.value ?? f.initial}
                        required={f.required}
                        min={f.min}
                        max={f.max}
                        step={f.step}
                      />
                    )}
                    {f.hint && <small>{f.hint}</small>}
                  </label>
                ))}
              </div>
              {error && (
                <p role="alert" tabIndex={-1} className="form-error">
                  {error}
                </p>
              )}
              <div className="dialog-actions">
                <button type="button" className="button secondary" onClick={close}>
                  Отмена
                </button>
                <button disabled={busy} type="submit" className="button">
                  {busy ? 'Сохраняем…' : spec.submitLabel || 'Подтвердить'}
                </button>
              </div>
            </form>
          )}
          {spec.confirm && (
            <div className="dialog-actions">
              <button className="button secondary" onClick={close}>
                Отмена
              </button>
              <button
                disabled={busy}
                className={'button ' + (spec.danger ? 'danger' : '')}
                onClick={async () => {
                  if (busy) return
                  setBusy(true)
                  try {
                    await spec.onConfirm?.()
                    close()
                  } catch (e) {
                    setError(e.message)
                  } finally {
                    setBusy(false)
                  }
                }}
              >
                {spec.confirmLabel || 'Подтвердить'}
              </button>
            </div>
          )}
          {error && !spec.fields && (
            <p role="alert" tabIndex={-1} className="form-error">
              {error}
            </p>
          )}
        </div>
      </section>
    </div>
  )
}
