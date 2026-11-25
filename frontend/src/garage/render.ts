import { assetRoot, geometry, type Catalog, type ComponentSelection, type Livery } from './model'

function surface(w: number, h: number) {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw Error('Браузер не поддерживает Canvas 2D.')
  return ctx
}

const cache = new Map<string, Promise<ImageData>>()
async function texture(url: string) {
  const img = new Image()
  img.src = assetRoot + url + '.webp'
  await img.decode()
  return img
}

// Atlas coordinates and mounts belong to a single homologated chassis.
// The shortened wing shares its lower mount and never introduces a cross-model part.
export function material(config: ComponentSelection) {
  const key = [config.regulation, config.model, JSON.stringify(config.installed)].join('/')
  let result = cache.get(key)
  if (!result) {
    result = assemble(config).catch((error) => {
      cache.delete(key)
      throw error
    })
    if (cache.size >= 6) cache.delete(cache.keys().next().value!)
    cache.set(key, result)
  }
  return result
}
async function assemble({ model, regulation, installed }: ComponentSelection) {
  const g = geometry[model]
  const [w, h] = g.size
  const ctx = surface(w, h)
  try {
    const atlas = await texture(model)
    for (const [part, x, y, sx, sy, width, height] of g.parts) {
      const choice = g.regulations.includes(regulation) && g.variants[part]?.[installed[part]]
      if (choice) {
        try {
          const alternative = await texture(choice)
          ctx.drawImage(alternative, x, y, width, height)
          continue
        } catch {
          /* The mounted base part remains available in the original atlas. */
        }
      }
      ctx.drawImage(atlas, sx, sy, width, height, x, y, width, height)
    }
  } catch {
    ctx.drawImage(await texture(model + '-base'), 0, 0)
  }
  return ctx.getImageData(0, 0, w, h)
}

const symbols: Record<string, Path2D> = {}
const drawings: Record<string, string> = {
  relay: 'M0 8L10 0H17L7 8 17 16H10Z M19 2H48L44 6H15Z M17 9H39L35 13H13Z',
  axis: 'M0 15L13 0H20L30 15H23L16 5 7 15Z M30 1H50L46 5H27Z M32 8H47L43 12H29Z',
  bars: 'M0 15L10 0H17L7 15Z M12 15L22 0H29L19 15Z M24 15L34 0H41L31 15Z',
}
function mark(ctx: CanvasRenderingContext2D, id: string, width: number) {
  symbols[id] ??= new Path2D(drawings[id])
  ctx.scale(width / 50, width / 50)
  ctx.translate(-25, -8)
  ctx.fill(symbols[id])
}
const inks = new Map<string, Promise<HTMLImageElement | undefined>>()
function artwork(id: string, catalog: Catalog) {
  const rule = catalog.sponsors[id]
  if (!rule.media && !rule.image) return undefined
  if (!inks.has(id)) {
    const img = new Image()
    img.src = rule.media ? '/api/media/logo/' + rule.media : assetRoot + rule.image
    inks.set(
      id,
      img
        .decode()
        .then(() => img)
        .catch(() => {
          inks.delete(id)
          return undefined
        }),
    )
  }
  return inks.get(id)
}
let wheel: Promise<HTMLImageElement | undefined> | undefined
export async function loadMarks(livery: Livery, catalog: Catalog) {
  const images = new Map(
    await Promise.all(
      livery.decals.map(async ({ asset }) => [asset, await artwork(asset, catalog)] as const),
    ),
  )
  if (livery.template.includes('/f1/')) {
    wheel ??= texture('f1-wheel').catch(() => {
      wheel = undefined
      return undefined
    })
    images.set('wheel-face', await wheel)
  }
  return images
}
function numeral(
  ctx: CanvasRenderingContext2D,
  l: Livery,
  x: number,
  y: number,
  height: number,
  plate: string,
) {
  ctx.save()
  ctx.translate(x, y)
  ctx.font = 'italic 900 ' + height + 'px Arial, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const width = ctx.measureText(l.number).width
  if (plate) {
    ctx.fillStyle = plate
    ctx.fillRect(-width * 0.64, -height * 0.53, width * 1.28, height * 1.1)
  }
  ctx.lineWidth = height * 0.085
  ctx.strokeStyle = '#24262a'
  ctx.strokeText(l.number, 0, height * 0.03)
  ctx.fillStyle = '#fff'
  ctx.fillText(l.number, 0, height * 0.03)
  ctx.restore()
}
// Stored coordinates remain attached to the named panel across compatible revisions.
function locate(source: ImageData, rect: number[], u: number, v: number) {
  const [x, y, width, height] = rect,
    w = source.width,
    h = source.height
  const cx = Math.round((x + width * u) * w),
    cy = Math.round((y + height * v) * h)
  const painted = (px: number, py: number) => {
    const i = (py * w + px) * 4
    return source.data[i + 2] > 100 && source.data[i + 3] > 220
  }
  if (painted(cx, cy)) return { cx, cy, moved: false }
  let best = Infinity,
    nearestX = cx,
    nearestY = cy
  for (let py = Math.ceil(y * h); py < (y + height) * h; py += 2) {
    for (let px = Math.ceil(x * w); px < (x + width) * w; px += 2) {
      const distance = (px - cx) ** 2 + (py - cy) ** 2
      if (distance < best && painted(px, py)) {
        best = distance
        nearestX = px
        nearestY = py
      }
    }
  }
  return { cx: nearestX, cy: nearestY, moved: true }
}
export function compose(
  canvas: HTMLCanvasElement,
  source: ImageData,
  model: string,
  l: Livery,
  catalog: Catalog,
  inks: Awaited<ReturnType<typeof loadMarks>>,
) {
  const { width: w, height: h } = source
  const g = geometry[model]
  const paint = surface(w, h)
  const pattern = catalog.patterns[l.pattern]
  paint.fillStyle = l.colors[0]
  paint.fillRect(0, 0, w, h)
  paint.save()
  paint.scale(w / 100, h / 100)
  for (const [i, path] of [pattern.secondary, pattern.accent].entries()) {
    paint.fillStyle = l.colors[i + 1]
    paint.fill(new Path2D(path))
  }
  paint.restore()

  let adjusted = false
  for (const d of l.decals) {
    const [x, y, width, height] = g.zones[d.zone]
    paint.save()
    paint.beginPath()
    paint.rect(x * w, y * h, width * w, height * h)
    paint.clip()
    const { cx, cy, moved } = locate(source, g.zones[d.zone], d.x, d.y)
    adjusted ||= moved
    paint.translate(cx, cy)
    paint.rotate((d.angle * Math.PI) / 180)
    // Choose the ink against the actual underlying stripe, including pale side panels.
    const rgb = paint.getImageData(cx, cy, 1, 1).data
    const point = (cy * w + cx) * 4
    const rawLuma = rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114
    const luminance = source.data[point] + (source.data[point + 1] / 255) * rawLuma
    paint.fillStyle = luminance > 126 ? '#23282b' : '#fffdf4'
    const rule = catalog.sponsors[d.asset],
      img = inks.get(d.asset)
    const maxWidth = width * w * d.scale,
      maxHeight = height * h * Math.min(1, d.scale * 1.3)
    if (img) {
      const ratio = Math.min(maxWidth / img.width, maxHeight / img.height)
      if (rule.image && paint.fillStyle === '#23282b') paint.filter = 'brightness(0.15)'
      paint.drawImage(
        img,
        (-img.width * ratio) / 2,
        (-img.height * ratio) / 2,
        img.width * ratio,
        img.height * ratio,
      )
    } else if (rule.text || rule.image || rule.media) {
      paint.font = 'italic 800 ' + Math.round(maxHeight * 0.89) + 'px Arial, sans-serif'
      paint.textAlign = 'center'
      paint.textBaseline = 'middle'
      paint.fillText(rule.text || rule.name, 0, 0, maxWidth)
    } else mark(paint, d.asset, Math.min(maxWidth, maxHeight * 2.8))
    paint.restore()
  }
  const isFormula = g.family === 'formula'
  const [zx, zy, zw, zh] = g.zones[isFormula ? 'upper' : 'flank']
  const plate = l.template.includes('/wec/') ? (g.family === 'gt' ? '#d66b10' : '#c52935') : ''
  numeral(
    paint,
    l,
    (zx + zw * (isFormula ? 0.22 : 0.19)) * w,
    (zy + zh * 0.5) * h,
    Math.min(zh * h * 0.96, zw * w * (l.number.length > 2 ? 0.24 : 0.34)),
    plate || (isFormula ? '' : '#25282a'),
  )

  // R contains protected neutral material and specular light, G diffuse illumination,
  // B the painted-surface matte, A silhouette coverage. No tint on tyres or glazing.
  const pixels = paint.getImageData(0, 0, w, h)
  const src = source.data,
    dst = pixels.data
  for (let i = 0; i < src.length; i += 4) {
    const gain = src[i + 1] / 255
    for (let c = 0; c < 3; c++) dst[i + c] = src[i] + gain * dst[i + c]
    dst[i + 3] = src[i + 3]
  }
  canvas.width = w
  canvas.height = h
  const output = canvas.getContext('2d')!
  output.putImageData(pixels, 0, 0)
  const face = inks.get('wheel-face')
  if (face && g.wheelFaces) {
    output.save()
    output.globalCompositeOperation = 'source-atop'
    for (const [x, y, r] of g.wheelFaces) {
      output.drawImage(face, x - r, y - r, r * 2, r * 2)
    }
    output.restore()
  }
  return adjusted
}
