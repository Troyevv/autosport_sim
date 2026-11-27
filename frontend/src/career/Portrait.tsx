import { useId, useContext } from 'react'
import { assetUrl, type Asset, type Organization, type Person, type Career, type World } from './api'
import { fitGarment, portraitCamera, useGarmentMaterial } from './portraitAnatomy'
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
  showShoulders = false,
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
  showShoulders?: boolean
  organization?: Organization
  category?: Category
  pattern?: Pattern
  sponsors?: ClothingRight[]
  view?: 'outfit' | 'garment'
}) {
  const id = useId().replace(/:/g, '')
  const game = useContext(Context) as {
    world: World
    game: { career: Career; personnelById?: Map<string, Subject> }
  } | null
  const current = person.id ? game?.game.personnelById?.get(person.id) : undefined
  if (!view && current && 'org' in current) org = current.org ?? null
  organization = organization || (org ? game?.world.organizations[org] : undefined)
  const headAsset = media.find((a) => a.entity === person.face && a.kind === 'generated-head')
  const group =
    category ||
    categoryFor(
      current?.kit_position || current?.position || person.position || (driver ? 'driver' : 'staff'),
    )
  const patterns = org ? game?.game.career.organization_uniforms?.[org] : undefined
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
  const head = headAsset?.anatomy?.unavailable
    ? undefined
    : assetUrl(media, 'generated-head', person.face)
  const arms =
    textiles[group] === 'engineering' && org
      ? assetUrl(media, 'skin-detail', 'paddock-forearms')
      : undefined
  const skin = headAsset?.anatomy?.skin || '#b48771'
  const badge = org && assetUrl(media, 'logo', organization?.logo_asset || org)
  const template = stock?.template
  if (!template)
    return (
      <svg className="career-portrait" viewBox="0 0 240 280" role="img" aria-label={person.name}>
        {head && <image href={head} width="240" height="280" />}
      </svg>
    )
  const {
    width: w,
    height: h,
    collar: [left, right, front],
  } = template
  const geometry = fitGarment(headAsset?.anatomy, template)
  const { x, y, scale, cx, chin, eye } = geometry
  const onlyGarment = view === 'garment'
  const viewBox = onlyGarment
    ? [-w * 0.055, -h * 0.04, w * 1.11, h * 1.08]
    : portraitCamera(
        headAsset?.anatomy,
        template,
        view === 'outfit' ? 'outfit' : showShoulders ? 'portrait' : 'face',
      )
  const transform = onlyGarment ? undefined : `translate(${x} ${y}) scale(${scale})`
  // Front rim leaves a genuine neck aperture; the back collar remains behind the head.
  const center = (left + right) / 2
  const rim = `M0 0 H${left} Q${left} ${front * 0.88} ${center} ${front} Q${right} ${front * 0.88} ${right} 0 H${w} V${h} H0 Z`
  const badgeX = ({ left: 0.65, right: 0.35, center: 0.5, none: 0 }[pattern.badge] - 0.085) * w
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
      data-employer={org || ''}
      data-category={org ? group : 'neutral'}
    >
      <defs>
        <filter id={id + 'skintone'} colorInterpolationFilters="sRGB">
          <feComponentTransfer>
            {(['feFuncR', 'feFuncG', 'feFuncB'] as const).map((Channel, i) => {
              const swatch = parseInt(skin.slice(1 + i * 2, 3 + i * 2), 16) / 255
              return (
                <Channel
                  key={Channel}
                  type="table"
                  tableValues={[
                    0,
                    swatch * 0.47,
                    swatch * 0.89,
                    swatch + (1 - swatch) * 0.17,
                    swatch + (1 - swatch) * 0.53,
                  ].join(' ')}
                />
              )
            })}
          </feComponentTransfer>
        </filter>
        <clipPath id={id + 'front'}>
          <path d={rim} />
        </clipPath>
        <clipPath id={id + 'neck'}>
          <path
            d={`M-50 -20H300V${chin - eye * 0.18}H${cx + eye * 1.04}Q${cx + eye * 0.72} ${chin + eye * 0.2} ${cx + eye * 0.74} ${chin + eye * 0.65}V280H${cx - eye * 0.74}V${chin + eye * 0.65}Q${cx - eye * 0.72} ${chin + eye * 0.2} ${cx - eye * 1.04} ${chin - eye * 0.18}H-50Z`}
          />
        </clipPath>
        {headAsset?.anatomy?.hair && (
          <clipPath id={id + 'hair'}>
            <path d={headAsset.anatomy.hair} />
          </clipPath>
        )}
      </defs>
      {!onlyGarment && arms && (
        <image
          data-layer="forearms"
          transform={transform}
          href={arms}
          x="-14"
          y="0"
          width="651"
          height="750"
          filter={'url(#' + id + 'skintone)'}
        />
      )}
      {!onlyGarment && material && <image transform={transform} href={material} width={w} height={h} />}
      {!onlyGarment &&
        (head ? (
          <image
            data-layer="appearance"
            clipPath={'url(#' + id + 'neck)'}
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
            y={h * 0.215}
            width={w * 0.17}
            height={h * 0.091}
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
                  y={h * 0.325}
                  width={w * 0.56 * r.mount.scale}
                  height={h * 0.105}
                  preserveAspectRatio="xMidYMid meet"
                />
              ),
          )}
      </g>
      {!onlyGarment && head && headAsset?.anatomy?.hair && (
        <image clipPath={'url(#' + id + 'hair)'} href={head} width="240" height="280" />
      )}
    </svg>
  )
}
