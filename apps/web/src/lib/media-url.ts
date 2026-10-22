export function mediaUrl(value: string | null | undefined, baseUrl: string): string {
  if (!value?.trim()) return ''
  try {
    const url = new URL(value, `${new URL(baseUrl).origin}/`)
    return ['http:', 'https:'].includes(url.protocol) ? url.href : ''
  } catch { return '' }
}
