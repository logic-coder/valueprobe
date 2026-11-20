const path = import.meta.env.BASE_URL + 'data/catalog.json'
let pending

export function getCatalog () {
  pending ||= fetch(path)
    .then(response => response.ok ? response.json() : null)
    .then(rows => Array.isArray(rows) && rows.length ? rows : null)
    .catch(() => null)
    .then(rows => {
      if (!rows) pending = null
      return rows
    })
  return pending
}
