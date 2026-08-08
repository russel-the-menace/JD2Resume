// tests/subscription.test.ts
import { isAiChineseUnlocked } from '../miniprogram/utils/subscription';

describe('Membership Status Logic (Frontend)', () => {
  const NOW = 1707300000000; // Fixed timestamp for consistency

  test('should return false for null user or membership', () => {
    expect(isAiChineseUnlocked(null, NOW)).toBe(false);
    expect(isAiChineseUnlocked({}, NOW)).toBe(false);
    expect(isAiChineseUnlocked({ membership: null }, NOW)).toBe(false);
  });

  test('should return false for non-positive level', () => {
    // Level 0 (Free)
    expect(isAiChineseUnlocked({
      membership: { level: 0, expire_at: NOW + 10000 }
    }, NOW)).toBe(false);

    // Negative (Invalid)
    expect(isAiChineseUnlocked({
      membership: { level: -1, expire_at: NOW + 10000 }
    }, NOW)).toBe(false);
  });

  test('should return false for valid level but expired date', () => {
    // Expired 1ms ago
    expect(isAiChineseUnlocked({
      membership: { level: 3, expire_at: NOW - 1 }
    }, NOW)).toBe(false);

    // Expired 1 day ago
    expect(isAiChineseUnlocked({
      membership: { level: 3, expire_at: NOW - 86400000 }
    }, NOW)).toBe(false);
  });

  test('should return true for valid level and future date', () => {
    // Expires 1ms in future
    expect(isAiChineseUnlocked({
      membership: { level: 3, expire_at: NOW + 1 }
    }, NOW)).toBe(true);

    // Expires 30 days in future
    expect(isAiChineseUnlocked({
      membership: { level: 3, expire_at: NOW + 86400000 * 30 }
    }, NOW)).toBe(true);
  });

  test('should handle ISO Date strings correctly', () => {
    const futureDate = new Date(NOW + 100000).toISOString();
    expect(isAiChineseUnlocked({
      membership: { level: 3, expire_at: futureDate }
    }, NOW)).toBe(true);

    const pastDate = new Date(NOW - 100000).toISOString();
    expect(isAiChineseUnlocked({
      membership: { level: 3, expire_at: pastDate }
    }, NOW)).toBe(false);
  });

  test('should return false if expire_at is missing or invalid', () => {
    expect(isAiChineseUnlocked({ membership: { level: 3 } }, NOW)).toBe(false);
    expect(isAiChineseUnlocked({ membership: { level: 3, expire_at: 'invalid' } }, NOW)).toBe(false);
    expect(isAiChineseUnlocked({ membership: { level: 3, expire_at: 0 } }, NOW)).toBe(false);
  });
});
