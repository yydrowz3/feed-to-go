import { QueryClient } from '@tanstack/react-query'
import { createAuthStore } from '../stores/auth.ts'
import type { TokenStorage } from '../stores/auth.ts'
import { parseApiBase } from './config.ts'
import { createApiClient } from '../api/client.ts'
import { createBusinessApi } from '../api/index.ts'
export function createRuntime(value: unknown, options: { storage?: TokenStorage; fetchImpl?: typeof fetch } = {}) {
  const baseUrl = parseApiBase(value)
  const authStore = createAuthStore(options.storage)
  const api = createApiClient({ baseUrl, fetchImpl: options.fetchImpl, auth: authStore.getState() })
  const queryClient = new QueryClient({ defaultOptions: {
    queries: { retry: false, staleTime: 30_000, refetchOnWindowFocus: false }, mutations: { retry: false },
  } })
  const taskCancels = new Set<() => void>()
  let invalidate = () => {}
  const unsubscribe = authStore.subscribe((state, previous) => {
    if (state.sessionId === previous.sessionId) return
    api.cancelSession(previous.sessionId)
    void queryClient.cancelQueries()
    taskCancels.forEach(cancel => cancel())
    taskCancels.clear()
    queryClient.clear()
    invalidate()
  })
  return {
    baseUrl, authStore, api, services: createBusinessApi(api), queryClient,
    setRouterInvalidation(callback: () => void) { invalidate = callback },
    registerSessionTask(cancel: () => void) { taskCancels.add(cancel); return () => { taskCancels.delete(cancel) } },
    dispose() { unsubscribe(); api.cancelSession(authStore.getState().sessionId); void queryClient.cancelQueries(); queryClient.clear(); taskCancels.forEach(cancel => cancel()); taskCancels.clear() },
  }
}
export type AppRuntime = ReturnType<typeof createRuntime>
