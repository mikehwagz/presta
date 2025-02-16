import path from 'path'
import fs from 'fs-extra'
import { build as esbuild } from 'esbuild'
import { requireSafe, timer } from '@presta/utils'

import { outputLambdas } from './outputLambdas'
import { getFiles, isStatic, isDynamic } from './getFiles'
import { buildStaticFiles } from './buildStaticFiles'
import * as logger from './log'
import { Config } from './config'
import { Hooks } from './createEmitter'

export async function build(config: Config, hooks: Hooks) {
  const totalTime = timer()
  const files = getFiles(config.files)
  const staticIds = files.filter(isStatic)
  const dynamicIds = files.filter(isDynamic)

  logger.debug({
    label: 'build',
    message: 'starting build',
  })

  if (!staticIds.length && !dynamicIds.length) {
    logger.warn({
      label: 'files',
      message: 'no files were found, nothing to build',
    })
  } else {
    let staticTime = ''
    let staticFileAmount = 0
    let dynamicTime = ''
    let copyTime = ''

    const tasks = await Promise.allSettled([
      (async () => {
        if (staticIds.length) {
          const time = timer()

          const { staticFilesMap } = await buildStaticFiles(staticIds, config)

          staticTime = time()
          staticFileAmount = Object.keys(staticFilesMap).reduce((count, key) => {
            return (count += staticFilesMap[key].length)
          }, 0)
        }
      })(),
      (async () => {
        if (dynamicIds.length) {
          const time = timer()
          const pkg = requireSafe(path.join(process.cwd(), 'package.json'))

          outputLambdas(dynamicIds, config)

          await esbuild({
            entryPoints: Object.values(require(config.functionsManifest)),
            outdir: config.functionsOutputDir,
            platform: 'node',
            target: ['node12'],
            minify: true,
            allowOverwrite: true,
            external: Object.keys(pkg.dependencies || {}),
            bundle: true,
            define: {
              'process.env.PRESTA_SERVERLESS_RUNTIME': 'true',
            },
          })

          dynamicTime = time()
        }
      })(),
      (async () => {
        if (fs.existsSync(config.assets)) {
          const time = timer()

          fs.copySync(config.assets, config.staticOutputDir)

          copyTime = time()
        }
      })(),
    ])

    // since we're building (not watch) if any task fails, exit with error
    if (tasks.find((task) => task.status === 'rejected')) {
      logger.debug({
        label: 'build',
        message: 'build partially failed',
      })

      // log out errors
      tasks.forEach((task) => {
        if (task.status === 'rejected') {
          // TODO can swallow errors in testing
          logger.error({
            label: 'error',
            error: task.reason,
          })
        }
      })

      throw new Error('presta build failed')
    }

    if (staticTime) {
      logger.info({
        label: 'static',
        message: `rendered ${staticFileAmount} file(s)`,
        duration: staticTime,
      })
    }

    if (dynamicTime) {
      logger.info({
        label: 'lambda',
        message: `compiled ${dynamicIds.length} function(s)`,
        duration: dynamicTime,
      })
    }

    if (copyTime) {
      logger.info({
        label: 'assets',
        message: `copied`,
        duration: copyTime,
      })
    }

    hooks.emitPostBuild({
      output: config.output,
      staticOutput: config.staticOutputDir,
      functionsOutput: config.functionsOutputDir,
      functionsManifest: requireSafe(config.functionsManifest),
    })

    if (staticTime || dynamicTime) {
      logger.info({
        label: 'build',
        message: `complete`,
        duration: totalTime(),
      })
    }
  }
}
