import './country.css'

export function CountryFlag({ id, countries }: { id: string; countries: Record<string, string> }) {
  const index = Object.keys(countries).sort().indexOf(id)
  if (index < 0) return null
  return (
    <span
      className="country-flag"
      role="img"
      aria-label={countries[id]}
      style={{
        backgroundPosition: ((index % 16) * 100) / 15 + '% ' + (Math.floor(index / 16) * 100) / 15 + '%',
      }}
    />
  )
}

export function CountryOptions({ countries }: { countries: Record<string, string> }) {
  return (
    <>
      {Object.entries(countries)
        .sort((a, b) => a[1].localeCompare(b[1], 'ru'))
        .map(([id, name]) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
    </>
  )
}
