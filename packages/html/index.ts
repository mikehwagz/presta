import merge from 'deepmerge'

type GenericObject = { [key: string]: any }

export type HeadElementWithChildren<T> = {
  children?: string
} & T

export type Meta = Partial<Omit<HTMLMetaElement, 'children'>> | string
export type Link = Partial<Omit<HTMLLinkElement, 'children'>> | string
export type Style = Partial<HeadElementWithChildren<Omit<HTMLStyleElement, 'children'>>> | string
export type Script = Partial<HeadElementWithChildren<Omit<HTMLScriptElement, 'children'>>> | string
export type HeadElement = Meta | Link | Style | Script

type Social = {
  title?: string
  description?: string
  image?: string
  url?: string
  [key: string]: string | undefined
}

export type PrestaHead = {
  title: string
  description: string
  image: string
  url: string
  og: Social
  twitter: Social
  meta: Meta[]
  link: Link[]
  script: Script[]
  style: Style[]
}

const defaults: PrestaHead = {
  title: 'Presta',
  description: '',
  image: '',
  url: '',
  og: {},
  twitter: {},
  meta: [
    // @ts-ignore
    { charset: 'UTF-8' },
    { name: 'viewport', content: 'width=device-width,initial-scale=1' },
  ],
  link: [],
  script: [],
  style: [],
}

export function pruneEmpty(obj: GenericObject) {
  let res: GenericObject = {}

  for (const k of Object.keys(obj)) {
    if (!!obj[k]) res[k] = obj[k]
  }

  return res
}

export function filterUnique(arr: HeadElement[]) {
  let res: HeadElement[] = []

  outer: for (const a of arr.reverse()) {
    for (const r of res) {
      if (typeof a === 'string' || typeof r === 'string') {
        if (a === r) continue outer
      } else {
        // @ts-ignore
        if (a.name && a.name === r.name) continue outer
        // @ts-ignore
        if (a.src && a.src === r.src) continue outer
        // @ts-ignore
        if (a.href && a.href === r.href) continue outer
      }
    }

    res.push(a)
  }

  return res.reverse()
}

export function tag(name: string) {
  return (props: HeadElement) => {
    if (typeof props === 'string') return props

    const attr = Object.keys(props)
      .filter((p) => p !== 'children')
      // @ts-ignore
      .map((p) => `${p}="${props[p]}"`)
      .join(' ')

    const attributes = attr ? ' ' + attr : ''

    if (/script|style/.test(name)) {
      // @ts-ignore
      return `<${name}${attributes}>${props.children || ''}</${name}>`
    } else {
      return `<${name}${attributes} />`
    }
  }
}

export function prefixToObjects(prefix: string, props: Social): HeadElementWithChildren<Partial<HTMLMetaElement>>[] {
  return Object.keys(props).map((p) => ({
    [prefix === 'og' ? 'property' : 'name']: `${prefix}:${p}`,
    content: props[p],
  }))
}

export function createHeadTags(config: Partial<PrestaHead> = {}) {
  const { title, description, image, url, ...o } = merge(defaults, config)

  const meta = o.meta ? filterUnique(o.meta) : []
  const link = o.link ? filterUnique(o.link) : []
  const script = o.script ? filterUnique(o.script) : []
  const style = o.style ? filterUnique(o.style) : []
  const og = pruneEmpty({
    title,
    description,
    url,
    image,
    ...(o.og || {}),
  })
  const twitter = pruneEmpty({
    title,
    description,
    url,
    image,
    ...(o.twitter || {}),
  })

  const tags = [
    meta.concat(description ? { name: 'description', content: description } : []).map(tag('meta')),
    prefixToObjects('og', og).map(tag('meta')),
    prefixToObjects('twitter', twitter).map(tag('meta')),
    link.map(tag('link')),
    script.map(tag('script')),
    style.map(tag('style')),
  ].flat(2)

  return `<title>${title}</title>${tags.join('')}`
}

export function createFootTags(config: Partial<Pick<PrestaHead, 'script' | 'style'>> = {}) {
  const o = merge({ script: [], style: [] }, config)
  const script = filterUnique(o.script)
  const style = filterUnique(o.style)

  const tags = [script.map(tag('script')), style.map(tag('style'))].flat()

  return tags.join('')
}

export function html({
  body = '',
  head = {},
  foot = {},
  htmlAttributes = {},
  bodyAttributes = {},
}: {
  body?: string
  head?: Partial<PrestaHead>
  foot?: Partial<Pick<PrestaHead, 'script' | 'style'>>
  htmlAttributes?: Partial<{ [key in keyof HTMLHtmlElement]: string }>
  bodyAttributes?: Partial<HTMLBodyElement>
}) {
  // insert favicon during dev, if not otherwise specified
  if (head.link && !head.link.find((m) => (typeof m === 'object' ? m.rel === 'icon' : /rel="icon/.test(m)))) {
    head.link.push({
      rel: 'icon',
      type: 'image/svg',
      href: `data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZpZXdCb3g9IjAgMCAzMiAzMiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KICA8c3R5bGU+CiAgICAjZmF2aWNvbiB7CiAgICAgIGZpbGw6ICMyMzI4M0Q7CiAgICB9CgogICAgQG1lZGlhIChwcmVmZXJzLWNvbG9yLXNjaGVtZTogZGFyaykgewogICAgICAjZmF2aWNvbiB7CiAgICAgICAgZmlsbDogI0RBREVGMDsKICAgICAgfQogICAgfQogIDwvc3R5bGU+CgogIDxnIGNsaXAtcGF0aD0idXJsKCNhKSI+CiAgICA8cGF0aCBpZD0iZmF2aWNvbiIgZmlsbC1ydWxlPSJldmVub2RkIiBjbGlwLXJ1bGU9ImV2ZW5vZGQiIGQ9Ik0xMC40IDdjLS4zIDAtLjguMi0xIC41TDEuMSAyMi4xYy0uMi4zIDAgLjYuMy42bDQgLjMtMi4xIDIuNmMtLjIuMy0uMS42LjIuNmwxNi44IDEuM2MuNCAwIC44LS4yIDEtLjRMMzIgMTMuOWMuMi0uMi4xLS41LS4yLS41bC02LjQtLjUgMi4yLTRjLjItLjMgMC0uNS0uMy0uNkwxMC40IDdaTTI0IDEyLjhsMS45LTMuNC0xNS41LTEuMi03LjcgMTMuNCAzLjYuMyA3LjUtOS40Yy4zLS4zLjctLjUgMS0uNGw5LjIuN1pNNy42IDIybDcuMS04LjkgOC43LjctNS4yIDlMNy42IDIyWm0tMSAxLjEgMTEuNiAxYy4zIDAgLjgtLjMgMS0uNmw1LjUtOS42IDUuNS41LTkuNyAxMkw1IDI1LjJsMS43LTJaIiBmaWxsPSIjMjMyODNEIi8+CiAgPC9nPgogIDxkZWZzPgogICAgPGNsaXBQYXRoIGlkPSJhIj4KICAgICAgPHBhdGggZmlsbD0iI2ZmZiIgZD0iTTAgMGgzMnYzMkgweiIvPgogICAgPC9jbGlwUGF0aD4KICA8L2RlZnM+Cjwvc3ZnPgo=`,
    })
  }

  // insert default charset and viewport, if not otherwise specified
  if (head.meta) {
    // @ts-ignore TODO wtf
    if (!head.meta.find((m) => !!m.charset)) {
      // @ts-ignore
      head.meta.push({ charset: 'UTF-8' })
    }
    if (!head.meta.find((m) => (typeof m === 'object' ? m.name === 'viewport' : /name="viewport/.test(m)))) {
      head.meta.push({
        name: 'viewport',
        content: 'width=device-width,initial-scale=1',
      })
    }
  }

  const headTags = createHeadTags(head)
  const footTags = createFootTags(foot)
  const htmlAttr = Object.keys(htmlAttributes).reduce((attr, key) => {
    return (attr += ` ${key}="${htmlAttributes[key as keyof HTMLHtmlElement]}"`)
  }, '')
  const bodyAttr = Object.keys(bodyAttributes).reduce((attr, key) => {
    return (attr += ` ${key}="${bodyAttributes[key as keyof HTMLBodyElement]}"`)
  }, '')

  return `<!-- built with presta https://npm.im/presta --><!DOCTYPE html><html${htmlAttr}><head>${headTags}</head><body${bodyAttr}>${body}${footTags}</body></html>`
}
