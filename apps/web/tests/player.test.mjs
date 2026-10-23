import test from 'node:test'
import assert from 'node:assert/strict'
import { acceptsVideoShortcut } from '../src/features/video/keyboard.ts'
test('shortcuts respect editors, IME, dialogs, modifiers and button space', () => {
  const key = { key: ' ', isComposing: false }
  for (const target of [{ tagName: 'INPUT' }, { tagName: 'TEXTAREA' }, { tagName: 'SELECT' }, { isContentEditable: true }, { insideEditor: true }, { tagName: 'BUTTON' }, { insideButton: true }]) assert.equal(acceptsVideoShortcut(key, target, false), false)
  assert.equal(acceptsVideoShortcut(key, {}, true), false)
  assert.equal(acceptsVideoShortcut({ ...key, isComposing: true }, {}, false), false)
  assert.equal(acceptsVideoShortcut({ ...key, ctrlKey: true }, {}, false), false)
  for (const value of [' ', 'ArrowUp', 'ArrowDown', 'M', 'c']) assert.equal(acceptsVideoShortcut({ ...key, key: value }, {}, false), true)
})
