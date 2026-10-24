// Read back this batch's real publications; never creates accounts, uploads, or publishes.
import assert from 'node:assert/strict';
import { readFile, writeFile, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
const batch = process.argv[2];
if (!batch || !/^[a-zA-Z0-9-]+$/.test(batch)) throw Error('Expected batch name');
const dir = path.resolve(import.meta.dirname, '../.local/test-data', batch);
const manifest = JSON.parse(await readFile(path.join(dir, 'manifest.json'), 'utf8'));
const api = manifest.api_base;
if (api !== 'http://localhost:8095') throw Error('Expected confirmed local API');
const evidence = path.join(dir, 'evidence');
const rows = (await readFile(path.join(evidence, 'browser-requests.jsonl'), 'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);
async function post(route, body) {
  const response = await fetch(api + route, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
  assert.equal(response.status, 200, route);
  return response.json();
}
const authors = new Map();
for (const id of [...new Set(manifest.media.map(x => x.author_id))])
  authors.set(id, await post('/video/listByAUthorID', { author_id: id }));
const results = [];
for (const item of manifest.media) {
  const matches = authors.get(item.author_id).filter(x => x.title === item.title && x.description === item.description);
  assert.ok(matches.length <= 1, `Duplicate publication of ${item.id}`);
  if (!matches.length) { results.push({ id: item.id, status: 'pending' }); continue; }
  const video = matches[0];
  assert.equal(video.author_id, item.author_id);
  if (item.video_id) assert.equal(video.id, item.video_id);
  const detail = await post('/video/getDetail', { id: video.id });
  for (const key of ['id', 'author_id', 'title', 'description', 'play_url', 'cover_url']) assert.equal(detail[key], video[key]);
  const publications = rows.filter(x => x.path === '/video/publish' && x.status === 200 && x.response.id === video.id);
  assert.equal(publications.length, 1, `Expected one recorded browser publish for ${item.id}`);
  const init = rows.filter(x => x.path === '/video/chunk/init' && x.status === 200 && x.request.filename === `${item.id}.mp4`);
  assert.ok(init.length, 'Missing browser init');
  const chunks = [];
  for (const session of init) {
    assert.equal(session.request.file_hash, item.actual.md5);
    const requests = rows.filter(x => x.path === '/video/chunk/upload' && x.status === 200 && x.request.upload_id === session.response.upload_id);
    for (const row of requests) {
      const index = Number(row.request.chunk_index);
      const local = await readFile(path.join(dir, item.video_path));
      const data = local.subarray(index * manifest.chunk_size, (index + 1) * manifest.chunk_size);
      assert.equal(row.request.file.bytes, data.length);
      assert.equal(row.request.chunk_hash, createHash('md5').update(data).digest('hex'));
      if (!chunks.some(x => x.index === index)) chunks.push({ index, bytes: data.length, md5: row.request.chunk_hash });
    }
  }
  assert.equal(chunks.length, item.actual.total_chunks);
  const media = [];
  for (const [kind, expected, bytes] of [['play_url', item.actual.md5, item.actual.bytes], ['cover_url', item.actual.cover_md5, item.actual.cover_bytes]]) {
    assert.equal(new URL(video[kind]).origin, api);
    const response = await fetch(video[kind], { signal: AbortSignal.timeout(60000) });
    assert.equal(response.status, 200);
    const data = Buffer.from(await response.arrayBuffer());
    assert.equal(data.length, bytes);
    const md5 = createHash('md5').update(data).digest('hex');
    assert.equal(md5, expected);
    media.push({ kind, bytes: data.length, md5, content_type: response.headers.get('content-type') });
  }
  const range = await fetch(video.play_url, { headers: { Range: 'bytes=100-199' }, signal: AbortSignal.timeout(10000) });
  assert.equal(range.status, 206);
  assert.equal(range.headers.get('content-range'), `bytes 100-199/${item.actual.bytes}`);
  assert.equal((await range.arrayBuffer()).byteLength, 100);
  Object.assign(item, { publish_status: 'published', video_id: video.id, play_url: video.play_url,
    cover_url: video.cover_url, published_at: video.create_time, publish_evidence: 'evidence/browser-requests.jsonl' });
  results.push({ id: item.id, video_id: video.id, author_id: video.author_id, status: 'passed', media,
    chunks, init_sessions: init.map(x => ({ upload_id: x.response.upload_id, uploaded_chunks: x.response.uploaded_chunks })), range: '206 bytes 100-199' });
}
await writeFile(path.join(dir, 'manifest.json.tmp'), JSON.stringify(manifest, null, 2) + '\n');
await rename(path.join(dir, 'manifest.json.tmp'), path.join(dir, 'manifest.json'));
await writeFile(path.join(evidence, 'stage-05-media-readback.json'), JSON.stringify({ checked_at: new Date().toISOString(),
  results, authors: [...authors].map(([id, list]) => ({ id, count: list.length, video_ids: list.map(x => x.id) })) }, null, 2) + '\n');
console.log(JSON.stringify(results.map(({ id, video_id, status }) => ({ id, video_id, status }))));
if (process.argv.includes('--final')) assert.ok(results.every(x => x.status === 'passed'), 'Some media remain unpublished');
