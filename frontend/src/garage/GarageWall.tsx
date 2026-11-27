import type { CSSProperties } from 'react'
import { assetUrl, type Organization, type Asset } from '../career/api'
import { identityVars } from '../pitwall/v2/brand'

export function GarageWall({ org, media }: { org: Organization; media: Asset[] }) {
  const logo = assetUrl(media, 'logo', org.logo_asset || org.id)
  return (
    <svg
      className="garage-wall"
      viewBox="0 0 1530 510"
      preserveAspectRatio="xMidYMid slice"
      aria-label={'Оформление гаража · ' + org.name}
      role="img"
      style={identityVars(org) as CSSProperties}
    >
      <g className="garage-wall-dye">
        <path fill="var(--org-brand-primary)" d="M111 64H1417V372H111z" />
        <path fill="var(--org-brand-secondary)" d="M111 251h416l-48 117H111zm1306 0h-416l48 117h368z" />
        <path fill="var(--org-brand-primary)" d="M0 275l78-7v92L0 379zm1456-7 74 7v102l-74-17z" />
      </g>
      <path
        fill="var(--org-brand-secondary)"
        opacity=".76"
        d="M114 273h369l-8 12H114zm1301 0h-369l8 12h361z"
      />
      <path
        fill="var(--org-accent)"
        opacity=".87"
        d="M114 290h357l-3 4H114zm1301 0h-357l3 4h354zM1 295l74-7v3L1 298zm1458-7 70 7v3l-70-7z"
      />
      {logo ? (
        <image
          data-layer="garage-logo"
          href={logo}
          x="572"
          y="76"
          width="386"
          height="145"
          preserveAspectRatio="xMidYMid meet"
        />
      ) : (
        <text
          x="765"
          y="159"
          textAnchor="middle"
          fill="var(--org-ink)"
          fontSize={Math.min(44, 660 / org.name.length)}
          fontFamily="Roboto Condensed, sans-serif"
          fontWeight="700"
        >
          {org.name}
        </text>
      )}
    </svg>
  )
}
