// The R3.2 photographic fabric sampler and shared camera from esport_sim (MIT).
import { useState, useEffect } from 'react'
import type { Anatomy, Garment } from './api'

export function shoulderFrame(frame: Anatomy) {
  const [left, top, width] = frame.camera
  const shoulders = frame.body[0]
  const chestWidth = Math.max(
    width,
    Math.min(width * 1.34, (shoulders[shoulders.length - 1] - shoulders[0]) * 0.94),
  )
  return [left + (width - chestWidth) / 2, top, chestWidth, (chestWidth * 280) / 240]
}

// Sample the garment at source resolution. Browser displacement filters round
// coordinates at display resolution, which leaves a stair-step around a 120px
// profile collar. The same column map fits crew, V and polo necks.

type Fabric = { image: HTMLImageElement; roof: Float32Array }
const fabrics = new Map<string, Promise<Fabric>>()
const finished = new Map<string, Promise<string>>()
function readFabric(url: string) {
  const cached = fabrics.get(url)
  if (cached) return cached
  const image = new Image()
  image.src = url
  const work = image
    .decode()
    .then(() => {
      const canvas = document.createElement('canvas')
      canvas.width = image.width
      canvas.height = image.height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(image, 0, 0)
      const pixels = ctx.getImageData(0, 0, image.width, image.height).data
      const roof = new Float32Array(image.width)
      for (let x = 0; x < image.width; x++) {
        let y = 0
        while (y < image.height && pixels[4 * (y * image.width + x) + 3] < 120) y++
        roof[x] = y
      }
      return { image, roof }
    })
    .catch((e) => {
      fabrics.delete(url)
      throw e
    })
  if (fabrics.size >= 32) fabrics.delete(fabrics.keys().next().value!)
  fabrics.set(url, work)
  return work
}

function cutFabric(digest: string, garment: Garment, url: string, frame: Anatomy) {
  const key = JSON.stringify([digest, url, frame, garment])
  const ready = finished.get(key)
  if (ready) return ready
  const rig = garment.rig
  const [sx] = garment.outline
  const [tx, ty] = frame.body
  const last = tx.length - 1
  const worldPerNative = 246 / rig.span
  const scale = (worldPerNative * (tx[last] - tx[0])) / (sx[last] - sx[0])
  const [left, top, width, height] = shoulderFrame(frame)
  const work = readFabric(url)
    .then(({ image, roof }) => {
      const c = document.createElement('canvas')
      c.width = Math.ceil(width * 2)
      c.height = Math.ceil(height * 2)
      const ctx = c.getContext('2d')!
      const pixel = width / c.width,
        syRatio = c.height / height
      let i = 0
      for (let x = 0; x < c.width; x++) {
        const pos = left + (x + 0.5) * pixel
        while (i < last - 1 && pos > tx[i + 1]) i++
        const u = (pos - tx[i]) / (tx[i + 1] - tx[i])
        const nx = (sx[i] + u * (sx[i + 1] - sx[i]) - rig.seat[0]) / worldPerNative + rig.collar[0]
        if (nx < 0 || nx >= image.width - 1) continue
        const leftPx = Math.floor(nx),
          fraction = nx - leftPx
        const edge = roof[leftPx] + fraction * (roof[leftPx + 1] - roof[leftPx])
        // Ignore isolated transparent columns at the sleeve and extrapolate
        // its natural edge outside the measured shoulder cross-section.
        if (edge >= image.height - 1) continue
        const v = Math.max(0, Math.min(1, u))
        const dest = ty[i] + v * (ty[i + 1] - ty[i])
        const measuredEdge = garment.outline[1]
        const nominal =
          (measuredEdge[i] + v * (measuredEdge[i + 1] - measuredEdge[i]) - rig.seat[1]) / worldPerNative +
          rig.collar[1]
        const baseline = u < 0 || u > 1 ? nominal : edge
        const sw = (pixel * (sx[i + 1] - sx[i])) / (tx[i + 1] - tx[i]) / worldPerNative
        ctx.drawImage(
          image,
          nx - sw / 2,
          0,
          sw,
          image.height,
          x,
          (dest - top - baseline * scale) * syRatio,
          1,
          image.height * scale * syRatio,
        )
      }
      return c.toDataURL()
    })
    .catch((e) => {
      finished.delete(key)
      throw e
    })
  if (finished.size >= 72) finished.delete(finished.keys().next().value!)
  finished.set(key, work)
  return work
}

export function useFittedFabric(
  digest: string | undefined,
  garment: Garment | undefined,
  url: string | undefined,
  frame: Anatomy | undefined,
) {
  const key = JSON.stringify([digest, url, frame, garment])
  const [result, setResult] = useState({ key: '', image: '' })
  useEffect(() => {
    if (!digest || !frame || !garment || !url) return
    let active = true
    cutFabric(digest, garment, url, frame)
      .then((image) => {
        if (active) setResult({ key, image })
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [key, digest, garment, url, frame])
  return result.key === key ? result.image : undefined
}
