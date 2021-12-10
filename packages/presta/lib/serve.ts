import http from 'http'
import getPort from 'get-port'
import sirv from 'sirv'
import chokidar from 'chokidar'
import mime from 'mime-types'
import toRegExp from 'regexparam'
import status from 'statuses'

import { timer } from './timer'
import * as logger from './log'
import { createDefaultHtmlResponse } from './createDefaultHtmlResponse'
import { requestToEvent } from './requestToEvent'
import { sendServerlessResponse } from './sendServerlessResponse'
import { createLiveReloadScript } from './liveReloadScript'
import { AWS, Presta, Response } from './types'
import { normalizeResponse } from './normalizeResponse'
import { requireFresh } from './utils'

export interface HttpError extends Error {
  statusCode?: number
  message: string
}

export function createHttpError(statusCode: number, message: string): HttpError {
  const error = new Error(message)
  // @ts-ignore
  error.statusCode = statusCode
  return error
}

export function getMimeType(response: Response) {
  const type = (response?.headers || {})['Content-Type'] || 'html'
  return type ? mime.extension(String(type)) || 'html' : 'html'
}

export function loadLambdaFroManifest(url: string, manifest: { [route: string]: string }): { handler: AWS['Handler'] } {
  const routes = Object.keys(manifest)
  const lambdaFilepath = routes
    .map((route) => ({
      matcher: toRegExp(route),
      route,
    }))
    .filter(({ matcher }) => {
      return matcher.pattern.test(url.split('?')[0])
    })
    .map(({ route }) => manifest[route])[0]

  return lambdaFilepath ? require(lambdaFilepath) : undefined
}

export async function processHandler(event: AWS['HandlerEvent'], lambda: { handler: AWS['Handler'] }) {
  const accept = event.headers.Accept || event.headers.accept
  const acceptsJson = accept && accept.includes('json')

  /*
   * No asset file, no static file, try dynamic
   */
  try {
    if (!lambda || !lambda.handler) {
      throw createHttpError(404, '')
    }

    return normalizeResponse(await lambda.handler(event, {}))
  } catch (e) {
    const error = e as HttpError
    const { statusCode = 500 } = error

    if (statusCode > 499)
      logger.error({
        label: 'error',
        message: error.message || status.message[statusCode],
        error,
      })

    return normalizeResponse({
      statusCode: statusCode,
      html: acceptsJson ? undefined : createDefaultHtmlResponse({ statusCode }),
      json: acceptsJson ? { detail: status.message[statusCode] } : undefined,
    })
  }
}

export function createRequestHandler({ port, config }: { port: number; config: Presta }) {
  return async function requestHandler(req: http.IncomingMessage, res: http.ServerResponse) {
    const time = timer()
    const event = await requestToEvent(req) // stock AWS Event shape
    const manifest = requireFresh(config.functionsManifest)
    const lambda = loadLambdaFroManifest(event.path, manifest)
    const response = await processHandler(event, lambda)
    const redir = response.statusCode > 299 && response.statusCode < 399
    const mime = getMimeType(response)

    if (mime === 'html') {
      response.body = (response.body || '').split('</body>')[0] + createLiveReloadScript({ port })
    }

    logger[response.statusCode < 299 ? 'info' : 'error']({
      label: 'serve',
      message: `${response.statusCode} ${redir ? response?.headers?.Location || event.path : event.path}`,
      duration: time(),
    })

    sendServerlessResponse(res, response)
  }
}

export function createServerHandler({ port, config }: { port: number; config: Presta }) {
  const staticDir = config.staticOutputDir
  const assetDir = config.assets

  return async function serveHandler(req: http.IncomingMessage, res: http.ServerResponse) {
    const time = timer()
    const url = req.url as string

    logger.debug({
      label: 'debug',
      message: `handling ${url}`,
    })

    // hook into sirv for logging only
    function setHeaders(res: http.ServerResponse, pathname: string) {
      logger.info({
        label: 'serve',
        message: `${res.statusCode} ${pathname}`,
        duration: time(),
      })
    }

    sirv(assetDir, { dev: true, setHeaders })(req, res, () => {
      sirv(staticDir, { dev: true, setHeaders })(req, res, async () => {
        createRequestHandler({ port, config })(req, res)
      })
    })
  }
}

export async function serve(config: Presta) {
  const port = await getPort({ port: config.port })
  const server = http.createServer(createServerHandler({ port, config })).listen(port)
  const socket = require('pocket.io')(server, { serveClient: false })

  config.hooks.onBrowserRefresh(() => {
    logger.debug({
      label: 'debug',
      message: `refresh event received`,
    })

    socket.emit('refresh')
  })

  chokidar.watch(config.assets, { ignoreInitial: true }).on('all', () => {
    config.hooks.emitBrowserRefresh()
  })

  return { port }
}
