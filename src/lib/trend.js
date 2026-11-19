// Linear-regression helper used by the indicator chart.

const DAYS_BEFORE_MONTH = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]

function dayOfYear (date) {
  const month = date.getMonth()
  const day = date.getDate()
  let doy = DAYS_BEFORE_MONTH[month] + day
  if (month > 1 && isLeapYear(date)) doy++
  return doy
}

function isLeapYear (date) {
  const year = date.getFullYear()
  return !(year & 3) && (year % 100 !== 0 || year % 400 === 0)
}

function mean (values) {
  let sum = 0
  for (const value of values) if (value) sum += Number(value)
  return sum / values.length
}

/** Ordinary least squares on (x, y) arrays. */
export function linearRegression (x, y) {
  const n = x.length
  if (n <= 1) return null
  const xMean = mean(x)
  const yMean = mean(y)
  let sumXX = 0
  let sumYY = 0
  let sumXY = 0
  for (let i = 0; i < n; i++) {
    sumXX += Math.pow(x[i] - xMean, 2)
    sumYY += Math.pow(y[i] - yMean, 2)
    sumXY += (x[i] - xMean) * (y[i] - yMean)
  }
  const slope = sumXY / sumXX
  const intercept = yMean - slope * xMean
  const predictedY = x.map((value) => intercept + slope * value)
  const r = sumXY / Math.sqrt(sumXX * sumYY)
  return { slope, intercept, predictedY, r, simData: predictedY }
}

/** Build the chart "trend" payload (years as fractional x axis). */
export function buildTrend (data) {
  const x = []
  const y = []
  for (const point of data) {
    const date = new Date(point[0])
    const year = date.getFullYear()
    const doy = dayOfYear(date)
    x.push(parseInt(year, 10) + parseFloat((doy / 365).toFixed(2)))
    y.push(Number(point[1]))
  }
  const fit = linearRegression(x, y)
  if (!fit) return null
  return {
    r: parseFloat(fit.r).toFixed(2),
    simData: data.map((point, index) => [point[0], parseFloat(fit.simData[index].toFixed(2))]),
  }
}
