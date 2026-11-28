import { publishCareerMoment } from '../../pitwall/core/moments'
import { useState, useRef } from 'react'
import { api, post, ApiError, explain, type Career } from '../api'
export function useOrder(
  c: Career,
  update: (c: Career) => void,
  field:
    | 'uniform'
    | 'paint'
    | 'brand_palette'
    | 'finance'
    | 'engineering'
    | 'research'
    | 'development'
    | 'production'
    | 'council'
    | 'programme'
    | 'manufacturer'
    | 'staff' = 'finance',
) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const latest = useRef(c)
  latest.current = c
  const lock = useRef(false),
    retry = useRef({ key: '', id: '' })
  async function send(action: string, payload: unknown, throwOnError = false, commandField = field) {
    const current = latest.current
    if (lock.current) {
      if (throwOnError) throw Error('Решение уже отправляется.')
      return false
    }
    lock.current = true
    setBusy(true)
    setError('')
    const key = JSON.stringify([current.revision, action, payload])
    if (retry.current.key !== key) retry.current = { key, id: crypto.randomUUID() }
    try {
      const next = await api<Career>(
        'careers/' + current.id + '/commands',
        post({
          command_id: retry.current.id,
          revision: current.revision,
          action,
          [commandField]: payload,
        }),
      )
      update(next)
      publishCareerMoment(current, next, action, payload)
      retry.current.key = ''
      return true
    } catch (e) {
      setError(explain(e))
      if (e instanceof ApiError && e.status === 409) {
        try {
          update(await api<Career>('careers/' + current.id))
        } catch {
          setError('Не удалось обновить карьеру.')
        }
      }
      if (throwOnError) throw e
      return false
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  return { send, busy, error, clear: () => setError('') }
}
