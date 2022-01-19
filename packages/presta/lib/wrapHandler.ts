/**
 * THIS IS PROD CODE, BE CAREFUL WHAT YOU ADD TO THIS FILE
 */
import { Response } from 'lambda-types'

import { getRouteParams } from './getRouteParams'
import { normalizeResponse } from './normalizeResponse'
import { Event, Context, Handler } from './lambda'

export function wrapHandler(file: {
  route: string
  handler: Handler
}): (event: Event, context: Context) => Promise<Response> {
  return async (event: Event, context: Context) => {
    event = {
      ...event,
      pathParameters: getRouteParams(event.path, file.route),
    } as Event

    return normalizeResponse(await file.handler(event as Event, context))
  }
}
