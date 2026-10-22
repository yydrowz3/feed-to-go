import { QueryClient } from '@tanstack/react-query'
import { createAuthStore } from '../stores/auth.ts'
import { parseApiBase } from './config.ts'
export function createRuntime(value: unknown) {
  const baseUrl = parseApiBase(value)
  const authStore = createAuthStore()
  const queryClient = new QueryClient()
  const taskCancels = new Set<() => void>()
  let invalidate = () => {}
  const unsubscribe = authStore.subscribe((state, previous) => {
    if (state.sessionId === previous.sessionId) return
    void queryClient.cancelQueries()
    taskCancels.forEach(cancel => cancel())
    taskCancels.clear()
    queryClient.clear()
    invalidate()
  })
  return {
    baseUrl, authStore, queryClient,
    setRouterInvalidation(callback: () => void) { invalidate = callback },
    registerSessionTask(cancel: () => void) { taskCancels.add(cancel); return () => { taskCancels.delete(cancel) } },
    dispose() { unsubscribe(); taskCancels.forEach(cancel => cancel()); taskCancels.clear() },
  }
}
export type AppRuntime = ReturnType<typeof createRuntime>
