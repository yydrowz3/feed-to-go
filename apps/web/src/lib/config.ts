export function parseApiBase(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('请配置 VITE_API_BASE 为后端 HTTP(S) 绝对地址')
  let url: URL
  try { url = new URL(value.trim()) } catch { throw new Error('VITE_API_BASE 必须是 HTTP(S) 绝对地址') }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('VITE_API_BASE 不允许非 HTTP(S) 协议、凭据、查询参数或片段')
  }
  return url.href.replace(/\/+$/, '')
}
