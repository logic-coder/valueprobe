// The header box accepts what people actually type: a bare six-digit A-share code,
// a short Hong Kong number or a US ticker. Only the input boundary guesses — nothing
// downstream sees a partial form.
const A_SHARE = /^\d{6}$/
const HK = /^\d{1,5}$/

export function guessSymbol (raw) {
  const text = String(raw || '').trim()
  if (!text) return ''
  if (text.includes(':')) return text
  if (A_SHARE.test(text)) return (text.startsWith('6') ? 'SHSE:' : 'SZSE:') + text
  if (HK.test(text)) return 'HKSE:' + text.padStart(5, '0')
  return 'NASDAQ:' + text
}
