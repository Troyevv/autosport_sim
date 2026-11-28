import type { Career } from '../../career/api'

export function publishCareerMoment(before: Career, after: Career, action: string, payload: unknown) {
  if (!payload || typeof payload !== 'object' || after.revision <= before.revision) return
  const args = payload as Record<string, unknown>
  const contractActions: Record<string, string> = {
    'staff-release': 'departure',
    'funding-end': 'funding-end',
    'finance-end-deal': 'partnership-end',
    'finance-end-supply': 'supply-end',
  }
  const kind = ['maker-review', 'development-review'].includes(action)
    ? ({ released: 'release', withdrawn: 'withdraw' } as Record<string, string>)[
        String(args.disposition)
      ]
    : contractActions[action]
  if (!kind) return
  const person = before.assignments.find((s) => s.id === args.seat)?.occupant?.id
  window.dispatchEvent(
    new CustomEvent('autosport-career-moment', {
      detail: {
        id: after.id,
        revision: after.revision,
        kind,
        project: args.project,
        person,
        date: after.date,
      },
    }),
  )
}
