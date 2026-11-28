import type { Geometry } from './model'

// The workshop plate is 1600 × 533. Its rear wall meets the floor at y ≈ 394.
// At the parked axle plane the visible bay spans 9.6 metres. All coordinates
// below are in photograph pixels, before the viewport crops the photograph.
export const workshop = { width: 1600, height: 533, widthMetres: 9.6, wheelLine: 458 }

export function parkCar(g: Geometry) {
  const scale = (workshop.width * g.length) / (workshop.widthMetres * g.size[0])
  const width = g.size[0] * scale
  const left = (workshop.width - width) / 2
  const contactY = (g.contacts[0][1] + g.contacts[1][1]) / 2
  const top = workshop.wheelLine - contactY * scale
  return {
    width, left, top,
    lights: [0.195, 0.5, 0.804].map(x => (workshop.width * x - left) / width),
    room: [-left / scale, -top / scale, workshop.width / scale, workshop.height / scale] as const,
  }
}

function lightProfile(width: number, lights: number[]) {
  return Float32Array.from({ length: width }, (_, x) => {
    const u = x / width
    return lights.reduce((total, light) => {
      // The diffuser is a strip with soft ends.
      const distance = Math.max(0, Math.abs(u - light) - 0.08)
      return total + Math.exp(-Math.pow(distance / 0.145, 2))
    }, 0)
  })
}

type Axle = [number, number, number]

// Red and green in the material map describe the surface before decals or paint.
// Cache its response independently of the career and of this room's dimensions.
const surfaceCache = new WeakMap<ImageData, Uint8Array>()
function surfaceResponse(src: ImageData, contacts: Axle[]) {
  const cached = surfaceCache.get(src)
  if (cached) return cached
  const { width: w, height: h, data } = src
  const response = new Uint8Array(w * h * 3)
  const front = contacts[0],
    rear = contacts[1]
  for (let x = 0; x < w; x++) {
    const ground = front[1] + ((rear[1] - front[1]) * (x - front[0])) / (rear[0] - front[0])
    let roof = h
    for (let y = 0; y < h; y++) {
      const pixel = y * w + x,
        i = 4 * pixel
      if (data[i + 3] < 2) continue
      if (data[i + 3] > 160) roof = Math.min(roof, y)
      const depth = Math.max(0, y - roof) / h
      const underside = Math.max(0, Math.min(1, 1 - (ground - y) / (0.29 * h)))
      const up = Math.max(0, i - 8 * w),
        down = Math.min(data.length - 4, i + 8 * w)
      const ridge = Math.max(0, (data[i + 1] * 2 - data[up + 1] - data[down + 1]) / 220)
      const tyre = contacts.some(([cx, base, r]) => (x - cx) ** 2 + (y - base + r) ** 2 < r ** 2)
      const upward = Math.exp(-depth * 7) * 0.7 + Math.min(0.3, ridge)
      const glaze = tyre ? 0.06 : 0.24 + (0.76 * data[i + 2]) / 255
      response[pixel * 3] = Math.round(255 * upward)
      response[pixel * 3 + 1] = Math.min(
        255,
        (42 * upward + data[i] * 0.45 + 24 * ridge) * glaze * (1 - underside * 0.82),
      )
      response[pixel * 3 + 2] = Math.round(255 * underside ** 1.6)
    }
  }
  surfaceCache.set(src, response)
  return response
}

// Apply only RGB irradiance to the assembled beauty pass. Coverage, registration
// and livery remain independent of the lamp positions and the concrete bounce.
export function illuminate(car: HTMLCanvasElement, source: ImageData, contacts: Axle[], lamps: number[]) {
  const ctx = car.getContext('2d')!
  const image = ctx.getImageData(0, 0, car.width, car.height)
  const response = surfaceResponse(source, contacts)
  const light = lightProfile(car.width, lamps)
  const rgba = image.data
  for (let p = 0; p < response.length / 3; p++) {
    const i = p * 4
    if (!rgba[i + 3]) continue
    const key = light[p % car.width]
    const up = response[3 * p] / 255,
      lower = response[3 * p + 2] / 255
    const diffuse = 0.8 + 0.13 * up + key * (0.09 + 0.19 * up) - 0.27 * lower
    const spec = response[3 * p + 1] * (0.09 + key * 0.79)
    const fill = (rgba[i] * 0.24 + rgba[i + 1] * 0.56 + rgba[i + 2] * 0.2) * 0.055
    // Neutral overhead tubes, cool indirect wall light and low-level concrete bounce.
    rgba[i] = (rgba[i] * 0.945 + fill) * diffuse + spec + 1.5
    rgba[i + 1] = (rgba[i + 1] * 0.945 + fill) * diffuse + spec * 0.99 + 2
    rgba[i + 2] = (rgba[i + 2] * 0.945 + fill) * diffuse + spec * 0.968 + 3
  }
  ctx.putImageData(image, 0, 0)
}

let finish: Promise<HTMLImageElement | undefined> | undefined
export function concreteResponse() {
  if (!finish) {
    const image = new Image()
    image.src = '/assets/garage/2025-v1/concrete-response.webp'
    finish = image
      .decode()
      .then(() => image)
      .catch(() => {
        finish = undefined
        return undefined
      })
  }
  return finish
}

function shade(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  opacity: number,
) {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(rx, ry)
  const falloff = ctx.createRadialGradient(0, 0, 0, 0, 0, 1)
  falloff.addColorStop(0, 'rgba(12, 13, 15, ' + opacity + ')')
  falloff.addColorStop(0.42, 'rgba(12, 13, 15, ' + opacity * 0.78 + ')')
  falloff.addColorStop(1, 'rgba(12, 13, 15, 0)')
  ctx.fillStyle = falloff
  ctx.fillRect(-1, -1, 2, 2)
  ctx.restore()
}

export function floorPass(
  floor: HTMLCanvasElement,
  car: HTMLCanvasElement,
  contacts: Axle[],
  rig: ReturnType<typeof parkCar>,
  source: ImageData,
  concrete?: HTMLImageElement,
) {
  const w = car.width,
    h = car.height
  const pad = Math.ceil(w * 0.06)
  floor.width = w + 2 * pad
  floor.height = Math.ceil(h * 1.58)
  const ctx = floor.getContext('2d')!
  ctx.translate(pad, 0)
  const [front, rear] = contacts
  const ground = (front[1] + rear[1]) * 0.5 + 1
  const slope = (rear[1] - front[1]) / (rear[0] - front[0])
  // Reflect in the line joining the two actual contact patches. A rough floor
  // integrates low-frequency colour and rapidly loses detail with distance.
  const bands = [0, 0.08, 0.18, 0.32, 0.6]
  for (let j = 1; j < bands.length; j++) {
    ctx.save()
    ctx.beginPath()
    const offset = j === 1 ? -h * 0.04 : bands[j - 1] * h
    ctx.rect(-pad, ground + offset, floor.width, bands[j] * h - offset)
    ctx.clip()
    ctx.transform(1, slope * 1.55, 0, -0.55, 0, (front[1] + 1 - slope * front[0]) * 1.55)
    ctx.filter = 'blur(' + (1.4 + w * 0.019 * bands[j]) + 'px)'
    ctx.drawImage(car, 0, 0)
    ctx.restore()
  }
  ctx.globalCompositeOperation = 'destination-in'
  if (concrete) ctx.drawImage(concrete, ...rig.room)
  const fade = ctx.createLinearGradient(0, ground - 2, 0, ground + 0.49 * h)
  fade.addColorStop(0, 'rgba(0,0,0,.43)')
  fade.addColorStop(0.34, 'rgba(0,0,0,.23)')
  fade.addColorStop(1, 'transparent')
  ctx.fillStyle = fade
  ctx.fillRect(-pad, 0, floor.width, floor.height)
  ctx.globalCompositeOperation = 'source-over'

  // Three overhead sources cast overlapping soft shadows behind the near wheels.
  const middle = (front[0] + rear[0]) / 2
  for (const lamp of rig.lights) {
    const shift = Math.max(-1, Math.min(1, 0.5 - lamp)) * w * 0.046
    shade(ctx, middle + shift, ground - h * 0.031, w * 0.53, h * 0.13, 0.39)
  }

  // Follow the underside of this particular assembled car. Low splitters and
  // floor edges occlude more of the floor's light than an elevated nose does.
  for (let x = 3; x < w; x += 8) {
    let bottom = h - 1
    while (bottom > 0 && source.data[(bottom * w + x) * 4 + 3] < 170) bottom--
    if (!bottom) continue
    const line = front[1] + (x - front[0]) * slope
    const clearance = Math.max(0, line - bottom) / h
    const occlusion = Math.exp(-clearance * 8)
    if (occlusion > 0.1)
      shade(ctx, x, line - h * 0.008, 11, h * (0.024 + clearance * 0.12), 0.46 * occlusion)
  }
  for (const [x, y, radius] of contacts) {
    shade(ctx, x + radius * 0.045, y - radius * 0.03, radius * 1.22, radius * 0.22, 0.8)
    shade(ctx, x, y + 1, radius * 0.51, radius * 0.069, 0.97)
  }
}
