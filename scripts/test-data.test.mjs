import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(ROOT, '.local', 'test-data');
const PREFIX = `checks-${randomUUID()}`;
const created = [];
const fixture = name => {
  const batch = `${PREFIX}-${name}`;
  const directory = path.join(OUTPUT, batch);
  created.push(directory);
  return { batch, directory };
};
const guard = fixture('guard');
await mkdir(guard.directory, { recursive: true });
const guardPath = path.join(guard.directory, 'offline.mjs');
await writeFile(guardPath, `import net from 'node:net';
let attempts = 0;
function deny() { attempts++; throw new Error('Network forbidden during metadata checks'); }
globalThis.fetch = deny;
net.Socket.prototype.connect = deny;
process.on('exit', () => { if (attempts) process.exitCode = 99; });
`);

function run(args, options = {}) {
  const result = spawnSync(process.execPath, ['--import', pathToFileURL(guardPath).href,
    path.join(ROOT, 'scripts', 'test-data.mjs'), ...args], { cwd: ROOT, encoding: 'utf8', ...options });
  assert.ifError(result.error);
  return result;
}
const generate = (batch, extra = []) => run(['generate', '--batch', batch, '--only', 'metadata', ...extra]);
async function load(directory) {
  return Object.fromEntries(await Promise.all(['accounts.json', 'accounts.md', 'manifest.json']
    .map(async name => [name, await readFile(path.join(directory, name), 'utf8')])));
}
async function ready(name) {
  const item = fixture(name);
  assert.equal(generate(item.batch).status, 0);
  return item;
}
after(async () => {
  for (const directory of created) {
    // Only delete the exact test-owned directories inside the ignored output root.
    assert.equal(path.dirname(directory), OUTPUT);
    assert.ok(path.basename(directory).startsWith(`${PREFIX}-`));
    await rm(directory, { recursive: true, force: true });
  }
});

test('metadata is offline, contains five pending credentials and eight exact specifications', async () => {
  const { directory } = await ready('inventory');
  const files = await load(directory);
  const accounts = JSON.parse(files['accounts.json']);
  const manifest = JSON.parse(files['manifest.json']);
  assert.equal(accounts.seed, 20261024);
  assert.match(accounts.created_at, /\+08:00$/);
  assert.deepEqual(accounts.accounts.map(a => a.alias), ['A', 'B', 'C', 'D', 'E']);
  assert.equal(new Set(accounts.accounts.map(a => a.password)).size, 5);
  assert.equal(new Set(accounts.accounts.map(a => a.username)).size, 5);
  for (const account of accounts.accounts) {
    assert.match(account.username, /^qa[a-z]+$/);
    assert.match(account.password, /^[A-Za-z0-9]{16}$/);
    for (const pattern of [/[A-Z]/, /[a-z]/, /[0-9]/]) assert.match(account.password, pattern);
    assert.equal(account.registration_status, 'pending');
    assert.equal(account.account_id, null);
    assert.equal(account.last_error, null);
    assert.ok(files['accounts.md'].includes(`| ${account.alias} | ${account.username} | ${account.password} |`));
  }
  assert.equal(manifest.media.length, 8);
  assert.equal(manifest.api_base, null);
  assert.equal(manifest.web_base, null);
  assert.equal(new Set(manifest.media.map(m => m.title)).size, 8);
  assert.equal(new Set(manifest.media.map(m => m.description)).size, 8);
  assert.deepEqual(manifest.media.map(m => m.target.duration_seconds), [5, 6, 10, 12, 16, 20, 30, 45]);
  assert.deepEqual(manifest.media.map(m => m.target.cover_format), ['jpeg', 'jpeg', 'jpeg', 'jpeg', 'png', 'png', 'webp', 'webp']);
  assert.deepEqual(manifest.media.map(m => m.author_alias), ['A', 'A', 'A', 'A', 'B', 'B', 'B', 'B']);
  assert.deepEqual(manifest.media.map(m => m.target.audio_codec), ['aac', 'aac', 'aac', 'aac', 'aac', null, 'aac', 'aac']);
  for (const item of manifest.media) {
    assert.ok(item.title.length > 0 && item.title.length <= 80);
    assert.ok(item.description.length > 0 && item.description.length <= 200);
    assert.equal(item.validation_status, 'pending');
    assert.equal(item.publish_status, 'pending');
    assert.ok(Object.values(item.actual).every(value => value === null));
    assert.equal(item.video_id, null);
  }
});

test('rerun is byte-for-byte stable and does not print credentials', async () => {
  const { batch, directory } = await ready('resume');
  const before = await load(directory);
  const result = generate(batch);
  assert.equal(result.status, 0);
  assert.deepEqual(await load(directory), before);
  for (const { password } of JSON.parse(before['accounts.json']).accounts) {
    assert.ok(!`${result.stdout}${result.stderr}`.includes(password));
    assert.ok(!before['manifest.json'].includes(password));
  }
});

test('a nondefault saved seed is reused when omitted; explicit seed conflict never writes', async () => {
  const { batch, directory } = fixture('seed');
  assert.equal(generate(batch, ['--seed', '42']).status, 0);
  const before = await load(directory);
  assert.equal(generate(batch).status, 0);
  assert.equal(generate(batch, ['--seed', '43']).status, 1);
  assert.deepEqual(await load(directory), before);
});

test('invalid paths and CLI inputs fail before output is created', () => {
  for (const batch of ['../escape', '..', 'bad/name', 'bad\\name', 'C:\\escape', 'CON', 'aux', '', 'a'.repeat(101)]) {
    assert.equal(generate(batch).status, 1);
  }
  for (const seed of ['-1', '1.5', 'NaN', '4294967296', '2e3']) {
    assert.equal(generate(`${PREFIX}-invalid`, ['--seed', seed]).status, 1);
  }
  for (const args of [[], ['unknown'], ['generate', '--only'], ['generate', '--only', 'wrong'],
    ['generate', '--seed', '1', '--seed', '2'], ['generate', '--surprise', 'x']]) {
    assert.equal(run(args).status, 1);
  }
});

test('media and register require metadata before any network request', () => {
  const missing = run(['generate', '--batch', `${PREFIX}-missing`, '--only', 'media']);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /existing metadata batch/);
  const register = run(['register', '--batch', `${PREFIX}-missing-register`, '--api-base', 'http://localhost:8095']);
  assert.equal(register.status, 1);
  assert.match(register.stderr, /existing metadata batch/);
  assert.equal(run(['--help']).status, 0);
  assert.equal(run(['register', '--help']).status, 0);
  assert.equal(run(['register', '--batch', 'test', '--api-base', 'invalid']).status, 1);
});

test('default all persists metadata then stops safely when FFmpeg is unavailable', async () => {
  const { batch, directory } = fixture('all');
  const result = run(['generate', '--batch', batch], { env: { ...process.env, PATH: '' } });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /ffmpeg could not start/);
  const files = await load(directory);
  assert.ok(JSON.parse(files['accounts.json']).accounts.every(a => a.registration_status === 'pending'));
  assert.ok(JSON.parse(files['manifest.json']).media.every(m => m.validation_status === 'pending'));
  assert.equal(generate(batch).status, 0);
});

test('registration rejects an unconfirmed or different API target before network access', async () => {
  const { batch, directory } = await ready('api-target');
  const before = await load(directory);
  const args = ['register', '--batch', batch, '--api-base', 'http://localhost:8095'];
  const unconfirmed = run(args);
  assert.equal(unconfirmed.status, 1); assert.match(unconfirmed.stderr, /saved batch target/);
  assert.deepEqual(await load(directory), before);
  const manifest = JSON.parse(before['manifest.json']); manifest.api_base = 'http://localhost:8096';
  await writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest));
  const wrong = run(args);
  assert.equal(wrong.status, 1); assert.match(wrong.stderr, /saved batch target/);
});

test('truncated JSON fails without replacing any saved data', async () => {
  const { batch, directory } = await ready('corrupt');
  await writeFile(path.join(directory, 'manifest.json'), '{');
  const before = await load(directory);
  const result = generate(batch);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Cannot parse manifest.json/);
  assert.deepEqual(await load(directory), before);
});

test('missing companion file is treated as an interrupted batch, never regenerated', async () => {
  const { batch, directory } = await ready('incomplete');
  const before = await readFile(path.join(directory, 'accounts.json'), 'utf8');
  await unlink(path.join(directory, 'manifest.json'));
  assert.equal(generate(batch).status, 1);
  assert.equal(await readFile(path.join(directory, 'accounts.json'), 'utf8'), before);
});

test('unknown schema, mismatched inventory, invalid state and unsafe media paths are rejected', async () => {
  const { batch, directory } = await ready('inconsistent');
  const original = await load(directory);
  for (const mutate of [m => { m.schema_version = 999; }, m => { m.account_candidates[0].username = 'wrong'; },
    m => { m.media[0].cover_path = '../outside.jpg'; }, m => { m.media[0].actual.bytes = 123; },
    m => { m.media[0].target.width = 1; }, m => { delete m.api_base; }]) {
    const manifest = JSON.parse(original['manifest.json']);
    mutate(manifest);
    await writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest));
    const before = await load(directory);
    assert.equal(generate(batch).status, 1);
    assert.deepEqual(await load(directory), before);
  }
});

test('existing registered/unknown/failed account states are preserved, Markdown is regenerated safely', async () => {
  const { batch, directory } = await ready('states');
  const original = await load(directory);
  const accounts = JSON.parse(original['accounts.json']);
  accounts.accounts[0].registration_status = 'registered';
  accounts.accounts[0].account_id = 123;
  accounts.accounts[0].purpose = 'A | <author>\ncopy';
  accounts.accounts[1].registration_status = 'unknown';
  accounts.accounts[2].registration_status = 'failed';
  await writeFile(path.join(directory, 'accounts.json'), JSON.stringify(accounts));
  await unlink(path.join(directory, 'accounts.md'));
  assert.equal(generate(batch).status, 0);
  const result = await load(directory);
  assert.deepEqual(JSON.parse(result['accounts.json']), accounts);
  assert.match(result['accounts.md'], /A &#124; &lt;author&gt;<br>copy/);
  assert.ok(result['accounts.md'].includes('| 已注册 | 123 |'));
});

test('invalid credentials and impossible account states never overwrite saved files or leak secrets', async () => {
  const { batch, directory } = await ready('credentials');
  const original = await load(directory);
  for (const mutate of [a => { a.accounts[1].password = a.accounts[0].password; },
    a => { a.accounts[1].username = a.accounts[0].username; },
    a => { a.accounts[0].password = 'invalid'; },
    a => { a.accounts[0].registration_status = 'registered'; },
    a => { a.accounts[0].account_id = 123; }, a => { delete a.accounts[0].last_error; }]) {
    const accounts = JSON.parse(original['accounts.json']);
    mutate(accounts);
    await writeFile(path.join(directory, 'accounts.json'), JSON.stringify(accounts));
    const before = await load(directory);
    const result = generate(batch);
    assert.equal(result.status, 1);
    assert.deepEqual(await load(directory), before);
    for (const { password } of JSON.parse(original['accounts.json']).accounts) {
      assert.ok(!`${result.stdout}${result.stderr}`.includes(password));
    }
  }
});

test('concurrent lock refuses a second writer', async () => {
  const { batch, directory } = await ready('locked');
  await mkdir(path.join(directory, '.metadata.lock'));
  const before = await load(directory);
  assert.equal(generate(batch).status, 1);
  assert.deepEqual(await load(directory), before);
});

test('a linked batch directory cannot redirect writes', async () => {
  const target = fixture('link-target');
  const linked = fixture('linked');
  await mkdir(target.directory);
  await symlink(target.directory, linked.directory, process.platform === 'win32' ? 'junction' : 'dir');
  try {
    const result = generate(linked.batch);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /not links/);
  } finally { await unlink(linked.directory); }
});
