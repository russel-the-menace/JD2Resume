import { toDateMs } from './time'

/**
 * A user is considered subscribed if expiredDate is in the future.
 * Supports: Date / timestamp(ms or s) / ISO string.
 */
export function isAiChineseUnlocked(user: any, nowMs: number = Date.now()): boolean {
  const membership = user?.membership
  if (!membership || membership.level <= 0) return false
  
  const expired = membership.expire_at
  if (!expired) return false
  
  const ms = toDateMs(expired)
  if (!ms) return false
  return ms > nowMs
}

