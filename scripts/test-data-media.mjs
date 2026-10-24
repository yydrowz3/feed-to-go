import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, open, readFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';

const MIB = 1024 * 1024;
const CHUNK = 5 * MIB;
const check = (condition, message) => { if (!condition) throw new Error(message); };

export async function runTool(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill(), 10 * 60 * 1000);
    child.stdout.on('data', data => { stdout = (stdout + data).slice(-4 * MIB); });
    child.stderr.on('data', data => { stderr = (stderr + data).slice(-4 * MIB); });
    child.on('error', () => { clearTimeout(timer); reject(new Error(`${command} could not start; check the existing tool installation and PATH.`)); });
    child.on('close', code => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr, exit_code: code });
      else reject(new Error(`${command} failed (${code}): ${stderr.slice(-2500)}`));
    });
  });
}

async function regularFile(filename) {
  let info;
  try { info = await lstat(filename); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  check(info.isFile() && !info.isSymbolicLink(), `Unsafe media output: ${path.basename(filename)} is not a regular file.`);
  return info;
}

export async function md5(filename) {
  check(await regularFile(filename), `Missing file: ${path.basename(filename)}.`);
  const hash = createHash('md5');
  for await (const part of createReadStream(filename)) hash.update(part);
  return hash.digest('hex');
}

export function chunkInfo(bytes) {
  check(Number.isSafeInteger(bytes) && bytes > 0, 'Invalid file size.');
  const total = Math.ceil(bytes / CHUNK);
  return { total_chunks: total, last_chunk_bytes: bytes - (total - 1) * CHUNK };
}

export async function isFaststart(filename) {
  const handle = await open(filename, 'r');
  try {
    const { size } = await handle.stat();
    let offset = 0;
    let moov = -1;
    let mdat = -1;
    while (offset + 8 <= size) {
      const header = Buffer.alloc(16);
      const { bytesRead } = await handle.read(header, 0, 16, offset);
      if (bytesRead < 8) break;
      let length = header.readUInt32BE(0);
      const type = header.toString('ascii', 4, 8);
      if (length === 1) {
        check(bytesRead === 16, 'Truncated MP4 atom.');
        length = Number(header.readBigUInt64BE(8));
      } else if (length === 0) length = size - offset;
      check(Number.isSafeInteger(length) && length >= (header.readUInt32BE(0) === 1 ? 16 : 8) && offset + length <= size,
        'Invalid MP4 atom length.');
      if (type === 'moov') moov = offset;
      if (type === 'mdat') mdat = offset;
      offset += length;
    }
    return moov >= 0 && mdat >= 0 && moov < mdat;
  } finally { await handle.close(); }
}

export function validateProbe(probe, target, bytes) {
  const video = probe.streams?.filter(s => s.codec_type === 'video') ?? [];
  const audio = probe.streams?.filter(s => s.codec_type === 'audio') ?? [];
  check(probe.format?.format_name?.split(',').includes('mp4'), 'Expected an MP4 container.');
  check(video.length === 1, 'Expected exactly one video stream.');
  const v = video[0];
  const [numerator, denominator] = String(v.avg_frame_rate).split('/').map(Number);
  check(v.codec_name === 'h264' && v.pix_fmt === 'yuv420p' && v.width === target.width && v.height === target.height
    && Number.isFinite(numerator / denominator) && Math.abs(numerator / denominator - 30) < 0.001, 'Video encoding/size/fps mismatch.');
  const duration = Number(probe.format.duration);
  check(Number.isFinite(duration) && Math.abs(duration - target.duration_seconds) <= 0.2, 'Video duration mismatch.');
  check(target.audio_codec ? audio.length === 1 && audio[0].codec_name === 'aac' && Number(audio[0].sample_rate) === 48000
    : audio.length === 0, 'Audio stream mismatch.');
  check(bytes >= target.size_mib[0] * MIB && bytes <= target.size_mib[1] * MIB, 'Video size is outside target range.');
  const chunks = chunkInfo(bytes);
  check(target.size_mib[0] <= 5 || (chunks.total_chunks > 1 && chunks.last_chunk_bytes < CHUNK), 'Expected a partial final chunk.');
  return { bytes, width: v.width, height: v.height, duration_seconds: duration, ...chunks,
    video_codec: v.codec_name, pixel_format: v.pix_fmt, fps: numerator / denominator,
    audio_codec: audio[0]?.codec_name ?? null, audio_sample_rate: audio[0] ? Number(audio[0].sample_rate) : null };
}

function hasPublication(item) {
  return item.publish_status !== 'pending' || ['video_id', 'play_url', 'cover_url', 'published_at'].some(key => item[key] !== null);
}

export async function generateMedia({ directory, manifest, safeDirectory, atomicWrite, save, now }) {
  const videoDir = path.join(directory, 'videos');
  const coverDir = path.join(directory, 'covers');
  const evidence = path.join(directory, 'evidence');
  const previews = path.join(evidence, 'media-previews');
  for (const dir of [videoDir, coverDir, evidence, previews]) await safeDirectory(dir);
  const run = (command, args) => runTool(command, args, evidence);
  const ff = args => run('ffmpeg', ['-hide_banner', '-nostdin', '-v', 'error', '-xerror', ...args]);
  const record = (name, data) => atomicWrite(path.join(evidence, name), `${JSON.stringify(data, null, 2)}\n`);
  const toolVersions = {};
  for (const command of ['ffmpeg', 'ffprobe']) {
    const result = await run(command, ['-version']);
    toolVersions[command] = result.stdout.split(/\r?\n/)[0];
  }
  const encoders = await run('ffmpeg', ['-hide_banner', '-encoders']);
  const filters = await run('ffmpeg', ['-hide_banner', '-filters']);
  for (const encoder of ['libx264', 'aac', 'mjpeg', 'png', 'libwebp']) check(encoders.stdout.includes(encoder), `FFmpeg lacks ${encoder}.`);
  for (const filter of ['testsrc2', 'sine', 'drawtext']) check(filters.stdout.includes(filter), `FFmpeg lacks ${filter}.`);
  let font;
  for (const candidate of ['C:/Windows/Fonts/arial.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/System/Library/Fonts/Supplemental/Arial.ttf']) {
    if (await regularFile(candidate)) { font = candidate; break; }
  }
  check(font, 'No supported local TrueType font found for the test labels.');
  await atomicWrite(path.join(evidence, 'font.ttf'), await readFile(font));
  await record('stage-02-tools.json', { checked_at: now(), ...toolVersions, font, encoders: encoders.stdout, filters: filters.stdout });

  async function probeFile(filename) {
    const result = await run('ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', filename]);
    return JSON.parse(result.stdout);
  }
  async function inspectVideo(filename, item) {
    const info = await regularFile(filename);
    check(info, `Missing video ${item.id}.`);
    const probe = await probeFile(filename);
    const actual = validateProbe(probe, item.target, info.size);
    check(await isFaststart(filename), 'MP4 moov atom must precede mdat (faststart).');
    const decode = await ff(['-i', filename, '-map', '0', '-f', 'null', '-']);
    check(!decode.stderr.trim(), 'Full decode reported errors.');
    return { actual: { ...actual, md5: await md5(filename), faststart: true }, probe, decode };
  }
  async function inspectCover(filename, item) {
    const info = await regularFile(filename);
    check(info && info.size > 0 && info.size < item.target.cover_max_bytes, 'Cover is empty or too large.');
    const probe = await probeFile(filename);
    const v = probe.streams?.find(s => s.codec_type === 'video');
    const expected = { jpeg: 'mjpeg', png: 'png', webp: 'webp' }[item.target.cover_format];
    check(v && v.codec_name === expected && v.width > 0 && v.height > 0 && Math.max(v.width, v.height) <= 960
      && Math.abs(v.width / v.height - item.target.width / item.target.height) < 0.01, 'Cover format/size/aspect mismatch.');
    await ff(['-i', filename, '-f', 'null', '-']);
    return { cover_bytes: info.size, cover_md5: await md5(filename), cover_width: v.width, cover_height: v.height, probe };
  }
  async function matches(filename, bytes, hash) {
    const info = await regularFile(filename);
    return Boolean(info && info.size === bytes && hash && await md5(filename) === hash);
  }
  const results = [];
  for (const [index, item] of manifest.media.entries()) {
    const video = path.join(directory, item.video_path);
    const cover = path.join(directory, item.cover_path);
    const videoOK = item.validation_status === 'passed' && await matches(video, item.actual.bytes, item.actual.md5);
    const coverOK = item.validation_status === 'passed' && await matches(cover, item.actual.cover_bytes, item.actual.cover_md5);
    if (videoOK && coverOK) {
      process.stdout.write(`Media ${item.id}: verified MD5 unchanged; skipped.\n`);
      results.push({ id: item.id, action: 'skipped' });
      continue;
    }
    check(!hasPublication(item), `Media ${item.id} has a publication mapping or unknown publication result. Do not rebuild; use a new batch.`);
    const started = Date.now();
    const attempts = [];
    let temporaryVideo;
    let temporaryCover;
    try {
      let inspection;
      let regenerate = !videoOK;
      // Recover a valid final file left by an interrupted run without re-encoding it.
      if (regenerate && item.actual.md5 === null && await regularFile(video)) {
        try { inspection = await inspectVideo(video, item); regenerate = false; }
        catch { /* Invalid, unpublished media may be rebuilt below. */ }
      }
      if (regenerate) {
        const t = item.target;
        const audioRate = t.audio_codec ? 64000 : 0;
        const midpointBytes = (t.size_mib[0] + t.size_mib[1]) / 2 * MIB;
        let bitrate = Math.round(midpointBytes * 8 / t.duration_seconds * 0.99 - audioRate);
        let success = false;
        for (let attempt = 0; attempt <= 3; attempt++) {
          temporaryVideo = path.join(videoDir, `${item.id}-${randomUUID()}.tmp.mp4`);
          const filter = `hue=h=${index * 35},drawbox=x=18:y=18:w=650:h=155:color=black@0.65:t=fill,drawtext=fontfile=font.ttf:text='TEST ${item.id}':fontsize=52:fontcolor=white:x=36:y=30,drawtext=fontfile=font.ttf:text='%{pts\\:hms}':fontsize=42:fontcolor=white:x=36:y=100`;
          const args = ['-f', 'lavfi', '-i', `testsrc2=size=${t.width}x${t.height}:rate=30`];
          if (t.audio_codec) args.push('-f', 'lavfi', '-i', `sine=frequency=${400 + index * 70}:sample_rate=48000`);
          args.push('-t', String(t.duration_seconds), '-vf', filter, '-c:v', 'libx264', '-preset', 'veryfast',
            '-pix_fmt', 'yuv420p', '-r', '30', '-b:v', String(bitrate), '-minrate', String(bitrate), '-maxrate', String(bitrate),
            '-bufsize', String(bitrate * 2), '-x264-params', 'nal-hrd=cbr:force-cfr=1:filler=1', '-threads', '4');
          if (t.audio_codec) args.push('-c:a', 'aac', '-b:a', '64000', '-ar', '48000', '-af', 'volume=0.08');
          else args.push('-an');
          args.push('-movflags', '+faststart', '-y', temporaryVideo);
          process.stdout.write(`Media ${item.id}: encoding attempt ${attempt + 1}, ${t.width}x${t.height}, ${t.duration_seconds}s.\n`);
          await ff(args);
          const bytes = (await regularFile(temporaryVideo)).size;
          attempts.push({ attempt: attempt + 1, video_bitrate: bitrate, bytes, args });
          if (bytes >= t.size_mib[0] * MIB && bytes <= t.size_mib[1] * MIB && (index < 2 || bytes % CHUNK !== 0)) {
            inspection = await inspectVideo(temporaryVideo, item);
            await regularFile(video);
            await rename(temporaryVideo, video);
            temporaryVideo = null;
            success = true;
            break;
          }
          await rm(temporaryVideo); temporaryVideo = null;
          bitrate = Math.round(bitrate * midpointBytes / bytes);
        }
        check(success, `Media ${item.id} did not meet its size target after the initial encode and three adjustments.`);
      }
      if (!inspection) inspection = await inspectVideo(video, item);
      if (!coverOK || regenerate) {
        const ext = path.extname(cover);
        temporaryCover = path.join(coverDir, `${item.id}-${randomUUID()}.tmp${ext}`);
        const codecArgs = item.target.cover_format === 'jpeg' ? ['-c:v', 'mjpeg', '-q:v', '3']
          : item.target.cover_format === 'png' ? ['-c:v', 'png'] : ['-c:v', 'libwebp', '-quality', '85'];
        for (const edge of [960, 720, 480]) {
          await ff(['-ss', '1', '-i', video, '-frames:v', '1', '-vf', `scale=${edge}:${edge}:force_original_aspect_ratio=decrease`,
            ...codecArgs, '-update', '1', '-y', temporaryCover]);
          if ((await regularFile(temporaryCover)).size < item.target.cover_max_bytes) break;
        }
        await inspectCover(temporaryCover, item);
        await regularFile(cover);
        await rename(temporaryCover, cover); temporaryCover = null;
      }
      const coverActual = await inspectCover(cover, item);
      const { probe: coverProbe, ...coverMeasurements } = coverActual;
      const sample = path.join(previews, `${item.id}-frames.jpg`);
      await regularFile(sample);
      const n = item.target.duration_seconds * 30;
      await ff(['-i', video, '-vf', `select='eq(n,0)+eq(n,${Math.floor(n / 2)})+eq(n,${n - 1})',scale=320:180:force_original_aspect_ratio=decrease,pad=320:180:(ow-iw)/2:(oh-ih)/2,tile=3x1`,
        '-frames:v', '1', '-q:v', '3', '-update', '1', '-y', sample]);
      const measurements = { ...inspection.actual, ...coverMeasurements };
      const verifiedAt = now();
      await record(`media-${item.id}.json`, { id: item.id, author_alias: item.author_alias, status: 'passed', verified_at: verifiedAt,
        target: item.target, actual: measurements, video_probe: inspection.probe, cover_probe: coverProbe,
        full_decode: inspection.decode, attempts, frames: `evidence/media-previews/${item.id}-frames.jpg`, elapsed_ms: Date.now() - started });
      item.actual = measurements;
      item.validation_status = 'passed'; item.last_error = null; item.verified_at = verifiedAt;
      await save();
      process.stdout.write(`Media ${item.id}: passed, ${measurements.bytes} bytes, ${measurements.total_chunks} chunks, tail ${measurements.last_chunk_bytes} bytes.\n`);
      results.push({ id: item.id, action: 'verified', elapsed_ms: Date.now() - started });
    } catch (error) {
      item.validation_status = 'failed'; item.last_error = error.message;
      await record(`media-${item.id}-failure.json`, { id: item.id, status: 'failed', checked_at: now(), error: error.message, attempts });
      await save();
      throw error;
    } finally {
      for (const filename of [temporaryVideo, temporaryCover]) if (filename) await rm(filename, { force: true });
    }
  }
  const lines = manifest.media.map(item => `| ${item.id} | ${item.author_alias} | ${item.target.width}×${item.target.height} | ${item.actual.duration_seconds} | ${item.actual.bytes} | ${item.actual.total_chunks} | ${item.actual.last_chunk_bytes} | ${item.video_path} | ${item.cover_path} |`);
  const descriptions = manifest.media.map(item => `## ${item.id} / Author ${item.author_alias}\n\nTitle: ${item.title}\n\nDescription: ${item.description}\n\nPurpose: ${item.purpose}\n\nVideo: ${path.join(directory, item.video_path)}\n\nCover: ${path.join(directory, item.cover_path)}\n`);
  await atomicWrite(path.join(directory, 'media.md'), `# Local media upload list\n\nBatch: ${manifest.batch}. Local verification only; nothing uploaded or published.\n\n| ID | Author | Dimensions | Seconds | Bytes | Chunks | Final chunk bytes | Video | Cover |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n${lines.join('\n')}\n\n${descriptions.join('\n')}\n`);
  await record('stage-02-generation.json', { batch: manifest.batch, status: 'passed', completed_at: now(), tool_versions: toolVersions,
    video_bytes: manifest.media.reduce((sum, m) => sum + m.actual.bytes, 0), cover_bytes: manifest.media.reduce((sum, m) => sum + m.actual.cover_bytes, 0), results });
}
