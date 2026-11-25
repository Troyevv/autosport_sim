import { useId } from 'react'
import { assetUrl, type Asset, type Person } from './api'

/** All head and uniform layers share a 256×320 canvas and a neck anchor at (128,191). */
export function Portrait({
  person,
  org,
  color,
  driver,
  media,
}: {
  person: Person
  org: string | null
  color: string
  driver: boolean
  media: Asset[]
}) {
  const uid = useId().replace(/:/g, '')
  const head = assetUrl(media, person.origin === 'generated' ? 'generated-head' : 'head', person.face)
  const uniform = assetUrl(media, 'uniform', driver ? 'driver' : 'staff')
  const logo = assetUrl(media, 'logo', org),
    sponsors = assetUrl(media, 'sponsor-strip', org)
  const body = driver
    ? 'M0 320V274Q3 247 39 228L84 209 99 184H157L172 209 218 229Q252 247 256 274V320Z'
    : 'M0 320V274Q5 245 43 228L93 200 101 185H155L165 201 213 227Q251 244 256 274V320Z'
  return (
    <svg
      className="career-portrait"
      viewBox="0 0 256 320"
      role="img"
      aria-label={person.name + (head ? '' : ' · силуэт')}
    >
      <defs>
        <linearGradient id={uid} x2="1" y2="1" gradientUnits="objectBoundingBox">
          <stop stopColor="#959ca8" />
          <stop offset=".5" stopColor="#575e69" />
          <stop offset="1" stopColor="#363b44" />
        </linearGradient>
      </defs>
      {head ? (
        <>
          <path d={body} fill={org ? color : '#4e525c'} />
          {uniform && (
            <image
              href={uniform}
              width="256"
              height="320"
              style={{ mixBlendMode: 'luminosity', opacity: 0.8 }}
            />
          )}
          <path
            d="M12 255L82 218 69 232 6 271ZM244 255L174 218 188 232 250 271Z"
            fill={org ? color : '#777b82'}
          />
          <image href={head} width="256" height="320" />
          <path
            d={
              driver
                ? 'M94 187Q128 209 162 187L158 202Q128 220 98 201Z'
                : 'M95 187L126 203 111 222 88 202ZM161 187L130 203 145 222 168 202Z'
            }
            fill={org ? color : '#4e525c'}
          />
          <path d="M128 210V320" stroke="#22252b" strokeWidth="2" />
          {logo && <image href={logo} x="151" y="226" width="40" height="24" />}
          {sponsors && <image href={sponsors} x="73" y="266" width="110" height="25" />}
        </>
      ) : (
        <g fill={'url(#' + uid + ')'}>
          <path d={body} />
          <path d="M100 197L102 173Q85 161 83 139Q72 138 75 122L80 119Q73 53 119 48Q173 39 177 98L175 120Q184 116 181 134Q180 141 173 143Q171 161 155 174L158 197Q129 220 100 197Z" />
        </g>
      )}
    </svg>
  )
}
