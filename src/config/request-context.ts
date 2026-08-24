import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * Per-request context propagated via AsyncLocalStorage so Winston (and any
 * other code) can read the active request ID without threading it through
 * every call site.
 */
export interface RequestContext {
  requestId: string
}

export const requestContext = new AsyncLocalStorage<RequestContext>()

export function getRequestId(): string | undefined {
  return requestContext.getStore()?.requestId
}
