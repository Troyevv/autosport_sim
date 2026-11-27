export const careerUrl = (id: string) => '?career=' + encodeURIComponent(id) + (location.hash === '#development' ? location.hash : '')
