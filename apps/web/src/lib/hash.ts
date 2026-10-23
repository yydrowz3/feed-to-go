type Hasher = { init(): unknown; update(bytes: Uint8Array): unknown; digest(format: 'hex'): string }
type HashOptions = { signal?: AbortSignal; onProgress?: (fraction: number) => void; createHasher?: () => Promise<Hasher> }
const READ_SIZE = 2 * 1024 * 1024

export async function computeFileMd5(file: Blob, { signal, onProgress, createHasher }: HashOptions = {}): Promise<string> {
  signal?.throwIfAborted()
  const hasher = await (createHasher ? createHasher() : import('hash-wasm').then(module => module.createMD5()))
  signal?.throwIfAborted()
  hasher.init()
  onProgress?.(0)
  for (let offset = 0; offset < file.size; offset += READ_SIZE) {
    signal?.throwIfAborted()
    const bytes = new Uint8Array(await file.slice(offset, offset + READ_SIZE).arrayBuffer())
    signal?.throwIfAborted()
    hasher.update(bytes)
    onProgress?.(Math.min(offset + bytes.length, file.size) / file.size)
  }
  signal?.throwIfAborted()
  if (!file.size) onProgress?.(1)
  return hasher.digest('hex')
}

export async function computeBlobMd5(blob: Blob): Promise<string> {
  const { md5 } = await import('hash-wasm')
  return md5(new Uint8Array(await blob.arrayBuffer()))
}
