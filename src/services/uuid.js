/**
 * UUID generation utility with fallback for browsers that don't support crypto.randomUUID
 */

/**
 * Generates a UUID v4
 * Uses crypto.randomUUID if available, otherwise falls back to a polyfill
 */
export function generateUUID() {
  // Use native implementation if available
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  // Fallback implementation for browsers without crypto.randomUUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}
