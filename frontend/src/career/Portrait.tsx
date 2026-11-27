import { useId, useContext } from 'react'
import {
  assetUrl,
  type Asset,
  type Organization,
  type Person,
  type Career,
  type World,
} from './api'
import {
  fitGarment,
  portraitCamera,
  useGarmentMaterial,
} from './portraitAnatomy'
import { Context } from '../pitwall/core/context'
import {
  categoryFor,
  clothingFor,
  neutral,
  standard,
  textiles,
  type Category,
  type Pattern,
  type ClothingRight,
} from './uniform'

type Subject = Pick<Person, 'name' | 'origin' | 'face'> & {
  id?: string
  position?: string
  org?: string | null
  kit_position?: string
  kit_programs?: string[]
  programs?: string[]
  active_entries?: string[]
}
export function Portrait({
  person,
  org,
  color,
  driver,
  media,
  organization,
  category,
  pattern: previewPattern,
  sponsors: previewSponsors,
  view,
}: {
  person: Subject
  org: string | null
  color: string
  driver: boolean
  media: Asset[]
  organization?: Organization
  category?: Category
  pattern?: Pattern
  sponsors?: ClothingRight[]
  view?: 'portrait' | 'garment'
}) {
  const id = useId().replace(/:/g, '')
  const game = useContext(Context) as {
    world: World
    game: { career: Career; personnelById?: Map<string, Subject> }
  } | null
  const current = person.id
    ? game?.game.personnelById?.get(person.id)
    : undefined
  if (!view && current && 'org' in current) org = current.org ?? null
  organization =
    organization || (org ? game?.world.organizations[org] : undefined)
  const headAsset = media.find(
    (a) => a.entity === person.face && a.kind === 'generated-head',
  )
  const group =
    category ||
    categoryFor(
      current?.kit_position ||
        current?.position ||
        person.position ||
        (driver ? 'driver' : 'staff'),
    )
  const patterns = org
    ? game?.game.career.organization_uniforms?.[org]
    : undefined
  const pattern =
    previewPattern ||
    patterns?.[group] ||
    (group === 'executive' ? patterns?.engineering : undefined) ||
    standard
  const sponsors =
    previewSponsors ||
    clothingFor(
      game?.game.career.clothing_rights || [],
      org,
      group,
      current || person,
      game?.world.entries || {},
    )
  const textile = 'paddock-' + (org ? textiles[group] : 'neutral')
  const stock = media.find((a) => a.kind === 'uniform' && a.entity === textile)
  const palette = organization?.brand_palette
  const colors = org
    ? {
        primary: palette?.primary || color,
        secondary: palette?.secondary || color,
        accent: palette?.accent || palette?.secondary || color,
      }
    : neutral
  const texture = assetUrl(media, 'uniform', textile)
  const material = useGarmentMaterial(
    texture,
    org ? assetUrl(media, 'uniform-mask', textile) : undefined,
    pattern.design,
    colors[pattern.base],
    colors[pattern.insert],
    colors[pattern.piping],
  )
  const anatomy = headAsset?.anatomy
  const head = assetUrl(media, 'generated-head', person.face)
  const registration = anatomy?.matte
  const matte =
    registration && assetUrl(media, 'portrait-matte', registration[0])
  const badge = org && assetUrl(media, 'logo', organization?.logo_asset || org)
  const template = stock?.template
  if (!template)
    return (
      <svg
        className="career-portrait"
        viewBox="0 0 240 280"
        role="img"
        aria-label={person.name}
      >
        {head && <image href={head} width="240" height="280" />}
      </svg>
    )
  const {
    width: w,
    height: h,
    collar: [left, right, front],
  } = template
  const geometry = fitGarment(headAsset?.anatomy, template)
  const { x, y, scale } = geometry
  const onlyGarment = view === 'garment'
  const viewBox = onlyGarment
    ? [-w * 0.055, -h * 0.04, w * 1.11, h * 1.08]
    : portraitCamera(geometry)
  const printUnit = (right - left) / 1.54
  const transform = onlyGarment
    ? undefined
    : `translate(${x} ${y}) scale(${scale})`
  // Front rim leaves a genuine neck aperture; the back collar remains behind the head.
  const lip = template.lip.map((fraction, i) => [
    left + ((right - left) * i) / (template.lip.length - 1),
    fraction * front,
  ])
  // Quadratic midpoints avoid cutting a polygon into the photographed seam.
  const curve = lip
    .slice(1, -1)
    .map(([px, py], i) => {
      const next = lip[i + 2]
      return `Q${px} ${py} ${(px + next[0]) / 2} ${(py + next[1]) / 2}`
    })
    .join(' ')
  const rim = `M0 -2 H${left} V${lip[0][1]} ${curve} L${right} ${lip.at(-1)![1]} V-2 H${w} V${h} H0Z`
  const slot = registration?.[1] || 0
  const maskPart = (offset: number) => (
    <svg
      x="0"
      y="0"
      width="240"
      height="280"
      viewBox={[
        (slot % 4) * 480 + offset,
        Math.floor(slot / 4) * 280,
        240,
        280,
      ].join(' ')}
      overflow="hidden"
    >
      <image href={matte} width="1920" height="1120" />
    </svg>
  )
  const lamp = anatomy?.keyLight ?? 0
  const badgeX =
    ({ left: 0.65, right: 0.35, center: 0.5, none: 0 }[pattern.badge] - 0.085) *
    w
  return (
    <svg
      className="career-portrait"
      viewBox={viewBox.join(' ')}
      role="img"
      aria-label={
        onlyGarment
          ? 'Комплект экипировки'
          : person.name + (head ? '' : ' · исходный портрет недоступен')
      }
      data-view={onlyGarment ? 'garment' : 'portrait'}
      data-employer={org || ''}
      data-category={org ? group : 'neutral'}
    >
      <defs>
        <clipPath id={id + 'frame'}>
          <rect
            x={viewBox[0]}
            y={viewBox[1]}
            width={viewBox[2]}
            height={viewBox[3]}
          />
        </clipPath>
        <clipPath id={id + 'front'}>
          <path d={rim} />
        </clipPath>
        {matte && !onlyGarment && (
          <>
            <mask
              id={id + 'skin'}
              maskUnits="userSpaceOnUse"
              x="0"
              y="0"
              width="240"
              height="280"
            >
              {maskPart(0)}
            </mask>
            {anatomy?.fringe && (
              <mask
                id={id + 'hair'}
                maskUnits="userSpaceOnUse"
                x="0"
                y="0"
                width="240"
                height="280"
              >
                {maskPart(240)}
              </mask>
            )}
          </>
        )}
        {!onlyGarment && (
          <>
            <mask
              id={id + 'cloth'}
              maskUnits="userSpaceOnUse"
              x="0"
              y="0"
              width={w}
              height={h}
              style={{ maskType: 'alpha' }}
            >
              <image
                href={texture}
                width={w}
                height={h}
                clipPath={'url(#' + id + 'front)'}
              />
            </mask>
            <radialGradient id={id + 'contact'}>
              <stop offset="0" stopColor="#191311" stopOpacity=".36" />
              <stop offset=".55" stopColor="#211c1b" stopOpacity=".16" />
              <stop offset="1" stopColor="#282323" stopOpacity="0" />
            </radialGradient>
            <linearGradient
              id={id + 'key'}
              x1={lamp >= 0 ? 0 : 1}
              x2={lamp >= 0 ? 1 : 0}
            >
              <stop
                offset="0"
                stopColor="#eee8dd"
                stopOpacity={Math.abs(lamp) * 0.08}
              />
              <stop offset=".55" stopColor="#454347" stopOpacity="0" />
              <stop
                offset="1"
                stopColor="#17171d"
                stopOpacity={Math.abs(lamp) * 0.22}
              />
            </linearGradient>
          </>
        )}
      </defs>
      <g clipPath={'url(#' + id + 'frame)'}>
        {!onlyGarment && material && (
          <image transform={transform} href={material} width={w} height={h} />
        )}
        {!onlyGarment &&
          (head ? (
            <image
              data-layer="appearance"
              mask={matte ? 'url(#' + id + 'skin)' : undefined}
              href={head}
              width="240"
              height="280"
            />
          ) : (
            <path
              fill="#797c80"
              d="M91 167L96 138Q76 121 79 85Q78 42 119 39Q161 40 161 85Q164 120 146 138L150 167Z"
            />
          ))}
        <g transform={transform}>
          {material && (
            <image
              data-layer="fitted-fabric"
              clipPath={onlyGarment ? undefined : 'url(#' + id + 'front)'}
              href={material}
              width={w}
              height={h}
            />
          )}
          {badge && pattern.badge !== 'none' && (
            <image
              data-layer="organization-badge"
              href={badge}
              x={badgeX}
              y={front + printUnit * 0.4}
              width={w * 0.17}
              height={printUnit * 0.66}
              preserveAspectRatio="xMidYMid meet"
            />
          )}
          {org &&
            sponsors.map(
              (r) =>
                r.mount &&
                r.image && (
                  <image
                    key={r.contract}
                    data-layer="sponsor"
                    href={r.image}
                    x={w * (0.22 + 0.56 * (r.mount.x - r.mount.scale / 2))}
                    y={front + printUnit * 1.18}
                    width={w * 0.56 * r.mount.scale}
                    height={printUnit * 0.6}
                    preserveAspectRatio="xMidYMid meet"
                  />
                ),
            )}
          {!onlyGarment && (
            <g mask={'url(#' + id + 'cloth)'} pointerEvents="none">
              <rect width={w} height={h} fill={'url(#' + id + 'key)'} />
              <ellipse
                cx={(left + right) / 2 + lamp * printUnit * 0.16}
                cy={front * 0.4}
                rx={printUnit * 1.6}
                ry={printUnit * 0.95}
                fill={'url(#' + id + 'contact)'}
              />
            </g>
          )}
        </g>
        {!onlyGarment && head && matte && anatomy?.fringe && (
          <image
            data-layer="foreground-hair"
            mask={'url(#' + id + 'hair)'}
            href={head}
            width="240"
            height="280"
          />
        )}
      </g>
    </svg>
  )
}
