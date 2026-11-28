export function careerUrl(id:string) {
  const panel = new URLSearchParams(location.search).get('section')
  const target = panel==='development' || location.hash==='#development' ? '#development' : ''
  return '?career='+encodeURIComponent(id)+target
}
