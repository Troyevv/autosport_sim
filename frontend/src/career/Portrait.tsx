import { useId } from 'react'
import { assetUrl, type Asset, type Person } from './api'
import stock from './garmentContours.json'
import { shoulderFrame, useFittedFabric } from './portraitAnatomy'

export function Portrait({
  person,
  org,
  color,
  driver,
  media,
  showShoulders = false,
}: {
  person: Pick<Person, 'name' | 'origin' | 'face'>
  org: string | null
  color: string
  driver: boolean
  media: Asset[]
  showShoulders?: boolean
}) {
  const id = useId().replace(/:/g, '')
  const kind = 'generated-head'
  const asset = media.find((a) => a.entity === person.face && a.kind === kind)
  const role = !org ? 'neutral' : driver ? 'driver' : org.startsWith('supplier-') ? 'manufacturer' : 'staff'
  const teamKit = org && media.find((a) => a.kind === 'uniform' && a.entity === role + '-' + org)
  const teamStudio = org && media.find((a) => a.kind === 'uniform' && a.entity === 'studio-' + role + '-' + org)
  const garment = teamStudio || media.find((a) => a.kind === 'uniform' && a.entity === 'studio-' + role)
  const textile =
    assetUrl(media, 'uniform', garment?.entity ?? null) || '/assets/studio-wardrobe/' + role + '.webp'
  const fabric = useFittedFabric(asset?.sha256, garment?.garment ?? stock[role], textile, asset?.anatomy)
  // Keep a fully dressed placeholder while the photographed fabric is being decoded.
  const frame = fabric ? asset?.anatomy : undefined
  const head = !asset?.anatomy || frame ? assetUrl(media, kind, person.face) : undefined
  const surface = frame && shoulderFrame(frame)
  const camera = showShoulders ? surface : frame?.camera
  const fallback = assetUrl(media, 'uniform', teamKit ? teamKit.entity : role) || '/assets/wardrobe/' + role + '.webp'
  const badge = assetUrl(media, 'logo', org)
  const sponsors = assetUrl(media, 'sponsor-strip', org)
  const rgb = (org ? color : '#85878a')
    .slice(1)
    .match(/../g)!
    .map((v) => parseInt(v, 16) / 255)
  const chestX = frame ? frame.body[0][21] - 3 : 151
  const chestY = frame ? frame.body[1][21] + 18 : 235
  const width = frame ? 20 : 35
  return (
    <svg
      className="career-portrait"
      viewBox={camera?.join(' ') || '0 0 256 320'}
      role="img"
      aria-label={person.name + (head ? '' : ' · силуэт')}
    >
      <defs>
        <clipPath id={id + '-front'}>
          <path d="M0 206 Q52 207 89 188 Q127 212 167 188 Q205 207 256 206 V320 H0Z" />
        </clipPath>
        <filter id={id + '-fabric'} colorInterpolationFilters="sRGB">
          <feComponentTransfer>
            {rgb.map((v, i) => {
              const Channel = (['feFuncR', 'feFuncG', 'feFuncB'] as const)[i]
              return (
                <Channel
                  key={i}
                  type="table"
                  tableValues={[0, v * 0.59, v, v + (1 - v) * 0.32, v + (1 - v) * 0.72].join(' ')}
                />
              )
            })}
          </feComponentTransfer>
        </filter>
        <linearGradient id={id + '-skin'} x2="1" y2=".6">
          <stop stopColor="#9298a2" />
          <stop offset="1" stopColor="#454a55" />
        </linearGradient>
      </defs>
      {!frame && <image href={fallback} width="256" height="320" filter={teamKit ? undefined : 'url(#' + id + '-fabric)'} />}
      {head ? (
        <image data-layer="appearance" href={head} width={frame ? 240 : 256} height={frame ? 280 : 320} />
      ) : (
        <path
          fill={'url(#' + id + '-skin)'}
          d="M99 215L103 165Q86 153 83 133Q73 131 75 116L80 115Q74 51 118 45Q172 37 177 92L175 115Q184 111 181 130Q180 137 173 138Q170 157 154 167L158 215Z"
        />
      )}
      {surface && fabric ? (
        <image
          data-layer="fitted-fabric"
          href={fabric}
          x={surface[0]}
          y={surface[1]}
          width={surface[2]}
          height={surface[3]}
          preserveAspectRatio="none"
          filter={teamStudio ? undefined : 'url(#' + id + '-fabric)'}
        />
      ) : (
        !frame && (
          <image
            data-layer="kit"
            clipPath={'url(#' + id + '-front)'}
            href={fallback}
            width="256"
            height="320"
            filter={teamKit ? undefined : 'url(#' + id + '-fabric)'}
          />
        )
      )}
      {badge && <image href={badge} x={chestX} y={chestY} width={width} height={width * 0.68} />}
      {sponsors && (
        <image
          href={sponsors}
          x={frame ? 90 : 77}
          y={frame ? chestY + 35 : 276}
          width={frame ? 65 : 100}
          height="22"
        />
      )}
    </svg>
  )
}
