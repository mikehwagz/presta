import { Hook } from './types'

type callable = (...args: any[]) => void

export function createEmitter() {
  let events: { [event: string]: callable[] } = {}

  function emit(ev: string, ...args: any[]): void {
    events[ev] ? events[ev].map((fn: callable) => fn(...args)) : []
  }

  function on(ev: string, fn: (...args: any[]) => void) {
    events[ev] = events[ev] ? events[ev].concat(fn) : [fn]
    return () => events[ev].splice(events[ev].indexOf(fn), 1)
  }

  function clear() {
    events = {}
  }

  function listeners(ev: string) {
    return events[ev] || []
  }

  return {
    emit,
    on,
    clear,
    listeners,
  }
}

export function createHook(name: string, emitter: ReturnType<typeof createEmitter>) {
  return function proxy<T>(hook: Hook<T>) {
    return emitter.on(name, hook)
  }
}

export function createAction(name: string, emitter: ReturnType<typeof createEmitter>) {
  return function proxy<T extends unknown[]>(...props: T) {
    emitter.emit(name, props)
  }
}
