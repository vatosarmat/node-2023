/**
 * @param {number} from
 * @param {number} count
 */
const numericRange = (from, count) => {
  return Object.keys(Array(count).fill(0)).map(n => parseInt(n) + from)
}

/**
 * @param {Date} date
 */
const formatDate = date => {
  return `${date.getUTCFullYear()}-${date.getUTCMonth().toString().padStart(2, 0)}-${date
    .getUTCDate()
    .toString()
    .padStart(2, 0)}`
}

/**
 * @param {unknown[]} ar
 */
const uniqueSort = ar => {
  return Array.from(new Set(ar)).sort()
}

const hasValue = (obj, key) => {
  return key in obj && obj[key] !== null && obj[key] !== undefined
}

/**
 * @param {Date} date
 */
const isValidDate = date => {
  return !isNaN(new Date(date))
}

/**
 * @param {unknown} v
 * @param {number} min
 * @param {number} max
 */
const isInteger = (v, min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY) => {
  return Number.isInteger(v) && v >= min && v <= max
}

exports.numericRange = numericRange
exports.formatDate = formatDate
exports.uniqueSort = uniqueSort
exports.hasValue = hasValue
exports.isValidDate = isValidDate
exports.isInteger = isInteger
