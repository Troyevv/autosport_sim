import { geometry } from '../src/garage/model'
import { expect, type Locator } from '@playwright/test'

export async function expectCarFits(stage: Locator) {
  await expect(stage.locator('.car-stand')).toHaveAttribute('data-state', 'ready')
  const result = await stage.locator('canvas.garage-body').evaluate((node: HTMLCanvasElement) => {
    const { width, height } = node
    const pixels = node.getContext('2d')!.getImageData(0, 0, width, height).data
    let left = width,
      right = 0,
      top = height,
      bottom = 0
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (pixels[4 * (y * width + x) + 3] < 32) continue
        left = Math.min(left, x)
        right = Math.max(right, x + 1)
        top = Math.min(top, y)
        bottom = Math.max(bottom, y + 1)
      }
    }
    const r = node.getBoundingClientRect()
    let clearance = Infinity
    for (
      let parent = node.parentElement;
      parent && !parent.matches('.main-scroll');
      parent = parent.parentElement
    ) {
      const style = getComputedStyle(parent),
        clip = parent.getBoundingClientRect()
      if (['hidden', 'clip'].includes(style.overflowX)) {
        clearance = Math.min(
          clearance,
          r.left + (left * r.width) / width - clip.left,
          clip.right - r.left - (right * r.width) / width,
        )
      }
      if (['hidden', 'clip'].includes(style.overflowY)) {
        clearance = Math.min(
          clearance,
          r.top + (top * r.height) / height - clip.top,
          clip.bottom - r.top - (bottom * r.height) / height,
        )
      }
    }
    return {
      clearance,
      proportion: r.width / r.height / (width / height),
      painted: ((right - left) * (bottom - top)) / (width * height),
    }
  })
  expect(result.painted).toBeGreaterThan(0.4)
  expect(result.proportion).toBeCloseTo(1, 2)
  expect(result.clearance).toBeGreaterThanOrEqual(-1)
}

// Measure painted wheel pixels and the shadow pass in the rendered room. The
// cabinet feet in workshop.webp are at 74–76% of its height, behind the car.
export async function expectCarParked(stage: Locator) {
  const stand = stage.locator('.car-stand')
  await expect(stand).toHaveAttribute('data-state', 'ready')
  const model = geometry[(await stand.getAttribute('data-geometry'))!]
  const metrics = await stand.evaluate((node, g) => {
    const bounds = (selector: string) => node.querySelector(selector)!.getBoundingClientRect()
    const room = bounds('.workshop-plate'), body = bounds('.garage-body')
    const frame = node.getBoundingClientRect()
    const car = node.querySelector<HTMLCanvasElement>('.garage-body')!
    const floor = node.querySelector<HTMLCanvasElement>('.garage-floor')!
    const shadow = floor.getContext('2d')!
    const floorBox = floor.getBoundingClientRect()
    const painted = car.getContext('2d')!.getImageData(0, 0, car.width, car.height).data
    const patches = g.contacts.map(([x, y, r]) => {
      let tread = 0
      for (let row = car.height - 1; row >= 0; row--) {
        if (painted[(row * car.width + x) * 4 + 3] > 170) {
          tread = row
          break
        }
      }
      const screenX = body.left + body.width * x / car.width
      const screenY = body.top + body.height * y / car.height
      const alphaBelowTyre = shadow.getImageData(
        Math.round((screenX - floorBox.left) * floor.width / floorBox.width),
        Math.round((screenY - floorBox.top) * floor.height / floorBox.height) + 1, 1, 1,
      ).data[3]
      return { depth: (screenY - room.top) / room.height, treadOffset: Math.abs(y - tread) / r, alphaBelowTyre }
    })
    const sign = bounds('.garage-wall image, .garage-wall text')
    return {
      patches,
      metres: g.length * room.width / body.width,
      sideSpace: Math.min(body.left - frame.left, frame.right - body.right) / frame.width,
      foreground: (frame.bottom - body.bottom) / frame.height,
      signSpace: (body.top - sign.bottom) / room.height,
      signVisible: sign.top >= frame.top - 1 && sign.left >= frame.left - 1 && sign.right <= frame.right + 1,
    }
  }, model)
  expect(metrics.metres).toBeCloseTo(9.6, 1)
  expect(metrics.sideSpace).toBeGreaterThan(0.07)
  expect(metrics.foreground).toBeGreaterThan(0.06)
  expect(metrics.signVisible).toBe(true)
  expect(metrics.signSpace).toBeGreaterThan(0.015)
  for (const patch of metrics.patches) {
    expect(patch.depth).toBeGreaterThan(0.84)
    expect(patch.depth).toBeLessThan(0.88)
    expect(patch.treadOffset).toBeLessThan(0.085)
    expect(patch.alphaBelowTyre).toBeGreaterThan(150)
  }
}
