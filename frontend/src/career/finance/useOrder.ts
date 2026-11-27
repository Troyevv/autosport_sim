import {publishCareerMoment} from '../../pitwall/core/moments'
import { useState, useRef } from 'react'
import { api, post, ApiError, explain, type Career } from '../api'
export function useOrder(c: Career, update: (c: Career) => void, field: 'brand_palette' | 'finance' | 'engineering' | 'research' | 'development' | 'production' | 'council' | 'programme' | 'manufacturer' | 'staff' = 'finance') {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const lock = useRef(false),
    retry = useRef({ key: '', id: '' })
  async function send(action: string, payload: unknown) {
    if (lock.current) return false
    lock.current = true
    setBusy(true)
    setError('')
    const key = JSON.stringify([c.revision, action, payload])
    if (retry.current.key !== key) retry.current = { key, id: crypto.randomUUID() }
    try {
      const next = await api<Career>(
          'careers/' + c.id + '/commands',
          post({ command_id: retry.current.id, revision: c.revision, action, [field]: payload }),
        )
      update(next)
      publishCareerMoment(c, next, action, payload)
      retry.current.key = ''
      return true
    } catch (e) {
      setError(explain(e))
      if (e instanceof ApiError && e.status === 409) {
        try {
          update(await api<Career>('careers/' + c.id))
        } catch {
          setError('Не удалось обновить карьеру.')
        }
      }
      return false
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  return { send, busy, error, clear: () => setError('') }
}
