import { useEffect, useState } from 'react'
import type { Anatomy, Asset } from './api'
import type { Pattern } from './uniform'

type Template = NonNullable<Asset['template']>
const original = new Map<string, Promise<HTMLImageElement>>()
const painted = new Map<string, Promise<string>>()
function load(url: string) {
  const cached = original.get(url)
  if (cached) return cached
  const image = new Image()
  image.src = url
  const pending = image
    .decode()
    .then(() => image)
    .catch((e) => {
      original.delete(url)
      throw e
    })
  original.set(url, pending)
  return pending
}
function paint(
  texture: string,
  mask: string,
  variant: Pattern['design'],
  colors: string[],
  key: string,
) {
  const cached = painted.get(key)
  if (cached) return cached
  const pending = Promise.all([load(texture), load(mask)])
    .then(([photo, atlas]) => {
      const w = photo.naturalWidth,
        h = photo.naturalHeight
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!
      const offset = ['panels', 'chevron', 'shoulders'].indexOf(variant) * w
      ctx.drawImage(atlas, offset, 0, w, h, 0, 0, w, h)
      const zones = ctx.getImageData(0, 0, w, h).data
      ctx.clearRect(0, 0, w, h)
      ctx.drawImage(photo, 0, 0)
      const shade = ctx.getImageData(0, 0, w, h),
        pixels = shade.data
      const dye = colors.map((c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)))
      for (let i = 0; i < pixels.length; i += 4) {
        if (!pixels[i + 3]) continue
        const grey = pixels[i],
          light = grey / 173,
          shine = (Math.max(0, grey - 173) / 82) * 0.43
        const total = zones[i] + zones[i + 1] + zones[i + 2]
        if (!total) continue
        const coverage = Math.min(1, total / 255)
        for (let channel = 0; channel < 3; channel++) {
          const pigment =
            (zones[i] * dye[0][channel] +
              zones[i + 1] * dye[1][channel] +
              zones[i + 2] * dye[2][channel]) /
            total
          // Even black technical textiles reflect diffuse light off yarn and raised seams.
          const dyed = Math.min(1, light) * (0.94 * pigment + 6) + (255 - pigment) * shine
          pixels[i + channel] = grey * (1 - coverage) + dyed * coverage
        }
      }
      ctx.putImageData(shade, 0, 0)
      return canvas.toDataURL('image/webp', 0.96)
    })
    .catch((e) => {
      painted.delete(key)
      throw e
    })
  if (painted.size >= 64) painted.delete(painted.keys().next().value!)
  painted.set(key, pending)
  return pending
}
export function useGarmentMaterial(
  texture: string | undefined,
  mask: string | undefined,
  variant: Pattern['design'],
  base: string,
  insert: string,
  piping: string,
) {
  const key = JSON.stringify([texture, mask, variant, base, insert, piping])
  const [result, set] = useState({ key: '', image: '' })
  useEffect(() => {
    if (!texture || !mask) return
    let active = true
    paint(texture, mask, variant, [base, insert, piping], key)
      .then((image) => {
        if (active) set({ key, image })
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [key, texture, mask, variant, base, insert, piping])
  return result.key === key ? result.image : texture
}

// The template stays rigid. Both the photograph and every print use this one
// similarity transform, anchored just below the jaw on the existing head layer.
export function fitGarment(anatomy: Anatomy | undefined, template: Template) {
  const [cx, chin, eye] = anatomy?.anchor || [
    anatomy?.body[0][13] ?? 120,
    (anatomy?.body[1][13] ?? 193) - 45,
    36,
  ]
  const [left, right] = template.collar
  const scale = (eye * 1.54) / (right - left)
  return { x: cx - ((left + right) * scale) / 2, y: chin + eye * 0.13, scale, cx, chin, eye }
}
export function portraitCamera(
  anatomy: Anatomy | undefined,
  template: Template,
  framing: 'face' | 'portrait' | 'outfit',
) {
  const fit = fitGarment(anatomy, template)
  const top = anatomy?.camera[1] ?? 0
  if (framing === 'outfit')
    return [
      fit.x - template.width * fit.scale * 0.055,
      top - 4,
      template.width * fit.scale * 1.11,
      fit.y + template.height * fit.scale * 0.93 - top,
    ]
  const bottom = fit.chin + fit.eye * (framing === 'face' ? 1.65 : 2.95)
  const height = Math.max(bottom - top, anatomy?.camera[3] || 0)
  return [fit.cx - (height * 3) / 7, top, (height * 6) / 7, height]
}
