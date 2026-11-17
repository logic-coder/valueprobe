// Markdown export of one valuation. Everything here is read from the same
// display values the page already shows; the kernel is not consulted twice and
// nothing is written back.
const CSV_HEAD = ['discount\\growth']

const round = (value, digits = 2) => {
  const number = Number(value)
  return Number.isFinite(number) ? number.toFixed(digits) : 'n/a'
}

const signed = (value, digits = 1) => {
  const number = Number(value)
  if (!Number.isFinite(number)) return 'n/a'
  const text = number.toFixed(digits) + '%'
  return number > 0 ? '+' + text : text
}

export function reportFilename(symbol, at = new Date()) {
  const stamp = at.toISOString().slice(0, 16).replace(/[:T]/g, '-')
  return 'valuation-' + String(symbol).replace(':', '-') + '-' + stamp + '.md'
}

export function buildReport(input) {
  const { symbol, company, currency, price, basis, form = {}, result = {}, grid, peers = [], meta = {}, at = new Date() } = input
  const unit = currency || '¥'
  const fcf = basis === 'freecashflow' || basis === 'fcf'
  const base = fcf ? form.freecashflow : form.eps
  const growth = fcf ? form.freecashflowGrowthRate : form.growthRate
  const lines = [
    '# ' + (company || symbol) + ' (' + symbol + ')',
    '',
    '- 生成时间：' + at.toISOString().replace('T', ' ').slice(0, 19) + ' UTC',
    '- 现价：' + unit + ' ' + round(price),
    '- 基数：' + (fcf ? '自由现金流/股' : '每股收益') + ' ' + unit + ' ' + round(base),
    '',
    '## 假设',
    '',
    '| 项 | 值 |',
    '|---|---|',
    '| 折现率 | ' + round(form.discountRate) + '% |',
    '| 快速成长年数 | ' + (Number.isFinite(Number(form.years)) ? Math.round(form.years) : 'n/a') + ' |',
    '| 快速成长率 | ' + round(growth) + '% |',
    '| 第二阶段年数 | ' + (Number.isFinite(Number(form.yearsOfTerminalGrowth)) ? Math.round(form.yearsOfTerminalGrowth) : 'n/a') + ' |',
    '| 第二阶段增长率 | ' + round(form.terminalGrowthRate) + '% |',
    '| 每股有形账面价值 | ' + unit + ' ' + round(result.tbv) + (result.addToFairValue ? '（并入内在价值）' : '') + ' |',
    '',
    '## 结果（内核原值）',
    '',
    '| 项 | 值 |',
    '|---|---|',
    '| 内在价值 | ' + unit + ' ' + round(result.fairValue) + ' |',
    '| 成长价值 | ' + unit + ' ' + round(result.growthValue) + ' |',
    '| 第二阶段价值 | ' + unit + ' ' + round(result.terminalValue) + ' |',
    '| 安全边际 | ' + signed(result.marginOfSafety) + ' |',
    '| 反 DCF 隐含增长率 | ' + signed(result.reverseGrowthRate) + ' |',
  ]

  if (grid && Array.isArray(grid.rows) && grid.rows.length) {
    lines.push('', '## 敏感度（折现率 × 增长率）', '')
    lines.push('| ' + CSV_HEAD[0].replace('\\', '\\') + ' | ' + grid.growths.map((value) => round(value, 1) + '%').join(' | ') + ' |')
    lines.push('|---' + '|---'.repeat(grid.growths.length) + '|')
    grid.rows.forEach((row, index) => {
      lines.push('| ' + round(grid.discounts[index], 1) + '% | ' + row.map((value) => round(value)).join(' | ') + ' |')
    })
  }

  if (peers.length) {
    lines.push('', '## 同行（中位隐含价只做旁证）', '')
    lines.push('| 公司 | 价格 | P/E | P/BV |', '|---|---|---|---|')
    for (const peer of peers) {
      lines.push('| ' + (peer.name || peer.symbol) + ' | ' + (peer.price === null ? 'n/a' : unit + ' ' + round(peer.price)) + ' | '
        + (peer.pe === null ? 'n/a' : round(peer.pe, 1) + '×') + ' | ' + (peer.pb === null ? 'n/a' : round(peer.pb, 2) + '×') + ' |')
    }
    if (Number.isFinite(Number(peers.medianPe))) {
      lines.push('', '同行中位 P/E ' + round(peers.medianPe, 1) + '×，隐含 ' + unit + ' ' + round(peers.implied) + '。')
    }
  }

  const provenance = [meta.source && '来源：' + meta.source, meta.asOf && '数据截至 ' + meta.asOf].filter(Boolean)
  if (provenance.length) lines.push('', '## 数据', '', provenance.join('；'))
  lines.push('', '> 内核 = 参考页公式逐行移植；本文件由页面导出，仅作记录，不构成投资建议。', '')
  return lines.join('\n')
}
