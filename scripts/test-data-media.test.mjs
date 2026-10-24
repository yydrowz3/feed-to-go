import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { chunkInfo, generateMedia, isFaststart, md5, validateProbe } from './test-data-media.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(ROOT, '.local', 'test-data');
const batch = `media-checks-${randomUUID()}`;
const directory = path.join(OUTPUT, batch);
await mkdir(directory, { recursive: true });
after(async () => {
  assert.equal(path.dirname(directory), OUTPUT);
  assert.equal(path.basename(directory), batch);
  await rm(directory, { recursive: true, force: true });
});

test('chunk boundaries retain exact byte counts including a partial tail', () => {
  assert.deepEqual(chunkInfo(5242880), { total_chunks: 1, last_chunk_bytes: 5242880 });
  assert.deepEqual(chunkInfo(5242881), { total_chunks: 2, last_chunk_bytes: 1 });
  assert.deepEqual(chunkInfo(59 * 1024 * 1024), { total_chunks: 12, last_chunk_bytes: 4 * 1024 * 1024 });
  for (const invalid of [0, -1, NaN, 1.5]) assert.throws(() => chunkInfo(invalid));
});

test('probe validation rejects incompatible codecs, fps, dimensions, duration, audio and size', () => {
  const target = { width: 1280, height: 720, duration_seconds: 5, size_mib: [1, 3], audio_codec: 'aac' };
  const probe = { format: { format_name: 'mov,mp4,m4a,3gp,3g2,mj2', duration: '5.000' },
    streams: [{ codec_type: 'video', codec_name: 'h264', pix_fmt: 'yuv420p', width: 1280, height: 720, avg_frame_rate: '30/1' },
      { codec_type: 'audio', codec_name: 'aac', sample_rate: '48000' }] };
  assert.equal(validateProbe(probe, target, 2 * 1024 * 1024).total_chunks, 1);
  for (const change of [p => { p.streams[0].codec_name = 'hevc'; }, p => { p.streams[0].pix_fmt = 'yuv444p'; },
    p => { p.streams[0].avg_frame_rate = '0/0'; }, p => { p.streams[0].width = 720; },
    p => { p.format.duration = '6'; }, p => { p.streams.pop(); }, p => { p.streams[1].sample_rate = '44100'; }]) {
    const changed = structuredClone(probe); change(changed);
    assert.throws(() => validateProbe(changed, target, 2 * 1024 * 1024));
  }
  assert.throws(() => validateProbe(probe, target, 4 * 1024 * 1024));
  assert.throws(() => validateProbe(probe, { ...target, audio_codec: null }, 2 * 1024 * 1024));
  const silent = structuredClone(probe); silent.streams.pop();
  assert.equal(validateProbe(silent, { ...target, audio_codec: null }, 2 * 1024 * 1024).audio_codec, null);
});

test('faststart is checked from MP4 atom order and malformed lengths are rejected', async () => {
  const atom = name => { const b = Buffer.alloc(8); b.writeUInt32BE(8); b.write(name, 4); return b; };
  const filename = path.join(directory, 'atoms.mp4');
  await writeFile(filename, Buffer.concat(['ftyp', 'moov', 'mdat'].map(atom)));
  assert.equal(await isFaststart(filename), true);
  await writeFile(filename, Buffer.concat(['ftyp', 'mdat', 'moov'].map(atom)));
  assert.equal(await isFaststart(filename), false);
  const invalid = atom('moov'); invalid.writeUInt32BE(9999);
  await writeFile(filename, invalid);
  await assert.rejects(isFaststart(filename), /Invalid MP4 atom/);
});

test('real FFmpeg generation, unchanged skip, selective repair and publication protection', async () => {
  // Remove only this empty, test-owned directory so the CLI can create a fresh metadata batch.
  await rm(path.join(directory, 'atoms.mp4'), { force: true });
  assert.equal(path.dirname(directory), OUTPUT);
  assert.equal(path.basename(directory), batch);
  await rm(directory, { recursive: true });
  const cli = spawnSync(process.execPath, ['scripts/test-data.mjs', 'generate', '--batch', batch, '--only', 'metadata'],
    { cwd: ROOT, encoding: 'utf8' });
  assert.equal(cli.status, 0);
  const manifest = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8'));
  manifest.media = [manifest.media[0]];
  const item = manifest.media[0];
  const accountsBefore = await readFile(path.join(directory, 'accounts.json'), 'utf8');
  const context = { directory, manifest, now: () => '2026-10-24T02:00:00+08:00',
    safeDirectory: async dir => { assert.ok(dir.startsWith(`${directory}${path.sep}`)); await mkdir(dir, { recursive: true }); },
    atomicWrite: async (filename, data) => { const temp = `${filename}.tmp`; await writeFile(temp, data); await rename(temp, filename); },
    save: async () => writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest)) };
  await generateMedia(context);
  assert.equal(item.validation_status, 'passed');
  assert.equal(item.actual.faststart, true);
  const video = path.join(directory, item.video_path);
  const cover = path.join(directory, item.cover_path);
  const originalVideo = await stat(video);
  const originalCover = await stat(cover);
  await generateMedia(context);
  assert.equal((await stat(video)).mtimeMs, originalVideo.mtimeMs);
  assert.equal((await stat(cover)).mtimeMs, originalCover.mtimeMs);
  await writeFile(cover, 'broken-cover');
  await generateMedia(context);
  assert.equal((await stat(video)).mtimeMs, originalVideo.mtimeMs);
  assert.equal(await md5(cover), item.actual.cover_md5);
  await writeFile(video, 'broken-video');
  await generateMedia(context);
  assert.equal(await md5(video), item.actual.md5);
  assert.equal(await isFaststart(video), true);
  item.publish_status = 'published'; item.video_id = 123;
  await writeFile(cover, 'published-broken-cover');
  await assert.rejects(generateMedia(context), /publication mapping/);
  assert.equal(await readFile(cover, 'utf8'), 'published-broken-cover');
  assert.equal(await readFile(path.join(directory, 'accounts.json'), 'utf8'), accountsBefore);
});
