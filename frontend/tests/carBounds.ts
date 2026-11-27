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
