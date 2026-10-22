import test from 'node:test'
import assert from 'node:assert/strict'
import { parseApiBase } from '../src/lib/config.ts'
test('configuration is required and keeps direct backend base', () => {
  for (const value of [undefined, '', '/api', 'ftp://example.com', 'https://u:p@example.com', 'https://example.com?q=a', 'https://example.com/#x']) assert.throws(() => parseApiBase(value))
  assert.equal(parseApiBase(' http://localhost:8095/// '), 'http://localhost:8095')
  assert.equal(parseApiBase('https://example.com/backend/'), 'https://example.com/backend')
})
