#!/usr/bin/env node
import { createHash, randomInt, randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, realpath, rename, rm, rmdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCHEMA = 1;
const DEFAULT_SEED = 20261024;
const ALIASES = ['A', 'B', 'C', 'D', 'E'];
const STATES = ['pending', 'registered', 'failed', 'unknown'];
const SPECS = [
  [1280, 720, 5, 1, 3, true, 'jpeg', 'Basic upload'],
  [720, 1280, 6, 1, 3, true, 'jpeg', 'Portrait playback'],
  [720, 720, 10, 6, 9, true, 'jpeg', 'Two-chunk upload'],
  [1280, 720, 12, 6, 9, true, 'jpeg', 'Cancel and resume'],
  [720, 1280, 16, 12, 18, true, 'png', 'Reload and resume'],
  [1280, 720, 20, 12, 18, false, 'png', 'Playback without audio'],
  [1280, 720, 30, 24, 32, true, 'webp', 'Multi-chunk progress'],
  [1920, 1080, 45, 40, 60, true, 'webp', 'Larger file upload'],
];
const HELP = `Local integration fixtures (run from the repository root)

Usage:
  node scripts/test-data.mjs generate [--batch NAME] [--seed NUMBER] [--only metadata|media|all]
  node scripts/test-data.mjs register --batch NAME --api-base URL [--only A|B|C|D|E|all]
  node scripts/test-data.mjs --help

Defaults: seed ${DEFAULT_SEED}; batch YYYYMMDD-HHmmss in Asia/Shanghai; --only all.
generate supports metadata, media and all. Media requires FFmpeg and FFprobe.
--only media and register require an existing metadata batch.
register checks the saved API address, skips registered accounts and reconciles unknown results.
Metadata never contacts the backend. Generated candidates are NOT registered accounts.
Existing batches retain credentials and metadata. An omitted seed reuses the saved seed.
Output: .local/test-data/<batch>/{accounts.json,accounts.md,manifest.json}
Keep this ignored directory private: accounts files contain dedicated test passwords.
`;

function requireThat(condition, message) {
  if (!condition) throw new Error(message);
}

function beijingTime() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date()).map(({ type, value }) => [type, value]));
  const { year, month, day, hour, minute, second } = parts;
  return {
    batch: `${year}${month}${day}-${hour}${minute}${second}`,
    iso: `${year}-${month}-${day}T${hour}:${minute}:${second}+08:00`,
  };
}

function parseArgs(args) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) return { help: true };
  const [command, ...rest] = args;
  requireThat(['generate', 'register'].includes(command), 'Expected generate or register. Use --help.');
  if (rest.length === 1 && ['--help', '-h'].includes(rest[0])) return { help: true };
  const allowed = command === 'generate' ? ['--batch', '--seed', '--only'] : ['--batch', '--api-base', '--only'];
  const options = {};
  for (let i = 0; i < rest.length; i += 2) {
    const key = rest[i];
    requireThat(allowed.includes(key), `Unknown option for ${command}. Use --help.`);
    requireThat(!(key in options), `Duplicate option ${key}.`);
    requireThat(rest[i + 1] && !rest[i + 1].startsWith('--'), `Missing value for ${key}.`);
    options[key] = rest[i + 1];
  }
  const batch = options['--batch'] ?? (command === 'generate' ? beijingTime().batch : null);
  requireThat(typeof batch === 'string' && /^[A-Za-z0-9-]{1,100}$/.test(batch)
    && !/^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i.test(batch),
  'Invalid batch: use 1–100 letters, numbers or hyphens; Windows device names are forbidden.');
  let seed;
  if ('--seed' in options) {
    requireThat(/^\d+$/.test(options['--seed']), 'Seed must be an integer between 0 and 4294967295.');
    seed = Number(options['--seed']);
    requireThat(Number.isSafeInteger(seed) && seed >= 0 && seed <= 0xffffffff,
      'Seed must be an integer between 0 and 4294967295.');
  }
  const only = options['--only'] ?? 'all';
  if (command === 'register') {
    let url;
    try { url = new URL(options['--api-base']); } catch { throw new Error('register requires --api-base with an HTTP(S) URL.'); }
    requireThat(['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
      && !url.search && !url.hash, 'API base must be an HTTP(S) URL without credentials, query or fragment.');
    requireThat(['all', ...ALIASES].includes(only), 'register --only must be A, B, C, D, E or all.');
    return { command, batch, apiBase: url.href.replace(/\/+$/, ''), only };
  }
  requireThat(['metadata', 'media', 'all'].includes(only), 'Invalid --only: choose metadata, media or all.');
  return { command, batch, seed, only };
}

async function existsInfo(filename) {
  try { return await lstat(filename); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

async function safeDirectory(directory) {
  const info = await existsInfo(directory);
  if (!info) await mkdir(directory);
  const checked = info ?? await lstat(directory);
  requireThat(checked.isDirectory() && !checked.isSymbolicLink(), 'Output directories must be real directories, not links.');
  const relative = path.relative(await realpath(ROOT), await realpath(directory));
  requireThat(relative && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative),
    'Output directory resolves outside the repository.');
}

async function readJson(filename) {
  const info = await existsInfo(filename);
  requireThat(info?.isFile() && !info.isSymbolicLink(), `Missing or unsafe ${path.basename(filename)}. Restore the complete batch from backup or choose a new batch; credentials were not regenerated.`);
  try { return JSON.parse(await readFile(filename, 'utf8')); }
  catch { throw new Error(`Cannot parse ${path.basename(filename)}. Restore it from backup or choose a new batch; do not delete individual files to retry.`); }
}

async function atomicWrite(filename, content) {
  const previous = await existsInfo(filename);
  requireThat(!previous || (previous.isFile() && !previous.isSymbolicLink()), 'Refusing to replace a non-regular output file.');
  const temporary = `${filename}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, content, { flag: 'wx', mode: 0o600 });
    await rename(temporary, filename);
  } finally { await rm(temporary, { force: true }); }
}

function password() {
  const groups = ['ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz', '0123456789'];
  const alphabet = groups.join('');
  const chars = groups.map(group => group[randomInt(group.length)]);
  while (chars.length < 16) chars.push(alphabet[randomInt(alphabet.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

function generate(faker, batch, seed, createdAt, fakerVersion) {
  faker.seed(seed);
  const suffix = [...createHash('sha256').update(batch).digest().subarray(0, 12)]
    .map(byte => String.fromCharCode(97 + byte % 26)).join('');
  const usedPasswords = new Set();
  const accounts = ALIASES.map((alias, i) => {
    const name = `${faker.person.firstName()}${faker.person.lastName()}`.normalize('NFKD').toLowerCase().replace(/[^a-z]/g, '') || 'tester';
    let secret;
    do { secret = password(); } while (usedPasswords.has(secret));
    usedPasswords.add(secret);
    return {
      alias, username: `qa${name}${suffix}${String.fromCharCode(97 + i)}`, password: secret,
      purpose: i < 2 ? `Author ${alias}; uploads ${i === 0 ? '01–04' : '05–08'}; social and messaging participant`
        : 'Independent login and reserve manual testing',
      registration_status: 'pending', account_id: null, last_error: null,
    };
  });
  const media = SPECS.map(([width, height, duration, min, max, audio, format, purpose], i) => {
    const id = String(i + 1).padStart(2, '0');
    return {
      id, title: `Test ${id}: ${faker.lorem.words(5)}`.slice(0, 80),
      description: faker.lorem.sentences(2).slice(0, 200), purpose, author_alias: i < 4 ? 'A' : 'B',
      target: { width, height, duration_seconds: duration, size_mib: [min, max],
        container: 'mp4', video_codec: 'h264', pixel_format: 'yuv420p', fps: 30,
        faststart: true, audio_codec: audio ? 'aac' : null, audio_sample_rate: audio ? 48000 : null,
        cover_format: format, cover_max_bytes: 10 * 1024 * 1024, cover_max_edge: 960 },
      video_path: `videos/${id}.mp4`, cover_path: `covers/${id}.${format === 'jpeg' ? 'jpg' : format}`,
      actual: { bytes: null, md5: null, width: null, height: null, duration_seconds: null,
        total_chunks: null, last_chunk_bytes: null, cover_bytes: null, cover_md5: null },
      validation_status: 'pending', last_error: null, publish_status: 'pending',
      author_id: null, video_id: null, play_url: null, cover_url: null, published_at: null,
    };
  });
  const header = { schema_version: SCHEMA, batch, seed, created_at: createdAt };
  return {
    accounts: { ...header, accounts },
    manifest: { ...header, api_base: null, web_base: null,
      generator: { node_version: process.version, faker_version: fakerVersion },
      chunk_size: 5 * 1024 * 1024, metadata_status: 'passed',
      account_candidates: accounts.map(({ alias, username }) => ({ alias, username })), media },
  };
}

function validate(accounts, manifest, batch, requestedSeed) {
  const fail = message => requireThat(false, `Inconsistent batch: ${message}. Restore the complete batch from backup or use a new batch; no credentials were regenerated.`);
  for (const data of [accounts, manifest]) {
    if (!data || data.schema_version !== SCHEMA) fail('unknown schema version');
    if (data.batch !== batch) fail('batch name does not match directory');
    if (!Number.isInteger(data.seed) || data.seed < 0 || data.seed > 0xffffffff) fail('invalid saved seed');
    if (typeof data.created_at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+08:00$/.test(data.created_at)
      || !Number.isFinite(Date.parse(data.created_at))) fail('invalid creation time');
  }
  if (accounts.seed !== manifest.seed || accounts.created_at !== manifest.created_at) fail('batch headers disagree');
  if (requestedSeed !== undefined && requestedSeed !== manifest.seed) fail('requested seed conflicts with saved seed');
  if (!Array.isArray(accounts.accounts) || accounts.accounts.length !== 5) fail('expected exactly five accounts');
  const usernames = new Set();
  const passwords = new Set();
  accounts.accounts.forEach((account, i) => {
    if (!account || account.alias !== ALIASES[i] || typeof account.username !== 'string'
      || !/^qa[a-z]+$/.test(account.username) || usernames.has(account.username)) fail('invalid or duplicate account identity');
    if (typeof account.password !== 'string' || !/^[A-Za-z0-9]{16}$/.test(account.password)
      || !/[A-Z]/.test(account.password) || !/[a-z]/.test(account.password) || !/[0-9]/.test(account.password)
      || passwords.has(account.password)) fail('invalid or duplicate password');
    if (typeof account.purpose !== 'string' || !account.purpose.trim() || !STATES.includes(account.registration_status)
      || !(account.last_error === null || typeof account.last_error === 'string')) fail('invalid account state');
    if (account.registration_status === 'registered'
      ? !Number.isSafeInteger(account.account_id) || account.account_id <= 0
      : account.account_id !== null) fail('account ID disagrees with registration state');
    usernames.add(account.username); passwords.add(account.password);
  });
  if (JSON.stringify(manifest.account_candidates) !== JSON.stringify(accounts.accounts.map(({ alias, username }) => ({ alias, username })))) fail('account mapping disagrees');
  for (const key of ['api_base', 'web_base']) {
    if (manifest[key] !== null) {
      let url;
      try { url = new URL(manifest[key]); } catch { fail('invalid target address'); }
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) fail('unsafe target address');
    }
  }
  if (manifest.chunk_size !== 5 * 1024 * 1024 || manifest.metadata_status !== 'passed'
    || !Array.isArray(manifest.media) || manifest.media.length !== 8) fail('invalid media inventory');
  const titles = new Set();
  const descriptions = new Set();
  manifest.media.forEach((item, i) => {
    const id = String(i + 1).padStart(2, '0');
    const [width, height, duration, min, max, audio, format] = SPECS[i];
    if (!item || item.id !== id || item.author_alias !== (i < 4 ? 'A' : 'B')) fail('invalid media identity or author');
    for (const [key, limit, seen] of [['title', 80, titles], ['description', 200, descriptions]]) {
      if (typeof item[key] !== 'string' || !item[key].trim() || item[key].length > limit
        || !/^[\x20-\x7e]+$/.test(item[key]) || seen.has(item[key])) fail(`invalid English media ${key}`);
      seen.add(item[key]);
    }
    const expectedTarget = { width, height, duration_seconds: duration, size_mib: [min, max], container: 'mp4',
      video_codec: 'h264', pixel_format: 'yuv420p', fps: 30, faststart: true,
      audio_codec: audio ? 'aac' : null, audio_sample_rate: audio ? 48000 : null,
      cover_format: format, cover_max_bytes: 10 * 1024 * 1024, cover_max_edge: 960 };
    if (!item.target || Object.entries(expectedTarget).some(([key, value]) => JSON.stringify(item.target[key]) !== JSON.stringify(value))
      || item.video_path !== `videos/${id}.mp4` || item.cover_path !== `covers/${id}.${format === 'jpeg' ? 'jpg' : format}`) fail('invalid media specification or path');
    if (!['pending', 'passed', 'failed'].includes(item.validation_status) || !['pending', 'published', 'unknown'].includes(item.publish_status)) fail('invalid media state');
    const actualKeys = ['bytes', 'md5', 'width', 'height', 'duration_seconds', 'total_chunks', 'last_chunk_bytes', 'cover_bytes', 'cover_md5'];
    if (!item.actual || actualKeys.some(key => !(key in item.actual))) fail('missing measured-value fields');
    if (item.validation_status === 'pending' && actualKeys.some(key => item.actual[key] !== null)) fail('pending media contains measured values');
    if (item.validation_status === 'passed') {
      const a = item.actual;
      if (![a.bytes, a.width, a.height, a.total_chunks, a.last_chunk_bytes, a.cover_bytes].every(value => Number.isSafeInteger(value) && value > 0)
        || !/^[a-f0-9]{32}$/.test(a.md5) || !/^[a-f0-9]{32}$/.test(a.cover_md5)
        || !Number.isFinite(a.duration_seconds) || Math.abs(a.duration_seconds - duration) > 0.2
        || a.width !== width || a.height !== height || a.bytes < min * 1048576 || a.bytes > max * 1048576
        || a.video_codec !== 'h264' || a.pixel_format !== 'yuv420p' || a.fps !== 30 || a.faststart !== true
        || a.audio_codec !== (audio ? 'aac' : null) || a.audio_sample_rate !== (audio ? 48000 : null)
        || ![a.cover_width, a.cover_height].every(value => Number.isSafeInteger(value) && value > 0 && value <= 960)
        || Math.abs(a.cover_width / a.cover_height - width / height) >= 0.01
        || a.cover_bytes >= item.target.cover_max_bytes || a.total_chunks !== Math.ceil(a.bytes / manifest.chunk_size)
        || a.last_chunk_bytes !== (a.bytes - (a.total_chunks - 1) * manifest.chunk_size)
        || (i >= 2 && a.last_chunk_bytes >= manifest.chunk_size)) fail('invalid measured media values');
    }
    if (!['author_id', 'video_id', 'play_url', 'cover_url', 'published_at'].every(key => key in item)) fail('missing publication fields');
    if (item.publish_status === 'pending' && ['video_id', 'published_at'].some(key => item[key] !== null)) fail('pending media has publication results');
  });
}

const markdownCell = value => String(value ?? '—').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/\|/g, '&#124;').replace(/\r?\n/g, '<br>');

function renderAccounts(accounts, manifest) {
  const labels = { pending: '待注册', registered: '已注册', failed: '失败', unknown: '结果未知，先查证再重试' };
  return `# 本地测试账号（含专用测试密码）\n\n批次：${accounts.batch}\n\n创建时间（北京时间）：${accounts.created_at}\n\n目标前端：${markdownCell(manifest.web_base ?? '待确认')}\n\n目标 API：${markdownCell(manifest.api_base ?? '待确认')}\n\n生成候选资料不等于账号已可使用；仅“已注册”且验证成功的账号可用于登录。\n\n| 别名 | 用户名 | 密码 | 用途 | 注册状态 | 真实账号 ID |\n| --- | --- | --- | --- | --- | --- |\n${accounts.accounts.map(account => `| ${[account.alias, account.username, account.password, account.purpose, labels[account.registration_status], account.account_id].map(markdownCell).join(' | ')} |`).join('\n')}\n\n凭据以 accounts.json 为准。此目录必须保持 Git 忽略；不要复制密码或 token 到仓库文档。\n`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) { process.stdout.write(HELP); return; }
  await safeDirectory(path.join(ROOT, '.local'));
  await safeDirectory(path.join(ROOT, '.local', 'test-data'));
  const directory = path.join(ROOT, '.local', 'test-data', options.batch);
  const previous = await existsInfo(directory);
  requireThat(previous || (options.command !== 'register' && options.only !== 'media'), 'Media/register require an existing metadata batch. Run generate --only metadata first.');
  await safeDirectory(directory);
  const lock = path.join(directory, '.metadata.lock');
  try { await mkdir(lock); }
  catch (error) {
    if (error.code === 'EEXIST') throw new Error('Batch is locked. Wait for the other generator; after an interrupted run, confirm it has stopped before removing .metadata.lock.');
    throw error;
  }
  try {
    const accountsPath = path.join(directory, 'accounts.json');
    const manifestPath = path.join(directory, 'manifest.json');
    let data;
    if (previous) {
      data = { accounts: await readJson(accountsPath), manifest: await readJson(manifestPath) };
    } else {
      const requireFromWeb = createRequire(path.join(ROOT, 'apps', 'web', 'package.json'));
      let fakerPath;
      try { fakerPath = requireFromWeb.resolve('@faker-js/faker'); }
      catch { throw new Error('Faker is unavailable in apps/web/node_modules. Restore the existing frontend dependencies; no root dependency is installed by this script.'); }
      const { fakerEN } = await import(pathToFileURL(fakerPath).href);
      const fakerPackage = JSON.parse(await readFile(path.resolve(path.dirname(fakerPath), '..', 'package.json'), 'utf8'));
      data = generate(fakerEN, options.batch, options.seed ?? DEFAULT_SEED, beijingTime().iso, fakerPackage.version);
    }
    validate(data.accounts, data.manifest, options.batch, options.seed);
    if (options.command === 'register') {
      requireThat(data.manifest.api_base === options.apiBase,
        'API base differs from the saved batch target or is unconfirmed. Confirm stage 03; no request was sent.');
      await safeDirectory(path.join(directory, 'evidence'));
      const { registerAccounts } = await import('./test-data-auth.mjs');
      const save = async () => {
        data.manifest.account_candidates = data.accounts.accounts.map(({ alias, username }) => ({ alias, username }));
        validate(data.accounts, data.manifest, options.batch, options.seed);
        await atomicWrite(accountsPath, `${JSON.stringify(data.accounts, null, 2)}\n`);
        await atomicWrite(manifestPath, `${JSON.stringify(data.manifest, null, 2)}\n`);
        await atomicWrite(path.join(directory, 'accounts.md'), renderAccounts(data.accounts, data.manifest));
      };
      const evidencePath = path.join(directory, 'evidence', 'stage-04-register-requests.json');
      const requests = await existsInfo(evidencePath) ? await readJson(evidencePath) : [];
      requireThat(Array.isArray(requests), 'Registration evidence must be a JSON array. Restore it before retrying.');
      await registerAccounts({ accounts: data.accounts.accounts, apiBase: options.apiBase, only: options.only,
        save, now: () => beijingTime().iso,
        record: async result => { requests.push(result); await atomicWrite(evidencePath, `${JSON.stringify(requests, null, 2)}\n`); },
      });
      process.stdout.write(`Registration complete for batch ${options.batch}; IDs and statuses saved. No media was uploaded.\n`);
      return;
    }
    if (!previous) {
      await atomicWrite(accountsPath, `${JSON.stringify(data.accounts, null, 2)}\n`);
      await atomicWrite(manifestPath, `${JSON.stringify(data.manifest, null, 2)}\n`);
    }
    await atomicWrite(path.join(directory, 'accounts.md'), renderAccounts(data.accounts, data.manifest));
    process.stdout.write(`${previous ? 'Reused' : 'Created'} batch ${options.batch}: 5 account candidates, 8 media metadata entries.\nOutput: ${directory}\n`);
    if (options.only !== 'metadata') {
      const { generateMedia } = await import('./test-data-media.mjs');
      await generateMedia({ directory, manifest: data.manifest, safeDirectory, atomicWrite,
        now: () => beijingTime().iso,
        save: async () => {
          validate(data.accounts, data.manifest, options.batch, options.seed);
          await atomicWrite(manifestPath, `${JSON.stringify(data.manifest, null, 2)}\n`);
        } });
    }
    process.stdout.write('Local generation only; no backend requests sent.\n');
  } finally { await rmdir(lock); }
}

main().catch(error => {
  // Never print source JSON, credentials, request bodies, or stack traces.
  const message = error.code ? `Filesystem operation failed (${error.code}). Check permissions and restore incomplete batches from backup.` : error.message;
  process.stderr.write(`test-data: ${message}\n`);
  process.exitCode = 1;
});
