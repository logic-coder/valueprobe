import axios from 'axios'

// One axios instance and one TTL table for the whole data facade. Transport builds
// the URLs; nothing here may hard-code an upstream prefix.
export const http = axios.create({ timeout: 20000 })

export const TTL = Object.freeze({ stock: 6 * 3600e3, financials: 6 * 3600e3, chart: 6 * 3600e3, indicator: 3600e3 })
