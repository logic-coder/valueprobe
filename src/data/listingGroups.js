// Dual-listed pairs of the same business. The official build reports how far
// the two market-specific values and their inputs diverge; it never averages
// them and never lets the report change a published value.
export const LISTING_GROUPS = Object.freeze([
  Object.freeze({ id: 'ICBC', name: '工商银行 / ICBC', a: 'SHSE:601398', h: 'HKSE:01398' }),
  Object.freeze({ id: 'PING_AN', name: '中国平安 / Ping An', a: 'SHSE:601318', h: 'HKSE:02318' }),
  Object.freeze({ id: 'BYD', name: '比亚迪 / BYD', a: 'SZSE:002594', h: 'HKSE:01211' }),
  Object.freeze({ id: 'CCB', name: '建设银行 / CCB', a: 'SHSE:601939', h: 'HKSE:00939' }),
  Object.freeze({ id: 'CHINA_LIFE', name: '中国人寿 / China Life', a: 'SHSE:601628', h: 'HKSE:02628' }),
  Object.freeze({ id: 'CPIC', name: '中国太保 / CPIC', a: 'SHSE:601601', h: 'HKSE:02601' }),
  Object.freeze({ id: 'ABC', name: '农业银行 / ABC', a: 'SHSE:601288', h: 'HKSE:01288' }),
  Object.freeze({ id: 'BOC', name: '中国银行 / BOC', a: 'SHSE:601988', h: 'HKSE:03988' }),
  Object.freeze({ id: 'BOCOM', name: '交通银行 / BoCom', a: 'SHSE:601328', h: 'HKSE:03328' }),
])
