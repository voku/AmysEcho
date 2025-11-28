/**
 * String utility functions for Amy's Echo app
 * Provides consistent string transformations and normalization
 */

/**
 * Mapping of common German characters to ASCII equivalents
 */
const GERMAN_CHAR_MAP: Record<string, string> = {
  ä: 'ae',
  ö: 'oe',
  ü: 'ue',
  Ä: 'Ae',
  Ö: 'Oe',
  Ü: 'Ue',
  ß: 'ss',
};

/**
 * Slugifies a string by converting it to lowercase ASCII-compatible format
 * Designed for German gesture labels to ensure server compatibility
 * 
 * Examples:
 *   "Ärger zeigen" -> "aerger_zeigen"
 *   "Fuß wackeln" -> "fuss_wackeln"
 *   "Hallo Welt!" -> "hallo_welt"
 * 
 * @param text - The text to slugify
 * @returns ASCII-compatible slug with underscores
 */
export function slugify(text: string): string {
  if (!text || typeof text !== 'string') {
    return '';
  }

  // Replace German special characters
  let result = text;
  for (const [char, replacement] of Object.entries(GERMAN_CHAR_MAP)) {
    result = result.replace(new RegExp(char, 'g'), replacement);
  }

  // Convert to lowercase and replace whitespace with underscores
  result = result.toLowerCase().replace(/\s+/g, '_');

  // Remove any remaining non-ASCII-alphanumeric characters except underscore and hyphen
  result = result.replace(/[^a-z0-9_-]/g, '');

  // Remove leading/trailing underscores or hyphens
  result = result.replace(/^[_-]+|[_-]+$/g, '');

  // Collapse multiple consecutive underscores or hyphens into a single underscore
  result = result.replace(/[_-]{2,}/g, '_');

  return result;
}

/**
 * Normalizes a gesture label for use as an ID
 * This is the recommended function for converting user-facing labels to IDs
 * 
 * @param label - The gesture label
 * @returns Normalized ID safe for server use
 */
export function normalizeGestureLabel(label: string): string {
  return slugify(label);
}
