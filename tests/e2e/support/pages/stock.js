// Page object for the stock workspace. Prefer these testids over CSS classes in new specs.
export const STOCK = Object.freeze({
  calculator: '[data-testid="dcf"]',
  result: '[data-testid="dcf-result"]',
  fairValue: '[data-testid="dcf-fair-value"]',
  margin: '[data-testid="dcf-margin-of-safety"]',
  discount: '[data-testid="field-discount"]',
  growth: '[data-testid="field-growth"]',
  growthYears: '[data-testid="field-growth-years"]',
  peers: '[data-testid="peers"]',
  banner: '[data-testid="data-banner"]',
  chart: '[data-testid="chart-panel"]',
})

export function stockPage (page) {
  return {
    ...Object.fromEntries(Object.entries(STOCK).map(([key, selector]) => [key, page.locator(selector)])),
    async open (symbol = 'SHSE:601398', tab = 'dcf') {
      await page.goto('/#/stock/' + symbol + '/' + tab)
    },
  }
}
