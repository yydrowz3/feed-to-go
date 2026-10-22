import { createStore } from 'zustand/vanilla'
export function createAuthStore() {
  return createStore(() => ({ accessToken: '', refreshToken: '', sessionId: 0 }))
}
export type AuthStore = ReturnType<typeof createAuthStore>
