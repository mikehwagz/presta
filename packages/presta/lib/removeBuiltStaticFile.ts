import fs from 'fs-extra'
import path from 'path'

import * as logger from './log'
import { Presta } from './types'

export function removeBuiltStaticFile(file: string, config: Presta) {
  logger.debug({
    label: 'debug',
    message: `removing old static file ${file}`,
  })

  fs.remove(path.join(config.staticOutputDir, file))
}
