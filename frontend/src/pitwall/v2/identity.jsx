import React from 'react'
import { useGame } from '../core/context'

// The identity layer changes space, editorial treatment and document stationery.
// It does not change data, permissions or the shared component implementation.
const identities = {
  'team-scuderia-ferrari': {
    key: 'ferrari',
    short: 'Ferrari',
    wordmark: 'Scuderia Ferrari',
    primary: '#b91f35',
    accent: '#f7db81',
    surface: '#211619',
    ink: '#fff1df',
    headline: 'Maranello. Una squadra.',
    tone: 'Решения, которые становятся скоростью.',
    signature: 'SCUDERIA / MARANELLO',
    theme: 'heritage',
  },
  'team-mclaren-formula-1-team': {
    key: 'mclaren',
    short: 'McLaren',
    wordmark: 'McLaren',
    primary: '#f48631',
    accent: '#ffb57c',
    surface: '#251b16',
    ink: '#fff4e8',
    headline: 'Всё начинается в Уокинге.',
    tone: 'Гоночная программа. Долгосрочное преимущество.',
    signature: 'MCLAREN / WOKING',
    theme: 'papaya',
  },
  'team-williams-racing': {
    key: 'williams',
    short: 'Williams',
    wordmark: 'WILLIAMS',
    primary: '#3378ef',
    accent: '#83b4ff',
    surface: '#121f37',
    ink: '#edf6ff',
    headline: 'Grove. Следующая глава.',
    tone: 'Каждый ресурс должен работать на прогресс.',
    signature: 'WILLIAMS RACING / GROVE',
    theme: 'precision',
  },
  'team-prema-racing': {
    key: 'prema',
    short: 'PREMA',
    wordmark: 'PREMA RACING',
    primary: '#cb3341',
    accent: '#8ee3ba',
    surface: '#17231e',
    ink: '#effff6',
    headline: 'У таланта есть команда.',
    tone: 'Люди, подготовка и следующий шаг в карьере.',
    signature: 'PREMA / GRISIGNANO DI ZOCCO',
    theme: 'academy',
  },
  'supplier-sadev': {
    key: 'sadev',
    short: 'SADEV',
    wordmark: 'SADEV',
    primary: '#c64b3e',
    accent: '#e6b49e',
    surface: '#241d1b',
    ink: '#f6e7df',
    headline: 'Точность под нагрузкой.',
    tone: 'От первой спецификации до доверия клиента.',
    signature: 'SADEV / TRANSMISSIONS',
    theme: 'industrial',
  },
  'supplier-mercedes': {
    key: 'mercedes',
    short: 'Mercedes',
    wordmark: 'MERCEDES',
    primary: '#00a99c',
    accent: '#75e0d5',
    surface: '#132927',
    ink: '#e6fffb',
    headline: 'Технология гоночного преимущества.',
    tone: 'Инженерные программы. Клиенты. Ответственность.',
    signature: 'MERCEDES / POWER & ENGINEERING',
    theme: 'industrial',
  },
}
export function getIdentity(org) {
  return (
    identities[org?.id] || {
      key: 'independent',
      short: org?.name || 'Autosport',
      wordmark: org?.name || 'AUTOSPORT',
      primary: org?.color || '#8c7662',
      accent: '#e5d1ae',
      surface: '#211e1b',
      ink: '#f1ede6',
      headline: org?.base || 'Ваше место в паддоке',
      tone:
        org?.kind === 'supplier'
          ? 'Технологии, которым доверяют.'
          : 'Организация с собственным характером.',
      signature: (org?.name || 'AUTOSPORT').toUpperCase(),
      theme: 'independent',
    }
  )
}
export function identityVars(org) {
  const i = getIdentity(org)
  return {
    '--org-primary': i.primary,
    '--org-accent': i.accent,
    '--org-surface': i.surface,
    '--org-ink': i.ink,
    '--team': i.primary,
  }
}
export function OrganizationMark({ orgId, size = 48, wordmark = false, className = '' }) {
  const g = useGame(),
    org = g.world.organizations[orgId || g.game.career.org],
    i = getIdentity(org),
    logo = (g.data.media || []).find((m) => m.kind === 'logo' && m.entity === org?.id)
  return (
    <span
      className={
        'organization-mark ' + (logo ? 'has-logo ' : 'typographic-mark ') + i.key + ' ' + className
      }
      style={{ '--mark-size': size + 'px' }}
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
