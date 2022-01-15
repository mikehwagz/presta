import http from 'http'
import { suite } from 'uvu'
import * as assert from 'uvu/assert'
// @ts-ignore
import proxy from 'proxyquire'
import { afix } from 'afix'

import { create } from '../config'
import { createHttpError, getMimeType, loadLambdaFroManifest, processHandler, sendServerlessResponse } from '../serve'
import { Event } from '../lambda'
import { createEmitter, createHooks } from '../createEmitter'
import { Env } from '../constants'

const test = suite('presta - serve')

const event = {
  path: '/',
  headers: {},
} as Event

test('createHttpError', async () => {
  const e = createHttpError(404, 'oops')
  assert.equal(e.statusCode, 404)
  assert.equal(e.message, 'oops')
})

test('getMimeType', async () => {
  const html = getMimeType({
    statusCode: 200,
    headers: { 'content-type': 'text/html' },
  })

  assert.equal(html, 'html')

  const none = getMimeType({
    statusCode: 200,
    headers: {},
  })

  assert.equal(none, 'html')

  const nully = getMimeType({
    statusCode: 200,
    headers: { 'content-type': 'foo/bar' },
  })

  assert.equal(nully, 'html')

  const noHeaders = getMimeType({
    statusCode: 200,
  })

  assert.equal(noHeaders, 'html')
})

test('loadLambdaFroManifest', async () => {
  const fixture = afix({
    lambda: ['lambda.js', `module.exports = { handler: true }`],
  })
  const manifest = {
    '/page': fixture.files.lambda.path,
    '/page/:slug': fixture.files.lambda.path,
  }

  assert.equal(loadLambdaFroManifest('/page', manifest), { handler: true })
  assert.equal(loadLambdaFroManifest('/page/path', manifest), { handler: true })
  assert.equal(loadLambdaFroManifest('/page?query', manifest), { handler: true })
  assert.equal(loadLambdaFroManifest('/foo/bar', manifest), undefined)

  fixture.cleanup()
})

test('processHandler - works', async () => {
  const res = await processHandler(event, {
    async handler(event, ctx) {
      return {
        statusCode: 204,
      }
    },
  })

  assert.equal(res.statusCode, 204)
})

test('processHandler - no lambda', async () => {
  // @ts-expect-error
  const res = await processHandler(event)
  assert.equal(res.statusCode, 404)
})

test('processHandler - no handler', async () => {
  // @ts-expect-error
  const res = await processHandler(event, {})
  assert.equal(res.statusCode, 404)
})

test('processHandler - throws', async () => {
  const res = await processHandler(event, {
    async handler(ev, ctx) {
      throw new Error('error')
    },
  })
  assert.equal(res.statusCode, 500)
  // @ts-ignore
  assert.ok(res.headers['Content-Type'].includes('text/html'))
})

test('processHandler - throws as json', async () => {
  const e = Object.assign({}, event, {
    headers: {
      Accept: 'application/json',
    },
  })
  const res = await processHandler(e, {
    async handler(ev, ctx) {
      throw new Error('error')
    },
  })
  assert.equal(res.statusCode, 500)
  // @ts-ignore
  assert.ok(res.headers['Content-Type'].includes('application/json'))
})

test('sendServerlessResponse', async () => {
  function createRequest() {
    let headers = []
    let body = ''

    return {
      get headers() {
        return headers
      },
      statusCode: null,
      get body() {
        return body
      },
      setHeader(key: string, value: string) {
        headers.push({ key, value })
      },
      write(body: string) {
        body = body
      },
      end() {}
    } as unknown as http.ServerResponse & { headers: any[] }
  }

  const one = createRequest()
  sendServerlessResponse(one, {
    statusCode: 200,
    headers: {
      'x-header': 'foo'
    },
    multiValueHeaders: {
      'x-header-multi': [
        'foo',
        'foo'
      ]
    }
  })
  assert.equal(one.statusCode, 200)
  assert.equal(one.headers, [
    { key: 'x-header-multi', value: 'foo,foo' },
    { key: 'x-header', value: 'foo' },
  ])
})

test('createRequestHandler', async () => {
  let plan = 0

  const fixture = afix({
    lambda: [
      'lambda.js',
      `export function handler() {
      return { statusCode: 204 }
    }`,
    ],
  })
  const config = create(
    Env.PRODUCTION,
    {
      _: [],
      output: fixture.root,
    },
    {}
  )
  const manifest = {
    '/': fixture.files.lambda.path,
  }
  const { createRequestHandler } = proxy('../serve', {
    './timer': {
      timer() {
        plan++

        return () => {
          plan++
        }
      },
    },
    './requestToEvent': {
      requestToEvent() {
        plan++
        return event
      },
    },
    './utils': {
      requireFresh() {
        return manifest
      },
    },
  })

  const requestHandler = createRequestHandler({ port: 4000, config })
  // @ts-ignore
  const req = new http.IncomingMessage(null)
  const res = new http.ServerResponse(req)

  await requestHandler(req, res)

  assert.equal(plan, 3)
})

test('createServerHandler', async () => {
  const fixture = afix({})
  const config = create(Env.PRODUCTION, { _: [], output: fixture.root }, {})

  let count = 0

  const { createServerHandler } = proxy('../serve', {
    sirv: (dir: string, options: any) => {
      count++
      return () => {
        count++
      }
    },
  })
  const serveHandler = createServerHandler({ port: 4000, config })

  // @ts-ignore
  serveHandler({ url: '' }, {})

  assert.equal(count, 2)

  fixture.cleanup()
})

test('serve', async () => {
  const fixture = afix({})

  let count = 0

  class WebSocketServer {
    constructor() {
      count++
    }

    clients = [
      {
        send() {
          count++
        }
      }
    ]
  }

  const { serve } = proxy('../serve', {
    http: {
      createServer() {
        return {
          listen: () => {
            count++

            return {
              on: () =>{
                count++
              },
              close: (y) => {
                count++
                y()
              }
            }
          },
        }
      },
    },
    ws: {
      WebSocketServer,
    },
  })
  const config = create(Env.PRODUCTION, { _: [], output: fixture.root }, {})
  const hooks = createHooks(createEmitter())
  const server = serve(config, hooks)

  hooks.emitBrowserRefresh()

  await server.close()

  assert.equal(count, 5)

  fixture.cleanup()
})

test.run()
