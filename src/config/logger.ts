import winston from 'winston'

import { getRequestId } from './request-context'

/**
 * Inject the active request ID (from AsyncLocalStorage) into every log record
 * as structured metadata so operators can filter by correlation ID.
 */
const requestIdFormat = winston.format((info) => {
  const requestId = getRequestId()
  if (requestId) {
    info.requestId = requestId
  }

  return info
})

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    requestIdFormat(),
    winston.format.printf((info) => {
      const { timestamp, level, message, requestId, ...meta } = info
      const idPart = requestId ? ` requestId=${requestId}` : ''
      // Drop Symbol keys Winston attaches (e.g. Symbol(level)) from meta dump
      const printable = Object.fromEntries(
        Object.entries(meta).filter(([key]) => typeof key === 'string'),
      )
      const metaPart =
        Object.keys(printable).length > 0 ? ` ${JSON.stringify(printable)}` : ''

      return `${timestamp} ${level}:${idPart} ${message}${metaPart}`
    }),
  ),
  transports: [new winston.transports.Console()],
})

export default logger
