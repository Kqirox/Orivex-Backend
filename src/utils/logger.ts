import configLogger from '../config/logger'
import { getRequestId } from '../config/request-context'

export type LogLevel =
  | 'error'
  | 'warn'
  | 'info'
  | 'http'
  | 'verbose'
  | 'debug'
  | 'silly'

/**
 * Thin wrapper around the Winston logger in `src/config/logger.ts`.
 * Request IDs are injected automatically via AsyncLocalStorage — callers do
 * not need to pass them. Prefer `getRequestId()` when the ID is needed for
 * responses or external systems.
 */
const logger = {
  error: (message: string, meta?: any) => configLogger.error(message, meta),
  warn: (message: string, meta?: any) => configLogger.warn(message, meta),
  info: (message: string, meta?: any) => configLogger.info(message, meta),
  http: (message: string, meta?: any) => configLogger.http(message, meta),
  verbose: (message: string, meta?: any) => configLogger.verbose(message, meta),
  debug: (message: string, meta?: any) => configLogger.debug(message, meta),
  silly: (message: string, meta?: any) => configLogger.silly(message, meta),
  setLevel: (level: LogLevel) => {
    configLogger.level = level
  },
  getRequestId,
}

export default logger
