import path from 'path'
import fs from 'fs'

type Loader = () => Promise<any>

const requests: { [key: string]: ReturnType<Loader> } = {}
const errors: { [key: string]: Error } = {}
export const loadCache = createLoadCache('presta-load-cache')

function writeFileCache(filepath: string, json: object) {
  fs.writeFileSync(filepath, JSON.stringify(json), 'utf-8')
}

function readFileCache(filepath: string) {
  if (!fs.existsSync(filepath)) fs.writeFileSync(filepath, '{}', 'utf-8')
  return JSON.parse(fs.readFileSync(filepath, 'utf8'))
}

export function createLoadCache(name: string, { dir = process.cwd() } = {}) {
  const filename = '.' + name
  const filepath = path.join(dir, filename)

  let cache = readFileCache(filepath)

  return {
    get(key: string) {
      const [value, expiration] = cache[key] || []

      if (expiration !== null && Date.now() > expiration) {
        delete cache[key]
        writeFileCache(filepath, cache)
        return undefined
      } else {
        return value
      }
    },
    set(key: string, value: any, duration?: number) {
      const expiration = duration ? Date.now() + duration : null
      cache[key] = [value, expiration]

      if (expiration) writeFileCache(filepath, cache)
    },
    clear(key: string) {
      delete cache[key]
      writeFileCache(filepath, cache)
    },
    clearAllMemory() {
      for (const key of Object.keys(cache)) {
        const [value, expiration] = cache[key] || []
        if (!expiration) delete cache[key]
      }
    },
    cleanup() {
      cache = {}

      // no persistent cache may have been created
      try {
        fs.unlinkSync(filepath)
      } catch (e) {}
    },
    dump() {
      const res: { [key: string]: any } = {}

      for (const key of Object.keys(cache)) {
        res[key] = cache[key][0]
      }

      return res
    },
  }
}

export function loadError(key: string, e: Error) {
  if (!process.env.TESTING) console.error(e)
  errors[key] = e
  delete requests[key]
}

export function prime(key: string, value: any, duration?: number) {
  loadCache.set(key, value, duration)
}

export async function cache(loader: () => Promise<any>, { key, duration }: { key: string; duration?: number }) {
  let value = loadCache.get(key)

  if (!value) {
    value = await loader()
    loadCache.set(key, value, duration)
  }

  return value
}

export function load(loader: Loader, { key, duration }: { key: string; duration?: number }) {
  let value = loadCache.get(key)

  if (!value && !errors[key]) {
    // try/catch required for sync loaders
    try {
      requests[key] = loader()

      requests[key]
        .then((value: any) => {
          loadCache.set(key, value, duration)
          delete requests[key]
        })
        // catch async errors
        .catch((e: Error) => loadError(key, e))
    } catch (e) {
      loadError(key, e as Error)
    }
  }

  delete errors[key]

  return value
}

export async function flush(
  run: () => any,
  data = {}
): Promise<{
  content: string
  data: { [key: string]: any }
}> {
  const content = run()

  if (Object.keys(requests).length) {
    await Promise.allSettled(Object.values(requests))
    return flush(run, data)
  }

  // TODO clear all cache here

  return { content, data: loadCache.dump() }
}
