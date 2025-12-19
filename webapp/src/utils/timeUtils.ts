/**
 * Time and timestamp utilities for Amy's Echo
 * Provides consistent time handling patterns to reduce duplication
 * 
 * Amy First: Centralized time utilities ensure consistent behavior
 * across all components that track timing and history.
 */

/**
 * Get current timestamp in milliseconds
 */
export function getCurrentTimestamp(): number {
  return Date.now();
}

/**
 * Get current timestamp as base-36 string (compact format)
 * Used for generating unique IDs
 */
export function getTimestampId(): string {
  return Date.now().toString(36);
}

/**
 * Calculate time difference in milliseconds
 */
export function getTimeDiff(timestamp: number, now: number = Date.now()): number {
  return now - timestamp;
}

/**
 * Check if a timestamp is within a time window (in milliseconds)
 */
export function isWithinTimeWindow(
  timestamp: number,
  windowMs: number,
  now: number = Date.now()
): boolean {
  return now - timestamp <= windowMs;
}

/**
 * Filter items by timestamp within a time window
 */
export function filterByTimeWindow<T extends { timestamp: number }>(
  items: T[],
  windowMs: number,
  now: number = Date.now()
): T[] {
  const cutoff = now - windowMs;
  return items.filter(item => item.timestamp > cutoff);
}

/**
 * Filter items by timestamp after a cutoff
 */
export function filterAfterTimestamp<T extends { timestamp: number }>(
  items: T[],
  cutoffTimestamp: number
): T[] {
  return items.filter(item => item.timestamp >= cutoffTimestamp);
}

/**
 * Common time constants (in milliseconds)
 */
export const TIME_CONSTANTS = {
  SECOND: 1000,
  MINUTE: 60 * 1000,
  HOUR: 60 * 60 * 1000,
  DAY: 24 * 60 * 60 * 1000,
  WEEK: 7 * 24 * 60 * 60 * 1000,
} as const;

/**
 * Calculate cutoff timestamp for a given number of days
 */
export function getDaysCutoff(days: number, now: number = Date.now()): number {
  return now - (days * TIME_CONSTANTS.DAY);
}

/**
 * Calculate cutoff timestamp for a given number of hours
 */
export function getHoursCutoff(hours: number, now: number = Date.now()): number {
  return now - (hours * TIME_CONSTANTS.HOUR);
}

/**
 * Calculate cutoff timestamp for a given number of minutes
 */
export function getMinutesCutoff(minutes: number, now: number = Date.now()): number {
  return now - (minutes * TIME_CONSTANTS.MINUTE);
}

/**
 * Format a timestamp as ISO string
 */
export function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toISOString();
}

/**
 * Get uptime in seconds from start timestamp
 */
export function getUptimeSeconds(startTime: number, now: number = Date.now()): number {
  return (now - startTime) / 1000;
}
