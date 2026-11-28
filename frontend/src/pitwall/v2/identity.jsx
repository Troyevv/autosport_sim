import React from 'react'
import { useGame } from '../core/context'

import { identityVars } from './brand'
export { identityVars } from './brand'

export function getIdentity(org) {
  const name = org?.name || 'Autosport'
  const initials = name
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
  const short = name.length <= 9 ? name : initials.length > 1 ? initials.slice(0, 4) : name.slice(0, 4)
  return {
    short,
    wordmark: name,
    signature: [name, org?.base].filter(Boolean).join(' / ').toLocaleUpperCase(),
    headline: org?.registration?.legal_name || name,
    tone:
      org?.kind === 'supplier'
        ? 'Техника, специалисты и клиентские программы.'
        : 'Люди, техника и решения команды.',
  }
}
export function OrganizationMark({ orgId, organization, size = 48, wordmark = false, className = '' }) {
  const g = useGame(),
    org = organization || g.world.organizations[orgId || g.game.career.org],
    i = getIdentity(org),
    logo = (g.data.media || []).find((m) => m.kind === 'logo' && m.entity === (org?.logo_asset || org?.id))
  return (
    <span
      className={'organization-mark ' + (logo ? 'has-logo ' : 'typographic-mark ') + className}
      style={{ ...identityVars(org), '--mark-size': size + 'px' }}
      aria-label={org?.name}
    >
      {logo ? <img src={logo.local_url} alt={org.name} /> : !wordmark && <strong>{i.short}</strong>}
      {wordmark && <b>{i.wordmark}</b>}
    </span>
  )
}
export const roleNames = {
  manager: 'Руководитель команды',
  owner: 'Владелец организации',
  manufacturer: 'Руководитель производителя',
}
