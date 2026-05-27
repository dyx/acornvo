import { logger } from './obs/logger'

type Handler = () => Promise<void> | void

const beforeQuitHandlers: Handler[] = []
const windowResumeHandlers: Handler[] = []

function subscribe(list: Handler[], handler: Handler): () => void {
  list.push(handler)
  return () => {
    const idx = list.indexOf(handler)
    if (idx !== -1) list.splice(idx, 1)
  }
}

async function runSerial(list: Handler[], label: string): Promise<void> {
  for (const handler of list) {
    try {
      await handler()
    } catch (err) {
      logger().error('main', {
        msg: `${label} handler threw`,
        meta: { message: err instanceof Error ? err.message : String(err) }
      })
      // Do not rethrow — one bad subscriber must not block the others.
    }
  }
}

export const appLifecycle = {
  onBeforeQuit: (handler: Handler) => subscribe(beforeQuitHandlers, handler),
  onWindowResume: (handler: Handler) => subscribe(windowResumeHandlers, handler),
  _runBeforeQuit: () => runSerial(beforeQuitHandlers, 'before-quit'),
  _runWindowResume: () => runSerial(windowResumeHandlers, 'window-resume')
}
