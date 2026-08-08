/**
 * Convert common date representations into epoch milliseconds.
 * Accepts: Date, ISO string, number (ms or seconds).
 */
export function toDateMs(input: any): number | null {
  if (!input) return null

  if (input instanceof Date) {
    const t = input.getTime()
    return Number.isFinite(t) ? t : null
  }

  if (typeof input === 'number') {
    if (!Number.isFinite(input)) return null
    // heuristic: seconds vs milliseconds
    return input < 1e12 ? input * 1000 : input
  }

  if (typeof input === 'string') {
    const s = input.trim()
    if (!s) return null

    // numeric string
    if (/^\d+$/.test(s)) {
      const n = Number(s)
      if (!Number.isFinite(n)) return null
      return n < 1e12 ? n * 1000 : n
    }

    const ms = Date.parse(s)
    return Number.isFinite(ms) ? ms : null
  }

  return null
}

