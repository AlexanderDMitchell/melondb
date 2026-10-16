import { Model } from '@nozbe/watermelondb'

/**
 * Strip circular WatermelonDB model references so rows can be logged or
 * JSON.stringified during debugging.
 */
export const sanitizeCircular = (
  obj: unknown,
  seen = new WeakSet<object>()
): unknown => {
  if (obj === null || obj === undefined) {
    return obj
  }

  if (typeof obj !== 'object') {
    return obj
  }

  if (seen.has(obj as object)) {
    return '[Circular Reference]'
  }

  if (obj instanceof Model) {
    seen.add(obj)
    const plain: Record<string, unknown> = {}

    for (const key in obj) {
      if (key !== '_raw' && key !== 'collection' && key !== 'database') {
        try {
          const value = (obj as unknown as Record<string, unknown>)[key]
          if (typeof value !== 'function') {
            plain[key] = sanitizeCircular(value, seen)
          }
        } catch {
          // Skip properties that throw on access
        }
      }
    }

    if ('_raw' in obj && typeof (obj as { _raw?: unknown })._raw === 'object') {
      const raw = (obj as { _raw: Record<string, unknown> })._raw
      for (const key in raw) {
        if (key !== '_status' && key !== '_changed' && key !== 'id') {
          plain[key] = sanitizeCircular(raw[key], seen)
        }
      }
    }

    plain._modelType = obj.constructor.name
    if ('id' in obj) {
      plain.id = (obj as { id?: unknown }).id
    }
    return plain
  }

  if (Array.isArray(obj)) {
    seen.add(obj)
    return obj.map((item) => sanitizeCircular(item, seen))
  }

  seen.add(obj as object)
  const sanitized: Record<string, unknown> = {}
  for (const key in obj as Record<string, unknown>) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      try {
        sanitized[key] = sanitizeCircular(
          (obj as Record<string, unknown>)[key],
          seen
        )
      } catch {
        sanitized[key] = '[Error accessing property]'
      }
    }
  }
  return sanitized
}
