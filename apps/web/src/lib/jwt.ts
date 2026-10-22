export type JwtPayload = { account_id: number; username: string; exp?: number; iat?: number; nbf?: number; [key: string]: unknown }

// Identity hints only: the backend validates signatures and expiry.
export function decodeJwtPayload(token: string): JwtPayload | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3 || parts.some(part => !/^[A-Za-z0-9_-]+$/.test(part))) return null
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const binary = atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, '='))
    const parsed: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, char => char.charCodeAt(0))))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    const claims = parsed as JwtPayload
    if (!Number.isSafeInteger(claims.account_id) || claims.account_id <= 0 || typeof claims.username !== 'string' || !claims.username.trim()) return null
    return claims
  } catch { return null }
}
