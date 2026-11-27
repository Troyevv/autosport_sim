import React, { useState } from 'react'
import { useGame } from './core'
import { Button } from './ui'
import { Dialog } from '../ui/components'
import { useOrder } from '../career/finance/useOrder'
import { identityVars, organizationPalette } from './v2/brand'
import './brand.css'

export function PaletteFields({ value, onChange, org }) {
  const tokens = identityVars({ ...org, brand_palette: value })
  return (
    <fieldset className="brand-fields">
      <legend>Фирменная палитра</legend>
      <div className="brand-swatches">
        {Object.entries({
          primary: 'Основной цвет организации',
          secondary: 'Дополнительный цвет организации',
          ...(value.accent ? { accent: 'Акцентный цвет организации' } : {}),
        }).map(([key, label]) => (
          <label key={key}>
            <span>{label}</span>
            <input
              type="color"
              aria-label={label}
              value={value[key]}
              onChange={(e) => onChange({ ...value, [key]: e.target.value })}
            />
            <code>{value[key].toUpperCase()}</code>
          </label>
        ))}
      </div>
      <label className="brand-accent-toggle">
        <input
          type="checkbox"
          checked={Boolean(value.accent)}
          onChange={(e) => {
            const { accent, ...pair } = value
            onChange(e.target.checked ? { ...pair, accent: tokens['--org-accent'] } : pair)
          }}
        />
        Задать отдельный акцент
      </label>
      <div className="brand-sample" style={tokens}>
        <span>Предпросмотр оформления</span>
        <strong>{org.name}</strong>
        <i aria-hidden="true" />
      </div>
    </fieldset>
  )
}
export function OrganizationPalette({ org }) {
  const g = useGame(),
    c = g.game.career
  const [draft, setDraft] = useState(null)
  const order = useOrder(c, g.updateCareer, 'brand_palette')
  if (org.id !== c.org || !c.can_edit_palette) return null
  return (
    <>
      <Button
        variant="secondary"
        onClick={() => {
          order.clear()
          setDraft(organizationPalette(org))
        }}
      >
        Изменить фирменные цвета
      </Button>
      {draft && (
        <Dialog
          title="Фирменные цвета организации"
          onClose={() => {
            if (!order.busy) setDraft(null)
          }}
        >
          <form
            className="brand-form"
            onSubmit={async (e) => {
              e.preventDefault()
              if (await order.send('organization-palette', draft)) setDraft(null)
            }}
          >
            <PaletteFields org={org} value={draft} onChange={setDraft} />
            {order.error && <p role="alert">{order.error}</p>}
            <Button type="submit" disabled={order.busy}>
              Сохранить палитру
            </Button>
          </form>
        </Dialog>
      )}
    </>
  )
}
