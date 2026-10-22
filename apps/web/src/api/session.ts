export type SessionSnapshot = { sessionId: number; accessToken: string; refreshToken: string }
export type AuthAccessor = {
  getSession(): SessionSnapshot
  updateTokens(sessionId: number, expectedToken: string, accessToken: string, refreshToken?: string): void
  clearSession(sessionId: number): void
}
