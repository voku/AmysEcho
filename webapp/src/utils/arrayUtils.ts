/**
 * Array utilities for Amy's Echo
 * Provides common array filtering and calculation patterns
 * 
 * Amy First: Consistent array operations reduce bugs and
 * ensure reliable data processing across the application.
 */

/**
 * Calculate success rate from items with success property
 */
export function calculateSuccessRate<T extends { success: boolean }>(
  items: T[]
): number {
  if (items.length === 0) return 0;
  const successCount = items.filter(item => item.success).length;
  return successCount / items.length;
}

/**
 * Filter items by a property value
 */
export function filterByProperty<T, K extends keyof T>(
  items: T[],
  property: K,
  value: T[K]
): T[] {
  return items.filter(item => item[property] === value);
}

/**
 * Group items by a property value
 */
export function groupByProperty<T, K extends keyof T>(
  items: T[],
  property: K
): Map<T[K], T[]> {
  const groups = new Map<T[K], T[]>();
  
  for (const item of items) {
    const key = item[property];
    const existing = groups.get(key);
    if (existing) {
      existing.push(item);
    } else {
      groups.set(key, [item]);
    }
  }
  
  return groups;
}

/**
 * Count items by a property value
 */
export function countByProperty<T, K extends keyof T>(
  items: T[],
  property: K,
  value: T[K]
): number {
  return items.filter(item => item[property] === value).length;
}

/**
 * Get the most recent item by timestamp
 */
export function getMostRecent<T extends { timestamp: number }>(
  items: T[]
): T | undefined {
  if (items.length === 0) return undefined;
  return items.reduce((latest, current) => 
    current.timestamp > latest.timestamp ? current : latest
  );
}

/**
 * Get items sorted by timestamp (newest first)
 */
export function sortByTimestampDesc<T extends { timestamp: number }>(
  items: T[]
): T[] {
  return [...items].sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * Get items sorted by timestamp (oldest first)
 */
export function sortByTimestampAsc<T extends { timestamp: number }>(
  items: T[]
): T[] {
  return [...items].sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Calculate average of numeric values
 */
export function calculateAverage(values: number[]): number {
  if (values.length === 0) return 0;
  const sum = values.reduce((acc, val) => acc + val, 0);
  return sum / values.length;
}

/**
 * Get unique values from array
 */
export function getUniqueValues<T>(items: T[]): T[] {
  return [...new Set(items)];
}

/**
 * Chunk array into smaller arrays of specified size
 */
export function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  if (chunkSize <= 0) return [items];
  
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * Take first N items from array
 */
export function takeFirst<T>(items: T[], count: number): T[] {
  return items.slice(0, Math.max(0, count));
}

/**
 * Take last N items from array
 */
export function takeLast<T>(items: T[], count: number): T[] {
  return items.slice(Math.max(0, items.length - count));
}

/**
 * Remove duplicates by property value
 */
export function uniqueByProperty<T, K extends keyof T>(
  items: T[],
  property: K
): T[] {
  const seen = new Set<T[K]>();
  return items.filter(item => {
    const value = item[property];
    if (seen.has(value)) {
      return false;
    }
    seen.add(value);
    return true;
  });
}
