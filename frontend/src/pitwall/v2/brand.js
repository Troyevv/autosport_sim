// sRGB and WCAG relative luminance, independent of organization, role or vehicle.
const hex = (value) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
const rgb = (value) => [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16))
const graphite = '#181819'
const white = '#ffffff'
const black = '#101012'
export function mixColors(from, to, amount) {
  const target = rgb(to)
  return (
    '#' +
    rgb(from)
      .map((channel, i) =>
        Math.round(channel + (target[i] - channel) * amount)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  )
}
function luminance(color) {
  const [r, g, b] = rgb(color).map((channel) => {
    const s = channel / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return r * 0.2126 + g * 0.7152 + b * 0.0722
}
export function contrast(a, b) {
  const x = luminance(a) + 0.05,
    y = luminance(b) + 0.05
  return Math.max(x, y) / Math.min(x, y)
}
function legible(color, background, ratio) {
  if (contrast(color, background) >= ratio) return color
  const end = contrast(background, white) > contrast(background, black) ? white : black
  let lo = 0,
    hi = 1
  for (let n = 0; n < 12; n++) {
    const step = (lo + hi) / 2
    if (contrast(mixColors(color, end, step), background) >= ratio) hi = step
    else lo = step
  }
  return mixColors(color, end, hi)
}
function chroma(color) {
  const channels = rgb(color)
  return Math.max(...channels) - Math.min(...channels)
}
export function organizationPalette(org) {
  const palette = org?.brand_palette
  const primary = hex(palette?.primary) ? palette.primary : hex(org?.color) ? org.color : '#77797b'
  const secondary = hex(palette?.secondary) ? palette.secondary : mixColors(primary, white, 0.58)
  return { primary, secondary, ...(hex(palette?.accent) ? { accent: palette.accent } : {}) }
}
export function identityVars(org) {
  const { primary, secondary, accent } = organizationPalette(org)
  // When one brand colour is neutral, keep the hue of its chromatic partner.
  const signal =
    accent ||
    (chroma(secondary) < 26
      ? mixColors(primary, secondary, 0.12)
      : chroma(primary) < 26
        ? secondary
        : mixColors(secondary, primary, 0.15))
  const textAccent = legible(signal, '#454548', 4.6)
  const paper = mixColors('#f4f2ed', secondary, 0.05)
  const onPaper = legible(primary, '#d5cfc6', 4.6)
  return {
    '--org-brand-primary': primary,
    '--org-brand-secondary': secondary,
    '--org-primary': legible(primary, '#38383b', 3.1),
    '--org-secondary': legible(secondary, '#38383b', 3.1),
    '--org-accent': textAccent,
    '--org-on-accent': contrast(textAccent, black) >= 4.5 ? black : white,
    '--org-surface': mixColors(graphite, primary, 0.12),
    '--org-panel': mixColors('#232325', secondary, 0.055),
    '--org-ink': mixColors('#f6f4ef', secondary, 0.035),
    '--org-paper': paper,
    '--org-paper-ink': onPaper,
    '--org-paper-rule': legible(secondary, paper, 3.1),
    '--team': primary,
    '--org': primary,
  }
}
