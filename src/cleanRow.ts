export type DirtyRaw = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any
}

/**
 * Build a mapper that strips WatermelonDB meta fields (`_status`, `_changed`)
 * from a model's `_raw` and optionally merges extra fields.
 *
 * Useful when exporting rows to JSON, PDF, or a remote API.
 */
export const cleanRow = (changes: DirtyRaw = {}) => {
  return (row?: DirtyRaw): DirtyRaw | undefined => {
    if (!row) {
      return undefined
    }

    const { _status, _changed, ...rest } = row._raw

    return { ...rest, ...changes }
  }
}
