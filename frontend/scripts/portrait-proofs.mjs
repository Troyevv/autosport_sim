/** Render the production component with a running Vite game and its actual career.
 * node scripts/portrait-proofs.mjs http://localhost:5173 CAREER_ID OUTPUT_DIR
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { chromium } from 'playwright'

const [url, career, target] = process.argv.slice(2)
if (!url || !career || !target)
  throw Error('Expected game URL, career ID and output directory')
const output = resolve(target)
await mkdir(output, { recursive: true })
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
})
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1056 },
    deviceScaleFactor: 1,
  })
  const failures = []
  page.on('pageerror', (error) => failures.push(error.message))
  await page.goto(new URL('/portraits.html', url).href)
  await page.waitForSelector('.studio-grid svg')
  const { subjects, looks } = await page.evaluate(async (id) => {
    // Import the same React singleton, renderer and production component as the gallery.
    const entry = await (await fetch('/src/career/Gallery.tsx')).text()
    const moduleURL = (fragment) => {
      const path = entry
        .split('"')
        .find((s) => s.startsWith('/') && s.split('?')[0].endsWith(fragment))
      if (!path) throw Error('Missing Vite module ' + fragment)
      return path
    }
    const { default: React } = await import(moduleURL('/react.js'))
    const {
      default: { createRoot },
    } = await import(moduleURL('/react-dom_client.js'))
    const { Portrait } = await import(moduleURL('/Portrait.tsx'))
    const { Context } = await import('/src/pitwall/core/context.js')
    const api = async (path) => {
      const response = await fetch('/api/' + path)
      if (!response.ok) throw Error(path + ' ' + response.status)
      return response.json()
    }
    const [world, media, directory, state] = await Promise.all([
      api('world'),
      api('media'),
      api('careers/' + id + '/personnel'),
      api('careers/' + id),
    ])
    const employees = new Map(directory.map((p) => [p.id, p]))
    const assignments = new Map(
      Object.values(world.assignments).map((s) => [s.person, s]),
    )
    const people = Object.entries(world.faces).map(([id, face]) => {
      const seat = assignments.get(id)
      return {
        id,
        face,
        name: world.names[id],
        org: seat?.org ?? null,
        position: seat?.position ?? 'staff',
        ...employees.get(id),
      }
    })
    for (const p of directory)
      if (!people.some((s) => s.id === p.id)) people.push(p)
    const used = new Set(people.map((p) => p.face))
    for (const asset of media.filter(
      (a) => a.kind === 'generated-head' && !used.has(a.entity),
    )) {
      people.push({
        id: asset.entity,
        face: asset.entity,
        name: 'Резерв',
        org: null,
        reserve: true,
      })
    }
    people.sort(
      (a, b) =>
        Number(!!a.reserve) - Number(!!b.reserve) || a.id.localeCompare(b.id),
    )
    const looks = []
    const categories = [
      'driver',
      'mechanic',
      'engineering',
      'executive',
      'staff',
      'advisor',
      'neutral',
    ]
    const candidates = people.filter((p) => employees.has(p.id) && p.face)
    const hair = new Map(
      media
        .filter((a) => a.kind === 'generated-head')
        .map((a) => [a.entity, a.anatomy]),
    )
    const samples = [
      candidates.find(
        (p) => hair.get(p.face)?.hair || hair.get(p.face)?.fringe,
      ),
      candidates.find((p) => p.org && p.position === 'technical-advisor'),
      candidates.find((p) => !p.org && p.position === 'driver'),
      candidates.find((p) => p.face.includes('junior') && p.org),
      candidates.find((p) => p.org && p.position?.includes('mechanic')),
      candidates.find((p) => p.org && p.position === 'manager'),
    ]
    const sponsors = Object.values(world.organizations).filter((o) =>
      media.some(
        (a) => a.kind === 'logo' && a.entity === (o.logo_asset || o.id),
      ),
    )
    samples.filter(Boolean).forEach((p, i) =>
      categories.forEach((category, j) => {
        const eligible = sponsors.filter(
          (o) => o.kind === (category === 'advisor' ? 'supplier' : 'team'),
        )
        looks.push({
          ...p,
          category,
          org:
            category === 'neutral'
              ? null
              : (eligible[(i + j) % eligible.length]?.id ?? p.org),
        })
      }),
    )
    document.body.replaceChildren()
    document.documentElement.removeAttribute('style')
    const style = document.createElement('style')
    style.textContent =
      'body{margin:0;background:#202329;color:white}#proof{display:grid;width:1440px;grid-template-columns:repeat(12,120px);grid-auto-rows:176px}#proof figure{height:176px;margin:0;border:1px solid #444;box-sizing:border-box;background:radial-gradient(at 48% 38%,#52565a,#292c30 76%);text-align:center;overflow:hidden}#proof .career-portrait{display:block;width:118px;height:148px;max-height:none;margin:0}#proof figcaption{font:11px/15px sans-serif;color:white;white-space:nowrap;overflow:hidden}'
    document.head.append(style)
    const main = document.createElement('main')
    main.id = 'proof'
    document.body.append(main)
    const root = createRoot(main)
    window.renderProof = (kind, index, count) => {
      const batch = (kind === 'roster' ? people : looks).slice(
        index,
        index + count,
      )
      const context = {
        world,
        game: { career: state, personnelById: employees },
      }
      root.render(
        React.createElement(
          Context.Provider,
          { value: context },
          batch.map((p, j) => {
            const org = world.organizations[p.org]
            const label = String(index + j + 1).padStart(4, '0')
            return React.createElement(
              'figure',
              { key: kind + p.id + j, 'data-row': label },
              React.createElement(Portrait, {
                person: p,
                org: p.org,
                organization: org,
                driver: p.position === 'driver',
                color: org?.brand_palette?.primary ?? '#797b80',
                media,
                category: p.category === 'neutral' ? undefined : p.category,
                view: kind === 'matrix' ? 'portrait' : undefined,
              }),
              React.createElement(
                'figcaption',
                {},
                label + ' · ' + (p.category ?? p.name),
              ),
            )
          }),
        ),
      )
    }
    return {
      subjects: people.map(
        ({ id, name, face, reserve, org, kit_position, position }) => ({
          id,
          name,
          face,
          reserve,
          org,
          position: kit_position || position,
        }),
      ),
      looks,
    }
  }, career)
  const manifest = { career, subjects, looks }
  await writeFile(join(output, 'index.json'), JSON.stringify(manifest, null, 2))
  for (const [kind, records] of [
    ['roster', subjects],
    ['matrix', looks],
  ]) {
    for (let i = 0; i < records.length; i += 72) {
      await page.evaluate(
        ([kind, i]) => window.renderProof(kind, i, 72),
        [kind, i],
      )
      await page.waitForFunction(
        (start) => document.querySelector('figure')?.dataset.row === start,
        String(i + 1).padStart(4, '0'),
      )
      await page.waitForFunction(() =>
        [
          ...document.querySelectorAll(
            'svg[data-employer]:not([data-employer=""])',
          ),
        ].every((svg) =>
          svg
            .querySelector('[data-layer="fitted-fabric"]')
            ?.getAttribute('href')
            ?.startsWith('data:'),
        ),
      )
      await page.evaluate(async () => {
        const urls = new Set(
          [...document.querySelectorAll('svg image')]
            .map((el) => el.getAttribute('href'))
            .filter(Boolean),
        )
        await Promise.all(
          [...urls].map(async (url) => {
            const im = new Image()
            im.src = url
            await im.decode()
          }),
        )
        await new Promise(requestAnimationFrame)
      })
      await page
        .locator('#proof')
        .screenshot({
          path: join(
            output,
            kind + '-' + String(i / 72 + 1).padStart(2, '0') + '.jpg',
          ),
          type: 'jpeg',
          quality: 92,
        })
    }
  }
  if (failures.length) throw Error(failures.join('\n'))
  console.log(
    subjects.filter((p) => !p.reserve).length,
    'people;',
    subjects.length,
    'portraits;',
    looks.length,
    'fittings',
  )
} finally {
  await browser.close()
}
