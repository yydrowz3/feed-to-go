import { QueryClient } from '@tanstack/react-query'
import { createAuthStore } from '../stores/auth.ts'
import { parseApiBase } from './config.ts'
import { createApiClient } from '../api/client.ts'
export function createRuntime(value: unknown) {
  const baseUrl = parseApiBase(value)
  const authStore = createAuthStore()
  const api = createApiClient({ baseUrl, auth: {
    getSession: authStore.getState,
    updateTokens(sessionId, expectedToken, accessToken, refreshToken) {
      const current = authStore.getState()
      if (current.sessionId === sessionId && current.accessToken === expectedToken) authStore.setState({ accessToken, refreshToken: refreshToken ?? current.refreshToken })
    },
    clearSession(sessionId) {
      if (authStore.getState().sessionId === sessionId) authStore.setState({ accessToken: '', refreshToken: '', sessionId: sessionId + 1 })
    },
  } })
  const queryClient = new QueryClient()
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
    baseUrl, authStore, api, queryClient,
    setRouterInvalidation(callback: () => void) { invalidate = callback },
    registerSessionTask(cancel: () => void) { taskCancels.add(cancel); return () => { taskCancels.delete(cancel) } },
    dispose() { unsubscribe(); taskCancels.forEach(cancel => cancel()); taskCancels.clear() },
  }
}
export type AppRuntime = ReturnType<typeof createRuntime>
