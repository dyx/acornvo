import { app } from 'electron'
import { initLogger, logger } from './services/logger'

async function bootstrap(): Promise<void> {
  await initLogger()
  await app.whenReady()
  logger.info('app whenReady fired')
}

bootstrap().catch((err) => {
  console.error('bootstrap failed', err)
  process.exit(1)
})
