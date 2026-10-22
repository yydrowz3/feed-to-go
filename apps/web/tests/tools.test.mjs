import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { apiUrl } from '../src/lib/config.ts'
import { mediaUrl } from '../src/lib/media-url.ts'
import { decodeJwtPayload } from '../src/lib/jwt.ts'
import { computeFileMd5, computeBlobMd5 } from '../src/lib/hash.ts'

test('URLs stay direct and media is resolved against backend origin', () => {
  assert.equal(apiUrl('https://backend.test/v1', '/account/login'), 'https://backend.test/v1/account/login')
  for (const path of ['account/login', '//evil.test', '/bad\\path', '/x?q=1']) assert.throws(() => apiUrl('https://backend.test', path))
  assert.equal(mediaUrl('/static/a.mp4', 'https://backend.test/v1'), 'https://backend.test/static/a.mp4')
  assert.equal(mediaUrl('https://cdn.test/a.mp4', 'https://backend.test'), 'https://cdn.test/a.mp4')
  for (const value of ['', null, 'javascript:alert(1)', 'blob:preview']) assert.equal(mediaUrl(value, 'https://backend.test'), '')
})
test('JWT supports Chinese identities and rejects malformed tokens', () => {
  const token = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ account_id: 3, username: '测试用户', exp: 1 })).toString('base64url')}.c2ln`
  assert.equal(decodeJwtPayload(token)?.username, '测试用户')
  for (const value of ['', 'a.b.c', 'a.b', 'a.W10.c', 'a.bnVsbA.c', 'a.e30.c']) assert.equal(decodeJwtPayload(value), null)
})
test('MD5 matches known vectors, binary data, and both sides of 2 MiB boundaries', async () => {
  assert.equal(await computeBlobMd5(new Blob(['abc'])), '900150983cd24fb0d6963f7d28e17f72')
  for (const size of [0, 1, 256, 2097151, 2097152, 2097153, 4194321]) {
    const bytes = Uint8Array.from({ length: size }, (_, i) => i % 251)
    const blob = new Blob([bytes])
    const expected = createHash('md5').update(bytes).digest('hex')
    const progress = []
    assert.equal(await computeFileMd5(blob, { onProgress: value => progress.push(value) }), expected)
    assert.equal(await computeBlobMd5(blob), expected)
    assert.equal(progress.at(-1), 1)
    assert.ok(progress.every((value, i) => i === 0 || value >= progress[i - 1]))
  }
})
test('hashes are independent and cancellation interrupts file reads', async () => {
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(computeFileMd5(new Blob(['abc']), { signal: controller.signal }), { name: 'AbortError' })
  const mid = new AbortController()
  await assert.rejects(computeFileMd5(new Blob([new Uint8Array(4194304)]), { signal: mid.signal, onProgress: value => { if (value > 0) mid.abort() } }), { name: 'AbortError' })
  assert.deepEqual(await Promise.all(['abc', ''].map(value => computeFileMd5(new Blob([value])))), ['900150983cd24fb0d6963f7d28e17f72', 'd41d8cd98f00b204e9800998ecf8427e'])
})
