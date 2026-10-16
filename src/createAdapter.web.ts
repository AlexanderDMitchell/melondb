import LokiJSAdapter, {
  LokiAdapterOptions,
} from '@nozbe/watermelondb/adapters/lokijs'

/** Web adapter (LokiJS + IndexedDB). Metro/webpack resolve this via `.web.ts`. */
export const createAdapter = (options: LokiAdapterOptions) => {
  return new LokiJSAdapter({
    useWebWorker: false,
    useIncrementalIndexedDB: true,
    ...options,
  })
}
