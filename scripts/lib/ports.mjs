// Every port the dev server, the preview server and the browser tooling bind, in
// one place. Windows can reserve a whole TCP range for Hyper-V/WSL and `listen`
// then fails with EACCES before the dev server or a single test starts, so each
// port also has an env override a host can move out of the way.
export const DEV_PORT = Number(process.env.PW_PORT) || 5173
export const PREVIEW_PORT = Number(process.env.PW_PREVIEW_PORT) || 4173
// The contrast audit starts its own preview so it never fights a running one.
export const CONTRAST_PORT = Number(process.env.PW_CONTRAST_PORT) || PREVIEW_PORT + 1
